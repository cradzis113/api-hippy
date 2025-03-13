const User = require('../../models/userModel');
const _ = require('lodash');

const seenStatusHandler = (socket, chatStates) => {
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
};

module.exports = seenStatusHandler; 