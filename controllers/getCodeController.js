const { createTempUser } = require('../utils/userUtils');
require('dotenv').config();

const getCodeController = async (req, res) => {
    try {
        const { email: userEmail} = req.body;
        const adminEmail = process.env.EMAIL_USER;

        if (userEmail === adminEmail) {
            return res.status(400).json({ message: 'Email invalid', status: false });
        }

        if (!userEmail) {
            return res.status(400).json({ message: 'Email is required.', status: false });
        }

        const result = await createTempUser(userEmail);

        return res.status(200).json({ message: result.message, status: true });
    } catch (error) {
        console.error('Error sending code:', error);
        return res.status(500).json({ message: 'Failed to send registration code.' });
    }
};

module.exports = getCodeController;
