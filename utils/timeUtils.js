const moment = require('moment');
const User = require('../models/userModel');

function formatLastSeenMessage(timestamp, isYesterday) {
    const [date, time] = timestamp.split(' ');
    const [hours, minutes] = time.split(':');
    return isYesterday ? `yesterday at ${hours}:${minutes}` : `last seen at ${hours}:${minutes}`;
}

async function updateLastSeenMessages(users) {
    const currentTime = moment();

    for (const user of users) {
        const { userName, lastSeen } = user;

        const lastSeenTime = moment(lastSeen, 'YYYY-MM-DD HH:mm');

        const oneDayLater = lastSeenTime.clone().add(1, 'days');
        const twoDaysLater = lastSeenTime.clone().add(2, 'days');
        const sevenDaysLater = lastSeenTime.clone().add(7, 'days');
        const thirtyDaysLater = lastSeenTime.clone().add(30, 'days');

        try {
            if (currentTime.isAfter(thirtyDaysLater)) {
                await User.findOneAndUpdate(
                    { userName: userName },
                    { $set: { lastSeenMessage: 'last seen within a month' } },
                    { upsert: true }
                );
            } else if (currentTime.isAfter(sevenDaysLater)) {
                await User.findOneAndUpdate(
                    { userName: userName },
                    { $set: { lastSeenMessage: 'last seen within a week' } },
                    { upsert: true }
                );
            } else if (currentTime.isAfter(twoDaysLater)) {
                const formattedLastSeenTime = lastSeenTime.format('MMM D [at] HH:mm');
                await User.findOneAndUpdate(
                    { userName: userName },
                    { $set: { lastSeenMessage: `last seen ${formattedLastSeenTime}` } },
                    { upsert: true }
                );
            } else if (currentTime.isAfter(oneDayLater)) {
                const formattedLastSeenTime = lastSeenTime.format('YYYY-MM-DD HH:mm');
                const lastSeenMessage = formatLastSeenMessage(formattedLastSeenTime, true);

                await User.findOneAndUpdate(
                    { userName: userName },
                    { $set: { lastSeenMessage: lastSeenMessage } },
                    { upsert: true }
                );
            }
        } catch (error) {
            console.error(`Error updating user ${userName}:`, error);
        }
    }
}

async function compareAndUpdateUserTimes() {
    try {
        const users = await User.find({});
        await updateLastSeenMessages(users);
    } catch (error) {
        console.error('Error fetching or checking user times:', error);
    }
}

setInterval(compareAndUpdateUserTimes, 1000);
module.exports = { compareAndUpdateUserTimes, formatLastSeenMessage };
