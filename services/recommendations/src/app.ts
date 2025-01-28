import axios from 'axios';
import { RedisClientType } from 'redis';
import { producer } from './kafka';

export class app {
  constructor(private redisClient: RedisClientType<any>) {}

  async processAllOrders() {
    try {
      const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
      const response = await axios.get(`${ordersServiceUrl}`);
      const data = response.data;
      console.log('Orders:', data);

      let orders: any[] = [];
      if (Array.isArray(data)) {
        orders = data;
      } else if (Array.isArray(data.orders)) {
        orders = data.orders;
      } else if (Array.isArray(data.result)) {
        orders = data.result;
      } else {
        console.error('Unexpected orders data format:', data);
        orders = [];
      }

      if (orders.length === 0) {
        console.log('No orders found to process.');
        return;
      }

      console.log(`Processing ${orders.length} orders...`);

      for (const orderData of orders) {
        await this.updateLocalOrderData(orderData);
        await this.updateUserPurchaseHistory(orderData);
      }

      const userIds = [...new Set(orders.map((order: any) => order.userId))];
      for (const userId of userIds) {
        await this.generateAndSendRecommendations(userId);
      }

      console.log('Daily order processing completed.');
    } catch (error) {
      console.error('Error fetching or processing orders:', error);
      throw error;
    }
  }

  private async updateLocalOrderData(orderData: any) {
    try {
      const orderId = orderData._id || orderData.orderId;
      const orderKey = `order:${orderId}`;

      const orderDataToStore = {
        userId: orderData.userId,
        orderId: orderId,
        products: JSON.stringify(
          orderData.products.map((product: any) => ({
            productId: product._id || product.productId,
            quantity: product.quantity,
            name: product.name,
            category: product.category || 'Unknown',
            price: product.price || 0,
          }))
        ),
        date: new Date(orderData.createdAt || Date.now()).toISOString(),
      };

      await this.redisClient.hSet(orderKey, orderDataToStore);
      console.log(`Order ${orderId} synchronized for user ${orderData.userId}`);
    } catch (error) {
      console.error(`Error updating local order data for order ${orderData.orderId}:`, error);
      throw error;
    }
  }

  private async updateUserPurchaseHistory(orderData: any) {
    try {
      const userPurchaseHistoryKey = `user:${orderData.userId}:purchaseHistory`;

      for (const product of orderData.products) {
        let category = product.category;

        if (!category || category === 'Unknown') {
          const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
          const productId = product._id || product.productId;

          try {
            const productResponse = await axios.get(`${productsServiceUrl}/id/${productId}`);
            const productData = productResponse.data;
            category = productData.category || 'Unknown';
          } catch (err) {
            console.error(`Error fetching product data for product ${productId}:`, err);
            category = 'Unknown';
          }
        }

        const purchaseRecord = JSON.stringify({
          productId: product._id || product.productId,
          category: category,
          quantity: product.quantity,
          price: product.price || 0,
          name: product.name,
          date: new Date(orderData.createdAt || Date.now()).toISOString(),
        });
        await this.redisClient.rPush(userPurchaseHistoryKey, purchaseRecord);
      }

      console.log(`Purchase history updated for user ${orderData.userId}`);
    } catch (error) {
      console.error(`Error updating purchase history for user ${orderData.userId}:`, error);
      throw error;
    }
  }

  private async generateAndSendRecommendations(userId: string) {
    try {
      const userPurchaseHistoryKey = `user:${userId}:purchaseHistory`;
      const purchaseHistoryItems = await this.redisClient.lRange(userPurchaseHistoryKey, 0, -1);

      if (!purchaseHistoryItems?.length) {
        console.log(`No purchase history for user ${userId}; skipping recommendations.`);
        return;
      }

      const purchaseHistory = purchaseHistoryItems.map((item) => JSON.parse(item));
      const categoryCount = purchaseHistory.reduce(
        (acc: { [key: string]: number }, purchase) => {
          const category = purchase.category;
          if (category && category !== 'Unknown') {
            acc[category] = (acc[category] || 0) + purchase.quantity;
          }
          return acc;
        },
        {}
      );

      const topCategory = Object.entries(categoryCount).sort(([, a], [, b]) => b - a)[0]?.[0];

      if (!topCategory) {
        console.log(`No top category found for user ${userId}; skipping recommendations.`);
        return;
      }

      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
      const response = await axios.get(`${productsServiceUrl}/category`, {
        params: { category: topCategory },
      });
      const allProductsInCategory = response.data || [];

      const purchasedProductIds = new Set(purchaseHistory.map((p) => p.productId));
      const recommendedProducts = allProductsInCategory
        .filter(
          (product: any) =>
            !purchasedProductIds.has(product._id || product.productId) && product.quantity > 0
        )
        .slice(0, 3);

      if (recommendedProducts.length === 0) {
        console.log(`No recommendations available for user ${userId} in category ${topCategory}`);
        return;
      }

      await this.sendRecommendationEvent(userId, recommendedProducts);

      console.log(`Recommendations sent for user ${userId}`, {
        category: topCategory,
        recommendationsCount: recommendedProducts.length,
      });
    } catch (error) {
      console.error(`Error generating recommendations for user ${userId}:`, error);
      throw error;
    }
  }

  private async sendRecommendationEvent(userId: string, products: any[]) {
    try {
      const event = {
        type: 'PRODUCT_RECOMMENDATIONS',
        userId: userId,
        timestamp: new Date().toISOString(),
        recommendations: products.map((product) => ({
          productId: product._id || product.productId,
          name: product.name,
          price: product.price,
          category: product.category,
        })),
      };

      await producer.send({
        topic: 'recommendation-events',
        messages: [
          {
            key: userId,
            value: JSON.stringify(event),
          },
        ],
      });

      console.log('Recommendation event sent successfully', { userId });
    } catch (error) {
      console.error('Error sending recommendation event:', error);
      throw error;
    }
  }
}