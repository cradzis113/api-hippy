const { generateToken } = require('../utils/tokenUtils');

const refreshController = (req, res) => {
    const email = req.email;
    const token = generateToken({ email });
    res.status(200).json({ token });
}


module.exports = refreshController