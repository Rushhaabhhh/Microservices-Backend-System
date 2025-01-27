import axios from "axios";
import cron from "node-cron";
import { Notification, NotificationType, NotificationPriority } from "../models";
import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";

interface User {
  _id: string;
  email: string;
  name: string;
  preferences?: {
    promotions?: boolean;
    orderUpdates?: boolean;
    recommendations?: boolean;
  };
}

interface NotificationPayload {
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

export class ProductEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.initializeCronJob();
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private initializeCronJob() {
    cron.schedule("* * * * *", async () => {
      console.log("[ProductEventProcessor] Starting scheduled notification process");
      try {
        await this.sendRandomUserNotifications();
      } catch (error) {
        console.error("[ProductEventProcessor] Scheduled notification process failed:", error);
      }
    });
  }

  private async getRandomUsers(count: number): Promise<User[]> {
    if (!process.env.USERS_SERVICE_URL) {
      throw new Error("[ProductEventProcessor] Users Service URL is not configured");
    }

    try {
      console.log(`[ProductEventProcessor] Fetching users from ${process.env.USERS_SERVICE_URL}`);
      
      const response = await axios.get(process.env.USERS_SERVICE_URL, {
        timeout: 5000,
      });

      console.log("[ProductEventProcessor] Raw API Response:", {
        status: response.status,
        dataStructure: JSON.stringify(response.data, null, 2)
      });

      const allUsers: User[] = (response.data?.result || []).filter((user: User) => {
        const isValid = this.isValidEmail(user.email);
        const promotionsEnabled = user.preferences?.promotions !== false;

        console.log(`[ProductEventProcessor] Validating user:`, {
          email: user.email,
          isValidEmail: isValid,
          hasPreferences: !!user.preferences,
          promotionsEnabled: promotionsEnabled
        });

        return isValid && promotionsEnabled;
      });

      if (allUsers.length === 0) {
        console.log("[ProductEventProcessor] No valid users found for notifications");
        return [];
      }

      const randomUsers: User[] = [];
      const usersCopy = [...allUsers];
      
      while (randomUsers.length < Math.min(count, usersCopy.length)) {
        const randomIndex = Math.floor(Math.random() * usersCopy.length);
        randomUsers.push(usersCopy[randomIndex]);
        usersCopy.splice(randomIndex, 1);
      }

      console.log(`[ProductEventProcessor] Selected ${randomUsers.length} random users for notifications:`, 
        randomUsers.map(user => ({ email: user.email, name: user.name }))
      );
      
      return randomUsers;
    } catch (error) {
      console.error("[ProductEventProcessor] Failed to fetch users:", error);
      throw new Error(`Failed to retrieve users: ${(error as Error).message}`);
    }
  }

  private async createNotificationForEvent(params: NotificationPayload): Promise<Notification> {
    try {
      console.log("[ProductEventProcessor] Processing Notification - Input:", {
        userId: params.userId,
        email: params.email,
        type: params.type,
        priority: params.priority,
      });

      // Create notification record
      const notification = await Notification.create({
        userId: params.userId,
        email: params.email,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata || {},
        sentAt: new Date(),
        read: false,
      });

      console.log("[ProductEventProcessor] Notification Record Created:", {
        notificationId: notification._id,
        userId: params.userId,
        email: params.email,
      });

      // Send email notification
      if (params.type === NotificationType.PROMOTION) {
        try {
          const emailContent = {
            to: params.email,
            subject: `Special Promotion for ${params.content.name}`,
            html: `
              <h2>Hello ${params.content.name}!</h2>
              <p>${params.content.message}</p>
              <p>Thank you for being our valued customer!</p>
            `
          };

          console.log("[ProductEventProcessor] Sending email:", {
            to: params.email,
            subject: emailContent.subject
          });

          await sendEmail(
            params.userId,
            emailContent.subject,
            NotificationType.PROMOTION,
            emailContent.html
          );
          console.log("[ProductEventProcessor] Email sent successfully to:", params.email);
        } catch (emailError) {
          console.error("[ProductEventProcessor] Email Sending Failed:", {
            userId: params.userId,
            email: params.email,
            error: (emailError as Error).message,
          });
          
          // Don't throw here - we want to keep the notification record even if email fails
          // But we should log it for monitoring
        }
      }

      return notification as unknown as Notification;
    } catch (error) {
      console.error("[ProductEventProcessor] Comprehensive Notification Processing Error:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
        params,
      });
      throw error;
    }
  }

  private async sendRandomUserNotifications() {
    console.log("[ProductEventProcessor] Starting random user notification process");
    
    try {
      const randomUsers = await this.getRandomUsers(10);
      
      if (randomUsers.length === 0) {
        console.log("[ProductEventProcessor] No valid users available for sending notifications");
        return;
      }

      const promotionalContent = {
        message: "Check out our latest promotions! Limited time offers await you.",
        eventType: "PROMOTIONAL_CAMPAIGN",
      };

      let successCount = 0;
      let failureCount = 0;

      for (const user of randomUsers) {
        try {
          await this.createNotificationForEvent({
            userId: user._id,
            email: user.email,
            type: NotificationType.PROMOTION,
            content: {
              ...promotionalContent,
              name: user.name
            },
            priority: NotificationPriority.STANDARD,
            metadata: {
              batchId: `PROMO_${Date.now()}`,
              isAutomated: true,
              userPreferences: user.preferences
            },
          });
          successCount++;
          console.log(`[ProductEventProcessor] Successfully sent notification to ${user.email}`);
        } catch (error) {
          failureCount++;
          console.error(`[ProductEventProcessor] Failed to send notification to ${user.email}:`, error);
        }
      }

      console.log(`[ProductEventProcessor] Notification processing complete. Success: ${successCount}, Failed: ${failureCount}`);
    } catch (error) {
      console.error("[ProductEventProcessor] Failed to process random user notifications:", error);
      throw error;
    }
  }

  async processProductEventWithRetry(
    event: any,
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    const MAX_RETRIES = 5;
    const BASE_DELAY = 500;

    try {
      await this.createNotificationForEvent({
        userId: event.userId,
        email: event.email,
        type: NotificationType.PROMOTION,
        content: {
          message: event.details?.message || "Promotional event processed",
          eventType: event.eventType,
          name: event.details?.name || "Valued Customer"
        },
        priority: NotificationPriority.STANDARD,
        metadata: {
          batchId: event.metadata?.batchId || `RETRY_${Date.now()}`,
          isAutomated: true,
          retryCount
        },
      });
      return true;
    } catch (error) {
      console.error(`[ProductEventProcessor] Event Processing Failed (Retry ${retryCount}):`, {
        error: (error as Error).message,
        event,
      });

      if (retryCount < MAX_RETRIES) {
        const backoffDelay = Math.pow(2, retryCount) * BASE_DELAY;
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        return this.processProductEventWithRetry(event, context, retryCount + 1);
      }

      await this.deadLetterQueueHandler.handleFailedMessage(
        context.topic,
        event,
        error as Error,
        { partition: context.partition, offset: context.offset }
      );
      return false;
    }
  }
}