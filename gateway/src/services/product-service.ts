import { axios } from "../library/http";
import Axios from "axios";
import { cacheClient } from "../library/redis";
import { Context } from "../types";

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
      const response = await client.get(`/${id}`);
      return response.data.result;
    } catch (error) {
      console.error(`Error fetching product with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to fetch product with ID: ${id}`);
    }
  },

  // Create a new product
  async post({ input }: { input: any }, context: Context) {
    try {
      const apiKey = context.headers["x-api-key"];
      if (!apiKey || apiKey !== process.env["API_SECRET"]) {
        throw new Error("Invalid API key");
      }

      const response = await client.post("/", input);

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

  // Update a product by ID
  async update({ id, input }: { id: string; input: any }) {
    try {
      const response = await client.put(`/${id}`, input);
      return response.data.result;
    } catch (error) {
      console.error(`Error updating product with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to update product with ID: ${id}`);
    }
  },

  // Delete a product by ID
  async delete({ id }: { id: string }) {
    try {
      const response = await client.delete(`/${id}`);
      return response.data.result;
    } catch (error) {
      console.error(`Error deleting product with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to delete product with ID: ${id}`);
    }
  },
} as const;

export { ProductService };
