import express from "express";
import { config } from "dotenv";
import mongoose from "mongoose";
import client from 'prom-client';


import app from "./app";
import { Product } from "./models";
import { consumer, producer } from "./kafka";
import { OrderEventPayload } from "./types";

config();

const METRICS_PORT = process.env.METRICS_PORT;

const register = new client.Registry();

register.setDefaultLabels({
  app: 'product-service'
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
    throw new Error("MONGO_URL is not defined in the environment variables");
  }

  await mongoose.connect(mongoUrl);
  await consumer.connect();
  await producer.connect();

  await consumer.subscribe({ topic: "order-events" });

  consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        console.error("Received message with null value");
        return;
      }

      const value = JSON.parse(message.value.toString()) as OrderEventPayload;
      console.log(`[TOPIC]: [${topic}] | PART: ${partition} | EVENT: ${value.type}`);

      if (value.type === "order-placed") {
        for (const product of value.payload.products) {
          const existingProduct = await Product.findById(product._id);
          if (existingProduct) {
            existingProduct.quantity -= product.quantity;
            await existingProduct.save();

            await producer.send({
              topic: "inventory-events",
              messages: [{
                value: JSON.stringify({ type: "product-updated", payload: product }),
              }],
            });
          }
        }
      }
    },
  });
};

main()
  .then(() => {
    app.listen(process.env["PRODUCTS_SERVICE_PORT"], () => {
      console.log(`Products service is running on port ${process.env["PRODUCTS_SERVICE_PORT"]}`);
    });
  })
  .catch(async (e) => {
    console.error(e);
    await consumer.disconnect();
    await producer.disconnect();
    process.exit(1);
  });

// Start the metrics server
metricsApp.listen(METRICS_PORT, () => {
  console.log(`Metrics available at http://localhost:${METRICS_PORT}/metrics`);
});