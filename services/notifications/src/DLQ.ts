// import { Kafka } from "kafkajs";
// import mongoose from "mongoose";
// import { Notification, NotificationType, NotificationPriority } from "./models";
// import { sendEmail } from "./emailService";
// import { consumer, producer } from "./kafka";

// interface EmailAttempt {
//   notificationId: string;
//   userId: string;
//   type: NotificationType;
//   content: any;
//   attempts: number;
//   lastAttempt: Date;
//   status: 'pending' | 'success' | 'failed';
// }

// export class NotificationProcessor {
//   private kafka: Kafka;
//   private MAX_EMAIL_RETRY_ATTEMPTS = 3;
//   private EMAIL_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

//   constructor() {
//     this.kafka = new Kafka({
//       clientId: "notifications",
//       brokers: (process.env["KAFKA_BROKERS"] || "").split(",")
//     });
//   }

//   async processNotification(params: {
//     userId: string;
//     type: NotificationType;
//     content: any;
//     priority: NotificationPriority;
//     metadata?: Record<string, any>;
//   }) {
//     try {
//       // Create notification in database
//       const notification = await Notification.create({
//         userId: params.userId,
//         type: params.type,
//         content: params.content,
//         priority: params.priority,
//         metadata: params.metadata || {},
//         sentAt: new Date(),
//         read: false
//       });

//       // Send email for critical notifications with retry mechanism
//       if (params.priority === NotificationPriority.CRITICAL) {
//         await this.sendCriticalNotificationEmailWithRetry(notification);
//       }

//       return notification;
//     } catch (error) {
//       console.error('Notification processing failed:', error);
//       await this.publishToDeadLetterQueue(params, error);
//       throw new Error('Failed to process notification');
//     }
//   }

//   // Enhanced email sending with retry and dead letter queue
//   private async sendCriticalNotificationEmailWithRetry(notification: any) {
//     try {
//       const user = await mongoose.model('User').findById(notification.userId);

//       if (!user || !user.email) {
//         throw new Error(`No email found for user ${notification.userId}`);
//       }

//       const emailAttempt: EmailAttempt = {
//         notificationId: notification._id,
//         userId: notification.userId,
//         type: notification.type,
//         content: notification.content,
//         attempts: 1,
//         lastAttempt: new Date(),
//         status: 'pending'
//       };

//       try {
//         await sendEmail(
//           user.email, 
//           `Critical Notification: ${notification.type}`, 
//           notification.type,
//           notification.content
//         );

//         emailAttempt.status = 'success';
//       } catch (emailError) {
//         // If email sending fails, schedule retry or move to DLQ
//         if (emailAttempt.attempts < this.MAX_EMAIL_RETRY_ATTEMPTS) {
//           await this.scheduleEmailRetry(emailAttempt);
//         } else {
//           await this.publishEmailToDeadLetterQueue(emailAttempt);
//         }
//       }
//     } catch (error) {
//       console.error('Critical notification email processing failed:', error);
//     }
//   }

//   // Schedule email retry with exponential backoff
//   private async scheduleEmailRetry(emailAttempt: EmailAttempt) {
//     emailAttempt.attempts++;
//     emailAttempt.lastAttempt = new Date();
    
//     // Publish retry message to a separate Kafka topic
//     await producer.send({
//       topic: 'email-retry-queue',
//       messages: [{ 
//         value: JSON.stringify(emailAttempt) 
//       }]
//     });
//   }

//   // Publish to dead letter queue when all retry attempts fail
//   private async publishEmailToDeadLetterQueue(emailAttempt: EmailAttempt) {
//     emailAttempt.status = 'failed';
    
//     await producer.send({
//       topic: 'email-dead-letter-queue',
//       messages: [{ 
//         value: JSON.stringify(emailAttempt) 
//       }]
//     });

//     console.error('Email notification moved to dead letter queue:', emailAttempt);
//   }

//   // General Dead Letter Queue for any processing failure
//   private async publishToDeadLetterQueue(params: any, error: any) {
//     await producer.send({
//       topic: 'notification-dead-letter-queue',
//       messages: [{ 
//         value: JSON.stringify({
//           ...params,
//           error: error.toString(),
//           timestamp: new Date()
//         }) 
//       }]
//     });
//   }

//   // Kafka consumer for retry queue
//   async startEmailRetryConsumer() {
//     await consumer.subscribe({ 
//       topic: 'email-retry-queue',
//       fromBeginning: false 
//     });

//     await consumer.run({
//       eachMessage: async ({ message }) => {
//         const emailAttempt = JSON.parse(message.value!.toString());
        
//         // Implement retry logic with time-based checks
//         const timeSinceLastAttempt = 
//           new Date().getTime() - new Date(emailAttempt.lastAttempt).getTime();
        
//         if (timeSinceLastAttempt >= this.EMAIL_RETRY_DELAY_MS) {
//           await this.sendCriticalNotificationEmailWithRetry(emailAttempt);
//         }
//       }
//     });
//   }
// }

// export const notificationProcessor = new NotificationProcessor();