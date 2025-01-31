import axios from 'axios';
import { RedisClientType } from 'redis';

import { Order, Product } from '../types';

export class OrderProcessor {
  constructor(private redisClient: RedisClientType<any>) {}

  async processOrders(orders: Order[]): Promise<string[]> {
    const userIds = new Set<string>();

    for (const order of orders) {
      try {
        await this.updateLocalOrderData(order);
        await this.updateUserPurchaseHistory(order);
        userIds.add(order.userId);
      } catch (error) {
        console.error(`Failed to process order ${order._id}:`, error);
      }
    }

    return Array.from(userIds);
  }

  // Update the local order data in Redis
  private async updateLocalOrderData(order: Order) {
    const orderKey = `order:${order._id}`;
    const orderDataToStore = {
      userId: order.userId,
      orderId: order._id,
      products: order.products.map((product: Product) => ({
        productId: product._id,
        quantity: product.quantity,
        name: product.name || 'Unknown Product',
        category: product.category || 'Unknown',
        price: product.price || 0,
      })),
      date: new Date().toISOString(),
    };

    await this.redisClient.hSet(orderKey, {
      userId: orderDataToStore.userId,
      orderId: orderDataToStore.orderId,
      products: JSON.stringify(orderDataToStore.products),
      date: orderDataToStore.date,
    });
  }

  // Update the user's purchase history in Redis
  private async updateUserPurchaseHistory(order: Order) {
    const userPurchaseHistoryKey = `user:${order.userId}:purchaseHistory`;
    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';

    for (const product of order.products) {
      const productDetails = await this.getProductDetails(product, productsServiceUrl);
      const purchaseRecord = {
        productId: product._id,
        category: productDetails.category,
        quantity: product.quantity,
        price: productDetails.price,
        name: productDetails.name,
        date: new Date().toISOString(),
      };

      await this.redisClient.rPush(userPurchaseHistoryKey, JSON.stringify(purchaseRecord));
    }
  }

  // Fetch product details from the Products service
  private async getProductDetails(product: Product, productsServiceUrl: string) {
    if (product.category && product.price && product.name) {
      return {
        category: product.category,
        price: product.price,
        name: product.name,
      };
    }

    try {
      const response = await axios.get(`${productsServiceUrl}/id/${product._id}`);
      const productData = response.data.data.product;
      return {
        category: productData.category,
        price: productData.price,
        name: productData.name,
      };
    } catch (err) {
      return {
        category: 'Unknown',
        price: 0,
        name: `Product ${product._id}`,
      };
    }
  }
}
