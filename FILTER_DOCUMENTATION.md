# Filter/AutoMod System Documentation

## Overview
The Filter/AutoMod System provides comprehensive message filtering capabilities using both Discord's built-in AutoMod and custom filter modules.

## Components

### 1. Discord AutoMod Integration
- **Purpose**: Uses Discord's native AutoMod system for word filtering
- **Commands**: `/filter automod create`, `/filter automod list`, `/filter automod delete`
- **Features**: Block messages, send alerts, apply timeouts

### 2. Custom Filter Modules
Available filter types:
- **CAPS**: Filters excessive capital letters (configurable percentage)
- **SPAM**: Filters repeated/duplicate messages
- **SPOILERS**: Filters excessive spoiler tags
- **REGEX**: Filters content matching custom regex patterns
- **SNIPE**: Prevents snipe bot functionality
- **MASS MENTION**: Filters excessive @mentions
- **MUSIC FILES**: Filters uploaded audio/video files
- **EMOJI**: Filters excessive emojis
- **INVITES**: Filters Discord invite links
- **LINKS**: Filters all URLs/links

### 3. Custom Word Filter
- Add/remove individual filtered words
- Works alongside AutoMod rules
- Stored in database for persistence

### 4. Whitelist System
- Whitelist channels (filters won't apply)
- Whitelist roles (users with these roles bypass filters)
- Flexible exemption system

## Command Structure

### AutoMod Commands
```
/filter automod create <name> <words> [action]
/filter automod list
/filter automod delete <rule_id>
```

### Module Commands
```
/filter module enable <type>
/filter module disable <type>
/filter module config <type> [threshold] [regex_pattern]
/filter module status
```

### Word Filter Commands
```
/filter add <word>
/filter remove <word>
/filter list
```

### Whitelist Commands
```
/filter whitelist <action> [channel] [role]
```

## Setup Process

### 1. Initial Setup
1. Use `/filter automod create` to create your first AutoMod rule with custom words
2. Enable desired filter modules with `/filter module enable`
3. Configure thresholds with `/filter module config`

### 2. Configure Modules
Example configurations:
- **CAPS**: Set threshold (default 70%)
- **SPAM**: Set message count and timeframe
- **MASS MENTION**: Set max mentions (default 5)
- **EMOJI**: Set max emojis (default 10)
- **REGEX**: Set custom patterns

### 3. Set Up Whitelist
- Add staff channels: `/filter whitelist add_channel #staff-chat`
- Add mod roles: `/filter whitelist add_role @Moderator`

### 4. Monitor and Adjust
- Use `/filter module status` to check enabled modules
- Review AutoMod rules with `/filter automod list`
- Adjust thresholds based on server needs

## Filter Behavior

### Message Processing
1. Check if user/channel is whitelisted
2. If whitelisted, skip all filters
3. Check each enabled filter module
4. Check custom words and AutoMod rules
5. Apply punishment if violations found

### Punishment System
- **First Offense**: Delete message (configurable)
- **Second Offense**: Warn user (configurable)
- **Third Offense**: Mute user (configurable)
- Progressive punishment based on violation history

### Logging
- All filter violations logged to configured channel
- Includes user info, violation type, and action taken
- Original message content preserved in logs

## Snipe Protection
Special anti-snipe functionality:
- Tracks deleted messages
- Clears snipe data when snipe commands detected
- Prevents common snipe bot commands
- Configurable per-server

## Database Models
- **FilterConfig**: Stores all filter settings per guild
- **Module configurations**: Thresholds, patterns, enabled status
- **Whitelist data**: Channels and roles exempt from filtering
- **Custom words**: Server-specific filtered words

## Integration Points
- Works with existing permission system
- Integrates with moderation commands (warn, mute, etc.)
- Logs to existing logging channels
- Respects AntiNuke whitelist system

## Best Practices
1. Start with conservative thresholds and adjust based on usage
2. Use whitelist for staff channels and trusted roles
3. Regularly review and update filtered words
4. Monitor logs for false positives
5. Test filter settings in low-activity channels first

## Troubleshooting
- **AutoMod not working**: Check bot has Manage Server permission
- **Filters too aggressive**: Lower thresholds or add whitelist exemptions
- **Missing logs**: Configure log channel in filter settings
- **Snipe protection**: Ensure snipe module is enabled

## Commands Reference
All commands require **Manage Messages** permission (fake permission system).

### Quick Start
1. `/filter automod create "Bad Words" "word1,word2,word3" block`
2. `/filter module enable caps`
3. `/filter module enable spam`
4. `/filter whitelist add_role @Staff`
5. `/filter module status`
