import axios from 'axios';
import { RedisClientType } from 'redis';

import { OrdersResponse } from './types';
import { OrderProcessor } from './processor/orderProcessor';
import { RecommendationProcessor } from './processor/recommendationProcessor';

export class App {
  private orderProcessor: OrderProcessor;
  private recommendationProcessor: RecommendationProcessor;

  constructor(redisClient: RedisClientType<any>) {
    this.orderProcessor = new OrderProcessor(redisClient);
    this.recommendationProcessor = new RecommendationProcessor(redisClient);
  }

  async processAllOrders(): Promise<void> {
    try {
      const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
      const response = await axios.get<OrdersResponse>(ordersServiceUrl);
      const orders = response.data.result;

      if (orders.length === 0) {
        return;
      }

      const userIds = await this.orderProcessor.processOrders(orders);

      for (const userId of userIds) {
        try {
          await this.recommendationProcessor.generateRecommendations(userId);
        } catch (error) {
          console.error(`Failed to generate recommendations for user ${userId}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to process orders:', error);
      throw error;
    }
  }
}