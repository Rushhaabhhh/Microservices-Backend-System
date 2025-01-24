import { config } from "dotenv";
config(); 

import mongoose from "mongoose";
import app from "./app";
import { consumer, producer, connectConsumer, connectProducer } from "./kafka";
import { NotificationProcessor } from "./processor"; 

const main = async () => {
  try {
    // Validate essential environment variables
    const requiredEnvs = [
      'MONGO_URL', 
      'KAFKA_BROKERS', 
      'NOTIFICATIONS_SERVICE_PORT',
      'SENDGRID_API_KEY'
    ];

    requiredEnvs.forEach(env => {
      if (!process.env[env]) {
        throw new Error(`${env} is not defined`);
      }
    });

    // MongoDB Connection
    await mongoose.connect(process.env.MONGO_URL!, {
      retryWrites: true,
      w: 'majority'
    });
    console.log("MongoDB Connected Successfully");

    // Kafka Connections
    await connectProducer();
    await connectConsumer();

    // Initialize Notification Processor
    const notificationProcessor = new NotificationProcessor();
    await notificationProcessor.startPriorityConsumer();

    // Start Express Server
    const port = process.env.NOTIFICATIONS_SERVICE_PORT!;
    app.listen(port, () => {
      console.log(`Notifications service running on port ${port}`);
    });

  } catch (error) {
    console.error('Notification Service Initialization Failed:', error);
    
    // Attempt graceful shutdown
    await producer.disconnect();
    await consumer.disconnect();
    
    process.exit(1);
  }
};

// Handle Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  await mongoose.connection.close();
  await producer.disconnect();
  await consumer.disconnect();
  process.exit(0);
});

main().catch(console.error);