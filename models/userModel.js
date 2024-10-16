const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    id: String, 
    time: String,
    seen: Boolean,
    revoked: Object,
    message: String,
    replyInfo: Object,
    senderUserName: String,
    recipientUserName: String,
});

const userSchema = new mongoose.Schema({
    status: String,
    lastSeen: String,
    lastSeenMessage: String,
    socketId: String,
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        sparse: true,
    },
    userName: {
        type: String,
        unique: true,
        sparse: true,
    },
    messageHistory: {
        type: Map,
        of: [messageSchema],
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.pre('save', async function (next) {
    if (!this.userName) {
        let newUserName;
        do {
            newUserName = `user_${generateRandom6DigitNumber()}`;
        } while (await User.exists({ userName: newUserName }));
        this.userName = newUserName;
    }

    next();
});

function generateRandom6DigitNumber() {
    const randomNumber = Math.floor(Math.random() * 1000000);
    return randomNumber.toString().padStart(6, '0');
}

const User = mongoose.model('User', userSchema);

module.exports = User;
