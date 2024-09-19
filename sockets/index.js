const { Server } = require('socket.io');
const User = require('../models/userModel');
const moment = require('moment');
const { formatLastSeenTime } = require('../utils/timeUtils');

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
        const { userName, status, hasFocus } = data;
        const currentDateTime = moment();
        const formattedDateTimeString = currentDateTime.format('YYYY-MM-DD HH:mm');

        const lastSeen = hasFocus ? formattedDateTimeString : undefined;
        const lastSeenMessage = hasFocus ? formatLastSeenTime(formattedDateTimeString) : undefined;

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
        io.emit('userStatusUpdated', userStatusUpdate);

      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });

    socket.on('sendMessage', async (messageData) => {
      const { recipientUserName, senderUserName } = messageData;

      try {
        const sender = await User.findOne({ userName: senderUserName });
        const recipient = await User.findOne({ userName: recipientUserName });

        if (!sender || !recipient) {
          return console.error('User not found');
        }

        if (!sender.otherUsers) {
          sender.otherUsers = new Map();
        }

        if (!recipient.otherUsers) {
          recipient.otherUsers = new Map();
        }

        if (!sender.otherUsers.has(recipientUserName)) {
          sender.otherUsers.set(recipientUserName, []);
        }

        if (!recipient.otherUsers.has(senderUserName)) {
          recipient.otherUsers.set(senderUserName, []);
        }

        sender.otherUsers.get(recipientUserName).push(messageData);
        recipient.otherUsers.get(senderUserName).push(messageData);

        const updatedUserData = await sender.save();
        await recipient.save();
        io.emit('messageSent', updatedUserData);
      } catch (error) {
        console.error('Error updating user messages:', error);
      }
    });

  });
};

module.exports = setupSocket;
