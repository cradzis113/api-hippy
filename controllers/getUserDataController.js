const User = require('../models/userModel');

async function getUserDataController(req, res) {
    try {
        const userEmail = req.user.email;
        const user = await User.findOne({ email: userEmail });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ user });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = getUserDataController;
