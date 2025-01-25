import express from "express";
import { config } from "dotenv";
import mongoose from "mongoose";
import client from 'prom-client';

import app from "./app";
import { consumer, producer } from "./kafka";


config();
const METRICS_PORT = process.env.METRICS_PORT ;

const register = new client.Registry();

register.setDefaultLabels({
  app: 'order-service'
});

client.collectDefaultMetrics({ register });

const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const main = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    throw new Error("MONGO_URL is not defined");
  }
  await mongoose.connect(mongoUrl);
  await producer.connect();

};

main()
  .then(() => {
    app.listen(process.env["ORDERS_SERVICE_PORT"], () => {
      console.log(
        `Orders service is running on port ${process.env["ORDERS_SERVICE_PORT"]}`
      );
    });
  })
  .catch(async (e) => {
    console.error(e);
    await producer.disconnect();
    await consumer.disconnect();
    process.exit(1);
  });

// Start the metrics server
metricsApp.listen(METRICS_PORT, () => {
  console.log(`Metrics available at http://localhost:${METRICS_PORT}/metrics`);
});