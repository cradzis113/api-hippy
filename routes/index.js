const express = require('express');
const router = express.Router();

const authRouter = require('./auth');
const getCodeRouter = require('./getCode');
const getUserDataRouter = require('./getUserData');
const cookieRouter = require('./cookie')

router.use('/api', [authRouter, getCodeRouter, getUserDataRouter, cookieRouter]);

module.exports = router;