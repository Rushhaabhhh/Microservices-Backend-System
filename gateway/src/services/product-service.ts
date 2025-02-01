import Axios from "axios";
import { verify } from "jsonwebtoken";

import { Context } from "../types";
import { axios } from "../library/http";
import { cacheClient } from "../library/redis";


const client = Axios.create({
  ...axios.defaults,
  baseURL: process.env["PRODUCTS_SERVICE_URL"],
});

const ProductService = {
  // Fetch all products with cache handling
  async getAll() {
    try {
      const cached = await cacheClient.get("products/");
      if (cached) {
        console.log("products/ cache hit");
        return JSON.parse(cached);
      }

      // If cache not found, fetch from the service
      const response = await client.get("/");
      const data = response.data.result;

      // Cache the fetched data
      await cacheClient.set("products/", JSON.stringify(data));

      return data;
    } catch (error) {
      console.error("Error fetching all products:", (error as any));
      throw new Error("Unable to fetch products.");
    }
  },

  // Fetch a product by ID
  async getById({ id }: { id: string }) {
    try {
      const response = await client.get(`/id/${id}`);
      return response.data.result;
    } catch (error) {
      console.error(`Error fetching product with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to fetch product with ID: ${id}`);
    }
  },

  // Create a new product
  async post({ input }: { input: any }, context: Context) {
    try {
      const authorization = context.headers["authorization"];
      if (!authorization) throw new Error("Authorization header is missing.");

      // Extract and verify the token
      const token = authorization.split("Bearer ")[1];
      if (!token) throw new Error("Invalid authorization token.");

      const secret = process.env.API_SECRET;
      if (!secret) throw new Error("API secret is missing.");
      const payload = verify(token, secret) as unknown as { userId: string };
      const userId = payload.userId;

      const response = await client.post("/", input, { headers: { "x-user-id": userId } });

      // Check if 'data' exists in the response
      if (!response.data || !response.data.result) {
        throw new Error("Unexpected response structure: Missing 'data.result'");
      }

      return response.data.result;
    } catch (error) {
      console.error("Error creating product:", (error as any));
      throw new Error((error as any).response?.data?.message || "Unable to create product.");
    }
  },
} as const;

export { ProductService };
