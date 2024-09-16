const { Server } = require('socket.io');
const User = require('../models/userModel'); 
const getCurrentTime = require('../utils/timeUtils');

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
        const regex = new RegExp(query, 'i'); // 'i' để không phân biệt chữ hoa chữ thường
        const users = await User.find({ userName: { $regex: regex } });

        callback(null, users);
      } catch (error) {
        console.error('Error during search:', error);
        callback(error.message, null);
      }
    });

    socket.on('updateUserStatus', async (data) => {
      try {
        const { userName, status, requiresNotification } = data;

        const updatedUser = await User.findOneAndUpdate(
          { userName: userName },
          { $set: { status: status, lastSeen: getCurrentTime() } },
          { new: true, upsert: true }
        );

        const userStatusUpdate = (({ status, lastSeen, userName }) => ({ status, lastSeen, userName }))(updatedUser);

        if (requiresNotification) {
          io.emit('userStatusUpdated', userStatusUpdate);
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });
  });
};

module.exports = setupSocket;
