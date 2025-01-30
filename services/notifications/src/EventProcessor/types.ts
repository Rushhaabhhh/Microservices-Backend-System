import { NotificationType, NotificationPriority } from "../models";

export interface NotificationDoc {
    _id: string;
    userId: string;
    email: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
    emailSent: boolean;
    sentAt?: Date;
    read: boolean;
    save(): Promise<void>;
}
  
export interface User {
    _id: string;
    email: string;
    name: string;
    preferences?: {
      promotions?: boolean;
      orderUpdates?: boolean;
      recommendations?: boolean;
    };
}

export interface NotificationPayload {
    userId: string;
    email: string;
    type: NotificationType;
    content: {
      message: string;
      eventType: string;
      name: string;
    };
    priority: NotificationPriority;
    metadata: {
      batchId: string;
      isAutomated: boolean;
      userPreferences?: Record<string, boolean>;
      retryCount?: number;
    };
}

