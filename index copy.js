const moment = require('moment');
const { Server } = require('socket.io');
const User = require('../models/userModel');
const { formatLastSeenMessage } = require('../utils/timeUtils');
const _ = require('lodash');
let chatStates = {}

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ['http://192.168.1.7:5173', 'http://localhost:5173', 'https://itself-graphs-delays-rica.trycloudflare.com'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('search', async (query, callback) => {
      try {
        const regex = new RegExp(query, 'i');
        const users = await User.find({ userName: { $regex: regex } });
        // const messageKeys = Array.from(user.messageHistory.keys());
        // const latestMessages = new Map(messageKeys.map(key => [key, user.messageHistory.get(key).slice(-10)]));
        // const userWithLatestMessages = {
        //   ...user.toObject(),
        //   messageHistory: Object.fromEntries(latestMessages)
        // };
        callback(null, users);
      } catch (error) {
        console.error('Error during search:', error);
        callback(error.message, null);
      }
    }); //

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
          ...(lastSeen && { lastSeen }),
          ...(lastSeenMessage && { lastSeenMessage })
        };

        await User.findOneAndUpdate(
          { userName: userName },
          { $set: updateFields },
          { new: true, upsert: true }
        );

        if (chatStates[userName]) {
          chatStates[userName].status = status
          const u = _.find(chatStates, { TextingWith: userName })
          if (u) {
            socket.to(u.socketId).emit('userStatus', { userName, status });
          }
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });//

    socket.on('enterChat', (data) => {
      const { userName, currentUserName } = data
      if (!userName || !currentUserName || !chatStates[userName]) return

      chatStates[currentUserName].TextingWith = userName //  Cannot set properties of undefined (setting 'TextingWith')
      setTimeout(() => {
        socket.emit('userStatus', { userName, status: chatStates[userName]?.status });
      }, 35);
    })

    socket.on('privateChat', async (messageData) => {
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

          socket.emit('readMessages', { ...messageData, seen: true }, recipientUserName);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('readMessages', { ...messageData, seen: true }, senderUserName);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', messageData);
          isChatting = true
        } else if ((chatStates[recipientUserName]?.seen &&
          !hasEmittedSeen &&
          (senderMessages.length - 1) - senderSeenIndex === 2 &&
          (recipientMessages.length - 1) - recipientSeenIndex === 2)
          && senderMessages[senderMessages.length - 1].senderUserName !== senderUserName ||
          senderMessages[senderMessages.length - 2].senderUserName !== senderUserName
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
          socket.emit('readMessages', messageData, recipientUserName, senderSeenMessageIndex);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('readMessages', messageData, senderUserName, recipientSeenMessageIndex);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', messageData);
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
          socket.emit('readMessages', messageData, recipientUserName, senderSeenMessageIndex);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('readMessages', messageData, senderUserName, recipientSeenMessageIndex);
          socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', messageData);
          isChatting = true
        }

        if (chatStates[recipientUserName]) {
          if (!isChatting) {
            socket.to(chatStates[recipientUserName].socketId).emit('messageHistoryUpdate', messageData, senderUserName);
          }

          if (!isMessageFromSender) {
            socket.to(chatStates[recipientUserName].socketId).emit('recipientUserUpdate', recipientUser)
          }
        }

        if (!isChatting) {
          socket.emit('messageHistoryUpdate', messageData, recipientUserName);
        }
        socket.emit('messageSent', messageData);
      } catch (error) {
        console.error('Error updating user messages:', error);
      }
    }); // 

    socket.on('sendMessage', (data) => {
      const { recipientUserName, message, senderUserName } = data

      socket.emit('notification', { message, recipientUserName })
      if (chatStates[recipientUserName]) {
        socket.to(chatStates[recipientUserName].socketId).emit('notification', { message, senderUserName });
      }
    })//

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
    });//

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

          socket.emit('readMessages', senderLatestMessage, recipientUserName);
          socket.to(recipientSocketId).emit('readMessages', recipientLatestMessage, userName);

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
    });//

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
            const currentRecipientUserName = message.recipientUserName;
            const currentSenderUserName = message.senderUserName;

            if (_.size(senderUser.pinnedInfo) > 0 && _.size(recipientUser.pinnedInfo) > 0) {
              const senderPinnedIndex = _.findIndex(senderUser.pinnedInfo[currentRecipientUserName], { id: message.id });
              const recipientPinnedIndex = _.findIndex(recipientUser.pinnedInfo[currentSenderUserName], { id: message.id });
              // console.log(2)
              if (senderPinnedIndex !== -1) {
                if (!senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked) {
                  senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked = {
                    revokedBy: [currentUser]
                  };
                  senderUser.markModified('pinnedInfo');
                } else {
                  const revokedBy = senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked.revokedBy || [];
                  if (!revokedBy.includes(currentUser)) {
                    revokedBy.push(currentUser);
                    senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked.revokedBy = revokedBy;
                    senderUser.markModified('pinnedInfo');
                  }
                }
              }
              if (recipientPinnedIndex !== -1) {
                if (!recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked) {
                  recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked = {
                    revokedBy: [currentUser]
                  };
                  recipientUser.markModified('pinnedInfo');
                } else {
                  const revokedBy = recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked.revokedBy || [];
                  if (!revokedBy.includes(currentUser)) {
                    revokedBy.push(currentUser);
                    recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked.revokedBy = revokedBy;
                    recipientUser.markModified('pinnedInfo');
                  }
                }
              }

              socket.emit('pinnedInfoUpdate', senderPinnedIndex)
            }

            if (!message.revoked) {
              message.revoked = { revokedBy: [currentUser] };
            } else {
              message.revoked.revokedBy = message.revoked.revokedBy || [];
              message.revoked.revokedBy.push(currentUser);
            }
          };

          messages.forEach((message) => {
            if (otherUsers) {
              console.log(1)
              otherUsers.messages.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
            }

            if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
              console.log(2)
              currentUserMessages.messages.forEach((msg) => {
                if (msg.id === message.id) {
                  revokeMessage(message);
                }
              });
            }

            if (currentUserRevokedMessages) {
              console.log(3)
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
                  console.log(4)
                  revokeMessage(message);
                }
              });
              return;
            }

            if (message.id === id) {
              console.log(5)
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

              let foundMessage;

              const messageSources = [];

              if (currentUserMessages) {
                messageSources.push(currentUserMessages.messages);
              }
              if (currentUserRevokedMessages) {
                messageSources.push(currentUserRevokedMessages.messages);
              }
              if (otherUsers) {
                messageSources.push(otherUsers.messages);
              }
              if (messageData) {
                messageSources.push(messageData);
              }

              if (messageSources.length > 0) {
                const intersections = messageSources.map(source =>
                  _.intersectionBy(updatedSenderMessageHistory, source, 'id')
                );
                foundMessage = _.flatten(intersections);
              }

              socket.emit('messageSent', foundMessage);
              if (chatStates[senderName]?.recipientSocketId) {
                socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', foundMessage);
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

            if (chatStates[senderName]?.recipientSocketId) {
              socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                message: lastMessageFromRecipient.message,
                senderUserName: senderName
              });
            }

            const foundMessage = _.find(updatedSenderMessageHistory, { id: id })
            socket.emit('messageSent', foundMessage);
            if (chatStates[senderName]?.recipientSocketId) {
              socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', foundMessage);
            }
          }

          if (currentUserRevokedMessages) {
            processMessages(currentUserRevokedMessages.messages);
          }

          if (otherUsers && !currentUserRevokedMessages && !currentUserMessages) {
            processMessages(otherUsers.messages);
          }
        };


        if (visibilityOption === 'onlyYou' && !messageData && !currentUserMessages) {
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

        if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
          for (const message of currentUserMessages.messages) {
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

        if (messageData && visibilityOption === 'onlyYou') {
          messageData.forEach((message) => {
            updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
            updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
          });
          await saveAndEmitUpdates();
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
              updatePinnedInfoRevoked(senderUser, recipientUser, message.recipientUserName, message.senderUserName, message, socket);

              if (!message.revoked) {
                message.revoked = { revokedBoth: senderUserName };
              } else {
                message.revoked.revokedBoth = senderUserName;
              }
            }

            if (messageData) {
              messageData.forEach((msg) => {
                updatePinnedInfoRevoked(senderUser, recipientUser, msg.recipientUserName, msg.senderUserName, msg, socket);

                if (!message.revoked) {
                  message.revoked = { revokedBoth: msg.senderUserName };
                } else {
                  message.revoked.revokedBoth = msg.senderUserName;
                }
              })
            }

            if (currentUserMessages) {
              updatePinnedInfoRevoked(senderUser, recipientUser, recipientUserName, senderUserName, message, socket);
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
              updatePinnedInfoRevoked(senderUser, recipientUser, message.recipientUserName, message.senderUserName, message, socket);
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
    }); // 

    socket.on('pinMessage', async (data, type) => {
      const { senderUserName, recipientUserName, message, time, id, currentChatUser } = data;

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

        await senderUser.save();
        await recipientUser.save();
        socket.emit('carouselDataUpdate', { id, time, message, senderUserName, recipientUserName, type });

        const recipientSocketId = chatStates[currentChatUser]?.socketId;
        if (recipientSocketId) {
          socket.to(recipientSocketId).emit(
            'carouselDataUpdate',
            { id, time, message, senderUserName, recipientUserName, type }
          );
        }
      } catch (error) {
        console.error("Error in pinning/unpinning message:", error);
      }
    });

    socket.on('reaction', async (data) => {
      const { messageId, emoji, currentChatUser, currentUser, type } = data;

      try {
        if (type === 'add') {
          const senderUser = await User.findOne({ userName: currentUser });
          const recipientUser = await User.findOne({ userName: currentChatUser });
          if (!senderUser || !recipientUser) return;

          const senderMessageIndex = senderUser.messageHistory.get(currentChatUser).findIndex((msg) => msg.id === messageId);
          const recipientMessageIndex = recipientUser.messageHistory.get(currentUser).findIndex((msg) => msg.id === messageId);

          if (senderMessageIndex !== -1 && recipientMessageIndex !== -1) {
            const senderMessage = senderUser.messageHistory.get(currentChatUser)[senderMessageIndex];
            const recipientMessage = recipientUser.messageHistory.get(currentUser)[recipientMessageIndex];

            if (!senderMessage.reactions) {
              senderMessage.reactions = {};
            }
            if (!recipientMessage.reactions) {
              recipientMessage.reactions = {};
            }

            senderMessage.reactions = {
              ...senderMessage.reactions,
              [currentUser]: emoji
            };

            recipientMessage.reactions = {
              ...recipientMessage.reactions,
              [currentUser]: emoji
            };

            senderUser.markModified('messageHistory');
            recipientUser.markModified('messageHistory');
            await Promise.all([senderUser.save(), recipientUser.save()]);

            socket.emit('reactionUpdate', data)
            if (chatStates[currentChatUser]) {
              socket.to(chatStates[currentChatUser].socketId).emit('reactionUpdate', data) // can't use recipientSocketId because the user is not online
            }
          }
        } else if (type === 'remove') {
          const senderUser = await User.findOne({ userName: currentUser });
          const recipientUser = await User.findOne({ userName: currentChatUser });

          if (!senderUser || !recipientUser) return;

          const senderMessageIndex = senderUser.messageHistory.get(currentChatUser).findIndex((msg) => msg.id === messageId);
          const recipientMessageIndex = recipientUser.messageHistory.get(currentUser).findIndex((msg) => msg.id === messageId);

          if (senderMessageIndex !== -1 && recipientMessageIndex !== -1) {
            const senderMessage = senderUser.messageHistory.get(currentChatUser)[senderMessageIndex];
            const recipientMessage = recipientUser.messageHistory.get(currentUser)[recipientMessageIndex];

            if (senderMessage.reactions) {
              delete senderMessage.reactions[currentUser];
            }
            if (recipientMessage.reactions) {
              delete recipientMessage.reactions[currentUser];
            }

            senderUser.markModified('messageHistory');
            recipientUser.markModified('messageHistory');
            await Promise.all([senderUser.save(), recipientUser.save()]);

            socket.emit('reactionUpdate', data)
            if (chatStates[currentChatUser]) {
              socket.to(chatStates[currentChatUser].socketId).emit('reactionUpdate', data) // can't use recipientSocketId because the user is not online
            }
          }
        }
      } catch (error) {
        console.error('Error handling reaction:', error);
      }
    });

    socket.on('updateSeenStatus', async (data) => {
      const { seen, currentUser, currentChatUser } = data;
      if (!currentUser || seen === undefined || !currentChatUser) return;
      chatStates[currentUser].seen = seen;

      try {
        const [senderUser, recipientUser] = await Promise.all([
          User.findOne({ userName: currentUser }),
          User.findOne({ userName: currentChatUser })
        ]);
        if (!senderUser || !recipientUser) return;

        if (!senderUser.messageHistory || !recipientUser.messageHistory) {
          console.log("Message history not initialized for one or both users");
          return;
        }

        const senderMessages = senderUser.messageHistory.get(currentChatUser);
        const recipientMessages = recipientUser.messageHistory.get(currentUser);

        if (!senderMessages || !recipientMessages) {
          console.log("No message history found between users");
          return;
        }

        const senderSeenIndex = _.findIndex(senderMessages, 'seen');
        const recipientSeenIndex = _.findIndex(recipientMessages, 'seen');

        if (senderSeenIndex !== -1 && recipientSeenIndex !== -1 &&
          senderSeenIndex < senderMessages.length - 1 &&
          recipientSeenIndex < recipientMessages.length - 1 &&
          _.last(senderMessages).senderUserName !== currentUser
        ) {
          senderMessages[senderSeenIndex] = _.omit(senderMessages[senderSeenIndex], ['seen']);
          recipientMessages[recipientSeenIndex] = _.omit(recipientMessages[recipientSeenIndex], ['seen']);

          _.last(senderMessages).seen = true;
          _.last(recipientMessages).seen = true;

          senderUser.markModified('messageHistory');
          recipientUser.markModified('messageHistory');

          socket.emit('updateSeenStatus', { indexSeen: senderSeenIndex, user: currentChatUser });
          if (chatStates[currentChatUser]?.socketId) {
            socket.to(chatStates[currentChatUser].socketId).emit('updateSeenStatus', { indexSeen: recipientSeenIndex, user: currentUser });
          }

          await Promise.all([senderUser.save(), recipientUser.save()]);
        }

      } catch (error) {
        console.error("Error updating seen status:", error);
      }
    });

    socket.on('connectionUpdate', async (connectionData) => {
      const { userName, socketId } = connectionData;
      if (!userName) return;

      if (!chatStates[userName]) {
        chatStates[userName] = {}
      }

      await User.findOneAndUpdate(
        { userName: userName },
        { $set: { socketId: socketId } },
      );
    });

    socket.on('disconnect', async () => {
      const disconnectedUserId = _.findKey(chatStates, userState => userState.socketId === socket.id);

      try {
        chatStates = Object.fromEntries(
          Object.entries(chatStates).filter(([userId, userState]) => userState.socketId !== socket.id)
        );

        const affectedUsers = _.compact(_.map(chatStates, (userState, userId) => {
          if (_.includes(userState.userOnline, disconnectedUserId)) {
            return {
              socketId: userState.socketId,
              userOffline: disconnectedUserId,
            };
          }
        }));

        affectedUsers.forEach(affectedUser => {
          io.to(affectedUser.socketId).emit('removeMessageFromQueue', affectedUser.userOffline);
        });
      } catch (error) {
        console.error("Error processing disconnect event:", error);
      }
    });

  });
};

