import Axios from "axios";
import { verify } from "jsonwebtoken";

import { Context } from "../types";
import { axios } from "../library/http";

const client = Axios.create({
  ...axios.defaults,
  baseURL: process.env["ORDERS_SERVICE_URL"],
});

interface OrderProductInput {
  _id: string;
  quantity: number;
}

interface Order {
  _id: string;
  userId: string;
  products: Array<{
    _id: string;
    quantity: number;
    name?: string;
    category?: string;
    price?: number;
  }>;
}

const OrderService = {
  async getAll() {
    try {
      const response = await client.get<{ result: Order[] }>("/");
      
      return response.data.result.map(order => ({
        ...order,
        products: order.products.map(product => ({
          ...product,
          name: product.name || `Product ${product._id}`
        }))
      }));
    } catch (error) {
      console.error("Error fetching all orders:", error);
      throw new Error("Unable to fetch orders.");
    }
  },
 
  async getById({ id }: { id: string }) {
    try {
      const response = await client.get<{ result: Order }>(`/${id}`);
      
      return {
        ...response.data.result,
        products: response.data.result.products.map(product => ({
          ...product,
          name: product.name || `Product ${product._id}`
        }))
      };
    } catch (error) {
      console.error(`Error fetching order with ID ${id}:`, error);
      throw new Error(`Unable to fetch order with ID: ${id}`);
    }
  },

  async post({ products }: { products: OrderProductInput[] }, context: Context) {
    try {
      const authorization = context.headers["authorization"];
      if (!authorization) throw new Error("Authorization header is missing");
  
      const token = authorization.split("Bearer ")[1];
      if (!token) throw new Error("Invalid authorization token");
  
      const secret = process.env.API_SECRET;
      if (!secret) throw new Error("API secret is missing");
  
      const payload = verify(token, secret) as { userId: string };
      const userId = payload.userId;
  
      const response = await client.post<{ result: Order }>(
        `/`,
        { products },
        { headers: { "x-user-id": userId } }
      );
  
      if (!response.data?.result) {
        throw new Error("Invalid response structure: Missing result");
      }
  
      return response.data.result;
    } catch (error: any) {
      console.error("Order creation failed:", error);
      throw new Error(error.response?.data?.message || "Unable to create order");
    }
  },

  async update({ id, input }: { id: string; input: Partial<Order> }) {
    try {
      const response = await client.put<{ result: Order }>(`/${id}`, input);
      return response.data.result;
    } catch (error) {
      console.error(`Error updating order with ID ${id}:`, error);
      throw new Error(`Unable to update order with ID: ${id}`);
    }
  },
} as const;

export { OrderService };
