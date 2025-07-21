const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const Reminder = require('../../models/Reminder');
const ReminderManager = require('../../utils/reminderManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Reminder system - set, list, or remove reminders')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a reminder')
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('When to remind you (e.g., 1h, 30m, 2d)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('What to remind you about')
                        .setRequired(true)
                        .setMaxLength(2000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your active reminders'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a reminder by ID')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The reminder ID to remove')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a reminder by ID (alias for remove)')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The reminder ID to delete')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('del')
                .setDescription('Del a reminder by ID (alias for remove)')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The reminder ID to del')
                        .setRequired(true)
                        .setMinValue(1))),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;
        const guild = interaction.guild;
        const channel = interaction.channel;

        try {
            switch (subcommand) {
                case 'set':
                    await handleSetReminder(interaction, user, guild, channel);
                    break;
                case 'list':
                    await handleListReminders(interaction, user, guild);
                    break;
                case 'remove':
                case 'delete':
                case 'del':
                    await handleRemoveReminder(interaction, user, guild);
                    break;
            }
        } catch (error) {
            console.error('Error in remind command:', error);
            const errorEmbed = createErrorEmbed(
                'Reminder System Error',
                'An error occurred while processing your reminder command.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Handle setting a new reminder
 */
async function handleSetReminder(interaction, user, guild, channel) {
    const durationString = interaction.options.getString('duration');
    const message = interaction.options.getString('message');

    // Parse duration
    const reminderManager = new ReminderManager();
    const duration = reminderManager.parseTimeString(durationString);
    
    if (!duration) {
        const errorEmbed = createErrorEmbed(
            'Invalid Duration Format',
            'Please use a valid time format (e.g., 1h, 30m, 2d, 7d).\nSupported units: s (seconds), m (minutes), h (hours), d (days)'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Check for reasonable duration limits
    const maxDuration = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    const minDuration = 60 * 1000; // 1 minute in milliseconds
    
    if (duration > maxDuration) {
        const errorEmbed = createErrorEmbed(
            'Duration Too Long',
            'Reminders cannot exceed 1 year.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    if (duration < minDuration) {
        const errorEmbed = createErrorEmbed(
            'Duration Too Short',
            'Reminders must be at least 1 minute in the future.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Check user's reminder limit
    const activeReminders = await Reminder.countUserActiveReminders(guild.id, user.id);
    if (activeReminders >= 20) {
        const errorEmbed = createErrorEmbed(
            'Reminder Limit Reached',
            'You can have a maximum of 20 active reminders. Please remove some before creating new ones.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Calculate reminder time
    const remindAt = new Date(Date.now() + duration);

    try {
        // Create reminder in database
        const reminder = await Reminder.createReminder({
            guildId: guild.id,
            userId: user.id,
            message: message,
            channelId: channel.id,
            remindAt: remindAt
        });

        // Create success embed
        const successEmbed = await createEmbed(guild.id, {
            title: 'Reminder Set',
            description: `I'll remind you about: **${message}**`,
            fields: [
                {
                    name: 'Reminder ID',
                    value: `#${reminder.reminderId}`,
                    inline: true
                },
                {
                    name: 'Duration',
                    value: durationString,
                    inline: true
                },
                {
                    name: 'Remind At',
                    value: `<t:${Math.floor(remindAt.getTime() / 1000)}:F> (<t:${Math.floor(remindAt.getTime() / 1000)}:R>)`,
                    inline: false
                }
            ],
            footer: {
                text: 'I\'ll try to DM you first, then mention you here if DMs are disabled'
            },
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        
    } catch (error) {
        console.error('Error creating reminder:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Create Reminder',
            'An error occurred while creating your reminder. Please try again.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle listing user's reminders
 */
async function handleListReminders(interaction, user, guild) {
    try {
        const reminders = await Reminder.getUserReminders(guild.id, user.id);
        
        if (reminders.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'Your Reminders',
                description: 'You have no active reminders.',
                color: 0x808080
            });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = await createEmbed(guild.id, {
            title: `Your Reminders (${reminders.length}/20)`,
            description: 'Here are your active reminders:',
            fields: reminders.slice(0, 10).map(reminder => ({
                name: `#${reminder.reminderId} - <t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R>`,
                value: `${reminder.message.length > 100 ? reminder.message.substring(0, 97) + '...' : reminder.message}`,
                inline: false
            })),
            footer: {
                text: reminders.length > 10 ? `Showing first 10 of ${reminders.length} reminders. Use /remind remove <id> to delete reminders.` : 'Use /remind remove <id> to delete reminders.'
            },
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        
    } catch (error) {
        console.error('Error listing reminders:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to List Reminders',
            'An error occurred while retrieving your reminders.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle removing a reminder
 */
async function handleRemoveReminder(interaction, user, guild) {
    const reminderId = interaction.options.getInteger('id');

    try {
        const reminder = await Reminder.getReminderById(guild.id, reminderId);
        
        if (!reminder) {
            const errorEmbed = createErrorEmbed(
                'Reminder Not Found',
                `No reminder found with ID #${reminderId} in this server.`
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // Check if the user owns this reminder
        if (reminder.userId !== user.id) {
            const errorEmbed = createErrorEmbed(
                'Not Your Reminder',
                'You can only remove your own reminders.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // Remove the reminder
        await Reminder.removeReminder(guild.id, user.id, reminderId);

        const successEmbed = await createEmbed(guild.id, {
            title: 'Reminder Removed',
            description: `Successfully removed reminder #${reminderId}:\n\n**${reminder.message}**`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        
    } catch (error) {
        console.error('Error removing reminder:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Remove Reminder',
            'An error occurred while removing your reminder.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}
