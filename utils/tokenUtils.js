const jwt = require('jsonwebtoken');

const generateToken = (payload) => {
    const secretKey = process.env.JWT_SECRET || 'cradz';
    const options = { expiresIn: '1m' }; 
    return jwt.sign(payload, secretKey, options);
};

const verifyToken = (token) => {
    const secretKey = process.env.JWT_SECRET || 'cradz';
    return new Promise((resolve, reject) => {
        jwt.verify(token, secretKey, (err, decoded) => {
            if (err) {
                return reject(err);
            }
            resolve(decoded);
        });
    });
};

module.exports = {
    generateToken,
    verifyToken
};
