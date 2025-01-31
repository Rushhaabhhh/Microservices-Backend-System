import express from 'express';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import client from 'prom-client';

import app from './app';
import { producer } from "./kafka";

config();

const METRICS_PORT = process.env.METRICS_PORT;

// Create a Registry to register the metrics
const register = new client.Registry();

register.setDefaultLabels({
  app: 'user-service'
});

client.collectDefaultMetrics({ register });


// Expose metrics endpoint
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
  
const main = async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
        throw new Error("MONGO_URL is not defined in the environment variables");
    }
    await mongoose.connect(mongoUrl);
    await producer.connect();
}

const PORT = parseInt(process.env.USERS_SERVICE_PORT || '8000', 10); 

main().then(() => {
    app.listen(PORT, '0.0.0.0', () => { // Add '0.0.0.0' to bind to all interfaces
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(async (err) => {
    console.error(err);
    await producer.disconnect();
    process.exit(1);
});

// Start the metrics server
metricsApp.listen(METRICS_PORT, () => {
    console.log(`Metrics available at http://localhost:${METRICS_PORT}/metrics`);
});