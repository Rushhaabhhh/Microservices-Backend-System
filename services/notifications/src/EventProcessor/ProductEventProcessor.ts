import axios from "axios";
import cron from "node-cron";
import { Notification, NotificationType, NotificationPriority } from "../models";
import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";

interface User {
  _id: string;
  email: string;
  name: string;
  preferences: {
    promotions: boolean;
    orderUpdates: boolean;
    recommendations: boolean;
  };
}


export class ProductEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.initializeCronJob();
  }

  private isValidEmail(email: string): boolean {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private initializeCronJob() {
    // Run every minute 
    cron.schedule("* * * * *", async () => {
      console.log("Cron job triggered: Sending random notifications...");
      try {
        await this.sendRandomUserNotifications();
      } catch (error) {
        console.error("Failed to process random notifications:", error);
      }
    });
  }

  private async getRandomUsers(count: number): Promise<User[]> {
    if (!process.env.USERS_SERVICE_URL) {
      throw new Error("Users Service URL is not configured");
    }
  
    try {
      const response = await axios.get(`${process.env.USERS_SERVICE_URL}/`, {
        timeout: 5000,
      });
  
      // Debug log
      console.log("User service response:", {
        status: response.status,
        dataStructure: Object.keys(response.data || {})
      });
  
      // Access the correct 'result' property and filter valid users
      const allUsers: User[] = (response.data?.result || []).filter((user: User) => {
        const isValid = this.isValidEmail(user.email) && user.preferences?.promotions !== false;
        if (!isValid) {
          console.log(`Skipping user ${user.email}: ${!this.isValidEmail(user.email) ? 'Invalid email' : 'Promotions disabled'}`);
        }
        return isValid;
      });
  
      if (allUsers.length === 0) {
        console.log("No valid users found for notifications");
        return [];
      }
  
      console.log(`Found ${allUsers.length} valid users for notifications`);
  
      // Select random users
      const randomUsers: User[] = [];
      const usersCopy = [...allUsers];
      
      while (randomUsers.length < count && usersCopy.length > 0) {
        const randomIndex = Math.floor(Math.random() * usersCopy.length);
        randomUsers.push(usersCopy[randomIndex]);
        usersCopy.splice(randomIndex, 1);
      }
  
      console.log(`Selected ${randomUsers.length} random users for notifications`);
      return randomUsers;
    } catch (error) {
      console.error("Failed to fetch users:", error);
      throw new Error(`Failed to retrieve users: ${(error as Error).message}`);
    }
  }

  private async sendRandomUserNotifications() {
    try {
      const randomUsers = await this.getRandomUsers(10);
      
      if (randomUsers.length === 0) {
        console.log("No valid users available for sending notifications");
        return;
      }
  
      const promotionalContent = {
        message: "Check out our latest promotions!",
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
              name: user.name // Personalize the message
            },
            priority: NotificationPriority.STANDARD,
            metadata: {
              batchId: `PROMO_${Date.now()}`,
              isAutomated: true,
              userPreferences: user.preferences
            },
          });
          successCount++;
          console.log(`Successfully sent notification to ${user.email}`);
        } catch (error) {
          failureCount++;
          console.error(`Failed to send notification to ${user.email}:`, error);
        }
      }
  
      console.log(`Notification processing complete. Success: ${successCount}, Failed: ${failureCount}`);
    } catch (error) {
      console.error("Failed to process random user notifications:", error);
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
        content: event.details || {
          message: "Promotional event processed",
          eventType: event.eventType,
        },
        priority: NotificationPriority.STANDARD,
        metadata: {
          batchId: event.metadata?.batchId,
          retryCount,
        },
      });
      return true;
    } catch (error) {
      console.error(`Product Event Processing Failed (Retry ${retryCount}):`, {
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

  private async createNotificationForEvent(params: {
    userId: string;
    email: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }) {
    try {
      console.log("Processing Notification - Input:", {
        userId: params.userId,
        email: params.email,
        type: params.type,
        priority: params.priority,
      });

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

      console.log("Notification Record Created:", {
        notificationId: notification._id,
        userId: params.userId,
        email: params.email,
      });

      // Send email for promotional notifications
      if (params.type === NotificationType.PROMOTION) {
        try {
          await sendEmail(
            params.email,
            `Notification: ${params.type}`,
            params.type,
            params.content
          );

          console.log("Email sent successfully", {
            userId: params.userId,
            email: params.email,
            type: params.type,
          });
        } catch (emailError) {
          console.error("Email Sending Failed:", {
            userId: params.userId,
            email: params.email,
            error: (emailError as Error).message,
          });
        }
      }

      return notification;
    } catch (error) {
      console.error("Comprehensive Notification Processing Error:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
        input: params,
      });
      throw new Error(
        `Notification processing failed: ${(error as Error).message}`
      );
    }
  }
}