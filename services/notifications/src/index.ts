import { config } from "dotenv";
import mongoose from "mongoose";

import app from "./app";
import { NotificationProcessorService } from "./EventProcessor/processor";
import { consumer, producer, connectConsumer, connectProducer } from "./kafka";

config();

/**
 * Main entry point for the Notifications service.
 */
const main = async () => {
  try {
    // Validate essential environment variables
    const requiredEnvs = [
      "MONGO_URL",
      "KAFKA_BROKERS",
      "USERS_SERVICE_URL",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
    ];

    requiredEnvs.forEach((env) => {
      if (!process.env[env]) {
        throw new Error(`${env} is not defined`);
      }
    });

    // MongoDB Connection
    await mongoose.connect(process.env.MONGO_URL!, {
      retryWrites: true,
      w: "majority",
    });
    console.log("MongoDB Connected Successfully");

    // Kafka Connections
    await connectProducer();
    await connectConsumer();

    // Initialize Notification Processor
    const notificationProcessor = new NotificationProcessorService();
    await notificationProcessor.initializePriorityEventConsumer();

    // Start Express Server
    const port = process.env.NOTIFICATIONS_SERVICE_PORT!;
    app.listen(port, () => {
      console.log(`Notifications service running on port ${port}`);
    });
  } catch (error) {
    console.error("Notification Service Initialization Failed:", error);

    // Attempt graceful shutdown
    await producer.disconnect();
    await consumer.disconnect();

    process.exit(1);
  }
};

/**
 * Handles graceful shutdown on SIGTERM.
 */
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully.");
  await mongoose.connection.close();
  await producer.disconnect();
  await consumer.disconnect();
  process.exit(0);
});

main().catch(console.error);