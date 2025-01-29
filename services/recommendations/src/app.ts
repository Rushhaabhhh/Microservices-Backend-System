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

interface ProductsByCategoryResponse {
  data: {
    products: Product[];
  };
}

export class app {
  private defaultCategory = 'Electronics'; // Adjust as per your data
  private defaultProducts: Product[] = [
    {
      _id: 'default1',
      name: 'Standard Product 1',
      price: 19.99,
      quantity: 100,
      category: 'Default',
    },
    {
      _id: 'default2',
      name: 'Standard Product 2',
      price: 29.99,
      quantity: 100,
      category: 'Default',
    },
    {
      _id: 'default3',
      name: 'Standard Product 3',
      price: 39.99,
      quantity: 100,
      category: 'Default',
    },
  ];

  constructor(private redisClient: RedisClientType<any>) {}

  async processAllOrders() {
    try {
      console.log('Starting processAllOrders...');
      const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
      const response = await axios.get<OrdersResponse>(`${ordersServiceUrl}`);

      const orders: Order[] = response.data.result;
      // console.log(`Successfully retrieved ${orders.length} orders from response`);

      if (orders.length === 0) {
        console.log('No orders found to process.');
        return;
      }

      console.log('Starting to process each order...');
      for (const orderData of orders) {
        // console.log(`Processing order ${orderData._id}...`);
        // console.log('Order products:', JSON.stringify(orderData.products, null, 2));

        try {
          // console.log(`Updating local data for order ${orderData._id}`);
          await this.updateLocalOrderData(orderData);

          // console.log(`Updating purchase history for user ${orderData.userId}`);
          await this.updateUserPurchaseHistory(orderData);
        } catch (error) {
          // console.error(`Error processing order ${orderData._id}:`, error);
          continue;
        }
      }

      // console.log('Orders processed, generating recommendations...');
      const userIds = [...new Set(orders.map((order) => order.userId))];
      // console.log(`Generating recommendations for ${userIds.length} users`);

      for (const userId of userIds) {
        try {
          // console.log(`Generating recommendations for user ${userId}`);
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
      // console.log(`Starting updateLocalOrderData for order ${orderData._id}`);
      const orderKey = `order:${orderData._id}`;

      // console.log('Processing products:', JSON.stringify(orderData.products, null, 2));

      const orderDataToStore = {
        userId: orderData.userId,
        orderId: orderData._id,
        products: orderData.products.map((product: Product) => ({
          productId: product._id,
          quantity: product.quantity,
          name: product.name || 'Unknown Product',
          category: product.category || 'Unknown',
          price: product.price || 0,
        })),
        date: new Date().toISOString(),
      };

      // console.log(`Storing order data:`, JSON.stringify(orderDataToStore, null, 2));
      await this.redisClient.hSet(orderKey, {
        userId: orderDataToStore.userId,
        orderId: orderDataToStore.orderId,
        products: JSON.stringify(orderDataToStore.products),
        date: orderDataToStore.date,
      });
      // console.log(`Successfully stored order ${orderData._id} in Redis`);
    } catch (error) {
      console.error(`Error in updateLocalOrderData for order ${orderData._id}:`, error);
      throw error;
    }
  }

  private async updateUserPurchaseHistory(orderData: Order) {
    try {
      // console.log(`Starting updateUserPurchaseHistory for user ${orderData.userId}`);
      const userPurchaseHistoryKey = `user:${orderData.userId}:purchaseHistory`;

      for (const product of orderData.products) {
        let category = product.category;
        let price = product.price;
        let name = product.name;

        if (!category || !price || !name) {
          const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
          try {
            // console.log(`Fetching product details for ${product._id}`);
            const productResponse = await axios.get<ProductResponse>(
              `${productsServiceUrl}/id/${product._id}`
            );
            const productData = productResponse.data.data.product;
            category = productData.category;
            price = productData.price;
            name = productData.name;
            // console.log(`Retrieved product details: category=${category}, price=${price}, name=${name}`);
          } catch (err) {
            // console.error(`Error fetching product data for ${product._id}:`, err);
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

        // console.log(`Adding purchase record to history:`, JSON.stringify(purchaseRecord, null, 2));
        await this.redisClient.rPush(userPurchaseHistoryKey, JSON.stringify(purchaseRecord));
      }

      // console.log(`Successfully updated purchase history for user ${orderData.userId}`);
    } catch (error) {
      // console.error(`Error in updateUserPurchaseHistory for user ${orderData.userId}:`, error);
      throw error;
    }
  }

  private async generateAndSendRecommendations(userId: string) {
    try {
      const userPurchaseHistoryKey = `user:${userId}:purchaseHistory`;
      const purchaseHistoryItems = await this.redisClient.lRange(userPurchaseHistoryKey, 0, -1);

      if (!purchaseHistoryItems?.length) {
        // console.log(`No purchase history for user ${userId}; sending default recommendations.`);
        await this.sendDefaultRecommendations(userId);
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

      // console.log(`Category counts for user ${userId}:`, categoryCount);

      // Sort categories by count in descending order
      const sortedCategories = Object.entries(categoryCount)
        .sort(([, a], [, b]) => b - a)
        .map(([category]) => category);

      let recommendedProducts: Product[] = [];

      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, "") || '';

      // Primary Strategy: Top Categories
      for (const category of sortedCategories) {
        try {
          // console.log(`Fetching products for category ${category}`);
          const response = await axios.get<ProductsByCategoryResponse>(`${productsServiceUrl}/category`, {
            params: { category },
          });

          const allProductsInCategory = response.data?.data?.products;
          if (!Array.isArray(allProductsInCategory) || allProductsInCategory.length === 0) {
            console.warn(`No products found in category ${category}`);
            continue;
          }

          // console.log(`Fetched ${allProductsInCategory.length} products from category ${category}`);

          const purchasedProductIds = new Set(purchaseHistory.map((p) => p.productId));
          recommendedProducts = allProductsInCategory
            .filter(
              (product) =>
                !purchasedProductIds.has(product._id) && product.quantity > 0
            )
            .slice(0, 3);

          if (recommendedProducts.length > 0) {
            // console.log(`Found ${recommendedProducts.length} recommendations in category ${category}`);
            break; // Exit the loop if recommendations are found
          }
        } catch (error) {
          console.error(`Error fetching products for category ${category}:`, error);
          continue;
        }
      }

      // Fallback Strategy 1: Default Category
      if (recommendedProducts.length === 0 && this.defaultCategory) {
        // console.log(`No recommendations found in top categories. Fetching from default category (${this.defaultCategory}).`);
        try {
          const response = await axios.get<ProductsByCategoryResponse>(`${productsServiceUrl}/category`, {
            params: { category: this.defaultCategory },
          });

          const allProductsInDefaultCategory = response.data?.data?.products;
          if (Array.isArray(allProductsInDefaultCategory) && allProductsInDefaultCategory.length > 0) {
            const purchasedProductIds = new Set(purchaseHistory.map((p) => p.productId));
            recommendedProducts = allProductsInDefaultCategory
              .filter(
                (product) =>
                  !purchasedProductIds.has(product._id) && product.quantity > 0
              )
              .slice(0, 3); // At least one recommendation

            // console.log(`Fetched ${recommendedProducts.length} products from default category.`);
          } else {
            console.warn(`No products found in default category (${this.defaultCategory}).`);
          }
        } catch (error) {
          console.error(`Error fetching products for default category (${this.defaultCategory}):`, error);
        }
      }

      // Fallback Strategy 2: Any Available Product
      if (recommendedProducts.length === 0) {
        console.log(`No recommendations found in default category. Sending a default recommendation.`);
        // Use hardcoded default products
        recommendedProducts = this.defaultProducts.slice(0, 1);
        console.log(`Using default product for recommendation: ${JSON.stringify(recommendedProducts[0], null, 2)}`);
      }

      // Final Fallback: Ensure at least one recommendation
      if (recommendedProducts.length === 0) {
        console.log(`No recommendations available for user ${userId}; using hardcoded default.`);
        recommendedProducts = this.defaultProducts.slice(0, 1);
      }

      // Limit to 3 recommendations
      recommendedProducts = recommendedProducts.slice(0, 3);

      // console.log(`Found ${recommendedProducts.length} recommendations for user ${userId}`);

      await this.sendRecommendationEvent(userId, recommendedProducts);

      console.log(`Recommendations sent for user ${userId}`, {
        recommendationsCount: recommendedProducts.length,
      });
    } catch (error) {
      console.error(`Error generating recommendations for user ${userId}:`, error);
      throw error;
    }
  }

  private async sendDefaultRecommendations(userId: string) {
    try {
      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, "") || '';
      // console.log(`Fetching default recommendations from default category (${this.defaultCategory})`);

      const response = await axios.get<ProductsByCategoryResponse>(`${productsServiceUrl}/category`, {
        params: { category: this.defaultCategory },
      });

      const popularProducts = response.data?.data?.products;
      if (Array.isArray(popularProducts) && popularProducts.length > 0) {
        const recommendedProducts = popularProducts
          .filter((product) => product.quantity > 0)
          .slice(0, 1); // At least one recommendation

        if (recommendedProducts.length > 0) {
          await this.sendRecommendationEvent(userId, recommendedProducts);
          console.log(`Default recommendation sent for user ${userId}`);
          return;
        }
      }

      console.log(`No default recommendations available for user ${userId}`);
    } catch (error) {
      console.error(`Error sending default recommendations for user ${userId}:`, error);
    }
  }

  private async sendRecommendationEvent(userId: string, products: Product[]) {
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
            value: JSON.stringify(event),
          },
        ],
      });

      console.log('Recommendation event sent successfully', { userId, event });
    } catch (error) {
      console.error('Error sending recommendation event:', error);
      throw error;
    }
  }
}