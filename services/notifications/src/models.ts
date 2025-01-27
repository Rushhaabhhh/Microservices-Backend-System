import { model, Schema } from "mongoose";

// Enum for Notification Types
export enum NotificationType {
  PROMOTION = 'promotion',
  ORDER_UPDATE = 'order_update',
  RECOMMENDATION = 'recommendation',
  USER_UPDATE = 'user_update'
}

// Enum for Notification Priorities
export enum NotificationPriority {
  CRITICAL = 'critical',   // Priority 1 events
  STANDARD = 'standard',   // Priority 2 events
}

const NotificationSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    email: {
      type: String,
      required: false
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true
    },
    priority: {
      type: String,
      enum: Object.values(NotificationPriority),
      default: NotificationPriority.STANDARD
    },
    content: {
      type: Schema.Types.Mixed,
      required: true
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { 
    timestamps: true,
    optimisticConcurrency: true  
  }
);

NotificationSchema.index({ content: 'text' });
NotificationSchema.index({ userId: 1, read: 1, type: 1 });
NotificationSchema.index({ userId: 1, readAt: 1 });

export const Notification = model("Notification", NotificationSchema);