import { model, Schema } from 'mongoose';

const userSchema = new Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    preferences: {
      promotions: { type: Boolean, default: true },
      orderUpdates: { type: Boolean, default: true },
      recommendations: { type: Boolean, default: true },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export const User = model('User', userSchema);