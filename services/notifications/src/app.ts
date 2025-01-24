import morgan from "morgan";
import express from "express";
import { Notification } from "./models";

const app = express();

app.use(express.json());
app.use(morgan("common"));


// Create a notification
// app.post(
//   "/",
//   validateRequestBody(notificationCreationSchema),
//   async (req, res): Promise<void> => {
//     try {
//       const { userId, type, content } = req.body;

//       // Save the notification in the database
//       const notification = await Notification.create(req.body);

//       const user = await User.findById(userId);
//       if (!user || !user.email) {
//         return res.status(404).json({ error: "User not found or email not available" });
//       }

//       // Send an email notification
//       const subject = `New Notification: ${type}`;
//       const emailContent = typeof content === "string" ? content : JSON.stringify(content);
//       await sendEmail(user.email, subject, emailContent);

//       res.status(201).json({ result: notification, message: "Email sent successfully." });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
//     }
//   }
// );

// Get all notifications for a user
app.get(
  "/:userId",
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      // Fetch notifications from the database
      const notifications = await Notification.find({ userId }).sort({ sentAt: -1 });

      // Respond with the notifications
      res.json({ result: notifications });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

// Get all unread notifications for a user
app.get(
  "/:userId",
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      // Fetch unread notifications
      const unreadNotifications = await Notification.find({ userId, read: false }).sort({
        sentAt: -1,
      });

      // Respond with unread notifications
      res.json({ result: unreadNotifications });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

// Mark a notification as read
app.patch(
  "/:userId",
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      // Mark all unread notifications as read
      const result = await Notification.updateMany(
        { userId, read: false },
        { $set: { read: true } }
      );

      // Respond with success message
      res.status(200).json({
        message: "All notifications marked as read.",
        updatedCount: result.modifiedCount,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }
);

export default app;

