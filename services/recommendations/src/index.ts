import express from 'express';
import { RecommendationService } from './scheduler';
import client from 'prom-client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize RecommendationService
const recommendationService = new RecommendationService();

// Start the RecommendationService
recommendationService.start().catch(error => {
  console.error('Failed to start Recommendation Service:', error);
  process.exit(1); // Exit the process if the service fails to start
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

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Recommendation Service server running on port ${PORT}`);
    console.log(`Order service URL: ${process.env.ORDER_SERVICE_URL}`);
  });
}

export default app;