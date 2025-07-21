const Reminder = require('../models/Reminder');
const { createEmbed } = require('./embedUtils');

class ReminderManager {
    constructor(client) {
        this.client = client;
        this.checkInterval = null;
    }

    // Start the reminder checking system
    start() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        // Check for due reminders every 30 seconds
        this.checkInterval = setInterval(() => {
            this.checkDueReminders();
        }, 30000);
        
        console.log('Reminder system started - checking every 30 seconds');
    }

    // Stop the reminder checking system
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('Reminder system stopped');
    }

    // Check for due reminders and send notifications
    async checkDueReminders() {
        try {
            const dueReminders = await Reminder.getDueReminders();
            
            for (const reminder of dueReminders) {
                await this.sendReminderNotification(reminder);
                await Reminder.completeReminder(reminder._id);
            }
            
            if (dueReminders.length > 0) {
                console.log(`Processed ${dueReminders.length} due reminders`);
            }
        } catch (error) {
            console.error('Error checking due reminders:', error);
        }
    }

    // Send reminder notification to user
    async sendReminderNotification(reminder) {
        try {
            const guild = this.client.guilds.cache.get(reminder.guildId);
            if (!guild) {
                console.log(`Guild ${reminder.guildId} not found for reminder ${reminder.reminderId}`);
                return;
            }

            const user = await this.client.users.fetch(reminder.userId).catch(() => null);
            if (!user) {
                console.log(`User ${reminder.userId} not found for reminder ${reminder.reminderId}`);
                return;
            }

            // Calculate time ago
            const timeDiff = Date.now() - reminder.createdAt.getTime();
            const timeAgo = this.formatDuration(timeDiff);

            const reminderEmbed = await createEmbed(guild.id, {
                title: 'Reminder',
                description: `You asked me to remind you about:\n\n**${reminder.message}**`,
                fields: [
                    {
                        name: 'Set',
                        value: `${timeAgo} ago`,
                        inline: true
                    },
                    {
                        name: 'Server',
                        value: guild.name,
                        inline: true
                    },
                    {
                        name: 'Reminder ID',
                        value: `#${reminder.reminderId}`,
                        inline: true
                    }
                ],
                footer: {
                    text: `Originally set on ${reminder.createdAt.toLocaleDateString()}`
                },
                timestamp: new Date(),
                color: 0x00FF00 // Green for reminders
            });

            let notificationSent = false;

            // Try to DM the user first
            try {
                await user.send({ embeds: [reminderEmbed] });
                notificationSent = true;
                console.log(`Reminder sent via DM to ${user.tag} (ID: ${reminder.reminderId})`);
            } catch (error) {
                console.log(`Failed to DM user ${user.tag}, trying channel mention...`);
            }

            // If DM fails, try to mention them in the original channel
            if (!notificationSent) {
                try {
                    const channel = guild.channels.cache.get(reminder.channelId);
                    if (channel && channel.viewable && channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
                        reminderEmbed.setDescription(`${user}, you asked me to remind you about:\n\n**${reminder.message}**`);
                        await channel.send({ embeds: [reminderEmbed] });
                        notificationSent = true;
                        console.log(`Reminder sent via channel mention to ${user.tag} in #${channel.name} (ID: ${reminder.reminderId})`);
                    }
                } catch (error) {
                    console.error(`Failed to send reminder in channel: ${error.message}`);
                }
            }

            // If both fail, log the failure
            if (!notificationSent) {
                console.error(`Failed to deliver reminder ${reminder.reminderId} to user ${user.tag}`);
            }

        } catch (error) {
            console.error('Error sending reminder notification:', error);
        }
    }

    // Format duration into human readable string
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
    }

    // Parse time string into milliseconds (same as used in other commands)
    parseTimeString(timeString) {
        const regex = /^(\d+)([smhd])$/i;
        const match = timeString.match(regex);
        
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const multipliers = {
            s: 1000,                    // seconds
            m: 60 * 1000,              // minutes
            h: 60 * 60 * 1000,         // hours
            d: 24 * 60 * 60 * 1000     // days
        };
        
        return value * multipliers[unit];
    }
}

module.exports = ReminderManager;
