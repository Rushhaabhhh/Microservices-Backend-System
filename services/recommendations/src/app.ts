import mongoose from 'mongoose';
import { producer } from './kafka';
import { User, Product } from './models';

class RecommendationService {
  // Get user's purchase history and analyze categories
  async analyzeUserPurchases(userId: any) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Group purchases by category and count occurrences
      const categoryCount = user.purchaseHistory.reduce((acc: { [key: string]: number }, purchase) => {
        acc[purchase.category] = (acc[purchase.category] || 0) + purchase.quantity;
        return acc;
      }, {});

      // Find the most purchased category
      const mostOrderedCategory = Object.entries(categoryCount)
        .sort(([, a], [, b]) => b - a)[0]?.[0];

      return mostOrderedCategory;
    } catch (error) {
      console.error('Error analyzing user purchases:', error);
      throw error;
    }
  }

  // Find recommended products from the most ordered category
  async getRecommendedProducts(category: string, userId: any, limit = 3) {
    try {
      // Get user's already purchased products
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      const purchasedProductIds = user.purchaseHistory.map(p => p.productId);

      // Find products from the same category that user hasn't bought yet
      const recommendedProducts = await Product.find({
        category: category,
        _id: { $nin: purchasedProductIds },
        quantity: { $gt: 0 } // Only recommend products in stock
      }).limit(limit);

      return recommendedProducts;
    } catch (error) {
      console.error('Error getting recommended products:', error);
      throw error;
    }
  }

  // Send recommendation event to Kafka
  async sendRecommendationEvent(userId: { toString: () => any; }, products: any[]) {
    try {
      const event = {
        type: 'PRODUCT_RECOMMENDATIONS',
        userId: userId,
        timestamp: new Date().toISOString(),
        recommendations: products.map((product: { _id: any; name: any; price: any; category: any; }) => ({
          productId: product._id,
          name: product.name,
          price: product.price,
          category: product.category
        }))
      };

      await producer.send({
        topic: 'notifications',
        messages: [
          {
            key: userId.toString(),
            value: JSON.stringify(event)
          }
        ]
      });
    } catch (error) {
      console.error('Error sending recommendation event:', error);
      throw error;
    }
  }

  // Main method to generate and send recommendations
  async processUserRecommendations(userId: any) {
    try {
      // 1. Analyze user's purchase history
      const topCategory = await this.analyzeUserPurchases(userId);
      
      if (!topCategory) {
        console.log(`No purchase history found for user ${userId}`);
        return;
      }

      // 2. Get recommended products
      const recommendedProducts = await this.getRecommendedProducts(topCategory, userId);
      
      if (recommendedProducts.length === 0) {
        console.log(`No recommendations available for user ${userId} in category ${topCategory}`);
        return;
      }

      // 3. Send recommendations to notification service via Kafka
      await this.sendRecommendationEvent(userId, recommendedProducts);
      
      console.log(`Recommendations sent for user ${userId} based on category ${topCategory}`);
    } catch (error) {
      console.error('Error processing recommendations:', error);
      throw error;
    }
  }
}

// API endpoint handler example
async function handleRecommendationRequest(req: { params: { userId: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message?: string; error?: string; }): void; new(): any; }; }; }) {
  try {
    const recommendationService = new RecommendationService();
    await recommendationService.processUserRecommendations(req.params.userId);
    res.status(200).json({ message: 'Recommendations processed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process recommendations' });
  }
}

export { RecommendationService, handleRecommendationRequest };