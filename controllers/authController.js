const { tempData, deleteTempUser } = require('../utils/userUtils');
const { generateToken } = require('../utils/tokenUtils');
const { formatLastSeenMessage } = require('../utils/timeUtils');
const User = require('../models/userModel');
const moment = require('moment');

const setAuthCookies = (res, token) => {
    const cookieOptions = {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    };

    res.cookie('token', token, cookieOptions);
    res.cookie('userStatus', 'loggedIn', {
        ...cookieOptions,
        httpOnly: false, 
    }); 
};

const authController = async (req, res) => {
    const { email, code } = req.body;

    const userTempData = tempData[email];
    if (!userTempData) {
        return res.status(400).json({ message: 'Code has expired' });
    }

    if (userTempData.try <= 0) {
        deleteTempUser(email);
        return res.status(400).json({ message: 'No tries left' });
    }

    if (userTempData.code !== code) {
        userTempData.try--;
        return res.status(400).json({ message: 'Invalid code' });
    }

    try {
        const existingUser = await User.findOne({ email });

        const token = generateToken({ email });
        deleteTempUser(email);

        if (existingUser) {
            setAuthCookies(res, token);
            return res.status(200).json({ message: 'Login successful' });
        }

        const currentDateTime = moment().format('YYYY-MM-DD HH:mm');
        const lastSeenMessage = formatLastSeenMessage(currentDateTime);

        const newUser = new User({
            email,
            lastSeen: currentDateTime,
            lastSeenMessage,
        });

        await newUser.save();

        setAuthCookies(res, token);
        return res.status(201).json({ message: 'User created successfully' });

    } catch (error) {
        console.error('Error during authentication:', error.message);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = authController;
