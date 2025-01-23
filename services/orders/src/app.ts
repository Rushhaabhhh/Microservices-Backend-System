import morgan from "morgan";
import express from "express";
import z from "zod";
import { Order } from "./models";
// import { producer } from "./kafka";

const app = express();

app.use(express.json());
app.use(morgan("common"));

// Zod schemas for validation
const orderCreationSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user ID"),
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
  (schema: z.ZodSchema) =>
  (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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
  (schema: z.ZodSchema) =>
  (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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
  async (req, res): Promise<void> => {
    try {
      const { userId, products } = req.body;

      // Create a new order
      const newOrder = await Order.create({ userId, products });

      // Publish an order-placed event to Kafka
    //   await producer.send({
    //     topic: "order-events",
    //     messages: [
    //       { value: JSON.stringify({ type: "order-placed", payload: newOrder }) },
    //     ],
    //   });

      // Return the created order
      res.status(201).json({ result: newOrder });
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
  async (req, res): Promise<void> => {
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
app.get("/", async (req, res): Promise<void> => {
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
