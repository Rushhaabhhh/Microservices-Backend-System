import express, { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { Notification, NotificationPriority, NotificationType } from "./models";
import { notificationProcessor } from "./processor";

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("common"));

// Validation middleware for notification creation
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

// Manually create a notification (for testing or manual intervention)
app.post(
  "/notifications", 
  validateNotificationPayload,
  async (req, res) => {
    try {
      const { userId, type, content, priority } = req.body;

      // Process and create notification
      const notification = await notificationProcessor.processNotification({
        userId,
        type,
        content,
        priority: priority || NotificationPriority.STANDARD
      });

      res.status(201).json({
        message: "Notification created successfully",
        result: notification
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ 
        error: err instanceof Error ? err.message : "Unexpected error" 
      });
    }
  }
);

// Get paginated notifications for a user
app.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      priority, 
      read, 
      limit = 50, 
      page = 1 
    } = req.query;

    // Build dynamic query
    const query: any = { userId };
    
    if (priority) query.priority = priority;
    if (read !== undefined) query.read = read === 'true';

    // Pagination
    const options = {
      limit: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      sort: { sentAt: -1 }
    };

    // Fetch notifications with pagination
    const [notifications, total] = await Promise.all([
      Notification.find(query, null, options),
      Notification.countDocuments(query)
    ]);

    res.json({
      result: notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ 
      error: err instanceof Error ? err.message : "Unexpected error" 
    });
  }
});

// Mark notifications as read
app.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { priority, notificationIds } = req.body;

    let updateQuery: any = { 
      userId, 
      read: false 
    };

    // Optional filtering by priority or specific notification IDs
    if (priority) updateQuery.priority = priority;
    if (notificationIds) updateQuery._id = { $in: notificationIds };

    const result = await Notification.updateMany(
      updateQuery,
      { $set: { read: true } }
    );

    res.json({
      message: "Notifications marked as read",
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ 
      error: err instanceof Error ? err.message : "Unexpected error" 
    });
  }
});

export default app;