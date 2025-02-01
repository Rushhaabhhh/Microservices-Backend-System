import axios from "axios";
import cron from "node-cron";

import { sendEmail } from "../emailService";
import { NotificationDoc, User } from "./types";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import { Notification, NotificationType, NotificationPriority } from "../models";


export class RecommendationEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private usersServiceUrl: string;
  private cronJob!: cron.ScheduledTask;
  private readonly concurrencyLimit = 5;
  private readonly maxRetries = 3;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.usersServiceUrl = process.env.USERS_SERVICE_URL || '';
    this.initializeCronJob();
  }

  private initializeCronJob() {
    this.cronJob = cron.schedule("*/5 * * * *", async () => {
      const pendingNotifications = await Notification.find({
        type: NotificationType.RECOMMENDATION,
        emailSent: false,
        sentAt: { $exists: false }
      }).limit(10);

      if (pendingNotifications.length === 0) return;

      const batches = this.createBatches(pendingNotifications, this.concurrencyLimit);
      for (const batch of batches) {
        await Promise.all(batch.map(notification => 
          this.sendEmailNotification(notification as unknown as NotificationDoc)
        ));
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });
  }

  private createBatches<T>(items: T[], size: number): T[][] {
    return items.reduce((batches: T[][], item: T, index: number) => {
      const batchIndex = Math.floor(index / size);
      if (!batches[batchIndex]) {
        batches[batchIndex] = [];
      }
      batches[batchIndex].push(item);
      return batches;
    }, []);
  }

  private async sendEmailNotification(notification: NotificationDoc): Promise<void> {
    if (notification.emailSent) return;
  
    try {
      // Fetch user data including preferences
      const user = await this.getUserData(notification.userId);
      if (!user || !this.validateEmailFormat(user.email)) {
        throw new Error(`Invalid or missing email for user ${notification.userId}`);
      }

      // Check user preferences for recommendations
      const recommendationsEnabled = user.preferences?.recommendations !== false;
      if (!recommendationsEnabled) {
        console.log(`User ${user.email} has opted out of recommendations.`);
        notification.emailSent = false;
        notification.sentAt = new Date();
        await notification.save();
        return;
      }

      const emailContent = this.formatRecommendationEmail(notification.content.recommendations);
      console.log(`Sending email to ${user.email}...`);

      await sendEmail(
        user._id,
        "Your Personalized Product Recommendations",
        NotificationType.RECOMMENDATION,
        emailContent
      );

      notification.emailSent = true;
      notification.sentAt = new Date();
      await notification.save();
      console.log(`Email sent successfully to ${user.email}`);
    } catch (error) {
      console.error(`Email sending failed for user ${notification.userId}:`, error);
    }
  }

  async processRecommendationEvent(
    event: any,
    context: { topic: string; partition: number; offset: string }
  ): Promise<boolean> {
    let retryCount = 0;
    
    while (retryCount < this.maxRetries) {
      try {
        if (!this.validateEvent(event)) return false;

        const user = await this.getUserData(event.userId);
        if (!user) {
          throw new Error(`User data not found for userId: ${event.userId}`);
        }

        // Check user preferences for recommendations
        const recommendationsEnabled = user.preferences?.recommendations !== false;
        if (!recommendationsEnabled) {
          console.log(`User ${user.email} has opted out of recommendations.`);
          return true; // No need to process further
        }

        const notification = await this.createNotificationForRecommendation({
          userId: event.userId,
          email: user.email,
          type: NotificationType.RECOMMENDATION,
          content: {
            recommendations: event.recommendations,
            timestamp: event.timestamp,
          },
          priority: NotificationPriority.STANDARD,
          metadata: {
            recommendationSource: event.type || 'RECOMMENDATIONS',
            generatedAt: event.timestamp,
            userPreferences: user.preferences,
          },
        });

        if (notification) {
          await this.sendEmailNotification(notification);
        }

        return true;
      } catch (error) {
        retryCount++;
        if (retryCount === this.maxRetries) {
          await this.deadLetterQueueHandler.handleFailedMessage(
            context.topic,
            event,
            error as Error,
            { partition: context.partition, offset: context.offset }
          );
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
    return false;
  }

  private validateEvent(event: any): boolean {
    return (
      event?.userId &&
      Array.isArray(event.recommendations) &&
      event.recommendations.length > 0 &&
      event.recommendations.every((rec: any) => 
        rec.productId && 
        rec.name && 
        typeof rec.price === 'number' && 
        rec.category
      )
    );
  }

  private validateEmailFormat(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private async createNotificationForRecommendation(params: {
    userId: string;
    email: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }): Promise<NotificationDoc | null> {
    return Notification.create({
      ...params,
      createdAt: new Date(),
      emailSent: false,
      read: false
    }) as unknown as NotificationDoc;
  }

  private async getUserData(userId: string): Promise<User | null> {
    try {
      const response = await axios.get(
        `${this.usersServiceUrl}/${userId}`,
        { 
          timeout: 5000,
          validateStatus: status => status === 200
        }
      );

      const userData = response.data?.result || response.data;
      if (!userData || !userData.email) {
        console.error(`No email in response for user ${userId}:`, response.data);
        return null;
      }

      console.log(`Fetched user data for ${userId}:`, userData);

      return {
        _id: userData._id || userId,
        email: userData.email,
        name: userData.name || 'Valued Customer',
        preferences: userData.preferences || {}
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Failed to fetch user data for ${userId}:`, {
          status: error.response?.status,
          message: error.message
        });
      } else {
        console.error(`Error fetching user data for ${userId}:`, error);
      }
      return null;
    }
  }

  private formatRecommendationEmail(recommendations: Array<{
    productId: string;
    name: string;
    price: number;
    category: string;
  }>): string {
    const productList = recommendations
      .map(product => `
        <li>
          <strong>${product.name}</strong><br>
          Category: ${product.category}<br>
          Price: $${product.price.toFixed(2)}
        </li>
      `)
      .join('');

    return `
      <html>
        <body>
          <h1> Your Personalized Product Picks! </h1>
          <p>We’ve handpicked these recommendations just for you, based on your shopping preferences:</p>
          <ul>
            ${productList.replace(/\n\s*\n/g, '').split('\n').map(item => `<li>${item.trim()}</li>`).join('')}
          </ul>
          <p>Discover more recommendations from "Recommendations from Ecommerce Backend System" </p>
        </body>
      </html>
    `;
  }

  stopCronJob() {
    this.cronJob?.stop();
  }
}