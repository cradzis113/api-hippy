const { verifyToken } = require('../utils/tokenUtils');

const authenticateAccessToken = async (req, res, next) => {
    const token = req.body.token;

    if (!token) {
        return res.status(401).json({ message: 'Token is required' });
    }

    try {
        const decoded = await verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(200).json({ status: 'error', message: 'Invalid or expired token' });
    }
};

module.exports = authenticateAccessToken;
