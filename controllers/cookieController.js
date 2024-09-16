const cookieController = (req, res) => {
    res.clearCookie('token');
    res.clearCookie('userStatus');
    res.status(200).json({ message: 'Cookie đã được xóa.' });
}

module.exports = cookieController