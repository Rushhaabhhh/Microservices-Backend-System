import { config } from "dotenv";
config();

import mongoose from "mongoose";
import app from "./app";

const main = async () => {
  const mongoUri = process.env.MONGO_URL;
  if (!mongoUri) {
    throw new Error("MONGO_URL is not defined");
  }
  await mongoose.connect(mongoUri);
}

main()
  .then(() => {
    app.listen(process.env["PRODUCTS_SERVICE_PORT"], () => {
      console.log(
        `Products service is running on port ${process.env["PRODUCTS_SERVICE_PORT"]}`
      );
    });
  })
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  });