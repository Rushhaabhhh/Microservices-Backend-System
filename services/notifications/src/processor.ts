import { Kafka } from "kafkajs";
import { Notification, NotificationType, NotificationPriority } from "./models";
import { sendEmail } from "./emailService";
import { consumer } from "./kafka";
import axios from "axios";

export class NotificationProcessor {
  private kafka: Kafka;

  constructor() {
    this.kafka = new Kafka({
      clientId: "notifications",
      brokers: (process.env["KAFKA_BROKERS"] || "").split(","),
    });
  }

  // Kafka Event Consumer Setup
  async startPriorityConsumer() {
    try {
      await consumer.connect();
      await consumer.subscribe({
        topics: ["user-update-events", "order-events"],
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const event = JSON.parse(message.value!.toString());
            console.log(`Processing Event on Topic: ${topic}`, event);

            switch (topic) {
              case "user-update-events":
                await this.handleUserUpdateEvent(event);
                break;
              case "order-events":
                await this.handleOrderUpdateEvent(event);
                break;
              default:
                console.warn(`Unhandled topic: ${topic}`);
            }
          } catch (parseError) {
            console.error(`Event parsing error on topic ${topic}:`, parseError);
          }
        },
      });

      console.log("Kafka Priority Consumer Started Successfully");
    } catch (setupError) {
      console.error("Kafka Consumer Setup Failed:", setupError);
      throw setupError;
    }
  }

  // Handle User Update Priority 1 Event
  private async handleUserUpdateEvent(event: any) {
    await this.processNotification({
      userId: event.userId,
      type: NotificationType.USER_UPDATE,
      content: event.details,
      priority: NotificationPriority.CRITICAL,
      metadata: {
        updateType: event.updateType,
      },
    });
  }

  // Order Event Handler with Enhanced Logging
  private async handleOrderUpdateEvent(event: any) {
    console.log("Received Order Event:", JSON.stringify(event, null, 2));

    try {
      if (!event.userId) {
        console.error("Invalid Order Event - Missing userId", event);
        return;
      }

      await this.processNotification({
        userId: event.userId,
        type: NotificationType.ORDER_UPDATE,
        content: {
          orderId: event.orderId,
          eventDetails: event,
        },
        priority: NotificationPriority.STANDARD,
      });

      console.log("Order Event Processed Successfully:", {
        userId: event.userId,
        orderId: event.orderId,
      });
    } catch (error) {
      console.error("Order Event Processing Comprehensive Error:", {
        message: (error as Error).message,
        event: event,
      });
    }
  }

  // Enhanced notification processing with comprehensive error handling
  async processNotification(params: {
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
    } catch (error) {
      console.error("Error during notification processor shutdown:", error);
    }
  }
}

// Export a singleton instance
export const notificationProcessor = new NotificationProcessor();
