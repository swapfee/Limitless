const mongoose = require('mongoose');

const staffConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    staffRoles: [{
        type: String,
        required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
staffConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to add a staff role
staffConfigSchema.statics.addStaffRole = async function(guildId, roleId) {
    let staffConfig = await this.findOne({ guildId });
    
    if (!staffConfig) {
        staffConfig = new this({
            guildId,
            staffRoles: [roleId]
        });
    } else {
        if (!staffConfig.staffRoles.includes(roleId)) {
            staffConfig.staffRoles.push(roleId);
        } else {
            return { success: false, message: 'Role is already set as staff role' };
        }
    }
    
    await staffConfig.save();
    return { success: true, message: 'Staff role added successfully' };
};

// Static method to remove a staff role
staffConfigSchema.statics.removeStaffRole = async function(guildId, roleId) {
    const staffConfig = await this.findOne({ guildId });
    
    if (!staffConfig || !staffConfig.staffRoles.includes(roleId)) {
        return { success: false, message: 'Role is not set as staff role' };
    }
    
    staffConfig.staffRoles = staffConfig.staffRoles.filter(id => id !== roleId);
    
    if (staffConfig.staffRoles.length === 0) {
        await this.deleteOne({ guildId });
    } else {
        await staffConfig.save();
    }
    
    return { success: true, message: 'Staff role removed successfully' };
};

// Static method to check if a role is staff
staffConfigSchema.statics.isStaffRole = async function(guildId, roleId) {
    const staffConfig = await this.findOne({ guildId });
    return staffConfig ? staffConfig.staffRoles.includes(roleId) : false;
};

// Static method to get all staff roles for a guild
staffConfigSchema.statics.getStaffRoles = async function(guildId) {
    const staffConfig = await this.findOne({ guildId });
    return staffConfig ? staffConfig.staffRoles : [];
};

// Static method to check if a user has any staff role
staffConfigSchema.statics.isUserStaff = async function(guildId, userRoles) {
    const staffRoles = await this.getStaffRoles(guildId);
    return userRoles.some(roleId => staffRoles.includes(roleId));
};

module.exports = mongoose.model('StaffConfig', staffConfigSchema);
