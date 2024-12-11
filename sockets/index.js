const moment = require('moment');
const { Server } = require('socket.io');
const User = require('../models/userModel');
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

        const user = await User.findOne({ userName });
        if (!user) return;

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
      const {
        id,
        revoked,
        otherUsers,
        currentUser,
        messageData,
        senderUserName,
        visibilityOption,
        recipientUserName,
        currentUserMessages,
        currentUserRevokedMessages
      } = data;

      try {
        let senderUser, recipientUser;
        if (!messageData && !currentUserMessages && !currentUserRevokedMessages && !otherUsers) {
          [senderUser, recipientUser] = await Promise.all([
            User.findOne({ userName: senderUserName }),
            User.findOne({ userName: recipientUserName }),
          ]);
        }

        if (otherUsers) {
          for (const message of otherUsers.messages) {
            recipientUser = await User.findOne({ userName: message.recipientUserName });
            senderUser = await User.findOne({ userName: message.senderUserName });
          }
        }

        if (currentUserMessages) {
          for (const message of currentUserMessages.messages) {
            recipientUser = await User.findOne({ userName: message.recipientUserName });
            senderUser = await User.findOne({ userName: message.senderUserName });
          }
        }

        if (currentUserRevokedMessages) {
          for (const message of currentUserRevokedMessages.messages) {
            recipientUser = await User.findOne({ userName: message.recipientUserName });
            senderUser = await User.findOne({ userName: message.senderUserName });
          }
        }

        if (messageData) {
          for (const message of messageData) {
            recipientUser = await User.findOne({ userName: message.recipientUserName });
            senderUser = await User.findOne({ userName: message.senderUserName });
          }
        }

        const updateMessageRevokedStatus = (messages) => {
          if (!messages) return;

          const revokeMessage = (message) => {
            if (!message.revoked) {
              message.revoked = { revokedBy: [currentUser] };
            } else {
              message.revoked.revokedBy = message.revoked.revokedBy || [];
              message.revoked.revokedBy.push(currentUser);
            }
          };

          messages.forEach((message) => {
            if (otherUsers) {
              otherUsers.messages.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
            }

            if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
              currentUserMessages.messages.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
            }

            if (currentUserRevokedMessages) {
              currentUserRevokedMessages.messages.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
              return;
            }

            if (messageData) {
              messageData.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
              return;
            }

            if (message.id === id) {
              revokeMessage(message);
            }
          });
        };

        const processUserMessages = (chatMessageHistory, userName, currentUserName) => {
          const userMessages = chatMessageHistory[userName];
          let lastMessage = userMessages[userMessages.length - 1];

          const firstNonRevokedByOtherUser = userMessages.find(
            message => !message?.revoked?.revokedBoth && !message.revoked?.revokedBy?.includes(userName)
          );

          const messagesRevokedByCurrentUser = userMessages.filter(
            message => message?.revoked?.revokedBy?.includes(currentUserName)
          );

          const nonRevokedMessages = userMessages.filter(
            msg => !msg?.revoked?.revokedBoth && !msg?.revoked?.revokedBy?.includes(currentUserName)
          );

          const revokedMessagesByBoth = userMessages.filter(
            msg => msg?.revoked?.revokedBoth && !msg?.revoked?.revokedBy?.includes(currentUserName)
          );

          const firstMessageRevokedByBoth = revokedMessagesByBoth.find(msg => msg?.revoked?.revokedBoth);
          const latestMessageRevokedByBoth = revokedMessagesByBoth.reverse().find(msg => msg?.revoked?.revokedBoth);
          const latestRevokedIndex = userMessages.findIndex(msg => msg?.id === latestMessageRevokedByBoth?.id);
          const latestNonRevokedIndex = userMessages.findIndex(
            msg => msg?.id === nonRevokedMessages[nonRevokedMessages.length - 1]?.id
          );

          if (firstNonRevokedByOtherUser) {
            if (latestNonRevokedIndex > latestRevokedIndex) {
              lastMessage = userMessages[latestNonRevokedIndex];
            } else if (latestRevokedIndex !== -1 && !userMessages[latestRevokedIndex]?.revoked?.revokedBy?.includes(currentUserName)) {
              lastMessage = {
                message: `${userMessages[latestRevokedIndex].senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
              };
            } else if (messagesRevokedByCurrentUser.length === userMessages.length) {
              lastMessage = { message: 'History was cleared' };
            }
          } else {
            if (lastMessage?.revoked?.revokedBoth && !lastMessage?.revoked?.revokedBy?.includes(currentUserName)) {
              lastMessage = {
                message: `${lastMessage.senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
              };
            } else if (messagesRevokedByCurrentUser.length === userMessages.length) {
              lastMessage = { message: 'History was cleared' };
            } else if (nonRevokedMessages.length === 1 && !firstMessageRevokedByBoth) {
              lastMessage = nonRevokedMessages[0];
            } else if (nonRevokedMessages.length > 1 && !latestMessageRevokedByBoth) {
              lastMessage = nonRevokedMessages[nonRevokedMessages.length - 1];
            } else if (firstMessageRevokedByBoth && nonRevokedMessages.length === 0) {
              lastMessage = {
                message: `${firstMessageRevokedByBoth.senderUserName === currentUserName ? 'Bạn' : senderUserName} đã thu hồi một tin nhắn`
              };
            } else if (latestNonRevokedIndex > latestRevokedIndex) {
              lastMessage = userMessages[latestNonRevokedIndex];
            } else if (latestNonRevokedIndex < latestRevokedIndex) {
              lastMessage = {
                message: `${firstMessageRevokedByBoth.senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
              };
            }
          }

          return lastMessage
        };

        const saveAndEmitUpdates = async () => {
          senderUser.markModified('messageHistory');
          recipientUser.markModified('messageHistory');

          await Promise.all([senderUser.save(), recipientUser.save()]);

          const processMessages = (messages, isCurrentUserMessages = false) => {
            messages.forEach((message) => {
              const recipientName = message.recipientUserName;
              const senderName = message.senderUserName;

              const updatedSenderMessageHistory = senderUser.messageHistory.get(recipientName);
              const lastMessageFromSender = processUserMessages(Object.fromEntries(senderUser.messageHistory), recipientName, currentUser);
              const lastMessageFromRecipient = processUserMessages(Object.fromEntries(recipientUser.messageHistory), senderName, recipientName);

              if (visibilityOption === 'onlyYou' ||
                currentUserRevokedMessages?.visibilityOption === 'onlyYou' ||
                otherUsers?.visibilityOption === 'onlyYou' ||
                messageData?.visibilityOption === 'onlyYou'
              ) {
                socket.emit('notification', {
                  message: lastMessageFromSender.message,
                  originMessage: lastMessageFromSender,
                  recipientUserName: recipientName,
                  senderUserName: senderName,
                  listMessage: updatedSenderMessageHistory
                });

                if (isCurrentUserMessages) {
                  socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                    message: lastMessageFromRecipient.message,
                    senderUserName: senderName
                  });
                }
              } else {
                socket.emit('notification', {
                  message: lastMessageFromSender.message,
                  recipientUserName: recipientName,
                  senderUserName: senderName
                });

                if (isCurrentUserMessages) {
                  socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                    message: lastMessageFromRecipient.message,
                    senderUserName: senderName
                  });
                }
              }

              socket.emit('messageSent', updatedSenderMessageHistory);

              if (chatStates[senderName]?.recipientSocketId) {
                socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', updatedSenderMessageHistory);
              }
            });
          };

          if (currentUserMessages) {
            processMessages(currentUserMessages.messages, true);
          }

          if (messageData) {
            processMessages(messageData);
          }

          if (!messageData && !currentUserMessages && !otherUsers && !currentUserRevokedMessages) {
            const recipientName = recipientUserName;
            const senderName = senderUserName;

            const updatedSenderMessageHistory = senderUser.messageHistory.get(recipientName);
            const lastMessageFromSender = processUserMessages(Object.fromEntries(senderUser.messageHistory), recipientName, currentUser);
            const lastMessageFromRecipient = processUserMessages(Object.fromEntries(recipientUser.messageHistory), senderName, recipientName);

            socket.emit('notification', {
              message: lastMessageFromSender.message,
              recipientUserName: recipientName,
              senderUserName: senderName
            });

            socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
              message: lastMessageFromRecipient.message,
              senderUserName: senderName
            });

            socket.emit('messageSent', updatedSenderMessageHistory);
            socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', updatedSenderMessageHistory);
          }

          if (currentUserRevokedMessages) {
            processMessages(currentUserRevokedMessages.messages);
          }

          if (otherUsers && !currentUserRevokedMessages && !currentUserMessages) {
            processMessages(otherUsers.messages);
          }
        };


        if (visibilityOption === 'onlyYou') {
          if (currentUser === senderUserName) {
            updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
            await saveAndEmitUpdates();
            return;
          }

          if (revoked && revoked.revokedBoth && !revoked.revokedBy) {
            updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
            await saveAndEmitUpdates();
            return;
          }

          if (revoked && revoked.revokedBoth && revoked.revokedBy) {
            updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
            await saveAndEmitUpdates();
            return;
          }

          if (currentUser === recipientUserName) {
            updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
            await saveAndEmitUpdates();
            return;
          }
        }

        if (messageData && data.visibilityOption === 'onlyYou') {
          for (const message of messageData) {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
          }
          await saveAndEmitUpdates();
          return;
        }

        if (currentUserRevokedMessages && currentUserRevokedMessages.visibilityOption === 'onlyYou') {
          currentUserRevokedMessages.messages.forEach((message) => {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
          });
          await saveAndEmitUpdates();
        }

        if (otherUsers && otherUsers.visibilityOption === 'onlyYou' && !currentUserMessages) {
          otherUsers.messages.forEach((message) => {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
          });
          await saveAndEmitUpdates();
        } else if (otherUsers && otherUsers.visibilityOption === 'onlyYou' && currentUserMessages) {
          otherUsers.messages.forEach((message) => {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.senderUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.recipientUserName));
          });
          await saveAndEmitUpdates();
        }

        if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
          currentUserMessages.messages.forEach((message) => {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.senderUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.recipientUserName));
          });
          await saveAndEmitUpdates();
          return;
        }

        let senderMessageHistory, recipientMessageHistory;
        if (currentUserMessages) {
          currentUserMessages.messages.forEach((message) => {
            senderMessageHistory = senderUser.messageHistory.get(message.recipientUserName);
            recipientMessageHistory = recipientUser.messageHistory.get(message.senderUserName);
          });
        } else if (messageData) {
          messageData.forEach((message) => {
            senderMessageHistory = senderUser.messageHistory.get(message.recipientUserName);
            recipientMessageHistory = recipientUser.messageHistory.get(message.senderUserName);
          });
        } else {
          senderMessageHistory = senderUser.messageHistory.get(recipientUserName);
          recipientMessageHistory = recipientUser.messageHistory.get(senderUserName);
        }

        if (senderMessageHistory &&
          recipientMessageHistory &&
          (
            visibilityOption === 'everyone' ||
            currentUserMessages?.visibilityOption === 'everyone'
          )) {
          if (currentUserMessages) {
            currentUserMessages.messages.forEach((message) => {
              senderMessage = senderMessageHistory.find((msg) => msg.id === message.id);
              recipientMessage = recipientMessageHistory.find((msg) => msg.id === message.id);
            });
          }

          const setRevokedBoth = (message) => {
            if (!currentUserMessages || !messageData) {
              if (!message.revoked) {
                message.revoked = { revokedBoth: senderUserName };
              } else {
                message.revoked.revokedBoth = senderUserName;
              }
            }

            if (messageData) {
              messageData.forEach((msg) => {
                if (!message.revoked) {
                  message.revoked = { revokedBoth: msg.senderUserName };
                } else {
                  message.revoked.revokedBoth = msg.senderUserName;
                }
              })
            }

            if (currentUserMessages) {
              currentUserMessages.messages.forEach((msg) => {
                if (!message.revoked) {
                  message.revoked = { revokedBoth: msg.senderUserName };
                } else {
                  message.revoked.revokedBoth = msg.senderUserName;
                }
              });
            }
          };

          if (messageData) {
            messageData.forEach((message) => {
              senderMessage = senderMessageHistory.find((msg) => msg.id === message.id);
              recipientMessage = recipientMessageHistory.find((msg) => msg.id === message.id);

              if (senderMessage && recipientMessage) {
                setRevokedBoth(senderMessage);
                setRevokedBoth(recipientMessage);
              }
            });
          }

          if (!messageData && !currentUserMessages) {
            senderMessage = senderMessageHistory.find((msg) => msg.id === id);
            recipientMessage = recipientMessageHistory.find((msg) => msg.id === id);
          }

          if (senderMessage && recipientMessage) {
            setRevokedBoth(senderMessage);
            setRevokedBoth(recipientMessage);
            await saveAndEmitUpdates();
          }
        }
      } catch (error) {
        console.error('Error occurred while deleting the message:', error);
      }
    });

    socket.on('pinMessage', async (data, type) => {
      const { senderUserName, recipientUserName, message, time, id } = data;

      try {
        const senderUser = await User.findOne({ userName: senderUserName });
        const recipientUser = await User.findOne({ userName: recipientUserName });

        if (!senderUser || !recipientUser) {
          console.log("User not found");
          return;
        }

        const insertMessageFindIndex = (messages, newMessage) => {
          const newTime = moment(newMessage.time);
          const index = messages.findIndex((msg) => moment(msg.time).isAfter(newTime));
          if (index === -1) {
            messages.push(newMessage);
          } else {
            messages.splice(index, 0, newMessage);
          }
        };

        const updatePinnedInfo = (user, key, action) => {
          if (action === 'pin') {
            if (!user.pinnedInfo) user.pinnedInfo = {};
            if (!user.pinnedInfo[key]) user.pinnedInfo[key] = [];
            const newMessage = { message, time, senderUserName, recipientUserName, id };
            insertMessageFindIndex(user.pinnedInfo[key], newMessage);
          } else if (action === 'unpin') {
            if (user.pinnedInfo?.[key]) {
              user.pinnedInfo[key] = user.pinnedInfo[key].filter((msg) => msg.id !== id);
              if (user.pinnedInfo[key].length === 0) delete user.pinnedInfo[key];
            }
          }
        };

        updatePinnedInfo(senderUser, recipientUserName, type);
        updatePinnedInfo(recipientUser, senderUserName, type);

        senderUser.markModified('pinnedInfo');
        recipientUser.markModified('pinnedInfo');

        const updatedSenderUser = await senderUser.save();
        const updatedRecipientUser = await recipientUser.save();

        socket.emit('carouselDataUpdate', updatedSenderUser?.pinnedInfo[recipientUserName] || []);

        const recipientSocketId = chatStates[recipientUserName]?.recipientSocketId;
        if (recipientSocketId) {
          socket.to(recipientSocketId).emit(
            'carouselDataUpdate',
            updatedRecipientUser?.pinnedInfo[senderUserName] || []
          );
        }
      } catch (error) {
        console.error("Error in pinning/unpinning message:", error);
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

    socket.on('getUserData', async (userName) => {
      try {
        const userData = await User.findOne({ userName });
        socket.emit('receiveUserData', userData);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    });

    socket.on('disconnect', () => {
      chatStates = Object.fromEntries(
        Object.entries(chatStates).filter(([key, value]) => value.socketId !== socket.id)
      );
    });

  });
};

module.exports = setupSocket;