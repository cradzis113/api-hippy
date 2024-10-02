const { Server } = require('socket.io');
const User = require('../models/userModel');
const moment = require('moment');
const { formatLastSeenTime } = require('../utils/timeUtils');

let chatStates = {}

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
        const regex = new RegExp(query, 'i');
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

    socket.on('privateChat', async (messageData) => {
      const { recipientUserName, senderUserName } = messageData;

      try {
        const sender = await User.findOne({ userName: senderUserName });
        const recipient = await User.findOne({ userName: recipientUserName });

        if (!sender || !recipient) {
          return console.error('Sender or recipient not found');
        }

        if (!sender.messageHistory) {
          sender.messageHistory = new Map();
        }

        if (!recipient.messageHistory) {
          recipient.messageHistory = new Map();
        }

        if (!sender.messageHistory.has(recipientUserName)) {
          sender.messageHistory.set(recipientUserName, []);
        }

        if (!recipient.messageHistory.has(senderUserName)) {
          recipient.messageHistory.set(senderUserName, []);
        }

        sender.messageHistory.get(recipientUserName).push(messageData);
        recipient.messageHistory.get(senderUserName).push(messageData);

        await recipient.save();
        const updatedSender = await sender.save();
        const conversation = updatedSender.messageHistory.get(recipientUserName);

        if (chatStates[recipientUserName]) {
          if (chatStates[recipientUserName].recipientUserName === senderUserName) {
            socket.to(chatStates[senderUserName].recipientSocketId).emit('messageSent', conversation);
          }
        }

        socket.emit('messageSent', conversation);
      } catch (error) {
        console.error('Error updating user messages:', error);
      }
    });

    socket.on('sendMessage', (data) => {
      const { recipientUserName, message, senderUserName } = data
      socket.to(chatStates[recipientUserName].socketId).emit('cee', { message, senderUserName })

    })

    socket.on('chatEvent', (data) => {
      const { type, userName, socketId, recipientUserName, recipientSocketId } = data;
  
      // Check for required fields
      if (!userName || !socketId) return;
  
      if (type === 'register') {
          // Handle user registration
          chatStates[userName] = { socketId };
      } else if (type === 'chatRequest') {
          // Handle chat request
          if (!recipientUserName || !recipientSocketId) return;
  
          // Check if recipient is registered
          if (chatStates[recipientUserName]) {
              chatStates[recipientUserName].recipientSocketId = socketId;
          }
  
          chatStates[userName] = { recipientUserName, recipientSocketId, socketId };
      }
  });
  

    socket.on('connectionUpdate', async (connectionData) => {
      const { userName, socketId } = connectionData;

      if (!chatStates[userName]) {
        chatStates[userName] = {}
      }

      await User.findOneAndUpdate(
        { userName: userName },
        { $set: { socketId: socketId } },
      );
    });

    socket.on('disconnect', () => {
      chatStates = Object.fromEntries(
        Object.entries(chatStates).filter(([key, value]) => value.socketId !== socket.id)
      );
    });

  });
};

module.exports = setupSocket;
