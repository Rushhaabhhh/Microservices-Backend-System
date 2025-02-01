import Axios from "axios";

import { axios } from "../library/http";

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
      if (!response.data?.result?.access_token || !response.data?.result?.user) {
        throw new Error("Invalid login response");
      }
      
      return response.data.result;
    } catch (error) {
      console.error("Error logging in:", error);
      if (error instanceof Axios.AxiosError && error.response) {
        throw new Error(error.response.data?.error || "Login failed");
      } else {
        throw new Error("Login failed");
      }
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
} as const;

export { UserService };