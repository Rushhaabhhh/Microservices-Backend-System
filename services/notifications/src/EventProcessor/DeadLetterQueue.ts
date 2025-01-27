import { producer } from "../kafka";

export class DeadLetterQueueHandler {
  private readonly DLQ_TOPIC = "dead-letter-queue";
  // Method to handle failed messages
  async handleFailedMessage(
    topic: string,
    event: any,
    error: Error,
    metadata: { partition: number; offset: string }
  ) {
    const reason = error.message || "Unknown error";

    try {
      const originalMessage = Buffer.from(JSON.stringify(event));
      const dlqMetadata = {
        originalTopic: topic,
        partition: metadata.partition,
        offset: metadata.offset,
        reason,
      };

      console.error("Handling Failed Message:", {
        originalTopic: topic,
        error: reason,
        metadata: dlqMetadata,
      });

      await this.queueFailedMessage(topic, originalMessage, dlqMetadata);
    } catch (queueError) {
      console.error("Failed to handle message and send to DLQ:", {
        topic,
        originalEvent: event,
        initialError: error.message,
        dlqError: (queueError as Error).message,
      });
    }
  }

  // Dead Letter Queue Sender
  async queueFailedMessage(
    originalTopic: string, 
    originalMessage: Buffer, 
    metadata: {
      originalTopic: string;
      partition: number;
      offset: string;
      reason: string;
    }
  ) {
    try {
      await producer.send({
        topic: this.DLQ_TOPIC,
        messages: [
          {
            key: `${originalTopic}-${metadata.partition}-${metadata.offset}`,
            value: JSON.stringify({
              originalMessage: originalMessage.toString('base64'),
              metadata,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });

      console.log("Message sent to Dead Letter Queue:", {
        originalTopic: metadata.originalTopic,
        reason: metadata.reason,
        timestamp: new Date().toISOString(),
        messageKey: `${originalTopic}-${metadata.partition}-${metadata.offset}`
      });
    } catch (error) {
      console.error("Failed to send message to Dead Letter Queue:", error);
    }
  }
}