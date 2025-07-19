const TempBan = require('../models/TempBan');
const { createEmbed } = require('./embedUtils');

class TempBanManager {
    constructor(client) {
        this.client = client;
        this.checkInterval = null;
        this.isRunning = false;
    }

    /**
     * Start the tempban checker
     * @param {number} intervalMs - Check interval in milliseconds (default: 30 seconds)
     */
    start(intervalMs = 30000) {
        if (this.isRunning) {
            console.log('TempBan manager is already running');
            return;
        }

        console.log('Starting TempBan manager...');
        this.isRunning = true;
        
        // Run immediately on start
        this.checkExpiredBans();
        
        // Set up periodic checking
        this.checkInterval = setInterval(() => {
            this.checkExpiredBans();
        }, intervalMs);
        
        console.log(`TempBan manager started with ${intervalMs / 1000}s check interval`);
    }

    /**
     * Stop the tempban checker
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping TempBan manager...');
        this.isRunning = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        console.log('TempBan manager stopped');
    }

    /**
     * Check for and process expired temporary bans
     */
    async checkExpiredBans() {
        try {
            const expiredBans = await TempBan.getExpiredTempBans();
            
            if (expiredBans.length === 0) {
                return; // No expired bans
            }

            console.log(`Found ${expiredBans.length} expired temporary ban(s)`);

            for (const ban of expiredBans) {
                await this.processExpiredBan(ban);
            }
        } catch (error) {
            console.error('Error checking expired tempbans:', error);
        }
    }

    /**
     * Process a single expired temporary ban
     * @param {Object} ban - The expired ban document
     */
    async processExpiredBan(ban) {
        try {
            const guild = await this.client.guilds.fetch(ban.guildId);
            if (!guild) {
                console.log(`Guild ${ban.guildId} not found, removing tempban record`);
                await TempBan.removeTempBan(ban.guildId, ban.userId);
                return;
            }

            // Try to unban the user
            try {
                await guild.members.unban(ban.userId, 'Temporary ban expired');
                console.log(`Successfully unbanned user ${ban.userId} from guild ${ban.guildId}`);
                
                // Log the automatic unban
                await this.logAutomaticUnban(guild, ban);
                
            } catch (unbanError) {
                // User might already be unbanned manually
                if (unbanError.code === 10026) { // Unknown Ban
                    console.log(`User ${ban.userId} was already unbanned in guild ${ban.guildId}`);
                } else {
                    console.error(`Failed to unban user ${ban.userId} from guild ${ban.guildId}:`, unbanError);
                }
            }

            // Remove the tempban record regardless of unban success
            await TempBan.removeTempBan(ban.guildId, ban.userId);
            
        } catch (error) {
            console.error(`Error processing expired ban for user ${ban.userId} in guild ${ban.guildId}:`, error);
        }
    }

    /**
     * Log automatic unban to jail-log channel
     * @param {Guild} guild - The guild object
     * @param {Object} ban - The ban document
     */
    async logAutomaticUnban(guild, ban) {
        try {
            const logChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
            if (!logChannel) {
                return;
            }

            // Try to get the executor user
            let executorUser;
            try {
                executorUser = await this.client.users.fetch(ban.executorId);
            } catch (error) {
                executorUser = { tag: 'Unknown User', id: ban.executorId };
            }

            // Try to get the target user
            let targetUser;
            try {
                targetUser = await this.client.users.fetch(ban.userId);
            } catch (error) {
                targetUser = { tag: 'Unknown User', id: ban.userId };
            }

            const logEmbed = await createEmbed(guild.id, {
                title: 'Moderation Action: Automatic Unban',
                description: 'A temporarily banned user has been automatically unbanned.',
                fields: [
                    {
                        name: 'Action',
                        value: 'Automatic Unban',
                        inline: true
                    },
                    {
                        name: 'Target',
                        value: `${targetUser} (${targetUser.tag})\nID: ${targetUser.id}`,
                        inline: true
                    },
                    {
                        name: 'Originally Banned By',
                        value: `${executorUser} (${executorUser.tag})\nID: ${executorUser.id}`,
                        inline: true
                    },
                    {
                        name: 'Original Duration',
                        value: ban.banDuration,
                        inline: true
                    },
                    {
                        name: 'Original Reason',
                        value: ban.reason,
                        inline: false
                    },
                    {
                        name: 'Ban Expired',
                        value: `<t:${Math.floor(ban.unbanTime.getTime() / 1000)}:F>`,
                        inline: true
                    },
                    {
                        name: 'Processed At',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    }
                ],
                footer: {
                    text: `Unban Case ID: ${Date.now()}`
                }
            });

            await logChannel.send({ embeds: [logEmbed] });
            
        } catch (error) {
            console.error('Error logging automatic unban:', error);
        }
    }

    /**
     * Get active temporary bans for a guild
     * @param {string} guildId - The guild ID
     * @returns {Array} - Array of active temp bans
     */
    async getActiveTempBans(guildId) {
        return await TempBan.getActiveTempBans(guildId);
    }

    /**
     * Manually remove a temporary ban (for when someone is unbanned manually)
     * @param {string} guildId - The guild ID
     * @param {string} userId - The user ID
     */
    async removeTempBan(guildId, userId) {
        await TempBan.removeTempBan(guildId, userId);
    }
}

module.exports = TempBanManager;
