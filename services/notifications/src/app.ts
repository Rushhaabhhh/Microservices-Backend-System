import express, { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import mongoose from "mongoose";

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
    const { userId, type, content, priority, email } = req.body;

    const notification = new Notification({
      userId,
      email,
      type,
      content,
      priority: priority || NotificationPriority.STANDARD,
    });

    await notification.save();

    res.status(201).json({
      message: "Notification created successfully",
      notification,
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

    const notifications = await Notification.find(query)
      .sort({ sentAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Notification.countDocuments(query);

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

    const query: any = { userId, read: false };
    if (priority) query.priority = priority;
    if (notificationIds) query._id = { $in: notificationIds };

    const result = await Notification.updateMany(query, { $set: { read: true } });

    res.json({
      message: "Notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

/**
 * Tracks email using a unique tracking URL.
 */
app.get("/track-email/:emailId", async (req: Request, res: Response) => {
  const { emailId } = req.params;

  if (!emailId) {
    res.status(400).send("Invalid request");
    return;
  }

  try {
    // Use the email field to update the read status
    const result = await Notification.updateOne(
      { email: emailId }, // Query by email
      { $set: { read: true, "metadata.readAt": new Date() } }
    );

    if (result.matchedCount === 0) {
      console.log("No email found with the given emailId");
      res.status(404).send("Email not found");
      return;
    }

    // Respond with a 1x1 transparent pixel image
    const img = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wQACfsD/QMKowAAAABJRU5ErkJggg==",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": img.length,
    });
    res.end(img);
  } catch (err) {
    console.error("Error updating read status:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});



export default app;
