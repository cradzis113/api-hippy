const moment = require('moment');
const User = require('../models/userModel');

function formatLastSeenTime(timestamp, yesterday) {
    const [date, time] = timestamp.split(' ');
    const [hours, minutes] = time.split(':');
    return yesterday ? `Yesterday at ${hours}:${minutes}` : `Last seen at ${hours}:${minutes}`;
}

async function checkUsersTime(users) {
    const currentTime = moment();

    for (const user of users) {
        const { userName, lastSeen } = user;

        const lastSeenTime = moment(lastSeen, 'YYYY-MM-DD HH:mm');
        const updatedLastSeenTime = lastSeenTime.add(1, 'days');

        if (currentTime.isAfter(updatedLastSeenTime)) {
            try {
                const lastSeenFormatted = lastSeenTime.format('YYYY-MM-DD HH:mm');
                const lastSeenMessage = formatLastSeenTime(lastSeenFormatted, true);

                await User.findOneAndUpdate(
                    { userName: userName },
                    { $set: { lastSeenMessage: lastSeenMessage } },
                    { upsert: true }
                );
            } catch (error) {
                console.error(`Error updating user ${userName}:`, error);
            }
        }
    }
}

async function timeComparison() {
    try {
        const users = await User.find({});
        await checkUsersTime(users);
    } catch (error) {
        console.error('Error fetching or checking user times:', error);
    }
}
setInterval(timeComparison, 1000)

module.exports = { timeComparison, formatLastSeenTime };
