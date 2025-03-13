const User = require('../../models/userModel');
const _ = require('lodash');

const registerHandler = (socket, chatStates, io) => {
    socket.on('chatEvent', async (eventData) => {
        const { type, userName, socketId, recipientUserName, recipientSocketId } = eventData;
        if (!userName || !socketId) return;

        try {
            if (type === 'register') {
                const currentUser = await User.findOne({ userName })
                const userContacts = currentUser?.messageHistory ? _.keys(Object.fromEntries(currentUser.messageHistory)) : [];
                chatStates[userName] = { socketId, userOnline: userContacts, status: 'online', seen: false };

                const onlineUsersWithCurrentUser = _.map(chatStates, (state) => {
                    if (_.includes(state.userOnline, userName)) {
                        if (!userName) return
                        return {
                            socketId: state.socketId,
                            userOnline: _.intersection(state.userOnline, [userName]),
                        };
                    }
                }).filter(Boolean);

                const connectedUserStates = _.map([chatStates[onlineUsersWithCurrentUser[0]?.userOnline[0]]], (state) => {
                    return {
                        socketId: state?.socketId,
                        userOnline: _.intersection(state?.userOnline, _.keys(chatStates)),
                    };
                });

                const combinedOnlineStates = []
                if (connectedUserStates[0].socketId) {
                    combinedOnlineStates.push(..._.flatMap([connectedUserStates, onlineUsersWithCurrentUser]))
                }

                if (_.size(combinedOnlineStates) > 0) {
                    combinedOnlineStates.forEach(i => {
                        io.to(i.socketId).emit('addMessagesToQueue', i.userOnline)
                    })
                }
            } else if (type === 'chatRequest') {
                if (!recipientUserName || !recipientSocketId) return;

                const senderUser = await User.findOne({ userName });
                const recipientUser = await User.findOne({ userName: recipientUserName });

                const senderMessageHistory = senderUser?.messageHistory?.get(recipientUserName);
                const recipientMessageHistory = recipientUser?.messageHistory?.get(userName);

                if (!senderMessageHistory || !recipientMessageHistory) {
                    if (chatStates[recipientUserName]) {
                        chatStates[recipientUserName].recipientSocketId = socketId;
                    }
                    chatStates[userName] = {
                        ...chatStates[userName],
                        recipientUserName,
                        recipientSocketId,
                        socketId
                    };
                    return;
                }

                senderMessageHistory.forEach((message, messageIndex) => {
                    if (messageIndex !== senderMessageHistory.length - 1) {
                        message.seen = undefined;
                    }

                    if (message.senderUserName !== userName) {
                        if (messageIndex === senderMessageHistory.length - 1) {
                            message.seen = true;
                        }

                        recipientMessageHistory.forEach((recipientMessage, recipientMessageIndex) => {
                            if (recipientMessageIndex === recipientMessageHistory.length - 1) {
                                recipientMessage.seen = true;
                            } else {
                                recipientMessage.seen = undefined;
                            }
                        });
                    }
                });

                await senderUser.save();
                await recipientUser.save();

                const senderLatestMessage = senderUser.messageHistory.get(recipientUserName).slice(-1)[0]
                const recipientLatestMessage = recipientUser.messageHistory.get(userName).slice(-1)[0]

                socket.emit('chatReadMessages', senderLatestMessage, recipientUserName);
                socket.to(recipientSocketId).emit('chatReadMessages', recipientLatestMessage, userName);

                if (chatStates[recipientUserName]) {
                    chatStates[recipientUserName].recipientSocketId = socketId;
                }

                chatStates[userName] = {
                    ...chatStates[userName],
                    recipientUserName,
                    recipientSocketId,
                    socketId
                };
            }
        } catch (error) {
            console.error(error);
        }
    });
};

module.exports = registerHandler;