import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import express from 'express';
import z from 'zod';

import { User } from './models';
import { signJWT } from './middleware';

const app = express();

app.use(express.json());
app.use(morgan('common'));

// Zod schemas for validation
const userRegistrationSchema = z.object({
  username: z.string().min(1, 'Username is required').trim(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const userIdParamSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid user ID'),
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

// User Registration Endpoint
app.post(
  '/',
  validateRequestBody(userRegistrationSchema),
  async (req, res): Promise<void> => {
    try {
      const { username, password } = req.body;

      const existingUser = await User.findOne({ username });
      if (existingUser) {
        res.status(400).json({ error: 'Username already exists' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({ username, password: hashedPassword });

      const token = signJWT(newUser.id);
      res.status(201).json({ result: { user: newUser, access_token: token } });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unexpected error occurred' });
      }
    }
  }
);

// Get User by ID
app.get(
  '/:id',
  validateRequestParams(userIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await User.findById(id);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ result: user });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unexpected error occurred' });
      }
    }
  }
);

// Get All Users
app.get('/', async (req, res): Promise<void> => {
  try {
    const users = await User.find({});
    res.json({ result: users });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unexpected error occurred' });
    }
  }
});

export default app;
