const TempMute = require('../models/TempMute');
const { createEmbed } = require('./embedUtils');
const { createModerationCase } = require('./moderationUtils');

class TempMuteManager {
    constructor(client) {
        this.client = client;
        this.checkInterval = null;
        this.isRunning = false;
    }

    /**
     * Start the tempmute checker
     * @param {number} intervalMs - Check interval in milliseconds (default: 30 seconds)
     */
    start(intervalMs = 30000) {
        if (this.isRunning) {
            console.log('TempMute manager is already running');
            return;
        }

        console.log('Starting TempMute manager...');
        this.isRunning = true;
        
        // Run immediately on start
        this.checkExpiredMutes();
        
        // Set up periodic checking
        this.checkInterval = setInterval(() => {
            this.checkExpiredMutes();
        }, intervalMs);
        
        console.log(`TempMute manager started with ${intervalMs / 1000}s check interval`);
    }

    /**
     * Stop the tempmute checker
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping TempMute manager...');
        this.isRunning = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        console.log('TempMute manager stopped');
    }

    /**
     * Check for and process expired temporary mutes
     */
    async checkExpiredMutes() {
        try {
            const expiredMutes = await TempMute.findExpired();
            
            if (expiredMutes.length === 0) {
                return; // No expired mutes to process
            }

            console.log(`Found ${expiredMutes.length} expired temporary mute(s) to process`);

            for (const tempMute of expiredMutes) {
                await this.processExpiredMute(tempMute);
            }

        } catch (error) {
            console.error('Error checking expired mutes:', error);
        }
    }

    /**
     * Process a single expired temporary mute
     * @param {Object} tempMute - The temporary mute document
     */
    async processExpiredMute(tempMute) {
        try {
            const guild = this.client.guilds.cache.get(tempMute.guildId);
            if (!guild) {
                console.log(`Guild ${tempMute.guildId} not found for expired mute, removing from database`);
                await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);
                return;
            }

            // Try to fetch the member
            let member;
            try {
                member = await guild.members.fetch(tempMute.userId);
            } catch (error) {
                console.log(`Member ${tempMute.userId} not found in guild ${tempMute.guildId}, removing temp mute record`);
                await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);
                return;
            }

            // Find the appropriate mute role based on muteType
            let muteRole;
            const muteType = tempMute.muteType || 'mute'; // Default to 'mute' for backward compatibility
            
            if (muteType === 'imute') {
                muteRole = guild.roles.cache.find(role => role.name === 'imute');
            } else if (muteType === 'rmute') {
                muteRole = guild.roles.cache.find(role => role.name === 'rmute');
            } else if (muteType === 'jail') {
                muteRole = guild.roles.cache.find(role => role.name === 'Jailed');
            } else {
                muteRole = guild.roles.cache.find(role => role.name === 'mute');
            }
            
