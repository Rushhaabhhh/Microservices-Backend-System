import express from 'express';
import morgan from 'morgan';
import z from 'zod';

import { Product } from './models';
import { producer } from './kafka'; 

const app = express();

app.use(express.json());
app.use(morgan('common'));

// Zod schema for product validation
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').trim(),
  price: z.number().positive('Price must be greater than zero'),
  quantity: z.number().int().nonnegative('Quantity must be a non-negative integer'),
  category: z.string().min(1, 'Category is required').trim(),
});

// Zod schema for product ID validation
const productIdParamSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid product ID'),
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
        res.status(400).json({ error: 'Invalid request body' });
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
        res.status(400).json({ error: 'Invalid request parameters' });
      }
    }
  };

// Create Product Endpoint
app.post(
  '/',
  validateRequestBody(productSchema),
  async (req, res): Promise<void> => {
    try {
      const product = await Product.create(req.body);

      // Send Kafka event for product creation
      await producer.send({
        topic: 'inventory-events',
        messages: [
          {
            value: JSON.stringify({
              type: 'product-created',
              payload: product,
            }),
          },
        ],
      });

      res.status(201).json({ result: product });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unexpected error occurred' });
      }
    }
  }
);

// Get Product by ID
app.get(
  '/:id',
  validateRequestParams(productIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      const product = await Product.findById(id);

      if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      res.json({ result: product });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unexpected error occurred' });
      }
    }
  }
);

// Get All Products
app.get('/', async (req, res): Promise<void> => {
  try {
    const products = await Product.find({});
    res.json({ result: products });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unexpected error occurred' });
    }
  }
});

export default app;