const updatePinnedInfoRevoked = (senderUser, recipientUser, recipientUserName, senderUserName, message, socket) => {
  console.log(1)
  const senderPinnedIndex = senderUser.pinnedInfo[recipientUserName].findIndex((msg) => msg.id === message.id);
  const recipientPinnedIndex = recipientUser.pinnedInfo[senderUserName].findIndex((msg) => msg.id === message.id);
  if (senderPinnedIndex !== -1) {
    if (!senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked) {
      senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked = { revokedBoth: senderUserName };
    } else {
      senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked.revokedBoth = senderUserName;
    }
  }
  if (recipientPinnedIndex !== -1) {
    if (!recipientUser.pinnedInfo[senderUserName][recipientPinnedIndex].revoked) {
      recipientUser.pinnedInfo[senderUserName][recipientPinnedIndex].revoked = { revokedBoth: recipientUserName };
    } else {
      recipientUser.pinnedInfo[senderUserName][recipientPinnedIndex].revoked.revokedBoth = recipientUserName;
    }
  }

  senderUser.markModified('pinnedInfo');
  recipientUser.markModified('pinnedInfo');

  socket.emit('pinnedInfoUpdate', senderPinnedIndex)
  if (chatStates[recipientUserName]) {
    socket.to(chatStates[recipientUserName].socketId).emit('pinnedInfoUpdate', recipientPinnedIndex)
  }
};

module.exports = setupSocket;