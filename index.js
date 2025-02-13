require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');

const indexRoutes = require('./routes/index');
const connectDB = require('./config/database');
const setupSocket = require('./sockets/index');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://192.168.1.7:5173',
      'http://192.168.1.241:5173',
      'http://localhost:5173',
      'https://itself-graphs-delays-rica.trycloudflare.com'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(bodyParser.json());
app.use(cookieParser());
app.use(indexRoutes);

const server = createServer(app);
setupSocket(server);

connectDB();

server.listen(3001, () => {
  console.log('Listening on port 3001');
});