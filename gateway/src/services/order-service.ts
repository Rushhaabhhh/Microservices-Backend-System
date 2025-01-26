import { axios } from "../library/http";
import Axios from "axios";
import { Context } from "../types";
import { verify } from "jsonwebtoken";

const client = Axios.create({
  ...axios.defaults,
  baseURL: process.env["ORDERS_SERVICE_URL"],
});

const OrderService = {
  async getAll() {
    try {
      const response = await client.get("/");
      
      // Add name to products if missing
      const ordersWithProductNames = response.data.result.map((order: { products: any[]; }) => ({
        ...order,
        products: order.products.map((product: { name: any; _id: any; }) => ({
          ...product,
          name: product.name || `Product ${product._id}`
        }))
      }));
 
      return ordersWithProductNames;
    } catch (error) {
      console.error("Error fetching all orders:", (error as any));
      throw new Error("Unable to fetch orders.");
    }
  },
 
  async getById({ id }: { id: string }) {
    try {
      const response = await client.get(`/${id}`);
      
      // Add name to products if missing
      const orderWithProductNames = {
        ...response.data.result,
        products: response.data.result.products.map((product: { name: any; _id: any; }) => ({
          ...product,
          name: product.name || `Product ${product._id}`
        }))
      };
 
      return orderWithProductNames;
    } catch (error) {
      console.error(`Error fetching order with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to fetch order with ID: ${id}`);
    }
  },

  // Create a new order
  async post({ products }: { products: any }, context: Context) {
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

      const response = await client.post(
        `/`,
        { products },
        { headers: { "x-user-id": userId } }
      );

      // Check if 'data.result' exists
      if (!response.data || !response.data.result) {
        throw new Error("Unexpected response structure: Missing 'data.result'");
      }

      return response.data.result;
    } catch (error) {
      console.error("Error creating order:", (error as any).message);
      throw new Error((error as any).response?.data?.message || "Unable to create order.");
    }
  },

  // Update an order by ID
  async update({ id, input }: { id: string; input: any }) {
    try {
      const response = await client.put(`/${id}`, input);
      return response.data.result;
    } catch (error) {
      console.error(`Error updating order with ID ${id}:`, (error as any).message);
      throw new Error(`Unable to update order with ID: ${id}`);
    }
  },
} as const;

export { OrderService };
