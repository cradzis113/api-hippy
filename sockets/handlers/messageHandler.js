const User = require('../../models/userModel');

const messageHandler = (socket, chatStates) => {
    socket.on('sendMessage', (data) => {
        const { recipientUserName, message, senderUserName } = data

        socket.emit('notification', { message, recipientUserName })
        if (chatStates[recipientUserName]) {
            socket.to(chatStates[recipientUserName].socketId).emit('notification', { message, senderUserName });
        }
    })

    socket.on('fetchUnseenMessages', async (userName) => {
        if (!chatStates[userName].returnMessage) { // lỗi
            return;
        }

        try {
            const user = await User.findOne({ userName });
            const messageRooms = Object.keys(Object.fromEntries(user.messageHistory));

            const unseenMessages = messageRooms.reduce((accumulator, room) => {
                const messages = user.messageHistory.get(room) || [];
                const firstSeenIndex = messages.findIndex(message => message.seen);
                const firstTemporarilySeenIndex = messages.findIndex(message => message.seenTemporarily);

                if (firstSeenIndex === -1) {
                    if (messages.length === 1) {
                        accumulator[room] = messages;
                        return accumulator
                    }

                    const newMessages = messages.slice(firstTemporarilySeenIndex + 1);
                    accumulator[room] = newMessages;
                    return accumulator;
                }

                const newMessages = messages.slice(firstSeenIndex + 1);
                accumulator[room] = newMessages;
                return accumulator;
            }, {});

            socket.emit('unseenMessages', unseenMessages);
        } catch (error) {
            console.error('Error processing unseen messages:', error);
        }
    });
};

module.exports = messageHandler; 