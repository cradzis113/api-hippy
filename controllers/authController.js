const { tempData, deleteTempUser } = require('../utils/userUtils');
const { generateToken } = require('../utils/tokenUtils');
const User = require('../models/userModel');

const authController = async (req, res) => {
    const { email, code } = req.body;

    if (!tempData[email]) {
        return res.status(400).json({ message: 'code has expired' });
    }

    const userTempData = tempData[email];
    if (userTempData.try <= 0) {
        return res.status(400).json({ message: 'No tries left' });
    }

    if (userTempData.code !== code) {
        userTempData.try--;
        return res.status(400).json({ message: 'Invalid code' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            const token = generateToken({ email });

            res.cookie('token', token, {
                httpOnly: true,
                maxAge: 30 * 24 * 60 * 60 * 1000,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/'
            });

            res.cookie('userStatus', 'loggedIn', {
                path: '/',
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
            });

            return res.status(201).json({ message: 'Login suscessful' });
        }

        const newUser = new User({ email });
        await newUser.save();

        deleteTempUser(email);

        const token = generateToken({ email });

        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });

        res.cookie('userStatus', 'loggedIn', {
            path: '/',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
        });

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Error creating user:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = authController;
