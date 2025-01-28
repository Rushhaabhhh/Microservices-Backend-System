import dotenv from 'dotenv';
import { createClient, RedisClientType } from 'redis';
import cron from 'node-cron';
import { app } from './app';

dotenv.config();

export class RecommendationService {
  private redisClient: RedisClientType<any>;
  private cronJob!: cron.ScheduledTask;
  private app: app;

  constructor() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    this.app = new app(this.redisClient);
    this.initializeCronJob();
  }

  async start() {
    await this.redisClient.connect();
    console.log('Recommendation Service is running with daily order processing cron job...');
  }

  private initializeCronJob() {
    this.cronJob = cron.schedule(
      '* * * * *',
      async () => {
        console.log('[RecommendationService] Starting daily order processing:', new Date().toISOString());
        try {
          await this.app.processAllOrders();
        } catch (error) {
          console.error('[RecommendationService] Error during daily order processing:', error);
        }
      },
      {
        scheduled: true,
        timezone: 'UTC',
      }
    );

    console.log('Cron job initialized to process all orders daily at 00:00 UTC');
  }

  async stop() {
    try {
      if (this.cronJob) {
        this.cronJob.stop();
      }
      await this.redisClient.disconnect();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}