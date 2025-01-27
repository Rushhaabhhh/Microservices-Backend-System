import axios from "axios";
import { Notification, NotificationType, NotificationPriority } from "../models";
import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";

export class UserUpdateEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
  }

  // Enhanced User Update Event Handler with Retry Logic
  async processUserUpdateEventWithRetry(
    event: any, 
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    const MAX_RETRIES = 5; 
    const BASE_DELAY = 500; 
    try {
      await this.createNotificationForEvent({
        userId: event.userId,
        type: NotificationType.USER_UPDATE,
        content: event.details || { 
          message: 'User event processed', 
          eventType: event.eventType 
        },
        priority: NotificationPriority.CRITICAL,
        metadata: {
          updateType: event.updateType,
          retryCount,
        },
      });
      return true;
    } catch (error) {
      console.error(`User Update Event Processing Failed (Retry ${retryCount}):`, {
        error: (error as Error).message,
        event,
      });

      if (retryCount < MAX_RETRIES) {
        const backoffDelay = Math.pow(2, retryCount) * BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        return this.processUserUpdateEventWithRetry(event, context, retryCount + 1);
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
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }) {
    try {
      console.log("Processing Notification - Input:", {
        userId: params.userId,
        type: params.type,
        priority: params.priority,
      });

      if (!process.env.USERS_SERVICE_URL) {
        throw new Error("Users Service URL is not configured");
      }

      let userResponse;
      try {
        userResponse = await axios.get(
          `${process.env.USERS_SERVICE_URL}/${params.userId}`,
          { timeout: 5000 }
        );
      } catch (fetchError) {
        console.error("User Retrieval Error:", {
          message: (fetchError as Error).message,
          url: `${process.env.USERS_SERVICE_URL}/${params.userId}`,
        });
        throw new Error(
          `Failed to retrieve user details: ${(fetchError as Error).message}`
        );
      }

      const userEmail = userResponse.data?.result?.email;
      console.log("User Email Retrieved:", {
        userId: params.userId,
        email: userEmail,
      });
      if (!userEmail) {
        console.warn(`No email found for user ${params.userId}`);
        return null;
      }

      const notification = await Notification.create({
        userId: params.userId,
        email: userEmail,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata || {},
        sentAt: new Date(),
        read: false,
      });

      console.log("Notification Record Created:", {
        userId: params.userId,
        type: params.type,
        priority: params.priority,
        notificationId: notification._id,
      });

      if (params.priority === NotificationPriority.CRITICAL) {
        try {
          await sendEmail(
            params.userId,
            `Notification: ${params.type}`,
            params.type,
            params.content
          );

          console.log("Email sent successfully", {
            userId: params.userId,
            type: params.type,
          });
        } catch (emailError) {
          console.error("Email Sending Failed:", {
            userId: params.userId,
            type: params.type,
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