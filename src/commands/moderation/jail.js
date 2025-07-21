const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission, canExecuteOn, getJailRole, getLogChannel } = require('../../utils/permissionUtils');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Jail a user (restrict them to the jail channel)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to jail')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for jailing the user')
                .setRequired(true)
                .setMaxLength(500))
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Duration for the jail (e.g., 1h, 30m, 2d) - leave empty for permanent')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const duration = interaction.options.getString('duration');
        const executor = interaction.member;
        const guild = interaction.guild;

        // Check if user is trying to jail themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Jail',
                'You cannot jail yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.ManageMessages);
            const hasFakePermission = await hasPermission(executor, 'manage_messsages');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to moderate members.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                targetMember = null;
            }

            if (hasRealPermission) {
                if (targetMember) {
                    // Check if we can execute on this target with real permissions
                    const canExecute = await canExecuteOn(executor, targetMember, 'manage_messsages');
                    if (!canExecute.canExecute) {
                        const errorEmbed = createErrorEmbed(
                            'Cannot Jail User',
                            canExecute.reason
                        );
                        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            } else {
                // Using fake permissions - additional checks
                if (!targetMember) {
                    const errorEmbed = createErrorEmbed(
                        'User Not Found',
                        'The specified user is not a member of this server.'
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                
                const canExecute = await canExecuteOn(executor, targetMember, 'moderate_members');
                if (!canExecute.canExecute) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Jail User',
                        canExecute.reason
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }

            // Ensure we have a target member for the rest of the operation
            if (!targetMember) {
                const errorEmbed = createErrorEmbed(
                    'User Not Found',
                    'The specified user is not a member of this server.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Get jail role from database
            const jailRoleId = await getJailRole(guild.id, guild);
            const jailRole = jailRoleId ? guild.roles.cache.get(jailRoleId) : null;

            if (!jailRole) {
                const errorEmbed = createErrorEmbed(
                    'Jail Role Not Found',
                    'The Jailed role does not exist. Please run the setup command first to create moderation roles.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Check if user is already jailed
            if (targetMember.roles.cache.has(jailRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Already Jailed',
                    `${targetUser.tag} is already jailed.`
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Add the jail role
            await targetMember.roles.add(jailRole, `Jailed by ${executor.user.tag}: ${reason}`);

            // Handle duration if provided
            let expiresAt = null;
            if (duration) {
                const durationMs = parseDuration(duration);
                if (durationMs) {
                    expiresAt = new Date(Date.now() + durationMs);
                    
                    // Save to temporary jail database
                    await TempMute.create({
                        guildId: guild.id,
                        userId: targetUser.id,
                        moderatorId: executor.user.id,
                        reason: reason,
                        muteType: 'jail',
                        expiresAt: expiresAt
                    });
                }
            }

            // Create moderation case
            let caseId;
            try {
                const caseData = {
                    guildId: guild.id,
                    type: 'jail',
                    target: { id: targetUser.id, tag: targetUser.tag },
                    executor: { id: executor.user.id, tag: executor.user.tag },
                    reason: reason,
                    additionalInfo: {
                        duration: duration || 'Permanent',
                        expiresAt: expiresAt
                    }
                };
                caseId = await createModerationCase(caseData);
            } catch (error) {
                console.error('Error creating moderation case:', error);
                caseId = Date.now();
            }

            const successEmbed = await createEmbed(guild.id, {
                title: 'User Jailed',
                description: `Successfully jailed ${targetUser}.`,
                fields: [
                    {
                        name: 'User',
                        value: `${targetUser} (${targetUser.tag})`,
                        inline: true
                    },
                    {
                        name: 'Moderator',
                        value: `${executor.user} (${executor.user.tag})`,
                        inline: true
                    },
                    {
                        name: 'Case ID',
                        value: `#${caseId}`,
                        inline: true
                    },
                    {
                        name: 'Duration',
                        value: duration || 'Permanent',
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: reason,
                        inline: false
                    }
                ],
                color: 0xFF8C00, // Dark orange for jail
                timestamp: new Date()
            });

            if (expiresAt) {
                successEmbed.addFields({
                    name: 'Expires',
                    value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            // Log the action
            await logJailAction(guild, {
                type: 'Jail',
                executor: executor.user,
                target: targetUser,
                reason: reason,
                duration: duration,
                caseId: caseId,
                expiresAt: expiresAt
            });

            // Try to DM the user
            try {
                const dmEmbed = await createEmbed(guild.id, {
                    title: `You have been jailed in ${guild.name}`,
                    fields: [
                        {
                            name: 'Reason',
                            value: reason,
                            inline: false
                        },
                        {
                            name: 'Duration',
                            value: duration || 'Permanent',
                            inline: true
                        },
                        {
                            name: 'Moderator',
                            value: executor.user.tag,
                            inline: true
                        }
                    ],
                    color: 0xFF8C00
                });

                if (expiresAt) {
                    dmEmbed.addFields({
                        name: 'Expires',
                        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
                        inline: true
                    });
                }

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                console.log(`Could not DM user ${targetUser.tag} about jail: ${error.message}`);
            }

        } catch (error) {
            console.error('Error in jail command:', error);
            const errorEmbed = createErrorEmbed(
                'Failed to Jail User',
                'An error occurred while trying to jail the user. Please check my permissions and try again.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Parse duration string into milliseconds
 * @param {string} duration - Duration string (e.g., "1h", "30m", "2d")
 * @returns {number|null} - Duration in milliseconds or null if invalid
 */
function parseDuration(duration) {
    const match = duration.match(/^(\\d+)([smhd])$/i);
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

/**
 * Log jail action to the configured log channel
 */
async function logJailAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id, guild);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping jail log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping jail log');
            return;
        }
        
        const logEmbed = await createEmbed(guild.id, {
            title: `🔒 ${logData.type}`,
            description: `${logData.target} has been jailed.`,
            fields: [
                {
                    name: 'Target',
                    value: `${logData.target} (${logData.target.tag})`,
                    inline: true
                },
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
                    name: 'Duration',
                    value: logData.duration || 'Permanent',
                    inline: true
                },
                {
                    name: 'Reason',
                    value: logData.reason,
                    inline: false
                }
            ],
            footer: {
                text: `User ID: ${logData.target.id} • Moderator ID: ${logData.executor.id}`
            },
            timestamp: new Date(),
            color: 0xFF8C00
        });

        if (logData.expiresAt) {
            logEmbed.addFields({
                name: 'Expires',
                value: `<t:${Math.floor(logData.expiresAt.getTime() / 1000)}:F>`,
                inline: true
            });
        }
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging jail action:', error);
    }
}
