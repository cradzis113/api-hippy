const User = require('../models/userModel');

const cookieController = async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    const user = await User.findOne({ refreshToken });

    if (user) {
        await User.updateOne({ refreshToken }, { $unset: { refreshToken: '' } });
    }

    res.clearCookie('refreshToken');
    res.sendStatus(204); // No Content
}

module.exports = cookieController