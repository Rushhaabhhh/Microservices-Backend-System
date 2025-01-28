import axios from 'axios';
import { producer } from './kafka';
import { User, Product, Order } from './models';

class RecommendationService {
  private orderServiceUrl: string;

  constructor() {
    this.orderServiceUrl = process.env.ORDER_SERVICE_URL || '';
  }

  // Fetch orders from external service and store them
  async syncOrders() {
    try {
      const response = await axios.get(this.orderServiceUrl);
      const orders = response.data;

      for (const order of orders) {
        await Order.findOneAndUpdate(
          { orderId: order._id },
          { 
            userId: order.userId,
            products: order.products.map((p: any) => ({
              productId: p._id,
              quantity: p.quantity,
              name: p.name,
              category: p.category,
              price: p.price
            }))
          },
          { upsert: true, new: true }
        );

        // Update user's purchase history
        await User.findByIdAndUpdate(
          order.userId,
          {
            $push: {
              purchaseHistory: {
                $each: order.products.map((p: any) => ({
                  productId: p._id,
                  category: p.category,
                  quantity: p.quantity,
                  price: p.price,
                  date: order.date
                }))
              }
            }
          }
        );
      }

      return orders.length;
    } catch (error) {
      console.error('Error syncing orders:', error);
      throw error;
    }
  }

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
        quantity: { $gt: 0 }
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
        recommendations: products.map(product => ({
          productId: product._id,
          name: product.name,
          price: product.price,
          category: product.category
        }))
      };

      await producer.send({
        topic: 'recommendation-event',
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
      // 0. Sync latest orders
      await this.syncOrders();

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

export { RecommendationService };