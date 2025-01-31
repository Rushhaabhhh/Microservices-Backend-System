import { Consumer, Kafka } from "kafkajs";

import { consumer, producer } from "../kafka";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import { ProductEventProcessor } from "./ProductEventProcessor";
import { UserUpdateEventProcessor } from "./UserEventProcessor";
import { OrderUpdateEventProcessor } from "./OrderEventProcessor";
import { RecommendationEventProcessor } from "./RecommendationEventProcessor";

export class NotificationProcessorService {
  private kafka: Kafka;
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private userUpdateEventProcessor: UserUpdateEventProcessor;
  private orderUpdateEventProcessor: OrderUpdateEventProcessor;
  private productEventProcessor: ProductEventProcessor;
  private recommendationEventProcessor: RecommendationEventProcessor;
  
  highPriorityConsumer: Consumer;
  standardPriorityConsumer: Consumer;
  static createNotificationForEvent: any;

  constructor() {
    this.kafka = new Kafka({
      clientId: "notifications",
      brokers: (process.env["KAFKA_BROKERS"] || "").split(","),
      retry: {
        retries: 5,
        factor: 2,
        initialRetryTime: 1000,
      }
    });
    
    this.deadLetterQueueHandler = new DeadLetterQueueHandler();
    
    this.userUpdateEventProcessor = new UserUpdateEventProcessor(this.deadLetterQueueHandler);
    this.orderUpdateEventProcessor = new OrderUpdateEventProcessor(this.deadLetterQueueHandler);
    this.productEventProcessor = new ProductEventProcessor(this.deadLetterQueueHandler);
    this.recommendationEventProcessor = new RecommendationEventProcessor(this.deadLetterQueueHandler);

    this.highPriorityConsumer = this.kafka.consumer({ 
      groupId: "priority1-notification-group",
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxInFlightRequests: 1, 
    });

    this.standardPriorityConsumer = this.kafka.consumer({ 
      groupId: "priority2-notification-group",
      sessionTimeout: 45000,
      heartbeatInterval: 5000,
      maxInFlightRequests: 1,
    });
  }

  async initializePriorityEventConsumer() {
    try {
      // High Priority Consumer Setup
      await this.highPriorityConsumer.connect();
      await this.highPriorityConsumer.subscribe({
        topics: ["user-events", "order-events"],
        fromBeginning: false,
      });

      await this.highPriorityConsumer.run({
        // Adjust the concurrency based on your processing capabilities
        eachMessage: async ({ topic, message, partition }) => {
          if (!message.value) {
            console.error('Received null message value');
            return;
          }

          const event = JSON.parse(message.value.toString());
          console.log(`Processing High Priority Event: ${topic}`, {
            eventType: event.type,
            userId: event.userId
          });

          let processingResult = false;
          try {
            if (topic === "user-events") {
              processingResult = await this.userUpdateEventProcessor.processUserUpdateEventWithRetry(
                event, 
                { topic, partition, offset: message.offset },
              );
            } else if (topic === "order-events") {
              processingResult = await this.orderUpdateEventProcessor.processOrderUpdateEventWithRetry(
                event, 
                { topic, partition, offset: message.offset },
              );
            }

            if (!processingResult) {
              await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value, { 
                originalTopic: topic, 
                partition, 
                offset: message.offset,
                reason: "High Priority Event Processing Failed"
              });
            }
          } catch (error) {
            console.error(`High Priority Event Processing Error: ${topic}`, error);
            await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value, { 
              originalTopic: topic, 
              partition, 
              offset: message.offset,
              reason: (error as Error).message
            });
          }
        },
      });

      // Standard Priority Consumer Setup
      await this.standardPriorityConsumer.connect();
      await this.standardPriorityConsumer.subscribe({
        topics: ["product-events", "recommendation-events"],
        fromBeginning: false,
      });

      await this.standardPriorityConsumer.run({
        eachMessage: async ({ topic, message, partition }) => {
          if (!message.value) {
            console.error('Received null message value');
            return;
          }

          const event = JSON.parse(message.value.toString());
          console.log(`Processing Standard Priority Event: ${topic}`, {
            eventType: event.type,
            userId: event.userId
          });

          let processingResult = false;
          try {
            if (topic === "product-events") {
              processingResult = await this.productEventProcessor.processProductEventWithRetry(
                event, 
                { topic, partition, offset: message.offset },
              );
            } else if (topic === "recommendation-events") {
              processingResult = await this.recommendationEventProcessor.processRecommendationEvent(
                event, 
                { topic, partition, offset: message.offset },
              );
            }

            if (!processingResult) {
              await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value, { 
                originalTopic: topic, 
                partition, 
                offset: message.offset,
                reason: "Standard Priority Event Processing Failed"
              });
            }
          } catch (error) {
            console.error(`Standard Priority Event Processing Error: ${topic}`, {
              error: (error as Error).message,
              topic,
              stack: (error as Error).stack
            });
            await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value, { 
              originalTopic: topic, 
              partition, 
              offset: message.offset,
              reason: (error as Error).message
            });
          }
        },
      });

      console.log("Kafka Priority Consumers Started Successfully", {
        highPriorityTopics: ["user-events", "order-events"],
        standardPriorityTopics: ["product-events", "recommendation-events"]
      });
    } catch (setupError) {
      console.error("Kafka Consumers Setup Failed:", setupError);
      throw setupError;
    }
  }

  async shutdown() {
    try {
      await this.highPriorityConsumer.disconnect();
      await this.standardPriorityConsumer.disconnect();
      await consumer.disconnect();
      await producer.disconnect();
      console.log("Notification processor service shut down successfully");
    } catch (error) {
      console.error("Error during notification processor shutdown:", error);
    }
  }
}

// Export a singleton instance
export const notificationProcessorService = new NotificationProcessorService();