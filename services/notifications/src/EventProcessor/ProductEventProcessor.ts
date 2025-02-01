import axios from "axios";
import cron from "node-cron";

import { sendEmail } from "../emailService";
import { NotificationPayload, User } from "./types";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import { Notification, NotificationType, NotificationPriority } from "../models";

export class ProductEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.initializeCronJob();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private initializeCronJob() {
    cron.schedule("*/5 * * * *", async () => {
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
      const response = await axios.get(process.env.USERS_SERVICE_URL, { timeout: 5000 });
      const allUsers: User[] = (response.data?.result || []).filter((user: { email: string; preferences: { promotions: boolean; }; }) => 
        this.isValidEmail(user.email) && user.preferences?.promotions !== false
      );

      return allUsers.sort(() => 0.5 - Math.random()).slice(0, count);
    } catch (error) {
      console.error("[ProductEventProcessor] Failed to fetch users:", error);
      throw new Error(`Failed to retrieve users: ${(error as Error).message}`);
    }
  }

  private async createNotificationForEvent(params: NotificationPayload): Promise<Notification> {
    try {
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

      if (params.type === NotificationType.PROMOTION) {
        try {
          await sendEmail(
            params.userId,
            `🎉 Special Promotion Just for You, ${params.content.name}!`,
            NotificationType.PROMOTION,
            `
            <html>
              <body>
                <h2>Hey ${params.content.name}, 🎁</h2>
                <p>${params.content.message}</p>
                <p>✨ Don't miss out—grab this special offer while it lasts!</p>
                <p>Best Regards, <br><strong>Your Favorite Store</strong>
                </p>
              </body>
            </html>`
          );
        } catch (emailError) {
          console.error("[ProductEventProcessor] Email Sending Failed:", { email: params.email, error: (emailError as Error).message });
        }
      }
      return notification as unknown as Notification;
    } catch (error) {
      console.error("[ProductEventProcessor] Notification Processing Error:", { message: (error as Error).message });
      throw error;
    }
  }

  private async sendRandomUserNotifications() {
    try {
      const randomUsers = await this.getRandomUsers(10);
      if (!randomUsers.length) return;

      const promotionalContent = {
        message: "Check out our latest promotions! Limited time offers await you.",
        eventType: "PROMOTIONAL_CAMPAIGN",
      };

      for (const user of randomUsers) {
        await this.createNotificationForEvent({
          userId: user._id,
          email: user.email,
          type: NotificationType.PROMOTION,
          content: { ...promotionalContent, name: user.name },
          priority: NotificationPriority.STANDARD,
          metadata: { batchId: `PROMO_${Date.now()}`, isAutomated: true, userPreferences: user.preferences },
        });
      }
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
        content: { message: event.details?.message || "Promotional event processed", eventType: event.eventType, name: event.details?.name || "Valued Customer" },
        priority: NotificationPriority.STANDARD,
        metadata: { batchId: event.metadata?.batchId || `RETRY_${Date.now()}`, isAutomated: true, retryCount },
      });
      return true;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * BASE_DELAY));
        return this.processProductEventWithRetry(event, context, retryCount + 1);
      }

      await this.deadLetterQueueHandler.handleFailedMessage(context.topic, event, error as Error, { partition: context.partition, offset: context.offset });
      return false;
    }
  }
}