            if (!muteRole) {
                console.log(`${muteType} role not found in guild ${tempMute.guildId}, removing temp mute record`);
                await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);
                return;
            }

            // Check if the user still has the appropriate mute role
            if (!member.roles.cache.has(muteRole.id)) {
                console.log(`Member ${tempMute.userId} no longer has ${muteType} role, removing temp mute record`);
                await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);
                return;
            }

            // Remove the appropriate mute role
            await member.roles.remove(muteRole, `Temporary ${muteType} expired (automatic)`);
            
            console.log(`Automatically ${muteType === 'imute' ? 'image un' : muteType === 'rmute' ? 'reaction un' : 'un'}muted ${member.user.tag} (${tempMute.userId}) in ${guild.name}`);

            // Create moderation case for automatic unmute
            try {
                const unmuteType = muteType === 'imute' ? 'iunmute' : 
                                  muteType === 'rmute' ? 'runmute' : 
                                  muteType === 'jail' ? 'unjail' : 'unmute';
                await createModerationCase({
                    guildId: guild.id,
                    type: unmuteType,
                    target: { id: member.id, tag: member.user.tag },
                    executor: { id: this.client.user.id, tag: this.client.user.tag },
                    reason: `Temporary ${muteType} expired (automatic)`,
                    additionalInfo: {
                        automatic: true,
                        originalDuration: tempMute.muteDuration,
                        muteType: muteType
                    }
                });
            } catch (error) {
                console.error('Error creating automatic unmute case:', error);
            }

            // Try to DM the user
            try {
                const muteTypeName = muteType === 'imute' ? 'image mute' : 
                                   muteType === 'rmute' ? 'reaction mute' : 
                                   muteType === 'jail' ? 'jail sentence' : 'mute';
                const actionText = muteType === 'imute' ? 'upload files and images' : 
                                 muteType === 'rmute' ? 'add reactions' : 
                                 muteType === 'jail' ? 'access all channels' : 'send messages';
                
                const dmEmbed = await createEmbed(guild.id, {
                    title: `You Have Been Automatically ${muteType === 'imute' ? 'Image ' : muteType === 'rmute' ? 'Reaction ' : muteType === 'jail' ? 'Un' : ''}${muteType === 'jail' ? 'jailed' : 'Unmuted'}`,
                    description: `Your temporary ${muteTypeName} in **${guild.name}** has expired and you can now ${actionText} again.`,
                    fields: [
                        {
                            name: 'Original Duration',
                            value: tempMute.muteDuration,
                            inline: true
                        },
                        {
                            name: 'Reason',
                            value: tempMute.reason,
                            inline: true
                        }
                    ],
                    color: 0x00FF00
                });
                
                await member.user.send({ embeds: [dmEmbed] });
            } catch (error) {
                // User has DMs disabled or we can't send DM - this is normal
            }

            // Log the automatic unmute
            await this.logAutomaticUnmute(guild, {
                target: member.user,
                reason: tempMute.reason,
                duration: tempMute.muteDuration,
                mutedAt: tempMute.createdAt
            });

            // Remove from database
            await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);

        } catch (error) {
            console.error(`Error processing expired mute for user ${tempMute.userId}:`, error);
            
            // If there's an error, we still want to remove the database record after a reasonable time
            // to prevent it from being processed repeatedly
            if (tempMute.unmuteTime < new Date(Date.now() - 5 * 60 * 1000)) { // 5 minutes old
                console.log(`Removing problematic temp mute record for ${tempMute.userId} after repeated failures`);
                await TempMute.removeTempMute(tempMute.guildId, tempMute.userId);
            }
        }
    }

    /**
     * Log automatic unmute to the configured log channel
     * @param {Guild} guild - The guild
     * @param {Object} logData - The log data
     */
    async logAutomaticUnmute(guild, logData) {
        try {
            // Import here to avoid circular dependency
            const { getLogChannel } = require('./permissionUtils');
            
            const logChannelId = await getLogChannel(guild.id);
            if (!logChannelId) {
                return; // No log channel configured
            }
            
            const logChannel = guild.channels.cache.get(logChannelId);
            if (!logChannel) {
                return; // Log channel not found
            }
            
            const logEmbed = await createEmbed(guild.id, {
                title: '🔊 Automatic Unmute',
                description: `${logData.target} has been automatically unmuted (temporary mute expired).`,
                fields: [
                    {
                        name: 'Target',
                        value: `${logData.target} (${logData.target.tag})`,
                        inline: true
                    },
                    {
                        name: 'Original Duration',
                        value: logData.duration,
                        inline: true
                    },
                    {
                        name: 'Muted At',
                        value: `<t:${Math.floor(logData.mutedAt.getTime() / 1000)}:F>`,
                        inline: true
                    },
                    {
                        name: 'Original Reason',
                        value: logData.reason,
                        inline: false
                    }
                ],
                footer: {
                    text: `User ID: ${logData.target.id} • Automatic Action`
                },
                timestamp: new Date(),
                color: 0x00FF00
            });
            
            await logChannel.send({ embeds: [logEmbed] });
            
        } catch (error) {
            console.error('Error logging automatic unmute:', error);
        }
    }

    /**
     * Get status information
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval ? 30000 : null,
            clientReady: this.client && this.client.isReady()
        };
    }

    /**
     * Force check expired mutes (manual trigger)
     */
    async forceCheck() {
        console.log('Forcing temp mute check...');
        await this.checkExpiredMutes();
    }

    /**
     * Get all active temporary mutes for a guild
     * @param {string} guildId - The guild ID
     * @returns {Promise<Array>} Array of active temp mutes
     */
    async getActiveTempMutes(guildId) {
        return await TempMute.getGuildTempMutes(guildId);
    }

    /**
     * Remove a specific temporary mute (for manual unmute)
     * @param {string} guildId - The guild ID
     * @param {string} userId - The user ID
     */
    async removeTempMute(guildId, userId) {
        return await TempMute.removeTempMute(guildId, userId);
    }
}

module.exports = TempMuteManager;
