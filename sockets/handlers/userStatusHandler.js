const moment = require('moment');
const User = require('../../models/userModel');
const { formatLastSeenMessage } = require('../../utils/timeUtils');
const _ = require('lodash');

const userStatusHandler = (socket, chatStates) => {
    socket.on('updateUserStatus', async (data) => {
        try {
            const { userName, status, hasFocus } = data;
            const user = await User.findOne({ userName });
            if (!user) return;

            const currentDateTime = moment();
            const formattedDateTimeString = currentDateTime.format('YYYY-MM-DD HH:mm');

            const lastSeen = hasFocus ? formattedDateTimeString : undefined;
            const lastSeenMessage = hasFocus ? formatLastSeenMessage(formattedDateTimeString) : undefined;

            const updateFields = {
                ...(lastSeen && { lastSeen }),
                ...(lastSeenMessage && { lastSeenMessage })
            };

            await User.findOneAndUpdate(
                { userName: userName },
                { $set: updateFields },
                { new: true, upsert: true }
            );

            if (chatStates[userName]) {
                chatStates[userName].status = status
                const u = _.find(chatStates, { TextingWith: userName })
                if (u) {
                    socket.to(u.socketId).emit('userStatus', { userName, status });
                }
            }
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    });
};

module.exports = userStatusHandler; 