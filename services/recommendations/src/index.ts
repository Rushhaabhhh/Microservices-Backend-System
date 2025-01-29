import express from 'express';
import { RecommendationService } from './scheduler';
import client from 'prom-client';
import dotenv from 'dotenv';
import { producer } from './kafka';  // Import Kafka producer

dotenv.config();

const app = express();
app.use(express.json());

// Initialize RecommendationService
const recommendationService = new RecommendationService();

// Start Kafka Producer
async function startKafkaProducer() {
  try {
    await producer.connect();
    console.log('Kafka Producer connected successfully');
  } catch (error) {
    console.error('Failed to connect Kafka Producer:', error);
    process.exit(1); // Exit if Kafka fails
  }
}

// Start RecommendationService & Kafka Producer
Promise.all([recommendationService.start(), startKafkaProducer()])
  .then(() => {
    console.log('Recommendation Service & Kafka Producer started');
  })
  .catch((error) => {
    console.error('Error initializing services:', error);
    process.exit(1);
  });

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error) {
    res.status(500).send('Error collecting metrics');
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await recommendationService.stop();
    await producer.disconnect();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Recommendation Service server running on port ${PORT}`);
  });
}

export default app;
