const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
    status: String,
    lastSeen: String,
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
