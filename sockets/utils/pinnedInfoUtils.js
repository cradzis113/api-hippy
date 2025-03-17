const _ = require('lodash');

const updatePinnedInfoRevoked = (senderUser, recipientUser, recipientUserName, senderUserName, message, socket) => {
  if (_.size(senderUser?.pinnedInfo) === 0 || _.size(recipientUser?.pinnedInfo) === 0) return;
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
};

module.exports = { updatePinnedInfoRevoked }; 