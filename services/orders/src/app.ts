import { z } from "zod";
import axios from "axios";
import morgan from "morgan"; 
import express, { Request, Response, NextFunction } from "express";

import { Order } from "./models";
import { producer } from "./kafka";

const app = express();

app.use(express.json());
app.use(morgan("common"));

// Zod schemas for validation
const orderCreationSchema = z.object({
  products: z.array(
    z.object({
      _id: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid product ID"),
      quantity: z.number().min(1, "Quantity must be at least 1"),
    })
  ),
});

const orderIdParamSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid order ID"),
});

interface OrderProductInput {
  _id: string;
  quantity: number;
}

// Middleware for validating request bodies
const validateRequestBody =
  (schema: z.ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors });
      } else {
        res.status(400).json({ error: "Invalid request body" });
      }
    }
  };

// Middleware for validating request params
const validateRequestParams =
  (schema: z.ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors });
      } else {
        res.status(400).json({ error: "Invalid request parameters" });
      }
    }
  };

// Create a new order

app.post("/", validateRequestBody(orderCreationSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        message: "User authentication required"
      });
      return;
    }

    // Validate user
    try {
      await axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`);
    } catch (e) {
      console.error('User validation failed:', e);
      res.status(401).json({
        code: "INVALID_USER",
        message: "User not found or invalid"
      });
      return;
    }

    // Validate and enrich products
    const enrichedProducts = await Promise.all(
      req.body.products.map(async ({ _id, quantity }: OrderProductInput) => {
        try {
          const response = await axios.get(`${process.env.PRODUCTS_SERVICE_URL}/id/${_id}`);

          console.log('Product API response:', response.data);

          const product = response.data.result;

          if (!product || !product.name || !product.category || !product.price) {
            throw {
              status: 400,
              code: "PRODUCT_DATA_INCOMPLETE",
              message: `Product ${_id} has missing details`,
              details: { productId: _id, receivedData: product }
            };
          }

          if (product.quantity < quantity) {
            throw {
              status: 400,
              code: "INSUFFICIENT_QUANTITY",
              message: `Insufficient quantity for product ${_id}`,
              details: {
                productId: _id,
                requested: quantity,
                available: product.quantity
              }
            };
          }

          await axios.patch(`${process.env.PRODUCTS_SERVICE_URL}/${_id}`, {
            quantity: product.quantity - quantity
          });

          return {
            _id: product._id,
            quantity,
            name: product.name,
            category: product.category,
            price: product.price
          };
        } catch (error: any) {
          if (error.code) throw error;
          throw {
            status: 400,
            code: "PRODUCT_NOT_FOUND",
            message: `Product ${_id} not found`,
            details: { productId: _id }
          };
        }
      })
    );

    console.log('Enriched products:', enrichedProducts);

    // Create order
    const order = await Order.create({ 
      products: enrichedProducts, 
      userId 
    });

    // Emit event
    await producer.send({
      topic: "order-events",
      messages: [{
        value: JSON.stringify({
          userId: order.userId,
          orderId: order._id,
          eventType: 'order-placed',
          products: enrichedProducts
        })
      }]
    });

    res.status(201).json({ result: order });
  } catch (error: any) {
    console.error('Order creation failed:', error);
    res.status(error.status || 500).json({
      code: error.code || "ORDER_CREATION_FAILED",
      message: error.message || "Unexpected error occurred",
      details: error.details || {}
    });
  }
});

// Get Order by ID
app.get(
  "/:id",
  validateRequestParams(orderIdParamSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);

      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      res.json({ result: order });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Unexpected error occurred" });
      }
    }
  }
);

// Get all orders
app.get("/", async (req, res) => {
  try {
    const orders = await Order.find({});
    res.json({ result: orders });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Unexpected error occurred" });
    }
  }
});

export default app;