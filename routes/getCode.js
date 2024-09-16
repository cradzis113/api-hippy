const express = require('express');
const router = express.Router();

const getCodeController = require('../controllers/getCodeController')
router.post('/getcode', getCodeController);

module.exports = router;