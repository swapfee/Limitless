const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, getLogChannel, getJailChannels } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const LockdownConfig = require('../../models/LockdownConfig');
const LockedChannel = require('../../models/LockedChannel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Channel unlock management system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Unlock a specific channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to unlock')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for unlocking the channel')
                        .setRequired(true)
                        .setMaxLength(500)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('Unlock all locked channels (respects ignored channels)')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for unlocking all channels')
                        .setRequired(true)
                        .setMaxLength(500))),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const executor = interaction.member;
        const guild = interaction.guild;

        // Check permissions - need real or fake manage_channels
        const permissionCheck = await hasPermission(executor, 'manage_channels');

        if (!permissionCheck.hasPermission) {
            const errorEmbed = createErrorEmbed(
                'Insufficient Permissions',
                permissionCheck.reason || 'You need Manage Channels permission to unlock channels.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            switch (subcommand) {
                case 'channel':
                    await handleUnlockChannel(interaction, executor, guild);
                    break;
                case 'all':
                    await handleUnlockAll(interaction, executor, guild);
                    break;
            }
        } catch (error) {
            console.error('Error in unlock command:', error);
            const errorEmbed = createErrorEmbed(
                'Unlock System Error',
                'An error occurred while processing the unlock command.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Handle unlocking a specific channel
 */
async function handleUnlockChannel(interaction, executor, guild) {
    const targetChannel = interaction.options.getChannel('channel');
    const reason = interaction.options.getString('reason');

    const lockedChannelData = await LockedChannel.getLockedChannel(guild.id, targetChannel.id);
    if (!lockedChannelData) {
        const errorEmbed = createErrorEmbed(
            'Channel Not Locked',
            `${targetChannel} is not currently locked down.`
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        const everyoneRole = guild.roles.everyone;

        // Restore original permissions or clear the overrides
        if (lockedChannelData.originalPermissions.length > 0) {
            for (const permData of lockedChannelData.originalPermissions) {
                if (permData.roleId === everyoneRole.id) {
                    // Restore original permissions
                    await targetChannel.permissionOverwrites.edit(everyoneRole, {
                        SendMessages: null,
                        SendMessagesInThreads: null,
                        CreatePublicThreads: null,
                        CreatePrivateThreads: null
                    });
                }
            }
        } else {
            // Clear the lockdown overrides
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null,
                SendMessagesInThreads: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null
            });
        }

        // Remove from database
        await LockedChannel.unlockChannel(guild.id, targetChannel.id);

        // Create moderation case
        let caseId;
        try {
            const caseData = {
                guildId: guild.id,
                type: 'unlock',
                target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
                executor: { id: executor.user.id, tag: executor.user.tag },
                reason: reason,
                additionalInfo: {}
            };
            caseId = await createModerationCase(caseData);
        } catch (error) {
            console.error('Error creating moderation case:', error);
            caseId = Date.now();
        }

        const successEmbed = await createEmbed(guild.id, {
            title: 'Channel Unlocked',
            description: `Successfully unlocked ${targetChannel}.`,
            fields: [
                {
                    name: 'Channel',
                    value: `${targetChannel} (${targetChannel.name})`,
                    inline: true
                },
                {
                    name: 'Unlocked By',
                    value: `${executor.user} (${executor.user.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                },
                {
                    name: 'Originally Locked By',
                    value: `<@${lockedChannelData.executorId}>`,
                    inline: true
                },
                {
                    name: 'Locked At',
                    value: `<t:${Math.floor(lockedChannelData.lockedAt.getTime() / 1000)}:R>`,
                    inline: true
                }
            ],
            color: 0x00FF00, // Green for unlock
            timestamp: new Date()
        });

        await interaction.reply({ embeds: [successEmbed] });

        // Log the action
        await logUnlockAction(guild, {
            type: 'Channel Unlock',
            executor: executor.user,
            channel: targetChannel,
            reason: reason,
            caseId: caseId,
            originalLockData: lockedChannelData
        });

    } catch (error) {
        console.error('Error unlocking channel:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Unlock Channel',
            'An error occurred while trying to unlock the channel. Please check my permissions.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle unlocking all channels
 */
async function handleUnlockAll(interaction, executor, guild) {
    const reason = interaction.options.getString('reason');

    await interaction.deferReply();

    try {
        // Get all locked channels
        const lockedChannels = await LockedChannel.getGuildLockedChannels(guild.id);
        
        if (lockedChannels.length === 0) {
            const errorEmbed = createErrorEmbed(
                'No Locked Channels',
                'There are no locked channels to unlock.'
            );
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        // Get ignored channels and jail channel IDs
        const config = await LockdownConfig.getOrCreateConfig(guild.id);
        const ignoredChannelIds = config.ignoredChannels;
        const jailChannels = await getJailChannels(guild.id, guild);

        let unlockedCount = 0;
        let skippedCount = 0;
        let failedChannels = [];

        for (const lockedChannelData of lockedChannels) {
            try {
                // Skip ignored channels
                if (ignoredChannelIds.includes(lockedChannelData.channelId)) {
                    skippedCount++;
                    continue;
                }

                const channel = guild.channels.cache.get(lockedChannelData.channelId);
                if (!channel) {
                    // Channel doesn't exist anymore, remove from database
                    await LockedChannel.unlockChannel(guild.id, lockedChannelData.channelId);
                    continue;
                }

                // Skip jail-related channels as additional safety
                if (channel.id === jailChannels.jailChannelId || channel.id === jailChannels.logChannelId) {
                    console.log(`Skipping jail-related channel during unlock all: ${channel.name}`);
                    skippedCount++;
                    continue;
                }

                const everyoneRole = guild.roles.everyone;

                // Restore original permissions or clear the overrides
                if (lockedChannelData.originalPermissions.length > 0) {
                    for (const permData of lockedChannelData.originalPermissions) {
                        if (permData.roleId === everyoneRole.id) {
                            await channel.permissionOverwrites.edit(everyoneRole, {
                                SendMessages: null,
                                SendMessagesInThreads: null,
                                CreatePublicThreads: null,
                                CreatePrivateThreads: null
                            });
                        }
                    }
                } else {
                    await channel.permissionOverwrites.edit(everyoneRole, {
                        SendMessages: null,
                        SendMessagesInThreads: null,
                        CreatePublicThreads: null,
                        CreatePrivateThreads: null
                    });
                }

                // Remove from database
                await LockedChannel.unlockChannel(guild.id, lockedChannelData.channelId);
                unlockedCount++;

            } catch (error) {
                console.error(`Failed to unlock channel ${lockedChannelData.channelId}:`, error);
                const channel = guild.channels.cache.get(lockedChannelData.channelId);
                failedChannels.push(channel ? channel.name : lockedChannelData.channelId);
            }
        }

        // Create moderation case
        let caseId;
        try {
            const caseData = {
                guildId: guild.id,
                type: 'unlock_all',
                target: { id: guild.id, tag: guild.name },
                executor: { id: executor.user.id, tag: executor.user.tag },
                reason: reason,
                additionalInfo: { 
                    unlockedChannels: unlockedCount,
                    skippedChannels: skippedCount
                }
            };
            caseId = await createModerationCase(caseData);
        } catch (error) {
            console.error('Error creating moderation case:', error);
            caseId = Date.now();
        }

        const successEmbed = await createEmbed(guild.id, {
            title: 'Mass Unlock Completed',
            description: `Successfully unlocked ${unlockedCount} channels.`,
            fields: [
                {
                    name: 'Channels Unlocked',
                    value: unlockedCount.toString(),
                    inline: true
                },
                {
                    name: 'Channels Skipped (Ignored)',
                    value: skippedCount.toString(),
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseId}`,
                    inline: true
                },
                {
                    name: 'Unlocked By',
                    value: `${executor.user} (${executor.user.tag})`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0x00FF00, // Green for unlock
            timestamp: new Date()
        });

        if (failedChannels.length > 0) {
            successEmbed.addFields({
                name: 'Failed Channels',
                value: failedChannels.slice(0, 10).join(', ') + (failedChannels.length > 10 ? '...' : ''),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [successEmbed] });

        // Log the action
        await logUnlockAction(guild, {
            type: 'Mass Unlock',
            executor: executor.user,
            reason: reason,
            caseId: caseId,
            channelsUnlocked: unlockedCount,
            channelsSkipped: skippedCount,
            failedChannels: failedChannels
        });

    } catch (error) {
        console.error('Error unlocking all channels:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Unlock All Channels',
            'An error occurred while trying to unlock all channels.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Log unlock action to the configured log channel
 */
async function logUnlockAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id, guild);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping unlock log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping unlock log');
            return;
        }
        
        const logEmbed = await createEmbed(guild.id, {
            title: `🔓 ${logData.type}`,
            description: logData.type === 'Channel Unlock' 
                ? `${logData.channel} has been unlocked.`
                : `${logData.channelsUnlocked} channels have been unlocked.`,
            fields: [
                {
                    name: 'Moderator',
                    value: `${logData.executor} (${logData.executor.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${logData.caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: logData.reason,
                    inline: false
                }
            ],
            footer: {
                text: logData.type === 'Channel Unlock' 
                    ? `Channel ID: ${logData.channel.id} • Moderator ID: ${logData.executor.id}`
                    : `Moderator ID: ${logData.executor.id}`
            },
            timestamp: new Date(),
            color: 0x00FF00
        });

        if (logData.type === 'Channel Unlock' && logData.originalLockData) {
            logEmbed.addFields({
                name: 'Originally Locked By',
                value: `<@${logData.originalLockData.executorId}>`,
                inline: true
            }, {
                name: 'Lock Duration',
                value: `<t:${Math.floor(logData.originalLockData.lockedAt.getTime() / 1000)}:R>`,
                inline: true
            });
        }

        if (logData.type === 'Mass Unlock') {
            logEmbed.addFields({
                name: 'Channels Unlocked',
                value: logData.channelsUnlocked.toString(),
                inline: true
            }, {
                name: 'Channels Skipped',
                value: logData.channelsSkipped.toString(),
                inline: true
            });

            if (logData.failedChannels && logData.failedChannels.length > 0) {
                logEmbed.addFields({
                    name: 'Failed Channels',
                    value: logData.failedChannels.slice(0, 5).join(', ') + 
                           (logData.failedChannels.length > 5 ? '...' : ''),
                    inline: true
                });
            }
        }
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging unlock action:', error);
    }
}
