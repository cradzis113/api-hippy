const express = require('express');
const router = express.Router();

const authenticateAccessToken = require('../middlewares/authenticateAccessToken');
const getUserDataController = require('../controllers/getUserDataController');

router.post('/user', authenticateAccessToken, getUserDataController);

module.exports = router;