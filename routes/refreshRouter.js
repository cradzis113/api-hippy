const express = require('express');
const router = express.Router();

const refreshController = require('../controllers/refreshController.js');
const authenticateRefreshToken = require('../middlewares/autheticationRefreshToken');
router.post('/refresh-token', authenticateRefreshToken, refreshController);

module.exports = router;