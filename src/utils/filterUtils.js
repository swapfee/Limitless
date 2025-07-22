const FilterConfig = require('../models/FilterConfig');
const { createLogEmbed } = require('./embedUtils');

/**
 * Filter utility functions for the message filtering system
 */
class FilterUtils {
    
    /**
     * Check if a user or channel is whitelisted
     */
    static async isWhitelisted(guildId, member, channel) {
        try {
            return await FilterConfig.isWhitelisted(guildId, member, channel);
        } catch (error) {
            console.error('Error checking whitelist:', error);
            return false;
        }
    }

    /**
     * Process all filters for a message
     */
    static async processMessage(message) {
        try {
            const config = await FilterConfig.getOrCreateConfig(message.guild.id);
            
            // Check whitelist
            const isWhitelisted = await this.isWhitelisted(
                message.guild.id,
                message.member,
                message.channel
            );
            
            if (isWhitelisted) return null;

            const violations = [];

            // Check each enabled filter
            const filterChecks = [
                { enabled: config.modules.caps.enabled, check: () => this.checkCapsFilter(message.content, config.modules.caps.threshold) },
                { enabled: config.modules.spam.enabled, check: () => this.checkSpamFilter(message, config.modules.spam) },
                { enabled: config.modules.spoilers.enabled, check: () => this.checkSpoilersFilter(message.content) },
                { enabled: config.modules.regex.enabled && config.modules.regex.pattern, check: () => this.checkRegexFilter(message.content, config.modules.regex.pattern) },
                { enabled: config.modules.massmention.enabled, check: () => this.checkMassMentionFilter(message, config.modules.massmention.threshold) },
                { enabled: config.modules.musicfiles.enabled, check: () => this.checkMusicFilesFilter(message) },
                { enabled: config.modules.emoji.enabled, check: () => this.checkEmojiFilter(message.content, config.modules.emoji.threshold) },
                { enabled: config.modules.invites.enabled, check: () => this.checkInvitesFilter(message.content) },
                { enabled: config.modules.links.enabled, check: () => this.checkLinksFilter(message.content) },
                { enabled: config.customWords.length > 0, check: () => this.checkCustomWordsFilter(message.content, config.customWords) }
            ];

            for (const filter of filterChecks) {
                if (filter.enabled) {
                    const violation = await filter.check();
                    if (violation) violations.push(violation);
                }
            }

            return violations.length > 0 ? { violations, config } : null;

        } catch (error) {
            console.error('Error processing message filters:', error);
            return null;
        }
    }

    /**
     * Handle filter violations
     */
    static async handleViolations(message, violations, config) {
        try {
            // Delete the message
            await message.delete().catch(() => {});

            // Apply punishment
            const punishment = this.determinePunishment(message.author.id, violations, config);
            await this.applyPunishment(message, punishment, config);

            // Log the violation
            await this.logViolation(message, violations, punishment, config);

            // Send temporary warning
            await this.sendTemporaryWarning(message, violations);

        } catch (error) {
            console.error('Error handling filter violations:', error);
        }
    }

    /**
     * Determine appropriate punishment based on violations and user history
     */
    static determinePunishment(userId, violations, config) {
        // For now, use simple logic based on first offense
        // This could be expanded to track user violation history
        return config.punishments.firstOffense;
    }

    /**
     * Apply punishment to user
     */
    static async applyPunishment(message, punishment, config) {
        try {
            switch (punishment) {
                case 'warn':
                    // Integrate with your existing warn system if available
                    console.log(`Would warn user ${message.author.id} for filter violation`);
                    break;
                case 'mute':
                    // Integrate with your existing mute system if available
                    console.log(`Would mute user ${message.author.id} for filter violation`);
                    break;
                case 'kick':
                    if (message.member?.kickable) {
                        await message.member.kick('Filter violation');
                    }
                    break;
                case 'ban':
                    if (message.member?.bannable) {
                        await message.member.ban({ reason: 'Filter violation' });
                    }
                    break;
                case 'delete':
                default:
                    // Message already deleted
                    break;
            }
        } catch (error) {
            console.error('Error applying punishment:', error);
        }
    }

    /**
     * Log filter violation
     */
    static async logViolation(message, violations, punishment, config) {
        if (!config.logChannel) return;

        try {
            const logChannel = message.guild.channels.cache.get(config.logChannel);
            if (!logChannel) return;

            const violationSummary = violations.map(v => `**${v.type.toUpperCase()}:** ${v.reason}`).join('\n');
            
            const logEmbed = createLogEmbed(
                'Filter Violation',
                `**User:** ${message.author.tag} (${message.author.id})
**Channel:** ${message.channel}
**Violations:**
${violationSummary}
**Action:** ${punishment}
**Original Message:**
\`\`\`
${message.content.substring(0, 1000)}${message.content.length > 1000 ? '\n...[truncated]' : ''}
\`\`\``,
                0xFF0000
            );

            await logChannel.send({ embeds: [logEmbed] });
        } catch (error) {
            console.error('Error logging violation:', error);
        }
    }

