const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    reminderId: {
        type: Number,
        required: true
    },
    message: {
        type: String,
        required: true,
        maxlength: 2000
    },
    channelId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    remindAt: {
        type: Date,
        required: true,
        index: true
    },
    completed: {
        type: Boolean,
        default: false,
        index: true
    }
});

// Compound indexes for efficient queries
reminderSchema.index({ guildId: 1, userId: 1 });
reminderSchema.index({ guildId: 1, reminderId: 1 });
reminderSchema.index({ remindAt: 1, completed: 1 }); // For finding due reminders

// Static method to get next reminder ID for a guild
reminderSchema.statics.getNextReminderId = async function(guildId) {
    const lastReminder = await this.findOne({ guildId }).sort({ reminderId: -1 });
    return lastReminder ? lastReminder.reminderId + 1 : 1;
};

// Static method to create a reminder
reminderSchema.statics.createReminder = async function(reminderData) {
    const reminderId = await this.getNextReminderId(reminderData.guildId);
    const reminder = new this({
        ...reminderData,
        reminderId
    });
    return await reminder.save();
};

// Static method to get user reminders
reminderSchema.statics.getUserReminders = async function(guildId, userId, includeCompleted = false) {
    const query = { guildId, userId };
    if (!includeCompleted) {
        query.completed = false;
    }
    return await this.find(query).sort({ remindAt: 1 });
};

// Static method to get reminder by ID
reminderSchema.statics.getReminderById = async function(guildId, reminderId) {
    return await this.findOne({ guildId, reminderId });
};

// Static method to remove a reminder
reminderSchema.statics.removeReminder = async function(guildId, userId, reminderId) {
    return await this.findOneAndDelete({ guildId, userId, reminderId });
};

// Static method to get due reminders
reminderSchema.statics.getDueReminders = async function() {
    return await this.find({
        remindAt: { $lte: new Date() },
        completed: false
    }).sort({ remindAt: 1 });
};

// Static method to mark reminder as completed
reminderSchema.statics.completeReminder = async function(reminderId) {
    return await this.findByIdAndUpdate(reminderId, { completed: true });
};

// Static method to count user's active reminders
reminderSchema.statics.countUserActiveReminders = async function(guildId, userId) {
    return await this.countDocuments({ guildId, userId, completed: false });
};

module.exports = mongoose.model('Reminder', reminderSchema);
