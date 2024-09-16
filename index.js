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
  origin: process.env.ALLOW_ORIGIN,
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(bodyParser.json());
app.use(cookieParser());
app.use(indexRoutes);

const server = createServer(app);
setupSocket(server);

connectDB();

server.listen(3000, () => {
  console.log('Listening on port 3000');
});
