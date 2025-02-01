import dotenv from 'dotenv';
import cron from 'node-cron';
import { createClient, RedisClientType } from 'redis';

import { App } from './app';

dotenv.config();

export class RecommendationService {
  private redisClient: RedisClientType<any>;
  private cronJob!: cron.ScheduledTask;
  private app: App;
  private isRunning: boolean = false;

  constructor() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    this.app = new App(this.redisClient);
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    try {
      await this.redisClient.connect();
      this.initializeCronJob();
      this.isRunning = true;
      console.log('Recommendation Service started successfully');
    } catch (error) {
      console.error('Failed to start Recommendation Service:', error);
      throw error;
    }
  }

  private initializeCronJob() {
    // Run every day at midnight UTC
    this.cronJob = cron.schedule(
      '*/5 * * * *',
      async () => {
        console.log('Starting daily order processing:', new Date().toISOString());
        try {
          await this.app.processAllOrders();
        } catch (error) {
          console.error('Error during daily order processing:', error);
        }
      },
      {
        scheduled: true,
        timezone: 'UTC',
      }
    );
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.cronJob?.stop();
      await this.redisClient.disconnect();
      this.isRunning = false;
      console.log('Recommendation Service stopped successfully');
    } catch (error) {
      console.error('Error during service shutdown:', error);
      throw error;
    }
  }

  // Method to manually trigger order processing
  async processOrdersManually() {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }
    return this.app.processAllOrders();
  }
}