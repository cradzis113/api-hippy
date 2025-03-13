const User = require('../../models/userModel');

const reactionHandler = (socket, chatStates) => {
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
            socket.to(chatStates[currentChatUser].socketId).emit('reactionUpdate', data)
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
            socket.to(chatStates[currentChatUser].socketId).emit('reactionUpdate', data)
          }
        }
      }
    } catch (error) {
      console.error('Error handling reaction:', error);
    }
  });
};

module.exports = reactionHandler; 