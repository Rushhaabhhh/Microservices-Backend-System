import { Kafka } from "kafkajs";
import mongoose from "mongoose";
import { Notification, NotificationType, NotificationPriority } from "./models";
import { sendEmail } from "./emailService";
import { consumer } from "./kafka";

export class NotificationProcessor {
  // Kafka Consumer Configuration
  private kafka: Kafka;

  constructor() {
    this.kafka = new Kafka({
      clientId: "notifications",
      brokers: (process.env["KAFKA_BROKERS"] || "").split(",")
    });
  }

  // Central method to create and process notifications
  async processNotification(params: {
    userId: string;
    type: NotificationType;
    content: any;
    priority: NotificationPriority;
    metadata?: Record<string, any>;
  }) {
    try {
      // Create notification in database
      const notification = await Notification.create({
        userId: params.userId,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata || {},
        sentAt: new Date(),
        read: false
      });

      // Send email for critical notifications
      if (params.priority === NotificationPriority.CRITICAL) {
        await this.sendCriticalNotificationEmail(notification);
      }

      return notification;
    } catch (error) {
      console.error('Notification processing failed:', error);
      throw new Error('Failed to process notification');
    }
  }

  // Email sending for critical notifications
  private async sendCriticalNotificationEmail(notification: any) {
    try {
      // Fetch user details 
      const user = await mongoose.model('User').findById(notification.userId);

      if (!user || !user.email) {
        console.warn(`No email found for user ${notification.userId}`);
        return;
      }

      await sendEmail(
        user.email, 
        `Critical Notification: ${notification.type}`, 
        notification.type,
        notification.content
      );
    } catch (error) {
      console.error('Critical email notification failed:', error);
    }
  }

  // Start consuming Kafka events
  async startPriorityConsumer() {
    await consumer.connect();
    
    // Subscribe to priority topics
    await consumer.subscribe({ 
      topics: ['user-update-events', 'order-events'],
      fromBeginning: false 
    });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const event = JSON.parse(message.value!.toString());

          switch(topic) {
            case 'user-update-events':
              await this.handleUserUpdateEvent(event);
              break;
            case 'order-events':
              await this.handleOrderUpdateEvent(event);
              break;
            default:
              console.warn(`Unhandled topic: ${topic}`);
          }
        } catch (error) {
          console.error(`Event processing error for topic ${topic}:`, error);
          // Potential dead-letter queue or retry mechanism
        }
      }
    });
  }

  // Handle User Update Priority 1 Event
  private async handleUserUpdateEvent(event: any) {
    await this.processNotification({
      userId: event.userId,
      type: NotificationType.USER_UPDATE,
      content: event.details,
      priority: NotificationPriority.CRITICAL,
      metadata: {
        updateType: event.updateType
      }
    });
  }

  // Handle Order Update Priority 1 Event
  private async handleOrderUpdateEvent(event: any) {
    await this.processNotification({
      userId: event.userId,
      type: NotificationType.ORDER_UPDATE,
      content: {
        orderId: event.orderId,
        status: event.status
      },
      priority: NotificationPriority.CRITICAL,
      metadata: {
        orderSource: event.source
      }
    });
  }

  // Graceful shutdown method
  async shutdown() {
    try {
      await consumer.disconnect();
    } catch (error) {
      console.error('Error during notification processor shutdown:', error);
    }
  }
}

// Export a singleton instance
export const notificationProcessor = new NotificationProcessor();