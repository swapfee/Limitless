const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to kick themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Kick',
                'You cannot kick yourself.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        try {
            // Check if user has real Discord permissions OR fake permissions
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.KickMembers);
            const hasFakePermission = await hasPermission(executor, 'kick_members');
            
            // User must have either real permissions or fake permissions
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to kick members.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Try to fetch the target member
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                const errorEmbed = createErrorEmbed(
                    'User Not Found', 
                    'The specified user is not a member of this server.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Permission-based hierarchy and security checks
            if (hasRealPermission) {
                // Basic hierarchy check for real permission users
                const executorHighestRole = executor.roles.highest;
                const targetHighestRole = targetMember.roles.highest;
                
                if (!executor.permissions.has(PermissionFlagsBits.Administrator) && 
                    targetHighestRole.position >= executorHighestRole.position) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Kick', 
                        'You cannot kick users with equal or higher roles.'
                    );
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }
            } else {
                // Full fake permission security checks
                const canExecute = await canExecuteOn(executor, targetMember, 'kick_members');
                if (!canExecute.canExecute) {
                    const errorEmbed = createErrorEmbed('Cannot Execute Kick', canExecute.reason);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }
            }
            
            // Execute the kick
            await executeKick(interaction, guild, executor, targetMember, reason);
            
        } catch (error) {
            console.error('Error in kick command:', error);
            
            let errorMessage = 'An error occurred while trying to kick the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to kick this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to kick this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            } else if (error.code === 10013) {
                errorMessage = 'User is not a member of this server.';
            }
            
            const errorEmbed = createErrorEmbed('Kick Failed', errorMessage);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

/**
 * Execute the kick action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the kick is happening
 * @param {GuildMember} executor - The member executing the kick
 * @param {GuildMember} targetMember - The member being kicked
 * @param {string} reason - The reason for the kick
 */
async function executeKick(interaction, guild, executor, targetMember, reason) {
    // Execute the kick
    const kickReason = `Kicked by ${executor.user.tag}: ${reason}`;
    
    await targetMember.kick(kickReason);
    
    // Create moderation case
    let caseId;
    try {
        caseId = await createModerationCase({
            guildId: guild.id,
            type: 'kick',
            target: { id: targetMember.user.id, tag: targetMember.user.tag },
            executor: { id: executor.user.id, tag: executor.user.tag },
            reason: reason
        });
    } catch (error) {
        console.error('Error creating moderation case:', error);
        caseId = Date.now(); // Fallback to timestamp
    }
    
    // Create success embed
    const kickEmbed = await createEmbed(guild.id, {
        title: 'User Kicked',
        description: `Successfully kicked ${targetMember.user} from the server.`,
        fields: [
            {
                name: 'Kicked User',
                value: `${targetMember.user} (${targetMember.user.tag})`,
                inline: true
            },
            {
                name: 'Kicked By',
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
                name: 'Timestamp',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        ]
    });
    
    await interaction.editReply({ embeds: [kickEmbed] });
    
    // Log to jail-log channel
    await logKickAction(guild, {
        executor: executor.user,
        target: targetMember.user,
        reason: reason,
        timestamp: Date.now(),
        caseId: caseId
    });
}

/**
 * Log kick action to jail-log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logKickAction(guild, logData) {
    try {
        // Find jail-log channel
        const logChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
        if (!logChannel) {
            console.log('Jail-log channel not found, skipping kick log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: 'Moderation Action: Kick',
            description: 'A user has been kicked from the server.',
            fields: [
                {
                    name: 'Action',
                    value: 'Kick',
                    inline: true
                },
                {
                    name: 'Target',
                    value: `${logData.target} (${logData.target.tag})\nID: ${logData.target.id}`,
                    inline: true
                },
                {
                    name: 'Moderator',
                    value: `${logData.executor} (${logData.executor.tag})\nID: ${logData.executor.id}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: logData.reason,
                    inline: false
                },
                {
                    name: 'Timestamp',
                    value: `<t:${Math.floor(logData.timestamp / 1000)}:F>`,
                    inline: true
                }
            ],
            footer: {
                text: `Case ID: #${logData.caseId}`
            }
        });
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging kick action:', error);
    }
}
