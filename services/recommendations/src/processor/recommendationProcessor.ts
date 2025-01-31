import axios from 'axios';
import { RedisClientType } from 'redis';

import { producer } from '../kafka';
import { Product, ProductsByCategoryResponse } from '../types';

export class RecommendationProcessor {
  private defaultCategory = 'Electronics';
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

  // Generate product recommendations for a user based on their purchase history
  async generateRecommendations(userId: string): Promise<void> {
    const purchaseHistory = await this.getUserPurchaseHistory(userId);
    
    if (!purchaseHistory.length) {
      await this.sendDefaultRecommendations(userId);
      return;
    }

    const recommendedProducts = await this.findRecommendedProducts(purchaseHistory);
    await this.sendRecommendationEvent(userId, recommendedProducts);
  }

  private async getUserPurchaseHistory(userId: string): Promise<any[]> {
    const userPurchaseHistoryKey = `user:${userId}:purchaseHistory`;
    const purchaseHistoryItems = await this.redisClient.lRange(userPurchaseHistoryKey, 0, -1);
    return purchaseHistoryItems.map(item => JSON.parse(item));
  }

  private async findRecommendedProducts(purchaseHistory: any[]): Promise<Product[]> {
    const categoryCount = this.getCategoryCount(purchaseHistory);
    const sortedCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .map(([category]) => category);

    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, '') || '';
    const purchasedProductIds = new Set(purchaseHistory.map(p => p.productId));

    // Try primary strategy
    const primaryRecommendations = await this.getPrimaryRecommendations(
      sortedCategories,
      productsServiceUrl,
      purchasedProductIds
    );
    if (primaryRecommendations.length > 0) {
      return primaryRecommendations.slice(0, 3);
    }

    // Try default category
    const defaultRecommendations = await this.getDefaultCategoryRecommendations(
      productsServiceUrl,
      purchasedProductIds
    );
    if (defaultRecommendations.length > 0) {
      return defaultRecommendations.slice(0, 3);
    }

    // Final fallback
    return this.defaultProducts.slice(0, 3);
  }

  // Count the number of purchases in each category
  private getCategoryCount(purchaseHistory: any[]): Record<string, number> {
    return purchaseHistory.reduce((acc: Record<string, number>, purchase) => {
      const category = purchase.category;
      if (category && category !== 'Unknown') {
        acc[category] = (acc[category] || 0) + purchase.quantity;
      }
      return acc;
    }, {});
  }

  private async getPrimaryRecommendations(
    categories: string[],
    productsServiceUrl: string,
    purchasedProductIds: Set<string>
  ): Promise<Product[]> {
    for (const category of categories) {
      try {
        const response = await axios.get<ProductsByCategoryResponse>(
          `${productsServiceUrl}/category`,
          { params: { category } }
        );

        const products = response.data?.data?.products || [];
        const recommendations = products.filter(
          product => !purchasedProductIds.has(product._id) && product.quantity > 0
        );

        if (recommendations.length > 0) {
          return recommendations;
        }
      } catch (error) {
        console.error(`Failed to fetch products for category ${category}:`, error);
      }
    }
    return [];
  }

  // Fallback to default category if primary strategy fails
  private async getDefaultCategoryRecommendations(
    productsServiceUrl: string,
    purchasedProductIds: Set<string>
  ): Promise<Product[]> {
    try {
      const response = await axios.get<ProductsByCategoryResponse>(
        `${productsServiceUrl}/category`,
        { params: { category: this.defaultCategory } }
      );

      const products = response.data?.data?.products || [];
      return products.filter(
        product => !purchasedProductIds.has(product._id) && product.quantity > 0
      );
    } catch (error) {
      console.error(`Failed to fetch products from default category:`, error);
      return [];
    }
  }

  // Send default recommendations if user has no purchase history
  private async sendDefaultRecommendations(userId: string): Promise<void> {
    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, '') || '';
    try {
      const response = await axios.get<ProductsByCategoryResponse>(
        `${productsServiceUrl}/category`,
        { params: { category: this.defaultCategory } }
      );

      const products = response.data?.data?.products || [];
      const recommendations = products
        .filter(product => product.quantity > 0)
        .slice(0, 3);

      if (recommendations.length > 0) {
        await this.sendRecommendationEvent(userId, recommendations);
      }
    } catch (error) {
      console.error(`Failed to send default recommendations for user ${userId}:`, error);
    }
  }

  // Send product recommendations to the recommendation-events topic
  private async sendRecommendationEvent(userId: string, products: Product[]): Promise<void> {
    const event = {
      type: 'PRODUCT_RECOMMENDATIONS',
      userId,
      timestamp: new Date().toISOString(),
      recommendations: products.map(product => ({
        productId: product._id,
        name: product.name,
        price: product.price,
        category: product.category,
      })),
    };

    await producer.send({
      topic: 'recommendation-events',
      messages: [{ key: userId, value: JSON.stringify(event) }],
    });
  }
}
