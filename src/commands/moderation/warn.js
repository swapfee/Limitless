const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createEmbed } = require('../../utils/embedUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const Warning = require('../../models/Warning');
const WarnConfig = require('../../models/WarnConfig');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warning system management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Warn a user for breaking server rules')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to warn')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for the warning')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a specific warning from a user')
                .addIntegerOption(option =>
                    option
                        .setName('warnid')
                        .setDescription('The warning ID to remove')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for removing the warning')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View warnings for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to view warnings for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all warnings from a user (Owner only)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to clear warnings from')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for clearing warnings')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the server warnings leaderboard')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of users to show (default: 10, max: 25)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Configure warning system and auto-punishments (Owner only)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('view')
                        .setDescription('View current warning configuration')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('toggle')
                        .setDescription('Enable or disable auto-moderation')
                        .addBooleanOption(option =>
                            option
                                .setName('enabled')
                                .setDescription('Enable or disable auto-moderation')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('addpunishment')
                        .setDescription('Add an auto-punishment rule')
                        .addIntegerOption(option =>
                            option
                                .setName('warnings')
                                .setDescription('Number of warnings to trigger punishment')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(100)
                        )
                        .addStringOption(option =>
                            option
                                .setName('action')
                                .setDescription('Punishment action to take')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Jail', value: 'jail' },
                                    { name: 'Ban', value: 'ban' },
                                    { name: 'Kick', value: 'kick' }
                                )
                        )
                        .addStringOption(option =>
                            option
                                .setName('duration')
                                .setDescription('Duration for jail (e.g., 1h, 30m, 1d) - not needed for ban/kick')
                                .setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('removepunishment')
                        .setDescription('Remove an auto-punishment rule')
                        .addIntegerOption(option =>
                            option
                                .setName('warnings')
                                .setDescription('Number of warnings to remove punishment for')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('togglepunishment')
                        .setDescription('Enable or disable a specific punishment rule')
                        .addIntegerOption(option =>
                            option
                                .setName('warnings')
                                .setDescription('Number of warnings for the rule to toggle')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                        .addBooleanOption(option =>
                            option
                                .setName('enabled')
                                .setDescription('Enable or disable this punishment rule')
                                .setRequired(true)
                        )
                )
        ),

    async execute(interaction) {
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const moderator = interaction.member;

        try {
            if (subcommandGroup === 'config') {
                // Handle config subcommands (Owner only)
                if (guild.ownerId !== moderator.user.id) {
                    const errorEmbed = await createEmbed(guild.id, {
                        title: 'Permission Denied',
                        description: 'Only the server owner can configure the warning system.',
                        color: 0xFF0000
                    });
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }

                switch (subcommand) {
                    case 'view':
                        await handleConfigView(interaction, guild);
                        break;
                    case 'toggle':
                        await handleConfigToggle(interaction, guild);
                        break;
                    case 'addpunishment':
                        await handleConfigAddPunishment(interaction, guild);
                        break;
                    case 'removepunishment':
                        await handleConfigRemovePunishment(interaction, guild);
                        break;
                    case 'togglepunishment':
                        await handleConfigTogglePunishment(interaction, guild);
                        break;
                }
            } else {
                // Handle main warn subcommands with proper permission checking
                const permissionCheck = await hasPermission(moderator, 'manage_messages');
                
                if (!permissionCheck.hasPermission) {
                    const errorEmbed = await createEmbed(guild.id, {
                        title: 'Insufficient Permissions',
                        description: permissionCheck.reason || 'You do not have permission to manage messages (warn users).',
                        color: 0xFF0000
                    });
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }

                switch (subcommand) {
                    case 'add':
                        await handleWarnAdd(interaction, guild, moderator);
                        break;
                    case 'remove':
                        await handleWarnRemove(interaction, guild, moderator);
                        break;
                    case 'list':
                        await handleWarnList(interaction, guild, moderator);
                        break;
                    case 'clear':
                        await handleWarnClear(interaction, guild, moderator);
                        break;
                    case 'leaderboard':
                        await handleWarnLeaderboard(interaction, guild, moderator);
                        break;
                }
            }
        } catch (error) {
            console.error('Error in warn command:', error);

            const errorEmbed = await createEmbed(guild.id, {
                title: 'Error',
                description: 'An error occurred while processing the warning command.',
                color: 0xFF0000
            });

            if (interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};

// ====== WARN SUBCOMMAND HANDLERS ======

async function handleWarnAdd(interaction, guild, moderator) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    // Check if user is trying to warn themselves
    if (targetUser.id === moderator.user.id) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Cannot Warn User',
            description: 'You cannot warn yourself.',
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Check if user is trying to warn a bot
    if (targetUser.bot) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Cannot Warn Bot',
            description: 'You cannot warn bots.',
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        const member = await guild.members.fetch(targetUser.id);

        // Check permissions and role hierarchy
        const permissionCheck = await hasPermission(moderator, 'manage_messages');

        // Check if user can execute on target (handles role hierarchy and whitelist checks)
        const canExecute = await canExecuteOn(moderator, member, 'manage_messages');
        if (!canExecute.canExecute) {
            const errorEmbed = await createEmbed(guild.id, {
                title: 'Cannot Execute Warning', 
                description: canExecute.reason,
                color: 0xFF0000
            });
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // Check if bot can manage this user (for potential auto-punishments)
        if (!member.manageable) {
            const errorEmbed = await createEmbed(guild.id, {
                title: 'Cannot Process Warning',
                description: 'I cannot manage this user for potential auto-punishments. They may have a higher role than me or be the server owner.',
                color: 0xFF0000
            });
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // Create the warning
        const warning = await Warning.createWarning({
            guildId: guild.id,
            userId: targetUser.id,
            moderatorId: moderator.user.id,
            reason: reason
        });

        // Create moderation case
        const caseData = await createModerationCase({
            guildId: guild.id,
            userId: targetUser.id,
            moderatorId: moderator.user.id,
            type: 'warn',
            reason: reason,
            additionalInfo: {
                warnId: warning.warnId
            }
        });

        // Update warning with case ID
        warning.caseId = caseData.caseId;
        await warning.save();

        // Get current warning count
        const totalWarnings = await Warning.countUserWarnings(guild.id, targetUser.id);

        // Check for auto-punishment
        const autoPunishment = await WarnConfig.getPunishmentForCount(guild.id, totalWarnings);

        let autoPunishmentExecuted = null;
        if (autoPunishment) {
            try {
                autoPunishmentExecuted = await executeAutoPunishment(
                    guild, 
                    member, 
                    moderator.user, 
                    autoPunishment, 
                    totalWarnings,
                    `Automatic punishment: ${totalWarnings} warnings reached`
                );
            } catch (error) {
                console.error('Error executing auto-punishment:', error);
            }
        }

        // Try to DM the user
        let dmSent = false;
        try {
            const dmEmbed = await createEmbed(guild.id, {
                title: 'You Have Been Warned',
                description: `You have received a warning in **${guild.name}**.`,
                fields: [
                    {
                        name: 'Warning ID',
                        value: `#${warning.warnId}`,
                        inline: true
                    },
                    {
                        name: 'Total Warnings',
                        value: `${totalWarnings}`,
                        inline: true
                    },
                    {
                        name: 'Case ID',
                        value: `#${caseData.caseId}`,
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: reason,
                        inline: false
                    }
                ],
                color: 0xFFAA00,
                timestamp: new Date()
            });

            if (autoPunishmentExecuted) {
                dmEmbed.data.fields.push({
                    name: 'Auto-Punishment Applied',
                    value: autoPunishmentExecuted,
                    inline: false
                });
            }

            await targetUser.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (error) {
            // User has DMs disabled - this is normal
        }

        // Reply with success
        const successEmbed = await createEmbed(guild.id, {
            title: 'User Warned',
            description: `Successfully warned ${targetUser.tag}`,
            fields: [
                {
                    name: 'User',
                    value: `${targetUser.tag} (${targetUser.id})`,
                    inline: true
                },
                {
                    name: 'Moderator',
                    value: `${moderator.user.tag} (${moderator.user.id})`,
                    inline: true
                },
                {
                    name: 'Warning ID',
                    value: `#${warning.warnId}`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseData.caseId}`,
                    inline: true
                },
                {
                    name: 'Total Warnings',
                    value: `${totalWarnings}`,
                    inline: true
                },
                {
                    name: 'DM Sent',
                    value: dmSent ? 'Yes' : 'No',
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0xFFAA00,
            timestamp: new Date()
        });

        if (autoPunishmentExecuted) {
            successEmbed.data.fields.push({
                name: 'Auto-Punishment Applied',
                value: autoPunishmentExecuted,
                inline: false
            });
        }

        await interaction.reply({ embeds: [successEmbed] });

    } catch (error) {
        if (error.code === 10007) {
            const errorEmbed = await createEmbed(guild.id, {
                title: 'User Not Found',
                description: 'The specified user is not a member of this server.',
                color: 0xFF0000
            });
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        throw error;
    }
}

async function handleWarnRemove(interaction, guild, moderator) {
    const warnId = interaction.options.getInteger('warnid');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Find the warning
    const warning = await Warning.getWarningById(guild.id, warnId);
    
    if (!warning) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Warning Not Found',
            description: `No warning found with ID #${warnId} in this server.`,
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Get user info
    let targetUser;
    try {
        targetUser = await guild.client.users.fetch(warning.userId);
    } catch (error) {
        // User might have left the server, but we can still remove the warning
        targetUser = { id: warning.userId, tag: 'Unknown User' };
    }

    // Remove the warning
    await Warning.removeWarning(guild.id, warnId);

    // Create moderation case
    const caseData = await createModerationCase({
        guildId: guild.id,
        userId: warning.userId,
        moderatorId: moderator.user.id,
        type: 'unwarn',
        reason: reason,
        additionalInfo: {
            removedWarnId: warnId,
            originalReason: warning.reason
        }
    });

    // Get remaining warning count
    const remainingWarnings = await Warning.countUserWarnings(guild.id, warning.userId);

    // Try to DM the user if they're still in the server
    let dmSent = false;
    try {
        if (targetUser.tag !== 'Unknown User') {
            const dmEmbed = await createEmbed(guild.id, {
                title: 'Warning Removed',
                description: `One of your warnings has been removed in **${guild.name}**.`,
                fields: [
                    {
                        name: 'Removed Warning ID',
                        value: `#${warnId}`,
                        inline: true
                    },
                    {
                        name: 'Remaining Warnings',
                        value: `${remainingWarnings}`,
                        inline: true
                    },
                    {
                        name: 'Case ID',
                        value: `#${caseData.caseId}`,
                        inline: true
                    },
                    {
                        name: 'Removal Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: 'Original Warning Reason',
                        value: warning.reason,
                        inline: false
                    }
                ],
                color: 0x00FF00,
                timestamp: new Date()
            });

            await targetUser.send({ embeds: [dmEmbed] });
            dmSent = true;
        }
    } catch (error) {
        // User has DMs disabled or left server - this is normal
    }

    // Reply with success
    const successEmbed = await createEmbed(guild.id, {
        title: 'Warning Removed',
        description: `Successfully removed warning #${warnId}`,
        fields: [
            {
                name: 'User',
                value: `${targetUser.tag} (${warning.userId})`,
                inline: true
            },
            {
                name: 'Moderator',
                value: `${moderator.user.tag} (${moderator.user.id})`,
                inline: true
            },
            {
                name: 'Warning ID',
                value: `#${warnId}`,
                inline: true
            },
            {
                name: 'Case ID',
                value: `#${caseData.caseId}`,
                inline: true
            },
            {
                name: 'Remaining Warnings',
                value: `${remainingWarnings}`,
                inline: true
            },
            {
                name: 'DM Sent',
                value: dmSent ? 'Yes' : 'No',
                inline: true
            },
            {
                name: 'Original Warning Reason',
                value: warning.reason,
                inline: false
            },
            {
                name: 'Removal Reason',
                value: reason,
                inline: false
            }
        ],
        color: 0x00FF00,
        timestamp: new Date()
    });

    await interaction.reply({ embeds: [successEmbed] });
}

async function handleWarnList(interaction, guild, moderator) {
    const targetUser = interaction.options.getUser('user');

    // Get user warnings
    const warnings = await Warning.getUserWarnings(guild.id, targetUser.id);
    const totalWarnings = warnings.length;

    if (totalWarnings === 0) {
        const noWarningsEmbed = await createEmbed(guild.id, {
            title: 'User Warnings',
            description: `${targetUser.tag} has no warnings in this server.`,
            color: 0x00FF00
        });
        return interaction.reply({ embeds: [noWarningsEmbed] });
    }

    // Create warning list
    const warningList = warnings.slice(0, 10).map((warning, index) => {
        const date = warning.createdAt.toLocaleDateString();
        const time = warning.createdAt.toLocaleTimeString();
        let moderatorName = 'Unknown';
        
        try {
            const mod = guild.members.cache.get(warning.moderatorId);
            if (mod) moderatorName = mod.user.tag;
        } catch (error) {
            // Moderator might have left
        }

        return {
            name: `Warning #${warning.warnId}`,
            value: `**Reason:** ${warning.reason}\n**Moderator:** ${moderatorName}\n**Date:** ${date} ${time}${warning.caseId ? `\n**Case:** #${warning.caseId}` : ''}`,
            inline: false
        };
    });

    const embed = await createEmbed(guild.id, {
        title: 'User Warnings',
        description: `Warnings for ${targetUser.tag} (${targetUser.id})`,
        fields: [
            {
                name: 'Summary',
                value: `**Total Warnings:** ${totalWarnings}\n**Showing:** ${Math.min(totalWarnings, 10)} most recent`,
                inline: false
            },
            ...warningList
        ],
        color: 0xFFAA00,
        timestamp: new Date()
    });

    if (totalWarnings > 10) {
        embed.data.fields.push({
            name: 'Note',
            value: `This user has ${totalWarnings} total warnings. Only the 10 most recent are shown.`,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleWarnClear(interaction, guild, moderator) {
    // Only the server owner can clear warnings
    if (guild.ownerId !== moderator.user.id) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Permission Denied',
            description: 'Only the server owner can clear all warnings from a user.',
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Get current warning count before clearing
    const currentWarnings = await Warning.countUserWarnings(guild.id, targetUser.id);

    if (currentWarnings === 0) {
        const noWarningsEmbed = await createEmbed(guild.id, {
            title: 'No Warnings Found',
            description: `${targetUser.tag} has no warnings to clear.`,
            color: 0xFFAA00
        });
        return interaction.reply({ embeds: [noWarningsEmbed] });
    }

    // Clear all warnings for the user
    const result = await Warning.clearUserWarnings(guild.id, targetUser.id);

    // Create moderation case
    const caseData = await createModerationCase({
        guildId: guild.id,
        userId: targetUser.id,
        moderatorId: moderator.user.id,
        type: 'clearwarns',
        reason: reason,
        additionalInfo: {
            clearedWarningsCount: currentWarnings
        }
    });

    // Try to DM the user
    let dmSent = false;
    try {
        const dmEmbed = await createEmbed(guild.id, {
            title: 'Warnings Cleared',
            description: `All your warnings have been cleared in **${guild.name}**.`,
            fields: [
                {
                    name: 'Warnings Cleared',
                    value: `${currentWarnings}`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseData.caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0x00FF00,
            timestamp: new Date()
        });

        await targetUser.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        // User has DMs disabled - this is normal
    }

    // Reply with success
    const successEmbed = await createEmbed(guild.id, {
        title: 'Warnings Cleared',
        description: `Successfully cleared all warnings for ${targetUser.tag}`,
        fields: [
            {
                name: 'User',
                value: `${targetUser.tag} (${targetUser.id})`,
                inline: true
            },
            {
                name: 'Moderator',
                value: `${moderator.user.tag} (${moderator.user.id})`,
                inline: true
            },
            {
                name: 'Warnings Cleared',
                value: `${currentWarnings}`,
                inline: true
            },
            {
                name: 'Case ID',
                value: `#${caseData.caseId}`,
                inline: true
            },
            {
                name: 'DM Sent',
                value: dmSent ? 'Yes' : 'No',
                inline: true
            },
            {
                name: 'Reason',
                value: reason,
                inline: false
            }
        ],
        color: 0x00FF00,
        timestamp: new Date()
    });

    await interaction.reply({ embeds: [successEmbed] });
}

async function handleWarnLeaderboard(interaction, guild, moderator) {
    const limit = interaction.options.getInteger('limit') || 10;

    // Get leaderboard data
    const leaderboard = await Warning.getGuildWarningsLeaderboard(guild.id, limit);

    if (leaderboard.length === 0) {
        const noWarningsEmbed = await createEmbed(guild.id, {
            title: 'Warnings Leaderboard',
            description: 'No warnings found in this server.',
            color: 0x00FF00
        });
        return interaction.reply({ embeds: [noWarningsEmbed] });
    }

    // Create leaderboard list
    let leaderboardText = '';
    const medals = ['1st', '2nd', '3rd'];
    
    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const position = i + 1;
        const medal = position <= 3 ? medals[position - 1] : `${position}.`;
        
        let username = 'Unknown User';
        try {
            const user = await guild.client.users.fetch(entry._id);
            username = user.tag;
        } catch (error) {
            // User might have left or account deleted
            username = `Unknown User (${entry._id})`;
        }

        const lastWarningDate = entry.lastWarning.toLocaleDateString();
        leaderboardText += `${medal} **${username}**\n`;
        leaderboardText += `   └ ${entry.count} warning${entry.count === 1 ? '' : 's'} • Last: ${lastWarningDate}\n\n`;
    }

    const embed = await createEmbed(guild.id, {
        title: 'Warnings Leaderboard',
        description: `Top ${leaderboard.length} users with the most warnings in this server.`,
        fields: [
            {
                name: 'Rankings',
                value: leaderboardText || 'No data available',
                inline: false
            }
        ],
        footer: {
            text: `Showing top ${limit} users • Total entries: ${leaderboard.length}`
        },
        color: 0xFFAA00,
        timestamp: new Date()
    });

    await interaction.reply({ embeds: [embed] });
}

// ====== CONFIG SUBCOMMAND HANDLERS ======

async function handleConfigView(interaction, guild) {
    const config = await WarnConfig.getConfig(guild.id);
    
    let punishmentsList = 'None configured';
    if (config.punishments.length > 0) {
        punishmentsList = config.punishments
            .sort((a, b) => a.warnCount - b.warnCount)
            .map(p => {
                const status = p.enabled ? 'Enabled' : 'Disabled';
                const duration = p.duration ? ` for ${p.duration}` : '';
                return `${status} ${p.warnCount} warnings → ${p.action}${duration}`;
            })
            .join('\n');
    }

    const embed = await createEmbed(guild.id, {
        title: 'Warning System Configuration',
        fields: [
            {
                name: 'Auto-Moderation Status',
                value: config.autoModeration ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: 'DM Users on Warning',
                value: config.dmUsers ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: 'Auto-Punishment Rules',
                value: punishmentsList,
                inline: false
            }
        ],
        footer: {
            text: 'Use /warn config addpunishment to add auto-punishment rules'
        },
        color: 0x0099FF,
        timestamp: new Date()
    });

    await interaction.reply({ embeds: [embed] });
}

async function handleConfigToggle(interaction, guild) {
    const enabled = interaction.options.getBoolean('enabled');
    
    await WarnConfig.setAutoModeration(guild.id, enabled);
    
    const embed = await createEmbed(guild.id, {
        title: 'Auto-Moderation Updated',
        description: `Auto-moderation has been **${enabled ? 'enabled' : 'disabled'}**.`,
        fields: [
            {
                name: 'What this means',
                value: enabled 
                    ? 'Users will automatically receive punishments when they reach configured warning thresholds.'
                    : 'Users will only receive warnings without automatic punishments.',
                inline: false
            }
        ],
        color: enabled ? 0x00FF00 : 0xFFAA00
    });

    await interaction.reply({ embeds: [embed] });
}

async function handleConfigAddPunishment(interaction, guild) {
    const warnings = interaction.options.getInteger('warnings');
    const action = interaction.options.getString('action');
    const duration = interaction.options.getString('duration');

    // Validate duration for jail action
    if (action === 'jail' && duration) {
        if (!isValidDuration(duration)) {
            const errorEmbed = await createEmbed(guild.id, {
                title: 'Invalid Duration',
                description: 'Please use a valid time format (e.g., 1h, 30m, 1d, 7d).\nSupported units: s (seconds), m (minutes), h (hours), d (days)',
                color: 0xFF0000
            });
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }

    // Check if jail role exists for jail action
    if (action === 'jail') {
        const jailRole = guild.roles.cache.find(role => role.name === 'Jailed');
        if (!jailRole) {
            const errorEmbed = await createEmbed(guild.id, {
                title: 'Jail Role Not Found',
                description: 'The "Jailed" role was not found. Please run `/setup` first to create the moderation system.',
                color: 0xFF0000
            });
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }

    await WarnConfig.addPunishment(guild.id, warnings, action, duration);

    const durationText = duration ? ` for ${duration}` : '';
    const embed = await createEmbed(guild.id, {
        title: 'Punishment Rule Added',
        description: `Successfully added auto-punishment rule.`,
        fields: [
            {
                name: 'Rule Details',
                value: `When a user reaches **${warnings}** warning${warnings === 1 ? '' : 's'}, they will be **${action}ed**${durationText}.`,
                inline: false
            },
            {
                name: 'Note',
                value: 'Make sure auto-moderation is enabled for this rule to take effect.',
                inline: false
            }
        ],
        color: 0x00FF00
    });

    await interaction.reply({ embeds: [embed] });
}

async function handleConfigRemovePunishment(interaction, guild) {
    const warnings = interaction.options.getInteger('warnings');
    
    const result = await WarnConfig.removePunishment(guild.id, warnings);
    
    if (!result || result.punishments.find(p => p.warnCount === warnings)) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Punishment Rule Not Found',
            description: `No punishment rule found for ${warnings} warning${warnings === 1 ? '' : 's'}.`,
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const embed = await createEmbed(guild.id, {
        title: 'Punishment Rule Removed',
        description: `Successfully removed the punishment rule for ${warnings} warning${warnings === 1 ? '' : 's'}.`,
        color: 0x00FF00
    });

    await interaction.reply({ embeds: [embed] });
}

async function handleConfigTogglePunishment(interaction, guild) {
    const warnings = interaction.options.getInteger('warnings');
    const enabled = interaction.options.getBoolean('enabled');
    
    const result = await WarnConfig.togglePunishment(guild.id, warnings, enabled);
    
    if (!result) {
        const errorEmbed = await createEmbed(guild.id, {
            title: 'Punishment Rule Not Found',
            description: `No punishment rule found for ${warnings} warning${warnings === 1 ? '' : 's'}.`,
            color: 0xFF0000
        });
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const embed = await createEmbed(guild.id, {
        title: 'Punishment Rule Updated',
        description: `The punishment rule for ${warnings} warning${warnings === 1 ? '' : 's'} has been **${enabled ? 'enabled' : 'disabled'}**.`,
        color: enabled ? 0x00FF00 : 0xFFAA00
    });

    await interaction.reply({ embeds: [embed] });
}

// ====== HELPER FUNCTIONS ======

/**
 * Execute auto-punishment based on warning count
 */
async function executeAutoPunishment(guild, member, moderator, punishment, warnCount, reason) {
    try {
        switch (punishment.action) {
            case 'jail':
                return await executeJail(guild, member, moderator, punishment, reason);
            case 'ban':
                return await executeBan(guild, member, moderator, reason);
            case 'kick':
                return await executeKick(guild, member, moderator, reason);
            default:
                return null;
        }
    } catch (error) {
        console.error('Error executing auto-punishment:', error);
        throw error;
    }
}

async function executeJail(guild, member, moderator, punishment, reason) {
    const jailRole = guild.roles.cache.find(role => role.name === 'Jailed');
    if (!jailRole) {
        throw new Error('Jail role not found. Please run setup command first.');
    }

    await member.roles.add(jailRole, `Auto-jail: ${reason}`);
    
    if (punishment.duration) {
        const duration = parseTimeString(punishment.duration);
        if (duration) {
            const expiresAt = new Date(Date.now() + duration);
            
            // Store in TempMute with type 'jail' for automatic removal
            await TempMute.createTempMute({
                guildId: guild.id,
                userId: member.id,
                executorId: moderator.id,
                reason: reason,
                muteDuration: punishment.duration,
                unmuteTime: expiresAt,
                muteType: 'jail'
            });
            
            return `Jailed for ${punishment.duration}`;
        }
    }
    
    return 'Jailed (permanent)';
}

async function executeBan(guild, member, moderator, reason) {
    await member.ban({ reason: `Auto-ban: ${reason}` });
    
    // Create case for the ban
    await createModerationCase({
        guildId: guild.id,
        userId: member.id,
        moderatorId: moderator.id,
        type: 'ban',
        reason: `Auto-ban: ${reason}`,
        additionalInfo: { automatic: true }
    });
    
    return 'Banned from server';
}

async function executeKick(guild, member, moderator, reason) {
    await member.kick(`Auto-kick: ${reason}`);
    
    // Create case for the kick
    await createModerationCase({
        guildId: guild.id,
        userId: member.id,
        moderatorId: moderator.id,
        type: 'kick',
        reason: `Auto-kick: ${reason}`,
        additionalInfo: { automatic: true }
    });
    
    return 'Kicked from server';
}

/**
 * Parse time string into milliseconds
 */
function parseTimeString(timeString) {
    const regex = /^(\d+)([smhd])$/i;
    const match = timeString.match(regex);
    
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
}

function isValidDuration(timeString) {
    const regex = /^(\d+)([smhd])$/i;
    return regex.test(timeString);
}
