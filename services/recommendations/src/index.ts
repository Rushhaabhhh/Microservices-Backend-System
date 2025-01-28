// app.js
import express from 'express';
import { RecommendationService } from './app';
import client from 'prom-client';

const app = express();
app.use(express.json());

// Create custom metrics
const recommendationRequests = new client.Counter({
    name: 'recommendation_requests_total',
    help: 'Total number of recommendation requests',
    labelNames: ['status']
});

const recommendationProcessingTime = new client.Histogram({
    name: 'recommendation_processing_duration_seconds',
    help: 'Time spent processing recommendations',
    buckets: [0.1, 0.5, 1, 2, 5]
});

// Register custom metrics
client.register.registerMetric(recommendationRequests);
client.register.registerMetric(recommendationProcessingTime);

// Recommendation endpoint with metrics
app.get('/recommendations/:userId', async (req, res) => {
    const timer = recommendationProcessingTime.startTimer();
    try {
        const recommendationService = new RecommendationService();
        await recommendationService.processUserRecommendations(req.params.userId);
        recommendationRequests.inc({ status: 'success' });
        timer({ status: 'success' });
        res.status(200).json({ message: 'Recommendations processed successfully' });
    } catch (error) {
        recommendationRequests.inc({ status: 'error' });
        timer({ status: 'error' });
        res.status(500).json({ error: 'Failed to process recommendations' });
    }
});

export default app;