    /**
     * Send temporary warning message
     */
    static async sendTemporaryWarning(message, violations) {
        try {
            const violationTypes = violations.map(v => v.type).join(', ');
            const warningMsg = await message.channel.send({
                content: `⚠️ ${message.author}, your message was removed for violating server filters: **${violationTypes}**`
            });

            // Delete warning after 10 seconds
            setTimeout(async () => {
                try {
                    await warningMsg.delete();
                } catch (error) {
                    // Ignore deletion errors
                }
            }, 10000);
        } catch (error) {
            console.error('Error sending warning message:', error);
        }
    }

    // Filter check methods
    static checkCapsFilter(content, threshold) {
        const letters = content.replace(/[^a-zA-Z]/g, '');
        if (letters.length < 5) return null;
        
        const caps = content.replace(/[^A-Z]/g, '');
        const capsPercentage = (caps.length / letters.length) * 100;
        
        if (capsPercentage >= threshold) {
            return {
                type: 'caps',
                reason: `Excessive capitals (${Math.round(capsPercentage)}%)`
            };
        }
        return null;
    }

    static async checkSpamFilter(message, spamConfig) {
        try {
            const recent = await message.channel.messages.fetch({ 
                limit: spamConfig.threshold + 1,
                before: message.id 
            });
            
            const authorMessages = recent.filter(msg => 
                msg.author.id === message.author.id && 
                msg.content === message.content &&
                Date.now() - msg.createdTimestamp <= spamConfig.timeframe
            );
            
            if (authorMessages.size >= spamConfig.threshold) {
                return {
                    type: 'spam',
                    reason: `Repeated message ${authorMessages.size + 1} times`
                };
            }
        } catch (error) {
            console.error('Error checking spam filter:', error);
        }
        return null;
    }

    static checkSpoilersFilter(content) {
        const spoilerCount = (content.match(/\|\|/g) || []).length / 2;
        if (spoilerCount >= 5) {
            return {
                type: 'spoilers',
                reason: `Excessive spoiler tags (${Math.floor(spoilerCount)})`
            };
        }
        return null;
    }

    static checkRegexFilter(content, pattern) {
        try {
            const regex = new RegExp(pattern, 'gi');
            if (regex.test(content)) {
                return {
                    type: 'regex',
                    reason: 'Content matches custom regex pattern'
                };
            }
        } catch (error) {
            console.error('Invalid regex pattern:', pattern, error);
        }
        return null;
    }

    static checkMassMentionFilter(message, threshold) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        if (mentionCount >= threshold) {
            return {
                type: 'massmention',
                reason: `Excessive mentions (${mentionCount})`
            };
        }
        return null;
    }

    static checkMusicFilesFilter(message) {
        const audioExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma', '.mp4', '.avi', '.mov', '.wmv'];
        
        for (const attachment of message.attachments.values()) {
            const fileName = attachment.name?.toLowerCase() || '';
            if (audioExtensions.some(ext => fileName.endsWith(ext))) {
                return {
                    type: 'musicfiles',
                    reason: `Media file detected: ${attachment.name}`
                };
            }
        }
        return null;
    }

    static checkEmojiFilter(content, threshold) {
        // Count Unicode emojis and custom Discord emojis
        const unicodeEmojiRegex = /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu;
        const customEmojiRegex = /<a?:\w+:\d+>/g;
        
        const unicodeEmojis = content.match(unicodeEmojiRegex) || [];
        const customEmojis = content.match(customEmojiRegex) || [];
        const totalEmojis = unicodeEmojis.length + customEmojis.length;
        
        if (totalEmojis >= threshold) {
            return {
                type: 'emoji',
                reason: `Excessive emojis (${totalEmojis})`
            };
        }
        return null;
    }

    static checkInvitesFilter(content) {
        const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+/gi;
        if (inviteRegex.test(content)) {
            return {
                type: 'invites',
                reason: 'Discord invite link detected'
            };
        }
        return null;
    }

    static checkLinksFilter(content) {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const urls = content.match(urlRegex);
        if (urls && urls.length > 0) {
            return {
                type: 'links',
                reason: `Link detected: ${urls[0]}`
            };
        }
        return null;
    }

    static checkCustomWordsFilter(content, customWords) {
        const lowerContent = content.toLowerCase();
        for (const word of customWords) {
            if (lowerContent.includes(word.toLowerCase())) {
                return {
                    type: 'customwords',
                    reason: `Contains filtered word`
                };
            }
        }
        return null;
    }

    /**
     * Get filter description for help messages
     */
    static getFilterDescription(filterType) {
        const descriptions = {
            'caps': 'Filters messages with excessive capital letters',
            'spam': 'Filters repeated messages or rapid message sending',
            'spoilers': 'Filters messages with excessive spoiler tags',
            'regex': 'Filters messages matching custom regex patterns',
            'snipe': 'Prevents snipe bot functionality by clearing message history',
            'massmention': 'Filters messages with excessive @mentions',
            'musicfiles': 'Filters uploaded music/audio/video files',
            'emoji': 'Filters messages with excessive emojis',
            'invites': 'Filters Discord server invites',
            'links': 'Filters URLs and links',
            'customwords': 'Filters custom words defined by server admins'
        };

        return descriptions[filterType] || 'Custom filter module';
    }
}

module.exports = FilterUtils;
