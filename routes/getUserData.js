const express = require('express');
const router = express.Router();

const authenticateToken = require('../middlewares/authenticateToken');
const getUserDataController = require('../controllers/getUserDataController');

router.get('/getuserdata', authenticateToken, getUserDataController);

module.exports = router;