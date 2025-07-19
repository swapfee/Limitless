const mongoose = require('mongoose');

const fakePermissionsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    roleId: {
        type: String,
        required: true
    },
    permissions: [{
        type: String,
        required: true,
        enum: [
            'ban_members',
            'kick_members', 
            'timeout_members',
            'manage_messages',
            'manage_roles',
            'manage_channels',
            'manage_nicknames',
            'view_audit_log',
            'administrator'
        ]
    }],
    grantedBy: {
        type: String,
        required: true
    },
    grantedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for efficient queries
fakePermissionsSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

// Update the updatedAt field before saving
fakePermissionsSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to grant fake permission to role
fakePermissionsSchema.statics.grantPermission = async function(guildId, roleId, permission, grantedBy) {
    let fakePerms = await this.findOne({ guildId, roleId });
    
    if (!fakePerms) {
        fakePerms = new this({
            guildId,
            roleId,
            permissions: [permission],
            grantedBy
        });
    } else {
        if (!fakePerms.permissions.includes(permission)) {
            fakePerms.permissions.push(permission);
        } else {
            return { success: false, message: 'Role already has this fake permission' };
        }
    }
    
    await fakePerms.save();
    return { success: true, message: 'Fake permission granted successfully' };
};

// Static method to revoke fake permission from role
fakePermissionsSchema.statics.revokePermission = async function(guildId, roleId, permission) {
    const fakePerms = await this.findOne({ guildId, roleId });
    
    if (!fakePerms || !fakePerms.permissions.includes(permission)) {
        return { success: false, message: 'Role does not have this fake permission' };
    }
    
    fakePerms.permissions = fakePerms.permissions.filter(perm => perm !== permission);
    
    if (fakePerms.permissions.length === 0) {
        await this.deleteOne({ guildId, roleId });
    } else {
        await fakePerms.save();
    }
    
    return { success: true, message: 'Fake permission revoked successfully' };
};

// Static method to check if a user has specific fake permission through their roles
fakePermissionsSchema.statics.hasPermission = async function(guildId, userRoleIds, permission) {
    const fakePerms = await this.find({ guildId, roleId: { $in: userRoleIds } });
    
    for (const rolePerm of fakePerms) {
        if (rolePerm.permissions.includes(permission) || rolePerm.permissions.includes('administrator')) {
            return true;
        }
    }
    
    return false;
};

// Static method to get all fake permissions for a role
fakePermissionsSchema.statics.getRolePermissions = async function(guildId, roleId) {
    const fakePerms = await this.findOne({ guildId, roleId });
    return fakePerms ? fakePerms.permissions : [];
};

// Static method to get all roles with fake permissions in a guild
fakePermissionsSchema.statics.getAllGuildPermissions = async function(guildId) {
    return await this.find({ guildId }).lean();
};

// Static method to revoke all fake permissions from role
fakePermissionsSchema.statics.revokeAllPermissions = async function(guildId, roleId) {
    const result = await this.deleteOne({ guildId, roleId });
    return { success: result.deletedCount > 0, message: result.deletedCount > 0 ? 'All fake permissions revoked' : 'Role had no fake permissions' };
};

// Static method to check if role has any fake permissions
fakePermissionsSchema.statics.hasAnyPermissions = async function(guildId, roleId) {
    const fakePerms = await this.findOne({ guildId, roleId });
    return fakePerms ? fakePerms.permissions.length > 0 : false;
};

// Static method to get all fake permissions for a user through their roles
fakePermissionsSchema.statics.getUserPermissions = async function(guildId, userRoleIds) {
    const fakePerms = await this.find({ guildId, roleId: { $in: userRoleIds } });
    const allPermissions = new Set();
    
    for (const rolePerm of fakePerms) {
        rolePerm.permissions.forEach(perm => allPermissions.add(perm));
    }
    
    return Array.from(allPermissions);
};

module.exports = mongoose.model('FakePermissions', fakePermissionsSchema);
