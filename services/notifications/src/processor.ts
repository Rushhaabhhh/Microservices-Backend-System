import { Consumer, Kafka } from "kafkajs";
import { Notification, NotificationType, NotificationPriority } from "./models";
import { sendEmail } from "./emailService";
import { consumer, producer } from "./kafka";
import axios from "axios";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";

export class NotificationProcessorService {
  private kafka: Kafka;
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  static createNotificationForEvent: any;
  highPriorityConsumer: Consumer;
  standardPriorityConsumer: Consumer;

  constructor() {
    this.kafka = new Kafka({
      clientId: "notifications",
      brokers: (process.env["KAFKA_BROKERS"] || "").split(","),
    });
    this.deadLetterQueueHandler = new DeadLetterQueueHandler();

    // Configure different consumers for priority levels
    this.highPriorityConsumer = this.kafka.consumer({ 
      groupId: "priority1-notification-group",
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.standardPriorityConsumer = this.kafka.consumer({ 
      groupId: "priority2-notification-group",
      sessionTimeout: 45000,
      heartbeatInterval: 5000,
    });
  }

  // Kafka Event Consumer Setup with Dead Letter Queue Logic
  async initializePriorityEventConsumer() {
    try {
      // High Priority Consumer Setup
      await this.highPriorityConsumer.connect();
      await this.highPriorityConsumer.subscribe({
        topics: ["user-update-events"],
        fromBeginning: false,
      });

      await this.highPriorityConsumer.run({
        // Increased concurrency for high-priority events
        partitionsConsumedConcurrently: 5,
        eachMessage: async ({ topic, message, partition }: { topic: string; message: { value: Buffer | null; offset: string }; partition: number }) => {
          try {
            const event = JSON.parse(message.value!.toString());
            console.log(`Processing High Priority Event: ${topic}`, event);

            const processingResult = await this.processUserUpdateEventWithRetry(
              event, 
              { topic, partition, offset: message.offset },
            );

            if (processingResult === false) {
              await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value!, { 
                originalTopic: topic, 
                partition, 
                offset: message.offset,
                reason: "High Priority Event Processing Failed"
              });
            }
          } catch (error) {
            console.error(`High Priority Event Processing Error: ${topic}`, error);
          }
        },
      });

      // Standard Priority Consumer Setup
      await this.standardPriorityConsumer.connect();
      await this.standardPriorityConsumer.subscribe({
        topics: ["order-events"],
        fromBeginning: false,
      });

      await this.standardPriorityConsumer.run({
        // Lower concurrency for standard events
        partitionsConsumedConcurrently: 2,
        eachMessage: async ({ topic, message, partition }: { topic: string; message: { value: Buffer | null; offset: string }; partition: number }) => {
          try {
            const event = JSON.parse(message.value!.toString());
            console.log(`Processing Standard Priority Event: ${topic}`, event);

            const processingResult = await this.processOrderUpdateEventWithRetry(
              event, 
              { topic, partition, offset: message.offset },
            );

            if (processingResult === false) {
              await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value!, { 
                originalTopic: topic, 
                partition, 
                offset: message.offset,
                reason: "Standard Priority Event Processing Failed"
              });
            }
          } catch (error) {
            console.error(`Standard Priority Event Processing Error: ${topic}`, error);
          }
        },
      });

      console.log("Kafka Priority Consumers Started Successfully");
    } catch (setupError) {
      console.error("Kafka Consumers Setup Failed:", setupError);
      throw setupError;
    }
  }

  // Enhanced User Update Event Handler with Retry Logic
  private async processUserUpdateEventWithRetry(
    event: any, 
    context: { topic: string; partition: number; offset: string },
    retryCount: number = 0
  ): Promise<boolean> {
    const MAX_RETRIES = 5; // Increased for high-priority events
    const BASE_DELAY = 500; // Shorter base delay for faster retries

    try {
      await this.createNotificationForEvent({
        userId: event.userId,
        type: NotificationType.USER_UPDATE,
        content: event.details,
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
        // More aggressive exponential backoff for high-priority events
        const backoffDelay = Math.pow(2, retryCount) * BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        return this.processUserUpdateEventWithRetry(event, context, retryCount + 1);
      }
      
      return false;
    }
  }

  // Enhanced Order Update Event Handler with Retry Logic
  private async processOrderUpdateEventWithRetry(
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
          eventDetails: event,
        },
        priority: NotificationPriority.STANDARD,
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

      if (
        params.priority === NotificationPriority.CRITICAL ||
        params.type === NotificationType.ORDER_UPDATE
      ) {
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

  // Graceful shutdown method
  async shutdown() {
    try {
      await consumer.disconnect();
      await producer.disconnect();
    } catch (error) {
      console.error("Error during notification processor shutdown:", error);
    }
  }
}

// Export a singleton instance
export const notificationProcessorService = new NotificationProcessorService();