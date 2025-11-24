// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: function() {
            return this.authProvider === 'email';
        },
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    authProvider: {
        type: String,
        enum: ['email', 'google'],
        default: 'email'
    },
    photoURL: {
        type: String,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    // Firebase UID for authentication reference
    firebaseUID: {
        type: String,
        sparse: true,
        unique: true,
        select: false
    },
    googleId: {
        type: String,
        sparse: true,
        unique: true,
        select: false
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function(doc, ret) {
            delete ret.password;
            delete ret.firebaseUID;
            delete ret.googleId;
            return ret;
        }
    }
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        this.password = await bcrypt.hash(this.password, 12);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Static method to find or create user from Firebase
userSchema.statics.findOrCreateFromFirebase = async function(firebaseUser, provider = 'google') {
    const user = await this.findByEmail(firebaseUser.email);
    
    if (user) {
        // Update existing user
        user.lastLogin = new Date();
        user.authProvider = provider;
        user.firebaseUID = firebaseUser.uid;
        if (provider === 'google') {
            user.googleId = firebaseUser.uid;
            if (!user.photoURL && firebaseUser.photoURL) user.photoURL = firebaseUser.photoURL;
        }
        await user.save();
        return user;
    } else {
        // Create new user (only for regular users, not admins)
        return await this.create({
            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            password: Math.random().toString(36).slice(-16), // Random password for social logins
            authProvider: provider,
            photoURL: firebaseUser.photoURL || null,
            isEmailVerified: firebaseUser.emailVerified || false,
            firebaseUID: firebaseUser.uid,
            googleId: provider === 'google' ? firebaseUser.uid : undefined,
            lastLogin: new Date()
        });
    }
};

module.exports = mongoose.model('User', userSchema);