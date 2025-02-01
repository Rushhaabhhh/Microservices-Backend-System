import { z } from 'zod';
import morgan from 'morgan';
import express from 'express';
import bcrypt from 'bcryptjs';

import { User } from './models';
import { producer } from "./kafka";
import { signJWT } from './middleware';


const app = express();

// Middleware setup
app.use(express.json());
app.use(morgan('common'));

// Zod schemas for validation
const userRegistrationSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().min(6, 'Email must be at least 6 characters long'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const userIdParamSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid user ID'),
});

// New Zod schema for user login
const userLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

// Middleware for validating request bodies
const validateRequestBody = (schema: z.ZodSchema) => (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
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
const validateRequestParams = (schema: z.ZodSchema) => (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
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

// Get All Users
app.get('/', async (req, res): Promise<void> => {
  try {
    const users = await User.find({});
    res.json({ result: users });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

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
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);
// Create User
app.post(
  '/',
  validateRequestBody(userRegistrationSchema),
  async (req, res): Promise<void> => {
    try {
      const { name, email, password, preferences } = req.body;

      // Check if a user with the given email already exists
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        res.status(400).json({ error: 'Email already exists'
        });
        return
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
      res.status(201).json({
        result: {
          user: newUser,
          access_token: token,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Login User
app.post(
  '/login',
  validateRequestBody(userLoginSchema),
  async (req, res): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email });
      
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = signJWT(user.id);

      await producer.send({
        topic: "user-events",
        messages: [
          { 
            value: JSON.stringify({
              userId: user.id,
              email: user.email,
              eventType: 'user-login',
              details: {
                timestamp: new Date().toISOString(),
                loginMethod: 'email'
              }
            })
          }
        ],
      });

      res.json({
        result: {
          user: {
            _id: user.id,
            name: user.name,
            email: user.email,
            preferences: user.preferences,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          },
          access_token: token,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Update user preferences
app.put(
  '/:id/preferences',
  validateRequestParams(userIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      const preferences = req.body;

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: { preferences } },
        { new: true }
      );

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ result: updatedUser });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);

export default app;
