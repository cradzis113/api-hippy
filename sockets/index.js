const { Server } = require('socket.io');
const User = require('../models/userModel');
const moment = require('moment');
const { formatLastSeenMessage } = require('../utils/timeUtils');

let chatStates = {}

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOW_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {

    socket.on('search', async (query, callback) => {
      try {
        const regex = new RegExp(query, 'i');
        const users = await User.find({ userName: { $regex: regex } });

        callback(null, users);
      } catch (error) {
        console.error('Error during search:', error);
        callback(error.message, null);
      }
    });

    socket.on('updateUserStatus', async (data) => {
      try {
        const { userName, status, hasFocus } = data;
        const currentDateTime = moment();
        const formattedDateTimeString = currentDateTime.format('YYYY-MM-DD HH:mm');

        const lastSeen = hasFocus ? formattedDateTimeString : undefined;
        const lastSeenMessage = hasFocus ? formatLastSeenMessage(formattedDateTimeString) : undefined;

        const updateFields = {
          status: status,
          ...(lastSeen && { lastSeen }),
          ...(lastSeenMessage && { lastSeenMessage })
        };

        const updatedUser = await User.findOneAndUpdate(
          { userName: userName },
          { $set: updateFields },
          { new: true, upsert: true }
        );

        const userStatusUpdate = (({ status, userName, lastSeenMessage }) => ({ status, userName, lastSeenMessage }))(updatedUser);
        socket.emit('userStatusUpdated', userStatusUpdate);

      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });

    socket.on('privateChat', async (messageData) => {
      const { recipientUserName, senderUserName } = messageData;

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

        senderUser.messageHistory.get(recipientUserName).push(messageData);
        recipientUser.messageHistory.get(senderUserName).push(messageData);

        const updatedRecipientUser = await recipientUser.save();
        const updatedSenderUser = await senderUser.save();
        const senderConversationHistory = updatedSenderUser.messageHistory.get(recipientUserName);

        if (chatStates[recipientUserName]) {
          if (chatStates[recipientUserName].recipientUserName === senderUserName) {
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

            const recipientWithSeenMessages = await updatedRecipientUser.save();
            const senderWithSeenMessages = await updatedSenderUser.save();

            socket.emit('readMessages', senderWithSeenMessages);
            socket.to(chatStates[senderUserName].recipientSocketId).emit('readMessages', recipientWithSeenMessages);
            socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', senderConversationHistory);
          }
        }

        if (chatStates[recipientUserName]) {
          const refreshedRecipient = await User.findOne({ userName: recipientUserName });
          socket.to(chatStates[recipientUserName].socketId).emit('messageHistoryUpdate', refreshedRecipient.messageHistory);
          socket.to(chatStates[recipientUserName].socketId).emit('messageBackState', updatedRecipientUser.messageHistory)
        }

        const refreshedSender = await User.findOne({ userName: senderUserName });
        socket.emit('messageHistoryUpdate', refreshedSender.messageHistory);
        socket.emit('messageSent', senderConversationHistory);
      } catch (error) {
        console.error('Error updating user messages:', error);
      }
    });

    socket.on('sendMessage', (data) => {
      const { recipientUserName, message, senderUserName } = data

      socket.emit('notification', { message, recipientUserName })
      if (chatStates[recipientUserName]) {
        socket.to(chatStates[recipientUserName].socketId).emit('notification', { message, senderUserName });
      }
    })

    socket.on('chatEvent', async (eventData) => {
      const { type, userName, socketId, recipientUserName, recipientSocketId } = eventData;
      if (!userName || !socketId) return;

      if (type === 'register') {
        chatStates[userName] = { socketId };
      } else if (type === 'chatRequest') {
        if (!recipientUserName || !recipientSocketId) return;

        try {
          const senderUser = await User.findOne({ userName });
          const recipientUser = await User.findOne({ userName: recipientUserName });

          const senderMessageHistory = senderUser?.messageHistory?.get(recipientUserName);
          const recipientMessageHistory = recipientUser?.messageHistory?.get(userName);

          if (!senderMessageHistory || !recipientMessageHistory) {
            if (chatStates[recipientUserName]) {
              chatStates[recipientUserName].recipientSocketId = socketId;
            }
            chatStates[userName] = { recipientUserName, recipientSocketId, socketId };
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
          socket.emit('readMessages', senderUser);
          socket.to(recipientSocketId).emit('readMessages', recipientUser);

          if (chatStates[recipientUserName]) {
            chatStates[recipientUserName].recipientSocketId = socketId;
          }
          chatStates[userName] = { recipientUserName, recipientSocketId, socketId };
        } catch (error) {
          console.error(error);
        }
      }
    });

    socket.on('deleteMessage', async (data) => {
      const { id, senderUserName, recipientUserName, currentUser } = data;

      try {
        const senderUser = await User.findOne({ userName: senderUserName });
        const recipientUser = await User.findOne({ userName: recipientUserName });

        if (currentUser === recipientUserName) {
          const currentUserDoc = await User.findOne({ userName: currentUser });
          currentUserDoc.messageHistory.get(senderUserName).forEach(message => {
            if (message.id === id) {
              if (!message.revoked) {
                message['revoked'] = { revokedFromYou: currentUser };
              } else {
                message.revoked['revokedFromYou'] = currentUser;
              }
            }
          });
          await currentUserDoc.save();
          return;
        }

        const senderMessageHistory = senderUser.messageHistory.get(recipientUserName);
        const recipientMessageHistory = recipientUser.messageHistory.get(senderUserName);

        if (senderMessageHistory && recipientMessageHistory) {
          const recipientMessage = recipientMessageHistory.find(message => message.id === id);
          const senderMessage = senderMessageHistory.find(message => message.id === id);

          if (senderMessage && recipientMessage) {
            if (senderMessage.revoked) {
              senderMessage.revoked['revokedBoth'] = senderUserName;
            } else {
              senderMessage.revoked = { revokedBoth: senderUserName };
            }

            if (recipientMessage.revoked) {
              recipientMessage.revoked['revokedBoth'] = senderUserName;
            } else {
              recipientMessage.revoked = { revokedBoth: senderUserName };
            }

            senderUser.markModified('messageHistory');
            recipientUser.markModified('messageHistory');

            senderUser.messageHistory.set(recipientUserName, senderMessageHistory);
            recipientUser.messageHistory.set(senderUserName, recipientMessageHistory);

            await senderUser.save();
            await recipientUser.save();

            const updatedSenderMessageHistory = senderUser.messageHistory.get(recipientUserName);
            const updatedRecipientMessageHistory = recipientUser.messageHistory.get(senderUserName);

            socket.emit('messageSent', updatedSenderMessageHistory);
            socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', updatedRecipientMessageHistory);
          }
        }
      } catch (error) {
        console.error('Error occurred while deleting the message:', error);
      }
    });

    socket.on('connectionUpdate', async (connectionData) => {
      const { userName, socketId } = connectionData;

      if (!chatStates[userName]) {
        chatStates[userName] = {}
      }

      await User.findOneAndUpdate(
        { userName: userName },
        { $set: { socketId: socketId } },
      );
    });

    socket.on('disconnect', () => {
      chatStates = Object.fromEntries(
        Object.entries(chatStates).filter(([key, value]) => value.socketId !== socket.id)
      );
    });

  });
};

module.exports = setupSocket;
