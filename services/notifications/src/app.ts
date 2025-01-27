import morgan from "morgan";
import express, { Request, Response, NextFunction, Application } from "express";
import { NotificationProcessorService } from "./EventProcessor/processor";
import { Notification, NotificationPriority, NotificationType } from "./models";

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("common"));

// Validation middleware
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

// Create notification
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

// Get notifications with enhanced filtering
app.get("/notifications/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { 
      priority, 
      read, 
      type,
      startDate,
      endDate,
      limit = 50, 
      page = 1 
    } = req.query;

    const query: any = { userId };
    
    // Apply filters
    if (priority) query.priority = priority;
    if (read !== undefined) query.read = read === "true";
    if (type) query.type = type;
    
    // Date range filter
    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) query.sentAt.$gte = new Date(startDate as string);
      if (endDate) query.sentAt.$lte = new Date(endDate as string);
    }

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

// Get unread count
app.get("/notifications/:userId/unread-count", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { priority, type } = req.query;

    const query: any = { userId, read: false };
    if (priority) query.priority = priority;
    if (type) query.type = type;

    const count = await Notification.countDocuments(query);

    res.json({
      userId,
      unreadCount: count,
      filters: { priority, type }
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

// Mark notifications as read
app.patch("/notifications/:userId/mark-read", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { notificationIds, markAll, priority, type } = req.body;

    const updateQuery: any = { userId, read: false };

    // Handle different update scenarios
    if (notificationIds?.length > 0) {
      updateQuery._id = { $in: notificationIds };
    } else if (!markAll) {
      res.status(400).json({ 
        error: "Either provide notificationIds or set markAll to true" 
      });
      return;
    }

    if (priority) updateQuery.priority = priority;
    if (type) updateQuery.type = type;

    const result = await Notification.updateMany(
      updateQuery,
      { 
        $set: { 
          read: true,
          readAt: new Date()
        } 
      }
    );

    res.json({
      message: "Notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

// Mark notifications as unread
app.patch("/notifications/:userId/mark-unread", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { notificationIds } = req.body;

    if (!notificationIds?.length) {
      res.status(400).json({ 
        error: "NotificationIds are required" 
      });
      return;
    }

    const result = await Notification.updateMany(
      { 
        userId, 
        _id: { $in: notificationIds },
        read: true
      },
      { 
        $set: { 
          read: false,
          readAt: null
        } 
      }
    );

    res.json({
      message: "Notifications marked as unread",
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

// Get read history
app.get("/notifications/:userId/read-history", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, limit = 50, page = 1 } = req.query;

    const query: any = { 
      userId, 
      read: true,
      readAt: { $exists: true }
    };

    // Date range filter
    if (startDate) query.readAt.$gte = new Date(startDate as string);
    if (endDate) query.readAt.$lte = new Date(endDate as string);

    const options = {
      limit: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      sort: { readAt: -1 },
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

// Track email opens
app.get('/track/:trackingId/open', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    await Notification.findOneAndUpdate(
      { 'emailStatus.trackingId': trackingId },
      {
        $set: {
          'emailStatus.read': true,
          'emailStatus.readAt': new Date()
        },
        $inc: {
          'emailStatus.openCount': 1
        }
      }
    );

    // Return a 1x1 transparent GIF
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': '43'
    });
    res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (error) {
    console.error('Error tracking email open:', error);
    res.status(500).send('Error tracking email');
  }
});

// Track email link clicks
app.get('/track/:trackingId/click', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { redirect } = req.query;
    
    await Notification.findOneAndUpdate(
      { 'emailStatus.trackingId': trackingId },
      {
        $set: {
          'emailStatus.clicked': true,
          'emailStatus.clickedAt': new Date()
        },
        $inc: {
          'emailStatus.clickCount': 1
        }
      }
    );

    // Redirect to original URL if provided
    if (redirect) {
      res.redirect(redirect as string);
    } else {
      res.status(200).send('Click tracked');
    }
  } catch (error) {
    console.error('Error tracking email click:', error);
    res.status(500).send('Error tracking click');
  }
});

// Get email tracking stats
app.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const query: any = { userId };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const stats = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalSent: { $sum: { $cond: ['$emailStatus.sent', 1, 0] } },
          totalRead: { $sum: { $cond: ['$emailStatus.read', 1, 0] } },
          totalClicked: { $sum: { $cond: ['$emailStatus.clicked', 1, 0] } },
          totalOpenCount: { $sum: '$emailStatus.openCount' },
          totalClickCount: { $sum: '$emailStatus.clickCount' },
          averageTimeToOpen: {
            $avg: {
              $cond: [
                '$emailStatus.readAt',
                { $subtract: ['$emailStatus.readAt', '$emailStatus.sentAt'] },
                null
              ]
            }
          }
        }
      }
    ]);

    res.json({
      userId,
      stats: stats[0] || {
        totalSent: 0,
        totalRead: 0,
        totalClicked: 0,
        totalOpenCount: 0,
        totalClickCount: 0,
        averageTimeToOpen: null
      }
    });
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ error: 'Error getting stats' });
  }
});

export default app;