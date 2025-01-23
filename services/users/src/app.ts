import morgan from 'morgan';
import express from 'express';
import z from 'zod';
import bcrypt from "bcryptjs";


import { User } from './models';
import { signJWT } from './middleware';

const app = express();

app.use(express.json());
app.use(morgan('common'));

// Zod schemas for validation
const userRegistrationSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  email: z.string().min(6, 'email must be at least 6 characters long'),
  password: z.string().min(6, 'password must be at least 6 characters long'),
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
      const { name, email, password, preferences } = req.body;

      // Check if a user with the given email already exists
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        res.status(400).json({ error: 'Email already exists' });
        return;
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create a new user with default preferences if not provided
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        preferences: {
          promotions: preferences?.promotions ?? true,
          orderUpdates: preferences?.orderUpdates ?? true,
          recommendations: preferences?.recommendations ?? true,
        },
      });

      // Generate a JWT token
      const token = signJWT(newUser.id);

      // Return the created user and access token
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
