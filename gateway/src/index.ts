import express from 'express';
import { config } from "dotenv";
import client from 'prom-client';

import app from "./app";

config();
const METRICS_PORT = process.env.METRICS_PORT;


const register = new client.Registry();

register.setDefaultLabels({
  app: 'graphql-gateway'
});

client.collectDefaultMetrics({ register });

const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

import { consumer } from "./library/kafka";
import { cacheClient } from "./library/redis";

const PORT = parseInt(process.env.PORT || '4000', 10);

const main = async () => {
    await cacheClient.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: "inventory-events" });
    await consumer.run({
        eachMessage: async ({ topic, partition }) => {
            console.log(`[TOPIC]: [${topic}] | PART: ${partition}`);
            await cacheClient.del("products/");
        },
    });
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Running a GraphQL API server at http://localhost:${PORT}/graphql`);
    });
};

main().catch(async (e) => {
  console.error(e);
  await consumer.disconnect();
  process.exit(1);
});

metricsApp.listen(METRICS_PORT, () => {
  console.log(`📊 Metrics available at http://localhost:${METRICS_PORT}/metrics`);
});