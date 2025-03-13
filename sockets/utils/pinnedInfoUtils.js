const updatePinnedInfoRevoked = (senderUser, recipientUser, recipientUserName, senderUserName, message, socket, chatStates) => {
  console.log(senderUser, recipientUser, recipientUserName, senderUserName, message, socket, chatStates)
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
  console.log(chatStates[recipientUserName])
  if (chatStates[recipientUserName]) {
    socket.to(chatStates[recipientUserName].socketId).emit('pinnedInfoUpdate', recipientPinnedIndex)
  }
};

module.exports = { updatePinnedInfoRevoked }; 