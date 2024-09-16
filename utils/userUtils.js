const sendEmail = require('./emailUtils');

const tempData = {};

const generateCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const createTempUser = async (email) => {
    if (tempData[email]) {
        delete tempData[email];
    }
    
    if (!tempData[email]) {
        const code = generateCode();

        tempData[email] = {
            try: 5,
            timeoutDuration: 60000,
            code: code,
            timeoutId: null,
        };

        await sendEmail(email, 'Code', `Your code is: ${code}`);

        tempData[email].timeoutId = setTimeout(() => {
            delete tempData[email];
            console.log(`Deleted info for ${email} after timeout.`);
        }, tempData[email].timeoutDuration);

        return { message: 'We have sent you a message in Telegram', code: code };
    } else {
        console.log(`Code already generated for ${email}.`);
        return { message: 'Code already generated for this email' };
    }
};

const deleteTempUser = (email) => {
    if (tempData[email]) {
        clearTimeout(tempData[email].timeoutId);
        console.log(`Deleted info for ${email} and cleared timeout.`);
    }
};

module.exports = { createTempUser, deleteTempUser, tempData };
