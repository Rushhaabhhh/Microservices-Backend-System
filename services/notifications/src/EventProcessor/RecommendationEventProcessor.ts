import axios from "axios";
import { Notification, NotificationType, NotificationPriority } from "../models";
import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import cron from "node-cron";

export class RecommendationEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private usersServiceUrl: string;
  private cronJob!: cron.ScheduledTask;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.usersServiceUrl = process.env.USERS_SERVICE_URL || '';
    this.initializeCronJob();
  }

  private initializeCronJob() {
    // Run every minute
    this.cronJob = cron.schedule("* * * * *", async () => {
      console.log("[Recommendation] Starting scheduled email processing", new Date());
      
      try {
        const pendingNotifications = await Notification.find({
          type: NotificationType.RECOMMENDATION,
          emailSent: { $ne: true },
          sentAt: { $exists: false }
        }).limit(10);

        console.log(`Found ${pendingNotifications.length} pending notifications`);

        // Process notifications in parallel with controlled concurrency
        const concurrencyLimit = 5;
        const notificationBatches = [];

        for (let i = 0; i < pendingNotifications.length; i += concurrencyLimit) {
          notificationBatches.push(pendingNotifications.slice(i, i + concurrencyLimit));
        }

        for (const batch of notificationBatches) {
          await Promise.all(batch.map(notification => 
            this.sendEmailNotification(notification)
              .catch(error => {
                console.error(`Failed to process notification ${notification._id}:`, error);
              })
          ));
        }

      } catch (error) {
        console.error("[Recommendation] Cron job failed:", error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log("Cron job initialized for email notifications");
  }

  private async sendEmailNotification(notification: any): Promise<void> {
    try {
      if (notification.emailSent) return;

      let userEmail = notification.email;
      if (!userEmail) {
        userEmail = await this.getUserEmail(notification.userId);
        if (!userEmail) {
          throw new Error(`No email found for user ${notification.userId}`);
        }
        notification.email = userEmail;
      }

      // Validate the email format before sending
      if (!this.validateEmailFormat(userEmail)) {
        throw new Error(`Invalid email format for user ${notification.userId}: ${userEmail}`);
      }

      const emailContent = this.formatRecommendationEmail(notification.content.recommendations);

      console.log(`Attempting to send email to ${userEmail}`, {
        notificationId: notification._id,
        userId: notification.userId
      });

      await sendEmail(
        userEmail,
        "Your Personalized Product Recommendations",
        NotificationType.RECOMMENDATION,
        emailContent
      );

      notification.emailSent = true;
      notification.sentAt = new Date();
      notification.lastEmailAttempt = new Date();
      await notification.save();

      console.log(`Email sent successfully to ${userEmail}`, {
        notificationId: notification._id,
        userId: notification.userId
      });
    } catch (error) {
      console.error('Failed to send email notification:', {
        notificationId: notification._id,
        userId: notification.userId,
        error: (error as Error).message
      });

      notification.lastEmailAttempt = new Date();
      notification.emailError = (error as Error).message;
      await notification.save();

      throw error;
    }
  }
  private validateEmailFormat(email: string): boolean {
    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }



  async processRecommendationEventWithRetry(
    event: any,
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    const MAX_RETRIES = 3;

    try {
      if (!this.validateEvent(event)) {
        console.error("Invalid Recommendation Event", event);
        return false;
      }

      // Create notification
      const notification = await this.createNotificationForRecommendation({
        userId: event.userId,
        type: NotificationType.RECOMMENDATION,
        content: {
          recommendations: event.recommendations,
          timestamp: event.timestamp,
        },
        priority: NotificationPriority.STANDARD,
        metadata: {
          retryCount,
          recommendationSource: event.type || 'PRODUCT_RECOMMENDATIONS',
          generatedAt: event.timestamp
        },
      });

      if (notification) {
        // Try to send email immediately if enabled
        if (process.env.ENABLE_RECOMMENDATION_EMAILS === 'true') {
          try {
            await this.sendEmailNotification(notification);
          } catch (error) {
            console.error('Initial email send failed, will retry via cron:', error);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Recommendation Event Processing Failed (Retry ${retryCount}):`, error);
  
      if (retryCount < MAX_RETRIES) {
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying after ${backoffDelay} ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return this.processRecommendationEventWithRetry(event, context, retryCount + 1);
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

  private validateEvent(event: any): boolean {
    return (
      event &&
      typeof event.userId === 'string' &&
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

  private async createNotificationForRecommendation(params: {
    userId: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }) {
    try {
      const userEmail = await this.getUserEmail(params.userId);

      const notification = await Notification.create({
        userId: params.userId,
        email: userEmail,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata,
        createdAt: new Date(),
        emailSent: false,
        read: false
      });

      console.log("Notification created:", {
        notificationId: notification._id,
        userId: params.userId
      });

      return notification;
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw error;
    }
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.usersServiceUrl}/users/${userId}`,
        { timeout: 5000 }
      );
      return response.data?.result?.email || null;
    } catch (error) {
      console.error("Failed to fetch user email:", error);
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
        - ${product.name}
          Category: ${product.category}
          Price: $${product.price.toFixed(2)}
      `)
      .join('\n');

    return `
      Based on your shopping history, we think you might like these products:
      
      ${productList}
      
      Visit our website to view more recommendations: ${process.env.WEBSITE_URL}/recommendations
    `;
  }

  // Cleanup method
  stopCronJob() {
    if (this.cronJob) {
      this.cronJob.stop();
    }
  }
}


/*
// src/RecommendationEventProcessor.ts
import axios from "axios";
import { Notification, NotificationType, NotificationPriority } from "../models";
import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import cron from "node-cron";

interface NotificationDoc extends Document {
  _id: string;
  userId: string;
  email: string;
  type: NotificationType;
  content: any;
  priority: NotificationPriority;
  metadata?: Record<string, any>;
  emailSent: boolean;
  sentAt?: Date;
  lastEmailAttempt?: Date;
  emailError?: string;
  read: boolean;
}

export class RecommendationEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private usersServiceUrl: string;
  private cronJob!: cron.ScheduledTask;
  private concurrencyLimit: number;
  private maxNotifications: number;
  private MAX_RETRIES: number;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
    this.usersServiceUrl = process.env.USERS_SERVICE_URL || '';
    this.concurrencyLimit = Number(process.env.NOTIFICATION_CONCURRENCY_LIMIT) || 5;
    this.maxNotifications = Number(process.env.NOTIFICATION_BATCH_LIMIT) || 10;
    this.MAX_RETRIES = Number(process.env.NOTIFICATION_MAX_RETRIES) || 3;
    this.initializeCronJob();
  }

  private initializeCronJob() {
    // Run every 5 minutes
    this.cronJob = cron.schedule("5 * * * *", async () => {
      console.log("[Recommendation] Starting scheduled email processing", new Date());

      try {
        const pendingNotifications = await Notification.find({
          type: NotificationType.RECOMMENDATION,
          emailSent: { $ne: true },
          sentAt: { $exists: false }
        }).limit(this.maxNotifications);

        console.log(`Found ${pendingNotifications.length} pending notifications`);

        if (pendingNotifications.length === 0) {
          console.log("No pending notifications to process.");
          return;
        }

        // Process notifications in parallel with controlled concurrency
        const notificationBatches = [];

        for (let i = 0; i < pendingNotifications.length; i += this.concurrencyLimit) {
          notificationBatches.push(pendingNotifications.slice(i, i + this.concurrencyLimit));
        }

        for (const batch of notificationBatches) {
          await Promise.all(batch.map(notification => 
            this.sendEmailNotification(notification)
              .catch(error => {
                console.error(`Failed to process notification ${notification._id}:`, error);
                // Optionally, handle specific error scenarios here
              })
          ));
        }

      } catch (error) {
        console.error("[Recommendation] Cron job failed:", error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log("Cron job initialized for email notifications");
  }

  private async sendEmailNotification(notification: NotificationDoc): Promise<void> {
    try {
      if (notification.emailSent) return;

      let userEmail = notification.email;
      if (!userEmail) {
        userEmail = await this.getUserEmail(notification.userId);
        if (!userEmail) {
          throw new Error(`No email found for user ${notification.userId}`);
        }
        notification.email = userEmail;
      }

      // Validate the email format before sending
      if (!this.validateEmailFormat(userEmail)) {
        throw new Error(`Invalid email format for user ${notification.userId}: ${userEmail}`);
      }

      const emailContent = this.formatRecommendationEmail(notification.content.recommendations);

      console.log(`Attempting to send email to ${userEmail}`, {
        notificationId: notification._id,
        userId: notification.userId
      });

      await sendEmail(
        userEmail,
        "Your Personalized Product Recommendations",
        NotificationType.RECOMMENDATION,
        emailContent
      );

      notification.emailSent = true;
      notification.sentAt = new Date();
      notification.lastEmailAttempt = new Date();
      await notification.save();

      console.log(`Email sent successfully to ${userEmail}`, {
        notificationId: notification._id,
        userId: notification.userId
      });
    } catch (error) {
      console.error('Failed to send email notification:', {
        notificationId: notification._id,
        userId: notification.userId,
        error: (error as Error).message
      });

      notification.lastEmailAttempt = new Date();
      notification.emailError = (error as Error).message;
      await notification.save();

      throw error; // Rethrow to allow the cron job to handle it
    }
  }

  private validateEmailFormat(email: string): boolean {
    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async processRecommendationEventWithRetry(
    event: any,
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    try {
      if (!this.validateEvent(event)) {
        console.error("Invalid Recommendation Event", event);
        return false;
      }

      // Create notification
      const notification = await this.createNotificationForRecommendation({
        userId: event.userId,
        type: NotificationType.RECOMMENDATION,
        content: {
          recommendations: event.recommendations,
          timestamp: event.timestamp,
        },
        priority: NotificationPriority.STANDARD,
        metadata: {
          retryCount,
          recommendationSource: event.type || 'PRODUCT_RECOMMENDATIONS',
          generatedAt: event.timestamp
        },
      });

      if (notification) {
        // Try to send email immediately if enabled
        if (process.env.ENABLE_RECOMMENDATION_EMAILS === 'true') {
          try {
            await this.sendEmailNotification(notification);
          } catch (error) {
            console.error('Initial email send failed, will retry via cron:', error);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Recommendation Event Processing Failed (Retry ${retryCount}):`, error);

      if (retryCount < this.MAX_RETRIES) {
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying after ${backoffDelay} ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return this.processRecommendationEventWithRetry(event, context, retryCount + 1);
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

  private validateEvent(event: any): boolean {
    return (
      event &&
      typeof event.userId === 'string' &&
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

  private async createNotificationForRecommendation(params: {
    userId: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }): Promise<NotificationDoc | null> {
    try {
      const userEmail = await this.getUserEmail(params.userId);
      if (!userEmail) {
        throw new Error(`No email found for user ${params.userId}`);
      }

      const notification = await Notification.create({
        userId: params.userId,
        email: userEmail,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata,
        createdAt: new Date(),
        emailSent: false,
        read: false
      });

      console.log("Notification created:", {
        notificationId: notification._id,
        userId: params.userId
      });

      return notification;
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw error;
    }
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.usersServiceUrl}/users/${userId}`,
        { timeout: 5000 }
      );
      return response.data?.result?.email || null;
    } catch (error) {
      console.error("Failed to fetch user email:", error);
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
          <strong>${product.name}</strong><br/>
          Category: ${product.category}<br/>
          Price: $${product.price.toFixed(2)}
        </li>
      `)
      .join('');

    return `
      <html>
        <body>
          <h1>Your Personalized Product Recommendations!</h1>
          <p>Based on your recent activity, you might like the following products:</p>
          <ul>
            ${productList}
          </ul>
          <p>Check them out <a href="${process.env.WEBSITE_URL}/recommendations">here</a>.</p>
          <p>Happy Shopping!</p>
        </body>
      </html>
    `;
  }

  // Cleanup method
  stopCronJob() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log("Cron job stopped.");
    }
  }
}
*/