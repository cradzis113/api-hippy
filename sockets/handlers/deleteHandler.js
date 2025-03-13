const User = require('../../models/userModel');

const deleteHandler = (socket, chatStates) => {
    socket.on('messageDelete', async (data) => {
        const {
            id,
            revoked,
            otherUsers,
            currentUser,
            messageData,
            senderUserName,
            visibilityOption,
            recipientUserName,
            currentUserMessages,
            currentUserRevokedMessages
        } = data;

        try {
            let senderUser, recipientUser;
            if (!messageData && !currentUserMessages && !currentUserRevokedMessages && !otherUsers) {
                [senderUser, recipientUser] = await Promise.all([
                    User.findOne({ userName: senderUserName }),
                    User.findOne({ userName: recipientUserName }),
                ]);
            }

            if (otherUsers) {
                for (const message of otherUsers.messages) {
                    recipientUser = await User.findOne({ userName: message.recipientUserName });
                    senderUser = await User.findOne({ userName: message.senderUserName });
                }
            }

            if (currentUserMessages) {
                for (const message of currentUserMessages.messages) {
                    recipientUser = await User.findOne({ userName: message.recipientUserName });
                    senderUser = await User.findOne({ userName: message.senderUserName });
                }
            }

            if (currentUserRevokedMessages) {
                for (const message of currentUserRevokedMessages.messages) {
                    recipientUser = await User.findOne({ userName: message.recipientUserName });
                    senderUser = await User.findOne({ userName: message.senderUserName });
                }
            }

            if (messageData) {
                for (const message of messageData) {
                    recipientUser = await User.findOne({ userName: message.recipientUserName });
                    senderUser = await User.findOne({ userName: message.senderUserName });
                }
            }

            const updateMessageRevokedStatus = (messages) => {
                if (!messages) return;
                const revokeMessage = (message) => {
                    const currentRecipientUserName = message.recipientUserName;
                    const currentSenderUserName = message.senderUserName;

                    if (_.size(senderUser.pinnedInfo) > 0 && _.size(recipientUser.pinnedInfo) > 0) {
                        const senderPinnedIndex = _.findIndex(senderUser.pinnedInfo[currentRecipientUserName], { id: message.id });
                        const recipientPinnedIndex = _.findIndex(recipientUser.pinnedInfo[currentSenderUserName], { id: message.id });
                        // console.log(2)
                        if (senderPinnedIndex !== -1) {
                            if (!senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked) {
                                senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked = {
                                    revokedBy: [currentUser]
                                };
                                senderUser.markModified('pinnedInfo');
                            } else {
                                const revokedBy = senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked.revokedBy || [];
                                if (!revokedBy.includes(currentUser)) {
                                    revokedBy.push(currentUser);
                                    senderUser.pinnedInfo[currentRecipientUserName][senderPinnedIndex].revoked.revokedBy = revokedBy;
                                    senderUser.markModified('pinnedInfo');
                                }
                            }
                        }
                        if (recipientPinnedIndex !== -1) {
                            if (!recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked) {
                                recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked = {
                                    revokedBy: [currentUser]
                                };
                                recipientUser.markModified('pinnedInfo');
                            } else {
                                const revokedBy = recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked.revokedBy || [];
                                if (!revokedBy.includes(currentUser)) {
                                    revokedBy.push(currentUser);
                                    recipientUser.pinnedInfo[currentSenderUserName][recipientPinnedIndex].revoked.revokedBy = revokedBy;
                                    recipientUser.markModified('pinnedInfo');
                                }
                            }
                        }

                        socket.emit('pinnedInfoUpdate', senderPinnedIndex)
                    }

                    if (!message.revoked) {
                        message.revoked = { revokedBy: [currentUser] };
                    } else {
                        message.revoked.revokedBy = message.revoked.revokedBy || [];
                        message.revoked.revokedBy.push(currentUser);
                    }
                };

                messages.forEach((message) => {
                    if (otherUsers) {
                        console.log(1)
                        otherUsers.messages.forEach((msg) => {
                            if (msg.id === message.id) {
                                revokeMessage(message);
                            }
                        });
                    }

                    if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
                        console.log(2)
                        currentUserMessages.messages.forEach((msg) => {
                            if (msg.id === message.id) {
                                revokeMessage(message);
                            }
                        });
                    }

                    if (currentUserRevokedMessages) {
                        console.log(3)
                        currentUserRevokedMessages.messages.forEach((msg) => {
                            if (msg.id === message.id) {
                                revokeMessage(message);
                            }
                        });
                        return;
                    }

                    if (messageData) {
                        messageData.forEach((msg) => {
                            if (msg.id === message.id) {
                                console.log(4)
                                revokeMessage(message);
                            }
                        });
                        return;
                    }

                    if (message.id === id) {
                        console.log(5)
                        revokeMessage(message);
                    }
                });
            };

            const processUserMessages = (chatMessageHistory, userName, currentUserName) => {
                const userMessages = chatMessageHistory[userName];
                let lastMessage = userMessages[userMessages.length - 1];

                const firstNonRevokedByOtherUser = userMessages.find(
                    message => !message?.revoked?.revokedBoth && !message.revoked?.revokedBy?.includes(userName)
                );

                const messagesRevokedByCurrentUser = userMessages.filter(
                    message => message?.revoked?.revokedBy?.includes(currentUserName)
                );

                const nonRevokedMessages = userMessages.filter(
                    msg => !msg?.revoked?.revokedBoth && !msg?.revoked?.revokedBy?.includes(currentUserName)
                );

                const revokedMessagesByBoth = userMessages.filter(
                    msg => msg?.revoked?.revokedBoth && !msg?.revoked?.revokedBy?.includes(currentUserName)
                );

                const firstMessageRevokedByBoth = revokedMessagesByBoth.find(msg => msg?.revoked?.revokedBoth);
                const latestMessageRevokedByBoth = revokedMessagesByBoth.reverse().find(msg => msg?.revoked?.revokedBoth);
                const latestRevokedIndex = userMessages.findIndex(msg => msg?.id === latestMessageRevokedByBoth?.id);
                const latestNonRevokedIndex = userMessages.findIndex(
                    msg => msg?.id === nonRevokedMessages[nonRevokedMessages.length - 1]?.id
                );

                if (firstNonRevokedByOtherUser) {
                    if (latestNonRevokedIndex > latestRevokedIndex) {
                        lastMessage = userMessages[latestNonRevokedIndex];
                    } else if (latestRevokedIndex !== -1 && !userMessages[latestRevokedIndex]?.revoked?.revokedBy?.includes(currentUserName)) {
                        lastMessage = {
                            message: `${userMessages[latestRevokedIndex].senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
                        };
                    } else if (messagesRevokedByCurrentUser.length === userMessages.length) {
                        lastMessage = { message: 'History was cleared' };
                    }
                } else {
                    if (lastMessage?.revoked?.revokedBoth && !lastMessage?.revoked?.revokedBy?.includes(currentUserName)) {
                        lastMessage = {
                            message: `${lastMessage.senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
                        };
                    } else if (messagesRevokedByCurrentUser.length === userMessages.length) {
                        lastMessage = { message: 'History was cleared' };
                    } else if (nonRevokedMessages.length === 1 && !firstMessageRevokedByBoth) {
                        lastMessage = nonRevokedMessages[0];
                    } else if (nonRevokedMessages.length > 1 && !latestMessageRevokedByBoth) {
                        lastMessage = nonRevokedMessages[nonRevokedMessages.length - 1];
                    } else if (firstMessageRevokedByBoth && nonRevokedMessages.length === 0) {
                        lastMessage = {
                            message: `${firstMessageRevokedByBoth.senderUserName === currentUserName ? 'Bạn' : senderUserName} đã thu hồi một tin nhắn`
                        };
                    } else if (latestNonRevokedIndex > latestRevokedIndex) {
                        lastMessage = userMessages[latestNonRevokedIndex];
                    } else if (latestNonRevokedIndex < latestRevokedIndex) {
                        lastMessage = {
                            message: `${firstMessageRevokedByBoth.senderUserName === currentUserName ? 'Bạn' : userName} đã thu hồi một tin nhắn`
                        };
                    }
                }

                return lastMessage
            };

            const saveAndEmitUpdates = async () => {
                senderUser.markModified('messageHistory');
                recipientUser.markModified('messageHistory');

                await Promise.all([senderUser.save(), recipientUser.save()]);

                const processMessages = (messages, isCurrentUserMessages = false) => {
                    messages.forEach((message) => {
                        const recipientName = message.recipientUserName;
                        const senderName = message.senderUserName;

                        const updatedSenderMessageHistory = senderUser.messageHistory.get(recipientName);
                        const lastMessageFromSender = processUserMessages(Object.fromEntries(senderUser.messageHistory), recipientName, currentUser);
                        const lastMessageFromRecipient = processUserMessages(Object.fromEntries(recipientUser.messageHistory), senderName, recipientName);

                        if (visibilityOption === 'onlyYou' ||
                            currentUserRevokedMessages?.visibilityOption === 'onlyYou' ||
                            otherUsers?.visibilityOption === 'onlyYou' ||
                            messageData?.visibilityOption === 'onlyYou'
                        ) {
                            socket.emit('notification', {
                                message: lastMessageFromSender.message,
                                originMessage: lastMessageFromSender,
                                recipientUserName: recipientName,
                                senderUserName: senderName,
                                listMessage: updatedSenderMessageHistory
                            });

                            if (isCurrentUserMessages) {
                                socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                                    message: lastMessageFromRecipient.message,
                                    senderUserName: senderName
                                });
                            }
                        } else {
                            socket.emit('notification', {
                                message: lastMessageFromSender.message,
                                recipientUserName: recipientName,
                                senderUserName: senderName
                            });

                            if (isCurrentUserMessages) {
                                socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                                    message: lastMessageFromRecipient.message,
                                    senderUserName: senderName
                                });
                            }
                        }

                        let foundMessage;

                        const messageSources = [];

                        if (currentUserMessages) {
                            messageSources.push(currentUserMessages.messages);
                        }
                        if (currentUserRevokedMessages) {
                            messageSources.push(currentUserRevokedMessages.messages);
                        }
                        if (otherUsers) {
                            messageSources.push(otherUsers.messages);
                        }
                        if (messageData) {
                            messageSources.push(messageData);
                        }

                        if (messageSources.length > 0) {
                            const intersections = messageSources.map(source =>
                                _.intersectionBy(updatedSenderMessageHistory, source, 'id')
                            );
                            foundMessage = _.flatten(intersections);
                        }

                        socket.emit('messageSent', foundMessage);
                        if (chatStates[senderName]?.recipientSocketId) {
                            socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', foundMessage);
                        }
                    });
                };

                if (currentUserMessages) {
                    processMessages(currentUserMessages.messages, true);
                }

                if (messageData) {
                    processMessages(messageData);
                }

                if (!messageData && !currentUserMessages && !otherUsers && !currentUserRevokedMessages) {
                    const recipientName = recipientUserName;
                    const senderName = senderUserName;

                    const updatedSenderMessageHistory = senderUser.messageHistory.get(recipientName);
                    const lastMessageFromSender = processUserMessages(Object.fromEntries(senderUser.messageHistory), recipientName, currentUser);
                    const lastMessageFromRecipient = processUserMessages(Object.fromEntries(recipientUser.messageHistory), senderName, recipientName);

                    socket.emit('notification', {
                        message: lastMessageFromSender.message,
                        recipientUserName: recipientName,
                        senderUserName: senderName
                    });

                    if (chatStates[senderName]?.recipientSocketId) {
                        socket.to(chatStates[senderName].recipientSocketId).emit('notification', {
                            message: lastMessageFromRecipient.message,
                            senderUserName: senderName
                        });
                    }

                    const foundMessage = _.find(updatedSenderMessageHistory, { id: id })
                    socket.emit('messageSent', foundMessage);
                    if (chatStates[senderName]?.recipientSocketId) {
                        socket.to(chatStates[senderName].recipientSocketId).emit('messageSent', foundMessage);
                    }
                }

                if (currentUserRevokedMessages) {
                    processMessages(currentUserRevokedMessages.messages);
                }

                if (otherUsers && !currentUserRevokedMessages && !currentUserMessages) {
                    processMessages(otherUsers.messages);
                }
            };


            if (visibilityOption === 'onlyYou' && !messageData && !currentUserMessages) {
                if (currentUser === senderUserName) {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
                    await saveAndEmitUpdates();
                    return;
                }

                if (revoked && revoked.revokedBoth && !revoked.revokedBy) {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
                    await saveAndEmitUpdates();
                    return;
                }

                if (revoked && revoked.revokedBoth && revoked.revokedBy) {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
                    await saveAndEmitUpdates();
                    return;
                }

                if (currentUser === recipientUserName) {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(senderUserName));
                    await saveAndEmitUpdates();
                    return;
                }
            }

            if (currentUserMessages && currentUserMessages.visibilityOption === 'onlyYou') {
                for (const message of currentUserMessages.messages) {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
                }
                await saveAndEmitUpdates();
                return;
            }

            if (currentUserRevokedMessages && currentUserRevokedMessages.visibilityOption === 'onlyYou') {
                currentUserRevokedMessages.messages.forEach((message) => {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
                });
                await saveAndEmitUpdates();
            }

            if (otherUsers && otherUsers.visibilityOption === 'onlyYou' && !currentUserMessages) {
                otherUsers.messages.forEach((message) => {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
                });
                await saveAndEmitUpdates();
            } else if (otherUsers && otherUsers.visibilityOption === 'onlyYou' && currentUserMessages) {
                otherUsers.messages.forEach((message) => {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(message.senderUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(message.recipientUserName));
                });
                await saveAndEmitUpdates();
            }

            if (messageData && visibilityOption === 'onlyYou') {
                messageData.forEach((message) => {
                    updateMessageRevokedStatus(senderUser.messageHistory.get(message.recipientUserName));
                    updateMessageRevokedStatus(recipientUser.messageHistory.get(message.senderUserName));
                });
                await saveAndEmitUpdates();
            }

            let senderMessageHistory, recipientMessageHistory;
            if (currentUserMessages) {
                currentUserMessages.messages.forEach((message) => {
                    senderMessageHistory = senderUser.messageHistory.get(message.recipientUserName);
                    recipientMessageHistory = recipientUser.messageHistory.get(message.senderUserName);
                });
            } else if (messageData) {
                messageData.forEach((message) => {
                    senderMessageHistory = senderUser.messageHistory.get(message.recipientUserName);
                    recipientMessageHistory = recipientUser.messageHistory.get(message.senderUserName);
                });
            } else {
                senderMessageHistory = senderUser.messageHistory.get(recipientUserName);
                recipientMessageHistory = recipientUser.messageHistory.get(senderUserName);
            }

            if (senderMessageHistory &&
                recipientMessageHistory &&
                (
                    visibilityOption === 'everyone' ||
                    currentUserMessages?.visibilityOption === 'everyone'
                )) {
                if (currentUserMessages) {
                    currentUserMessages.messages.forEach((message) => {
                        senderMessage = senderMessageHistory.find((msg) => msg.id === message.id);
                        recipientMessage = recipientMessageHistory.find((msg) => msg.id === message.id);
                    });
                }

                const setRevokedBoth = (message) => {
                    if (!currentUserMessages || !messageData) {
                        updatePinnedInfoRevoked(senderUser, recipientUser, message.recipientUserName, message.senderUserName, message, socket);

                        if (!message.revoked) {
                            message.revoked = { revokedBoth: senderUserName };
                        } else {
                            message.revoked.revokedBoth = senderUserName;
                        }
                    }

                    if (messageData) {
                        messageData.forEach((msg) => {
                            updatePinnedInfoRevoked(senderUser, recipientUser, msg.recipientUserName, msg.senderUserName, msg, socket);

                            if (!message.revoked) {
                                message.revoked = { revokedBoth: msg.senderUserName };
                            } else {
                                message.revoked.revokedBoth = msg.senderUserName;
                            }
                        })
                    }

                    if (currentUserMessages) {
                        updatePinnedInfoRevoked(senderUser, recipientUser, recipientUserName, senderUserName, message, socket);
                        currentUserMessages.messages.forEach((msg) => {
                            if (!message.revoked) {
                                message.revoked = { revokedBoth: msg.senderUserName };
                            } else {
                                message.revoked.revokedBoth = msg.senderUserName;
                            }
                        });
                    }
                };

                if (messageData) {
                    messageData.forEach((message) => {
                        updatePinnedInfoRevoked(senderUser, recipientUser, message.recipientUserName, message.senderUserName, message, socket);
                        senderMessage = senderMessageHistory.find((msg) => msg.id === message.id);
                        recipientMessage = recipientMessageHistory.find((msg) => msg.id === message.id);

                        if (senderMessage && recipientMessage) {
                            setRevokedBoth(senderMessage);
                            setRevokedBoth(recipientMessage);
                        }
                    });
                }

                if (!messageData && !currentUserMessages) {
                    senderMessage = senderMessageHistory.find((msg) => msg.id === id);
                    recipientMessage = recipientMessageHistory.find((msg) => msg.id === id);
                }

                if (senderMessage && recipientMessage) {
                    setRevokedBoth(senderMessage);
                    setRevokedBoth(recipientMessage);
                    await saveAndEmitUpdates();
                }
            }
        } catch (error) {
            console.error('Error occurred while deleting the message:', error);
        }
    }); //
}

module.exports = deleteHandler;