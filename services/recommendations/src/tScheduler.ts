import dotenv from 'dotenv';
import { createClient, RedisClientType } from 'redis';
import cron from 'node-cron';
import { RecommendationProcessor } from './processor/recommendationProcessor';
import { OrderProcessor } from './processor/orderProcessor';

dotenv.config();

export class RecommendationService {
  private redisClient: RedisClientType<any>;
  private cronJob!: cron.ScheduledTask;
  private recommendationProcessor: RecommendationProcessor;
  private orderProcessor: OrderProcessor;

  constructor() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    this.recommendationProcessor = new RecommendationProcessor(this.redisClient);
    this.orderProcessor = new OrderProcessor(this.redisClient);
    this.initializeCronJob();
  }

  async start() {
    await this.redisClient.connect();
    console.log('Recommendation Service is running with daily order processing cron job...');
  }

  private initializeCronJob() {
    // Running every 2 minutes for testing. Adjust as needed.
    this.cronJob = cron.schedule(
      '*/2 * * * *',
      async () => {
        console.log('[RecommendationService] Starting order processing:', new Date().toISOString());
        try {
          const processedUserIds = await this.orderProcessor.processAllOrders();
          if (processedUserIds) {
            for (const userId of processedUserIds) {
              await this.recommendationProcessor.generateRecommendations(userId);
            }
          }
        } catch (error) {
          console.error('[RecommendationService] Error during order processing:', error);
        }
      },
      {
        scheduled: true,
        timezone: 'UTC',
      }
    );

    console.log('Cron job initialized to process orders every 2 minutes');
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