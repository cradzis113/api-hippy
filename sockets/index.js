const { Server } = require('socket.io');
const User = require('../models/userModel');
const moment = require('moment');
const { formatLastSeenTime } = require('../utils/timeUtils');

const chatStates = {}

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

    socket.on('sendMessage', async (messageData) => {
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
    
        Object.keys(chatStates).forEach(clientId => {
          const clientState = chatStates[clientId];
          if (clientState.recipientUserName === recipientUserName) {
            socket.to(clientState.socketId).emit('messageSent', conversation);
          }
        });
    
        socket.emit('messageSent', conversation);
      } catch (error) {
        console.error('Error updating user messages:', error);
      }
    });
    

    socket.on('chatRequest', (messageData) => {
      const { recipientUserName, socketId } = messageData;

      if (!recipientUserName && !socketId) return
      chatStates[socketId] = { recipientUserName, socketId }
    });

    socket.on('connectionUpdate', async (connectionData) => {
      const { userName, socketId } = connectionData;

      if (socketId && !chatStates[socketId]) {
        chatStates[socketId] = {}
      }

      await User.findOneAndUpdate(
        { userName: userName },
        { $set: { socketId: socketId } },
      );
    });

    socket.on('disconnect', () => {
      if (chatStates[socket.id]) {
        delete chatStates[socket.id]
      }
    });

  });
};

module.exports = setupSocket;
