import axios from "axios";

import { sendEmail } from "../emailService";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import { Notification, NotificationType, NotificationPriority } from "../models";

export class OrderUpdateEventProcessor {
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
  }

  // Enhanced Order Update Event Handler with Retry Logic
  async processOrderUpdateEventWithRetry(
    event: any, 
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    const MAX_RETRIES = 3;

    try {
      if (!event.userId) {
        console.error("Invalid Order Event - Missing userId", event);
        return false;
      }

      await this.createNotificationForEvent({
        userId: event.userId,
        type: NotificationType.ORDER_UPDATE,
        content: {
          orderId: event.orderId,
          eventDetails: event.details || {
            message: "Order event processed",
            eventType: event.eventType,
          },
        },
        priority: NotificationPriority.CRITICAL,
        metadata: {
          retryCount,
        },
      });

      console.log("Order Event Processed Successfully:", {
        userId: event.userId,
        orderId: event.orderId,
      });

      return true;
    } catch (error) {
      console.error(`Order Event Processing Failed (Retry ${retryCount}):`, {
        error: (error as Error).message,
        event,
      });

      if (retryCount < MAX_RETRIES) {
        // Exponential backoff
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        return this.processOrderUpdateEventWithRetry(event, context, retryCount + 1);

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

  // Enhanced notification processing with comprehensive error handling
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

      if (params.type === NotificationType.ORDER_UPDATE) {
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