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

const orderSyncRequests = new client.Counter({
    name: 'order_sync_requests_total',
    help: 'Total number of order sync requests',
    labelNames: ['status']
});

const orderSyncProcessingTime = new client.Histogram({
    name: 'order_sync_processing_duration_seconds',
    help: 'Time spent syncing orders',
    buckets: [0.1, 0.5, 1, 2, 5]
});

const ordersProcessed = new client.Counter({
    name: 'orders_processed_total',
    help: 'Total number of orders processed'
});

// Register custom metrics
client.register.registerMetric(recommendationRequests);
client.register.registerMetric(recommendationProcessingTime);
client.register.registerMetric(orderSyncRequests);
client.register.registerMetric(orderSyncProcessingTime);
client.register.registerMetric(ordersProcessed);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', client.register.contentType);
        res.end(await client.register.metrics());
    } catch (error) {
        res.status(500).send('Error collecting metrics');
    }
});
// Manual order sync endpoint
app.post('/sync-orders', async (req, res) => {
    const timer = orderSyncProcessingTime.startTimer();
    try {
        const recommendationService = new RecommendationService();
        const syncedOrders = await recommendationService.syncOrders();
        
        orderSyncRequests.inc({ status: 'success' });
        ordersProcessed.inc(syncedOrders);
        timer({ status: 'success' });
        
        res.status(200).json({ 
            message: 'Orders synced successfully',
            ordersProcessed: syncedOrders
        });
    } catch (error) {
        orderSyncRequests.inc({ status: 'error' });
        timer({ status: 'error' });
        res.status(500).json({ error: 'Failed to sync orders' });
    }
});

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
        res.status(500).json({ 
            error: 'Failed to process recommendations',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Order service URL: ${process.env.ORDER_SERVICE_URL}`);
    });
}

export default app;