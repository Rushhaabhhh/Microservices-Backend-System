import { config } from "dotenv";
config();

import mongoose from "mongoose";
import app from "./app";

import { consumer, producer } from "./kafka";


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