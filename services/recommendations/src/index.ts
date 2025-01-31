import express from 'express';
import dotenv from 'dotenv';
import client from 'prom-client';

import { producer } from './kafka';
import { RecommendationService } from './scheduler';

dotenv.config();

// Create a Registry and configure default labels
const register = new client.Registry();
register.setDefaultLabels({
  app: 'recommendation-service'
});

// Define service metrics
const metrics = {
  orderProcessingDuration: new client.Histogram({
    name: 'order_processing_duration_seconds',
    help: 'Duration of order processing in seconds',
    buckets: [1, 2, 5, 10, 20, 30, 60]
  }),
  
  recommendationsGenerated: new client.Counter({
    name: 'recommendations_generated_total',
    help: 'Total number of recommendations generated'
  }),

  processingErrors: new client.Counter({
    name: 'processing_errors_total',
    help: 'Total number of processing errors',
    labelNames: ['error_type']
  }),

  redisConnectionStatus: new client.Gauge({
    name: 'redis_connection_status',
    help: 'Status of Redis connection (1 for connected, 0 for disconnected)'
  }),

  kafkaConnectionStatus: new client.Gauge({
    name: 'kafka_connection_status',
    help: 'Status of Kafka connection (1 for connected, 0 for disconnected)'
  })
};

// Register all metrics
Object.values(metrics).forEach(metric => register.registerMetric(metric));

client.collectDefaultMetrics({ register });


// Initialize Express app and recommendation service
const app = express();
const recommendationService = new RecommendationService();

app.use(express.json());
// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).send('Error collecting metrics');
  }
});

// Manual trigger endpoint (for testing)
app.post('/process', async (req, res) => {
  try {
    await recommendationService.processOrdersManually();
    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Global error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  metrics.processingErrors.inc({ error_type: 'unhandled' });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Service startup sequence
async function startServices() {
  try {
    await producer.connect();
    metrics.kafkaConnectionStatus.set(1);
    console.log('Kafka Producer connected successfully');

    // Start recommendation service
    await recommendationService.start();
    metrics.redisConnectionStatus.set(1);
    console.log('Recommendation Service started successfully');

    // Start HTTP server
    const PORT = process.env.PORT || '';
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start services:', error);
    metrics.processingErrors.inc({ error_type: 'startup' });
    process.exit(1);
  }
}

// Graceful shutdown handler
async function shutdownGracefully() {
  console.log('Initiating graceful shutdown...');
  try {
    await recommendationService.stop();
    metrics.redisConnectionStatus.set(0);
    
    await producer.disconnect();
    metrics.kafkaConnectionStatus.set(0);
    
    console.log('All services stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    metrics.processingErrors.inc({ error_type: 'shutdown' });
    process.exit(1);
  }
}

process.on('SIGTERM', shutdownGracefully);
process.on('SIGINT', shutdownGracefully);

if (require.main === module) {
  startServices();
}

export { app, metrics, register };