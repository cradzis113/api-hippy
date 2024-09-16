const express = require('express');
const router = express.Router();

const cookieController = require('../controllers/cookieController');
router.post('/clear-cookie', cookieController);

module.exports = router;