const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('delete_messages')
                .setDescription('Delete messages from the user (last 7 days)')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteMessages = interaction.options.getBoolean('delete_messages') ?? false;
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to ban themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Ban',
                'You cannot ban yourself.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        try {
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.BanMembers);
            const hasFakePermission = await hasPermission(executor, 'ban_members');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to ban members.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                targetMember = null;
            }
            
            if (hasRealPermission) {
                if (targetMember) {
                    const executorHighestRole = executor.roles.highest;
                    const targetHighestRole = targetMember.roles.highest;
                    
                    if (!executor.permissions.has(PermissionFlagsBits.Administrator) && 
                        targetHighestRole.position >= executorHighestRole.position) {
                        const errorEmbed = createErrorEmbed(
                            'Cannot Execute Ban', 
                            'You cannot ban users with equal or higher roles.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }
                }
            } else {
                if (targetMember) {
                    const canExecute = await canExecuteOn(executor, targetMember, 'ban_members');
                    if (!canExecute.canExecute) {
                        const errorEmbed = createErrorEmbed('Cannot Execute Ban', canExecute.reason);
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }
                }
            }
            
            // Execute the ban
            const permissionSource = hasRealPermission ? 'discord' : 'fake';
            await executeBan(interaction, guild, executor, targetUser, reason, deleteMessages, permissionSource);
            
        } catch (error) {
            console.error('Error in ban command:', error);
            
            let errorMessage = 'An error occurred while trying to ban the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to ban this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to ban this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            } else if (error.code === 10013) {
                errorMessage = 'User is already banned or invalid user ID.';
            }
            
            const errorEmbed = createErrorEmbed('Ban Failed', errorMessage);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

/**
 * Execute the ban action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the ban is happening
 * @param {GuildMember} executor - The member executing the ban
 * @param {User} targetUser - The user being banned
 * @param {string} reason - The reason for the ban
 * @param {boolean} deleteMessages - Whether to delete messages
 * @param {string} permissionSource - 'discord' or 'fake'
 */
async function executeBan(interaction, guild, executor, targetUser, reason, deleteMessages, permissionSource) {
    // Execute the ban
    const banOptions = {
        reason: `Banned by ${executor.user.tag}: ${reason}`,
        deleteMessageSeconds: deleteMessages ? 7 * 24 * 60 * 60 : 0 // 7 days in seconds
    };
    
    await guild.members.ban(targetUser, banOptions);
    
    // Create success embed
    const banEmbed = await createEmbed(guild.id, {
        title: 'User Banned',
        description: `Successfully banned ${targetUser} from the server.`,
        fields: [
            {
                name: 'Banned User',
                value: `${targetUser} (${targetUser.tag})`,
                inline: true
            },
            {
                name: 'Banned By',
                value: `${executor.user} (${executor.user.tag})`,
                inline: true
            },
            {
                name: 'Reason',
                value: reason,
                inline: false
            },
            {
                name: 'Message Deletion',
                value: deleteMessages ? 'Last 7 days deleted' : 'No messages deleted',
                inline: true
            },
            {
                name: 'Timestamp',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        ]
    });
    
    await interaction.editReply({ embeds: [banEmbed] });
    
    // Log to jail-log channel
    await logBanAction(guild, {
        executor: executor.user,
        target: targetUser,
        reason: reason,
        permissionSource: permissionSource,
        deleteMessages: deleteMessages,
        timestamp: Date.now()
    });
}

/**
 * Log ban action to jail-log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logBanAction(guild, logData) {
    try {
        // Find jail-log channel
        const logChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
        if (!logChannel) {
            console.log('Jail-log channel not found, skipping ban log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: 'Moderation Action: Ban',
            description: 'A user has been banned from the server.',
            fields: [
                {
                    name: 'Action',
                    value: 'Ban',
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
                    name: 'Message Deletion',
                    value: logData.deleteMessages ? 'Yes (7 days)' : 'No',
                    inline: true
                },
                {
                    name: 'Timestamp',
                    value: `<t:${Math.floor(logData.timestamp / 1000)}:F>`,
                    inline: true
                }
            ],
            footer: {
                text: `Case ID: ${Date.now()}`
            }
        });
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging ban action:', error);
    }
}
