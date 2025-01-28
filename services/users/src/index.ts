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

main().then(() => {
    app.listen(process.env['USER_SERVICE_PORT'], () => {
        console.log(`Server is running on port ${process.env['USER_SERVICE_PORT']}`);
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