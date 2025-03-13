const User = require('../../models/userModel');

const searchHandler = (socket) => {
    socket.on('search', async (query, callback) => {
        try {
          const regex = new RegExp(query, 'i');
          const users = await User.find({ userName: { $regex: regex } });
          // const messageKeys = Array.from(user.messageHistory.keys());
          // const latestMessages = new Map(messageKeys.map(key => [key, user.messageHistory.get(key).slice(-10)]));
          // const userWithLatestMessages = {
          //   ...user.toObject(),
          //   messageHistory: Object.fromEntries(latestMessages)
          // };
          callback(null, users);
        } catch (error) {
          console.error('Error during search:', error);
            callback(error.message, null);
        }
    });
};

module.exports = searchHandler; 