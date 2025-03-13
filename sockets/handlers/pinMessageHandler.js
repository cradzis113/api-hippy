const moment = require('moment');
const User = require('../../models/userModel');

const pinMessageHandler = (socket, chatStates) => {
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
};

module.exports = pinMessageHandler; 