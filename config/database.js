const mongoose = require('mongoose');
require('dotenv').config();

const dbURI =  process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_data';

const connectDB = async () => {
    try {
        await mongoose.connect(dbURI);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
