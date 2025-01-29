// app.ts
import axios from 'axios';
import { RedisClientType } from 'redis';
import { producer } from './kafka';

interface Product {
  _id: string;
  quantity: number;
  name?: string;
  category?: string | null;
  price?: number | null;
}

interface Order {
  _id: string;
  userId: string;
  products: Product[];
  __v: number;
}

interface OrdersResponse {
  result: Order[]; 
}

interface ProductResponse {
  data: {
    product: {
      _id: string;
      name: string;
      price: number;
      quantity: number;
      category: string;
    };
  };
}

export class app {
  constructor(private redisClient: RedisClientType<any>) {}

  async processAllOrders() {
    try {
      console.log('Starting processAllOrders...');
      const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
      const response = await axios.get<OrdersResponse>(`${ordersServiceUrl}`);

      // Directly assign response.data.result to orders since it's already an array
      const orders: Order[] = response.data.result;
      console.log(`Successfully retrieved ${orders.length} orders from response`);

      if (orders.length === 0) {
        console.log('No orders found to process.');
        return;
      }

      console.log('Starting to process each order...');
      for (const orderData of orders) {
        console.log(`Processing order ${orderData._id}...`);
        console.log('Order products:', JSON.stringify(orderData.products, null, 2));

        try {
          console.log(`Updating local data for order ${orderData._id}`);
          await this.updateLocalOrderData(orderData);

          console.log(`Updating purchase history for user ${orderData.userId}`);
          await this.updateUserPurchaseHistory(orderData);
        } catch (error) {
          console.error(`Error processing order ${orderData._id}:`, error);
          continue;
        }
      }

      console.log('Orders processed, generating recommendations...');
      const userIds = [...new Set(orders.map((order) => order.userId))];
      console.log(`Generating recommendations for ${userIds.length} users`);

      for (const userId of userIds) {
        try {
          console.log(`Generating recommendations for user ${userId}`);
          await this.generateAndSendRecommendations(userId);
        } catch (error) {
          console.error(`Error generating recommendations for user ${userId}:`, error);
          continue;
        }
      }

      console.log('Daily order processing completed successfully.');
    } catch (error) {
      console.error('Error in processAllOrders:', error);
      throw error;
    }
  }

  private async updateLocalOrderData(orderData: Order) {
    try {
      console.log(`Starting updateLocalOrderData for order ${orderData._id}`);
      const orderKey = `order:${orderData._id}`;

      // Log the products data before processing
      console.log('Processing products:', JSON.stringify(orderData.products, null, 2));

      const orderDataToStore = {
        userId: orderData.userId,
        orderId: orderData._id,
        products: orderData.products.map((product: Product) => ({
          productId: product._id,
          quantity: product.quantity,
          name: product.name || 'Unknown Product',
          category: product.category || 'Unknown',
          price: product.price || 0,
        }),),
        date: new Date().toISOString(),
      };

      console.log(`Storing order data:`, JSON.stringify(orderDataToStore, null, 2));
      await this.redisClient.hSet(orderKey, {
        userId: orderDataToStore.userId,
        orderId: orderDataToStore.orderId,
        products: JSON.stringify(orderDataToStore.products),
        date: orderDataToStore.date,
      });
      console.log(`Successfully stored order ${orderData._id} in Redis`);
    } catch (error) {
      console.error(`Error in updateLocalOrderData for order ${orderData._id}:`, error);
      throw error;
    }
  }

  private async updateUserPurchaseHistory(orderData: Order) {
    try {
      console.log(`Starting updateUserPurchaseHistory for user ${orderData.userId}`);
      const userPurchaseHistoryKey = `user:${orderData.userId}:purchaseHistory`;

      for (const product of orderData.products) {
        let category = product.category;
        let price = product.price;
        let name = product.name;

        if (!category || !price || !name) {
          const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
          try {
            console.log(`Fetching product details for ${product._id}`);
            const productResponse = await axios.get<ProductResponse>(
              `${productsServiceUrl}/id/${product._id}`
            );
            const productData = productResponse.data.data.product;
            category = productData.category;
            price = productData.price;
            name = productData.name;
            console.log(`Retrieved product details: category=${category}, price=${price}, name=${name}`);
          } catch (err) {
            console.error(`Error fetching product data for ${product._id}:`, err);
            category = 'Unknown';
            price = 0;
            name = `Product ${product._id}`;
          }
        }

        const purchaseRecord = {
          productId: product._id,
          category: category,
          quantity: product.quantity,
          price: price,
          name: name,
          date: new Date().toISOString(),
        };

        console.log(`Adding purchase record to history:`, JSON.stringify(purchaseRecord, null, 2));
        await this.redisClient.rPush(userPurchaseHistoryKey, JSON.stringify(purchaseRecord));
      }

      console.log(`Successfully updated purchase history for user ${orderData.userId}`);
    } catch (error) {
      console.error(`Error in updateUserPurchaseHistory for user ${orderData.userId}:`, error);
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
  
      // Log category counts for debugging
      console.log(`Category counts for user ${userId}:`, categoryCount);
  
      const topCategory = Object.entries(categoryCount).sort(([, a], [, b]) => b - a)[0]?.[0];
  
      if (!topCategory) {
        console.log(`No top category found for user ${userId}; skipping recommendations.`);
        return;
      }
  
      console.log(`Top category for user ${userId}: ${topCategory}`);
  
      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
      const response = await axios.get(`${productsServiceUrl}/category`, {
        params: { category: topCategory },
      });
  
      // More robust extraction with validation
      const allProductsInCategory = response.data?.data?.products;
      if (!Array.isArray(allProductsInCategory)) {
        console.error(`Invalid products data received from products-service for category ${topCategory}`);
        return;
      }
  
      console.log(`Fetched ${allProductsInCategory.length} products from category ${topCategory}`);
  
      const purchasedProductIds = new Set(purchaseHistory.map((p) => p.productId));
      const recommendedProducts = allProductsInCategory
        .filter(
          (product: any) =>
            !purchasedProductIds.has(product._id) && product.quantity > 0
        )
        .slice(0, 3);
  
      console.log(`Found ${recommendedProducts.length} recommendations for user ${userId}`);
  
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
          productId: product._id,
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
            value: JSON.stringify(event),  // Ensure the event is properly stringified
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