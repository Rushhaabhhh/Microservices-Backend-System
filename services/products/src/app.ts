import morgan from 'morgan';
import express from 'express';

import { Product } from './models';
import { producer } from './kafka';

const app = express();

app.use(express.json());
app.use(morgan('common'));

// Middleware for validating request bodies
const validateRequestBody =
  (schema: any) =>
  (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      res.status(400).json({ error: 'Invalid request body' });
    }
  };

// Utility function for validating MongoDB ObjectID
const isValidObjectId = (id: string): boolean => /^[a-fA-F0-9]{24}$/.test(id);

// Create Product Endpoint
app.post(
  '/',
  validateRequestBody({
    parse: (body: any) => {
      const { name, price, quantity, category } = body;

      if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new Error('Product name is required and must be a non-empty string');
      }
      if (typeof price !== 'number' || price <= 0) {
        throw new Error('Price must be a positive number');
      }
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error('Quantity must be a non-negative integer');
      }
      if (!category || typeof category !== 'string' || category.trim() === '') {
        throw new Error('Category is required and must be a non-empty string');
      }

      return { name: name.trim(), price, quantity, category: category.trim() };
    },
  }),
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
      res.status(500).json({ error: 'Unexpected error occurred' });
    }
  }
);

// Get Product by ID
app.get('/id/:id', async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate the ID manually
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ result: product });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
});

// Get All Products
app.get('/', async (req, res): Promise<void> => {
  try {
    const products = await Product.find({});
    res.json({ result: products });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
});

// Get Products by Category
app.get(
  '/category',
  async (req, res): Promise<void> => {
    try {
      const { category } = req.query;

      // Check if category is provided and not empty
      if (!category || typeof category !== 'string' || category.trim() === '') {
        res.status(400).json({ error: 'Category is required and must be a non-empty string' });
        return;
      }

      // Query the database for products in the category
      const products = await Product.find({ category: category.trim() });

      if (!products.length) {
        res.status(404).json({ error: `No products found in category: ${category}` });
        return;
      }

      res.status(200).json({ result: products });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected error occurred' });
    }
  }
);



export default app;
