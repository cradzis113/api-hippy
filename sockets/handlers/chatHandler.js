const User = require('../../models/userModel');
const _ = require('lodash');

const chatHandler = (socket, chatStates, io) => {
    socket.on('chatEnter', (data) => {
        const { userName, currentUserName } = data
        if (!userName || !currentUserName || !chatStates[userName]) return

        chatStates[currentUserName].TextingWith = userName //  Cannot set properties of undefined (setting 'TextingWith')
        setTimeout(() => {
            socket.emit('chatUserStatus', { userName, status: chatStates[userName]?.status });
        }, 35);
    })

    socket.on('chatPrivate', async (messageData) => {
        const { recipientUserName, senderUserName, hasEmittedSeen } = messageData;
        let isChatting = false

        try {
            const senderUser = await User.findOne({ userName: senderUserName });
            const recipientUser = await User.findOne({ userName: recipientUserName });

            if (!senderUser || !recipientUser) {
                return console.error('Sender or recipient not found');
            }

            if (!senderUser.messageHistory) {
                senderUser.messageHistory = new Map();
            }

            if (!recipientUser.messageHistory) {
                recipientUser.messageHistory = new Map();
            }

            if (!senderUser.messageHistory.has(recipientUserName)) {
                senderUser.messageHistory.set(recipientUserName, []);
            }

            if (!recipientUser.messageHistory.has(senderUserName)) {
                recipientUser.messageHistory.set(senderUserName, []);
            }

            const hasBeenSeenBySender = senderUser.messageHistory.get(recipientUserName).some(i => i.seen);
            const hasBeenSeenByRecipient = recipientUser.messageHistory.get(senderUserName).some(i => i.seen);
            const hasBeenTemporarilySeenBySender = recipientUser.messageHistory.get(senderUserName).some(i => i.seenTemporarily);
            const hasBeenTemporarilySeenByRecipient = senderUser.messageHistory.get(recipientUserName).some(i => i.seenTemporarily);
            const isMessageFromSender = recipientUser.messageHistory.get(senderUserName).some(i => i.senderUserName === senderUserName);

            if (!hasBeenSeenBySender && !hasBeenTemporarilySeenBySender) {
                const temporaryMessage = { ...messageData, seenTemporarily: true };
                senderUser.messageHistory.get(recipientUserName).push(temporaryMessage);
            } else {
                senderUser.messageHistory.get(recipientUserName).push(messageData);
            }

            if (!hasBeenSeenByRecipient && !hasBeenTemporarilySeenByRecipient) {
                const temporaryMessage = { ...messageData, seenTemporarily: true };
                recipientUser.messageHistory.get(senderUserName).push(temporaryMessage);
            } else {
                recipientUser.messageHistory.get(senderUserName).push(messageData);
            }

            if (chatStates[recipientUserName] && !chatStates[recipientUserName].returnMessage) {
                chatStates[recipientUserName].returnMessage = true
            }

            const senderMessages = senderUser.messageHistory.get(recipientUserName);
            const recipientMessages = recipientUser.messageHistory.get(senderUserName);
            const senderSeenIndex = _.findIndex(senderMessages, 'seen');
            const recipientSeenIndex = _.findIndex(recipientMessages, 'seen');

            const updatedRecipientUser = await recipientUser.save();
            const updatedSenderUser = await senderUser.save();

            if (
                (
                    (!chatStates[recipientUserName]?.seen && !chatStates[senderUserName]?.seen) ||
                    (
                        (_.last(updatedSenderUser.messageHistory.get(recipientUserName)).senderUserName === senderUserName) &&
                        !chatStates[recipientUserName]?.seen
                    )
                ) && chatStates[recipientUserName] && chatStates[recipientUserName].recipientUserName === senderUserName) {
                updatedSenderUser.messageHistory.get(recipientUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === updatedSenderUser.messageHistory.get(recipientUserName).length - 1) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });
                updatedRecipientUser.messageHistory.get(senderUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === updatedRecipientUser.messageHistory.get(senderUserName).length - 1) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });

                await updatedRecipientUser.save();
                await updatedSenderUser.save();

                socket.emit('chatReadMessages', { ...messageData, seen: true }, recipientUserName);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatReadMessages', { ...messageData, seen: true }, senderUserName);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatMessageSent', messageData);
                isChatting = true
            } else if ((chatStates[recipientUserName]?.seen &&
                !hasEmittedSeen &&
                (senderMessages.length - 1) - senderSeenIndex === 2 &&
                (recipientMessages.length - 1) - recipientSeenIndex === 2)
                && senderMessages[senderMessages.length - 1]?.senderUserName !== senderUserName ||
                senderMessages[senderMessages.length - 2]?.senderUserName !== senderUserName
            ) {
                updatedSenderUser.messageHistory.get(recipientUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === updatedSenderUser.messageHistory.get(recipientUserName).length - 2) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });
                updatedRecipientUser.messageHistory.get(senderUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === updatedRecipientUser.messageHistory.get(senderUserName).length - 2) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });

                const savedRecipientUser = await updatedRecipientUser.save();
                const savedSenderUser = await updatedSenderUser.save();

                const senderSeenMessageIndex = _.findIndex(savedSenderUser.messageHistory.get(recipientUserName), 'seen')
                const recipientSeenMessageIndex = _.findIndex(savedRecipientUser.messageHistory.get(senderUserName), 'seen')
                socket.emit('chatReadMessages', messageData, recipientUserName, senderSeenMessageIndex);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatReadMessages', messageData, senderUserName, recipientSeenMessageIndex);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatMessageSent', messageData);
                isChatting = true
            } else if ((chatStates[recipientUserName]?.seen &&
                !chatStates[senderUserName]?.seen &&
                (senderMessages.length - 1) - senderSeenIndex === 2 &&
                (recipientMessages.length - 1) - recipientSeenIndex === 2)) {
                updatedSenderUser.messageHistory.get(recipientUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === senderSeenIndex) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });
                updatedRecipientUser.messageHistory.get(senderUserName).forEach((msg, msgIndex) => {
                    if (msgIndex === recipientSeenIndex) {
                        msg.seen = true;
                    } else {
                        msg.seen = undefined;
                    }
                });

                const savedRecipientUser = await updatedRecipientUser.save();
                const savedSenderUser = await updatedSenderUser.save();

                const senderSeenMessageIndex = _.findIndex(savedSenderUser.messageHistory.get(recipientUserName), 'seen')
                const recipientSeenMessageIndex = _.findIndex(savedRecipientUser.messageHistory.get(senderUserName), 'seen')
                socket.emit('chatReadMessages', messageData, recipientUserName, senderSeenMessageIndex);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatReadMessages', messageData, senderUserName, recipientSeenMessageIndex);
                socket.to(chatStates[senderUserName].recipientSocketId).emit('chatMessageSent', messageData);
                isChatting = true
            }

            if (chatStates[recipientUserName]) {
                if (!isChatting) {
                    socket.to(chatStates[recipientUserName].socketId).emit('chatHistoryUpdate', messageData, senderUserName);
                }

                if (!isMessageFromSender) {
                    socket.to(chatStates[recipientUserName].socketId).emit('chatRecipientUpdate', recipientUser)
                }
            }

            if (!isChatting) {
                socket.emit('chatHistoryUpdate', messageData, recipientUserName);
            }
            socket.emit('chatMessageSent', messageData);
        } catch (error) {
            console.error('Error updating user messages:', error);
        }
    });
};

module.exports = chatHandler; 