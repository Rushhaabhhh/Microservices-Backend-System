import { Consumer, Kafka } from "kafkajs";

import { consumer, producer } from "../kafka";
import { DeadLetterQueueHandler } from "./DeadLetterQueue";
import { UserUpdateEventProcessor } from "./UserEventProcessor";
import { OrderUpdateEventProcessor } from "./OrderEventProcessor";
import { ProductEventProcessor } from "./ProductEventProcessor";

export class NotificationProcessorService {
  private kafka: Kafka;
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private userUpdateEventProcessor: UserUpdateEventProcessor;
  private orderUpdateEventProcessor: OrderUpdateEventProcessor;
  private productEventProcessor: ProductEventProcessor;
  
  highPriorityConsumer: Consumer;
  standardPriorityConsumer: Consumer;
  static createNotificationForEvent: any;

  constructor() {
    this.kafka = new Kafka({
      clientId: "notifications",
      brokers: (process.env["KAFKA_BROKERS"] || "").split(","),
    });
    
    this.deadLetterQueueHandler = new DeadLetterQueueHandler();
    this.userUpdateEventProcessor = new UserUpdateEventProcessor(this.deadLetterQueueHandler);
    this.orderUpdateEventProcessor = new OrderUpdateEventProcessor(this.deadLetterQueueHandler);
    this.productEventProcessor = new ProductEventProcessor(this.deadLetterQueueHandler);

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
        topics: ["user-events", "order-events"],
        fromBeginning: false,
      });

      await this.highPriorityConsumer.run({
        // Increased concurrency for high-priority events
        partitionsConsumedConcurrently: 5,
        eachMessage: async ({ topic, message, partition }: { topic: string; message: { value: Buffer | null; offset: string }; partition: number }) => {
          try {
            const event = JSON.parse(message.value!.toString());
            console.log(`Processing High Priority Event: ${topic}`, event);

            let processingResult = false;
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
        topics: ["promotional-events"],
        fromBeginning: false,
      });

      await this.standardPriorityConsumer.run({
        // Lower concurrency for standard events
        partitionsConsumedConcurrently: 2,
        eachMessage: async ({ topic, message, partition }: { topic: string; message: { value: Buffer | null; offset: string }; partition: number }) => {
          try {
            const event = JSON.parse(message.value!.toString());
            console.log(`Processing Standard Priority Event: ${topic}`, event);

            const processingResult = await this.productEventProcessor.processProductEventWithRetry(
              event, 
              { topic, partition, offset: message.offset },
            );

            if (processingResult === false) {
              await this.deadLetterQueueHandler.queueFailedMessage(topic, message.value!, { 
                originalTopic: topic, 
                partition, 
                offset: message.offset,
                reason: "Promotional Event Processing Failed"
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

  // Graceful shutdown method
  async shutdown() {
    try {
      await this.highPriorityConsumer.disconnect();
      await this.standardPriorityConsumer.disconnect();
      await consumer.disconnect();
      await producer.disconnect();
    } catch (error) {
      console.error("Error during notification processor shutdown:", error);
    }
  }
}

// Export a singleton instance
export const notificationProcessorService = new NotificationProcessorService();