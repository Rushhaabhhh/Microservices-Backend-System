import express, { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { isValidObjectId } from "mongoose";

import { Notification, NotificationPriority, NotificationType } from "./models";

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("common"));

interface NotificationRequest {
  userId: string;
  type: NotificationType;
  content: string;
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
  trackingId?: string;
}

/**
 * Validates the payload for creating a notification.
 */
const validateNotificationPayload = (
  req: Request<{}, {}, NotificationRequest>,
  res: Response,
  next: NextFunction
): void => {
  const { userId, type, content, priority } = req.body;

  const errors: string[] = [];

  if (!userId) errors.push("User ID is required");
  if (!Object.values(NotificationType).includes(type)) errors.push("Invalid notification type");
  if (!content?.trim()) errors.push("Notification content is required");
  if (priority && !Object.values(NotificationPriority).includes(priority)) {
    errors.push("Invalid notification priority");
  }

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  next();
};

/**
 * Generates a unique tracking ID for email notifications
 */
const generateTrackingId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Creates a notification manually.
 */
app.post(
  "/notifications",
  validateNotificationPayload,
  async (req: Request<{}, {}, NotificationRequest>, res: Response) => {
    try {
      const { userId, type, content, priority, metadata = {} } = req.body;

      // Generate tracking ID for email notifications
      const trackingId = type === NotificationType.EMAIL ? generateTrackingId() : undefined;

      const notification = new Notification({
        userId,
        type,
        content,
        priority: priority || NotificationPriority.STANDARD,
        metadata: {
          ...metadata,
          ...(trackingId && { trackingId }),
          createdAt: new Date(),
        },
        read: false,
      });

      await notification.save();

      res.status(201).json({
        message: "Notification created successfully",
        notification,
        ...(trackingId && {
          trackingUrl: `${process.env.API_BASE_URL}/notifications/track/${trackingId}`,
        }),
      });
    } catch (err) {
      console.error("Error creating notification:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

/**
 * Retrieves paginated notifications for a user.
 */
app.get("/notifications/user/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { priority, read, limit = 50, page = 1 } = req.query;

    const query: Record<string, any> = { userId };
    if (priority) query.priority = priority;
    if (read !== undefined) query.read = read === "true";

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ "metadata.createdAt": -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Notification.countDocuments(query),
    ]);

    res.json({
      results: notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

/**
 * Marks notifications as read for a user.
 */
app.patch("/notifications/user/:userId/read", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { priority, notificationIds } = req.body;

    if (notificationIds && (!Array.isArray(notificationIds) || !notificationIds.every(isValidObjectId))) {
      res.status(400).json({ error: "Invalid notification IDs provided" });
      return;
    }

    const query: Record<string, any> = { userId, read: false };
    if (priority) query.priority = priority;
    if (notificationIds?.length) query._id = { $in: notificationIds };

    const result = await Notification.updateMany(
      query,
      {
        $set: {
          read: true,
          "metadata.readAt": new Date(),
        },
      }
    );

    res.json({
      message: "Notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

/**
 * Tracks email opens using a unique tracking ID.
 */
app.get("/notifications/track/:trackingId", async (req: Request, res: Response) => {
  const { trackingId } = req.params;

  if (!trackingId) {
    res.status(400).send("Invalid tracking ID");
    return;
  }

  try {
    const result = await Notification.updateOne(
      {
        type: NotificationType.EMAIL,
        "metadata.trackingId": trackingId,
      },
      {
        $set: {
          read: true,
          "metadata.readAt": new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.warn(`No notification found with tracking ID: ${trackingId}`);
    }

    // Return a transparent 1x1 pixel GIF
    const transparentPixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": transparentPixel.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(transparentPixel);
  } catch (err) {
    console.error("Error tracking email open:", err);
    // Still return the pixel even if there's an error to avoid breaking email clients
    const transparentPixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": transparentPixel.length,
    });
    res.end(transparentPixel);
  }
});

export default app;