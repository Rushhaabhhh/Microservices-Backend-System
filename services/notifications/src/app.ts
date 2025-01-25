import morgan from "morgan";
import express, { Request, Response, NextFunction } from "express";

import { NotificationProcessorService } from "./processor";
import { Notification, NotificationPriority, NotificationType } from "./models";

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("common"));

/**
 * Validates the payload for creating a notification.
 */
const validateNotificationPayload = (req: Request, res: Response, next: NextFunction): void => {
  const { userId, type, content, priority } = req.body;

  if (!userId) {
    res.status(400).json({ error: "User ID is required" });
    return;
  }
  if (!Object.values(NotificationType).includes(type)) {
    res.status(400).json({ error: "Invalid notification type" });
    return;
  }
  if (!content) {
    res.status(400).json({ error: "Notification content is required" });
    return;
  }
  if (priority && !Object.values(NotificationPriority).includes(priority)) {
    res.status(400).json({ error: "Invalid notification priority" });
    return;
  }

  next();
};

/**
 * Creates a notification manually.
 */
app.post("/notifications", validateNotificationPayload, async (req: Request, res: Response) => {
  try {
    const { userId, type, content, priority } = req.body;

    const notification = await NotificationProcessorService.createNotificationForEvent({
      userId,
      type,
      content,
      priority: priority || NotificationPriority.STANDARD,
    });

    res.status(201).json({
      message: "Notification created successfully",
      result: notification,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

/**
 * Retrieves paginated notifications for a user.
 */
app.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { priority, read, limit = 50, page = 1 } = req.query;

    const query: any = { userId };
    if (priority) query.priority = priority;
    if (read !== undefined) query.read = read === "true";

    const options = {
      limit: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      sort: { sentAt: -1 },
    };

    const [notifications, total] = await Promise.all([
      Notification.find(query, null, options),
      Notification.countDocuments(query),
    ]);

    res.json({
      result: notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

/**
 * Marks notifications as read for a user.
 */
app.patch("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { priority, notificationIds } = req.body;

    const updateQuery: any = { userId, read: false };
    if (priority) updateQuery.priority = priority;
    if (notificationIds) updateQuery._id = { $in: notificationIds };

    const result = await Notification.updateMany(updateQuery, { $set: { read: true } });

    res.json({
      message: "Notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

export default app;
