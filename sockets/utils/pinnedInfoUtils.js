const updatePinnedInfoRevoked = (chatStates, senderUser, recipientUser, recipientUserName, senderUserName, message, socket) => {
  const senderPinnedIndex = senderUser.pinnedInfo[recipientUserName].findIndex((msg) => msg.id === message.id);
  const recipientPinnedIndex = recipientUser.pinnedInfo[senderUserName].findIndex((msg) => msg.id === message.id);
  if (senderPinnedIndex !== -1) {
    if (!senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked) {
      senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked = { revokedBoth: senderUserName };
    } else {
      senderUser.pinnedInfo[recipientUserName][senderPinnedIndex].revoked.revokedBoth = senderUserName;
    }
    socket.emit('messagePinned', senderPinnedIndex)
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

  if (chatStates[recipientUserName]) {
    socket.to(chatStates[recipientUserName].socketId).emit('messagePinned', recipientPinnedIndex)
  }
};

module.exports = { updatePinnedInfoRevoked }; 