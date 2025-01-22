import { model, Schema } from 'mongoose';

const userSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true 
    },
    preferences : { 
        type: Object, 
        required: false 
    }
});

export const User = model('User', userSchema);