import morgan from "morgan";
import express from "express";
import z from "zod";
import { Notification } from "./models";

const app = express();

app.use(express.json());
app.use(morgan("common"));

// Zod schemas for validation
const notificationCreationSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user ID"),
  type: z.string(),
  content: z.union([z.string(), z.object({})]),
});

const userIdParamSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user ID"),
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

// Create a notification
app.post(
  "/",
  validateRequestBody(notificationCreationSchema),
  async (req, res): Promise<void> => {
    try {
      const notification = await Notification.create(req.body);
      res.status(201).json({ result: notification });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

// Get all notifications for a user
app.get(
  "/:userId",
  validateRequestParams(userIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;
      const notifications = await Notification.find({ userId }).sort({ sentAt: -1 });
      res.json({ result: notifications });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

// Get all unread notifications for a user
app.get(
  "/:userId",
  validateRequestParams(userIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;
      const unreadNotifications = await Notification.find({ userId, read: false }).sort({
        sentAt: -1,
      });
      res.json({ result: unreadNotifications });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

// Mark a notification as read
app.patch(
  "/:userId",
  validateRequestParams(userIdParamSchema),
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;
      await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
      res.status(200).json({ message: "All notifications marked as read." });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

export default app;

