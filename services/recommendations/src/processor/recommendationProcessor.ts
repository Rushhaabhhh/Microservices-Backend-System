import axios from 'axios';
import { RedisClientType } from 'redis';
import { producer } from '../kafka';

export class RecommendationProcessor {
  constructor(private redisClient: RedisClientType<any>) {}

  async generateRecommendations(userId: string) {
    try {
      const userKey = `user:${userId}:purchaseHistory`;
      const history = await this.redisClient.lRange(userKey, 0, -1);
      if (!history.length) return;

      const purchases = history.map(item => JSON.parse(item));
      const categoryCount = purchases.reduce((acc: Record<string, number>, p) => {
        if (p.category && p.category !== 'Unknown') acc[p.category] = (acc[p.category] || 0) + p.quantity;
        return acc;
      }, {});

      const topCategory = Object.entries(categoryCount).sort(([, a], [, b]) => b - a)[0]?.[0];
      if (!topCategory) return;

      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
      const response = await axios.get(`${productsServiceUrl}/category`, { params: { category: topCategory } });
      const allProducts = response.data?.data?.products;

      if (!Array.isArray(allProducts)) return;

      const purchasedIds = new Set(purchases.map(p => p.productId));
      const recommendations = allProducts.filter(p => !purchasedIds.has(p._id) && p.quantity > 0).slice(0, 3);

      if (recommendations.length) await this.sendRecommendationEvent(userId, recommendations);
    } catch (error) {
      console.error(`Error generating recommendations for user ${userId}:`, error);
    }
  }

  private async sendRecommendationEvent(userId: string, products: any[]) {
    try {
      const event = {
        type: 'PRODUCT_RECOMMENDATIONS',
        userId,
        timestamp: new Date().toISOString(),
        recommendations: products.map(p => ({
          productId: p._id,
          name: p.name,
          price: p.price,
          category: p.category,
        })),
      };

      await producer.send({
        topic: 'recommendation-events',
        messages: [{ key: userId, value: JSON.stringify(event) }],
      });
    } catch (error) {
      console.error('Error sending recommendation event:', error);
    }
  }
}
