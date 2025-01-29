import { axios } from "../library/http";
import Axios from "axios";

const client = Axios.create({
  ...axios.defaults,
  baseURL: process.env["USERS_SERVICE_URL"],
});

const UserService = {
  // Fetch all users
  async getAll() {
    try {
      const response = await client.get("/");
      return response.data.result; 
    } catch (error) {
      console.error("Error fetching all users:", (error as any));
      throw new Error("Unable to fetch users.");
    }
  },

  // Fetch a user by ID
  async getById({ _id }: { _id: string }) {
    try {
      if (!_id) {
        throw new Error('User ID is required');
      }
      const response = await client.get(`/${_id}`);
      return response.data.result;
    } catch (error) {
      console.error(`Error fetching user with ID ${_id}:`, (error as any).message);
      throw new Error(`Unable to fetch user with ID: ${_id}`);
    }
  },

  async createUser({ input }: { input: any }) {
    try {
      const response = await client.post("/", input);
  
      // Check if 'data' exists in the response
      if (!response.data || !response.data.result) {
        throw new Error("Unexpected response structure: Missing 'data.result'");
      }
  
      return response.data.result;
    } catch (error) {
      console.error("Error creating user:", (error as any));
      throw new Error((error as any).response.data.message); 
    }
  },

  // Login a user
  async loginUser({ input }: { input: { email: string; password: string } }) {
    try {
      const response = await client.post("/login", input);
  
      // Check if 'data' exists in the response
      if (!response.data || !response.data.result) {
        throw new Error("Unexpected response structure: Missing 'data.result'");
      }
  
      return response.data.result;
    } catch (error) {
      console.error("Error logging in:", (error as any));
      throw new Error((error as any).response?.data?.error || "Login failed");
    }
  },

  // Update user preferences
  async updatePreferences({ id, preferences }: { id: string; preferences: any }) {
    try {
      const response = await client.put(`/${id}/preferences`, preferences);
      return response.data.result;
    } catch (error) {
      console.error(`Error updating preferences for user ID ${id}:`, (error as any).message);
      throw new Error("Unable to update preferences.");
    }
  },

  // Delete a user
  async delete({ id }: { id: string }) {
    try {
      const response = await client.delete(`/${id}`);
      return response.data.result;
    } catch (error) {
      console.error(`Error deleting user with ID ${id}:`, (error as any).message);
      throw new Error("Unable to delete user.");
    }
  },
} as const;

export { UserService };