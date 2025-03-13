const { Server } = require('socket.io');
const searchHandler = require('./handlers/searchHandler');
const userStatusHandler = require('./handlers/userStatusHandler');
const chatHandler = require('./handlers/chatHandler');
const messageHandler = require('./handlers/messageHandler');
const deleteMessageHandler = require('./handlers/deleteHandler');
const pinMessageHandler = require('./handlers/pinMessageHandler');
const reactionHandler = require('./handlers/reactionHandler');
const seenStatusHandler = require('./handlers/seenStatusHandler');
const connectionHandler = require('./handlers/connectionHandler');
const registerHandler = require('./handlers/registerHandler');
let chatStates = {};

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ['http://192.168.1.7:5173', 'http://localhost:5173', 'https://republican-vermont-mirrors-colony.trycloudflare.com'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    searchHandler(socket);
    userStatusHandler(socket, chatStates);
    chatHandler(socket, chatStates);
    messageHandler(socket, chatStates);
    deleteMessageHandler(socket, chatStates);
    pinMessageHandler(socket, chatStates);
    reactionHandler(socket, chatStates);
    seenStatusHandler(socket, chatStates);
    connectionHandler(socket, chatStates, io);
    registerHandler(socket, chatStates, io);
  });
};

module.exports = setupSocket;