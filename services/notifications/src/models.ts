import { model, Schema } from "mongoose";

const NotificationSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['promotion', 'order_update', 'recommendation', 'user_update'],
      required: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Notification = model("Notification", NotificationSchema);
