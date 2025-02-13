const express = require('express');
const router = express.Router();

const authRouter = require('./authRoutes');
const codeRouter = require('./codeRoutes');
const userRouter = require('./userRoutes');
const cookieRouter = require('./cookieRoutes');
const refreshRouter = require('./refreshRouter');
    
router.use('/api', [authRouter, codeRouter, userRouter, cookieRouter, refreshRouter]);


module.exports = router;