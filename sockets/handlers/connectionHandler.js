const User = require('../../models/userModel');
const _ = require('lodash');

const connectionHandler = (socket, chatStates, io) => {
  socket.on('userConnectionUpdate', async (connectionData) => {
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
};

module.exports = connectionHandler; 