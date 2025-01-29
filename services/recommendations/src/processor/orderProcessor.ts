import axios from 'axios';
import { RedisClientType } from 'redis';
import { Order, OrdersResponse, ProductResponse } from '../types';

export class OrderProcessor {
  constructor(private redisClient: RedisClientType<any>) {}

  async processAllOrders() {
    try {
      const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
      const response = await axios.get<OrdersResponse>(ordersServiceUrl);
      const orders: Order[] = response.data.result;

      if (!orders.length) return;

      for (const order of orders) {
        await this.updateLocalOrderData(order);
        await this.updateUserPurchaseHistory(order);
      }

      return [...new Set(orders.map(order => order.userId))];
    } catch (error) {
      console.error('Error processing orders:', error);
      throw error;
    }
  }

  private async updateLocalOrderData(order: Order) {
    try {
      const orderKey = `order:${order._id}`;
      const orderDataToStore = {
        userId: order.userId,
        orderId: order._id,
        products: order.products.map(product => ({
          productId: product._id,
          quantity: product.quantity,
          name: product.name || 'Unknown',
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
    } catch (error) {
      console.error(`Error updating order ${order._id}:`, error);
    }
  }

  private async updateUserPurchaseHistory(order: Order) {
    try {
      const userKey = `user:${order.userId}:purchaseHistory`;

      for (const product of order.products) {
        let { category, price, name } = product;

        if (!category || !price || !name) {
          try {
            const productServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';
            const response = await axios.get<ProductResponse>(
              `${productServiceUrl}/id/${product._id}`
            );
            const productData = response.data.data.product;
            category = productData.category;
            price = productData.price;
            name = productData.name;
          } catch {
            category = 'Unknown';
            price = 0;
            name = `Product ${product._id}`;
          }
        }

        const purchaseRecord = {
          productId: product._id,
          category,
          quantity: product.quantity,
          price,
          name,
          date: new Date().toISOString(),
        };

        await this.redisClient.rPush(userKey, JSON.stringify(purchaseRecord));
      }
    } catch (error) {
      console.error(`Error updating purchase history for user ${order.userId}:`, error);
    }
  }
}