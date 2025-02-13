const { tempData, deleteTempUser } = require('../utils/userUtils');
const { generateToken } = require('../utils/tokenUtils');
const { formatLastSeenMessage } = require('../utils/timeUtils');
const User = require('../models/userModel');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

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
        const refreshToken = uuidv4();
        deleteTempUser(email);

        if (existingUser) {
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                maxAge: 3 * 24 * 60 * 60 * 1000,
                secure: true,
                sameSite: 'none',
                path: '/',
            });

            await User.findOneAndUpdate({ email }, { refreshToken }, { new: true })
            return res.status(200).json({ message: 'Login successful', token });
        }

        const currentDateTime = moment().format('YYYY-MM-DD HH:mm');
        const lastSeenMessage = formatLastSeenMessage(currentDateTime);

        const newUser = new User({
            email,
            lastSeen: currentDateTime,
            lastSeenMessage,
            refreshToken,
        });

        await newUser.save();

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            maxAge: 3 * 24 * 60 * 60 * 1000,
            secure: true,
            sameSite: 'none',
            path: '/',
        });

        return res.status(201).json({ token });
    } catch (error) {
        console.error('Error during authentication:', error.message);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = authController;
