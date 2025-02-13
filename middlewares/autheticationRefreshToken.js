
const User = require("../models/userModel");

const authenticateRefreshToken = async (req, res, next) => {
    const token = req.cookies.refreshToken;

    if (!token) {
        return res.status(200).json({ status: 'error', message: 'No refresh token provided' });
    }

    try {
        const user = await User.findOne({ refreshToken: token });

        if (!user) {
            return res.status(200).json({ status: 'error', message: 'Invalid refresh token' });
        }
        
        req.email = user.email;
        next();
    } catch (error) {
        return res.status(200).json({ status: 'error', message: 'Invalid refresh token' });
    }
};

module.exports = authenticateRefreshToken;

