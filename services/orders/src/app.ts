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
app.post(
  "/",
  validateRequestBody(orderCreationSchema),
  async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];

      // Validate user
      if (!userId) {
        res.status(401).send("Unauthorized");
        return;
      }

      try {
        await axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`);
      } catch (e) {
        console.error(e);
        res.status(401).send("Unauthorized");
        return;
      }

      // Validate product availability
      for (const { _id, quantity } of req.body.products) {
        try {
          const product = (
            await axios.get(`${process.env.PRODUCTS_SERVICE_URL}/${_id}`)
          ).data as { result: { _id: string; quantity: number } };

          if (product.result.quantity < quantity) {
            res.status(400).send("Insufficient product quantity");
            product.result.quantity = product.result.quantity - quantity;
            return;
          }
        } catch (e) {
          res.status(400).send(`Product ${_id} not found`);
          return;
        }
      }

      // Create order
      const order = await Order.create({ products: req.body.products, userId });

      // Publish an order-placed event to Kafka
      await producer.send({
        topic: "order-events",
        messages: [
          { value: JSON.stringify({
            userId: order.userId, 
            orderId: order._id,
            eventType: 'order-placed'
          }) 
        }],
      });

      res.status(201).json({ result: order });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Unexpected error occurred" });
      }
    }
  }
);

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