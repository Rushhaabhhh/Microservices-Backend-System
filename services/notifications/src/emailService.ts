import axios from "axios";
import nodemailer from "nodemailer";

import { NotificationType } from "./models";

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Formats email content based on notification type.
 * @param {NotificationType} type - Type of notification.
 * @param {any} content - Notification content.
 * @returns {string} - Formatted HTML email content.
 */
const formatEmailContent = (type: any, content: any) => {
  switch (type) {
    case NotificationType.USER_UPDATE:
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Profile Update Notification</h2>
          <p>Your profile has been updated with the following details:</p>
          <pre>${JSON.stringify(content, null, 2)}</pre>
        </div>
      `;
    case NotificationType.ORDER_UPDATE:
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Order Status Update</h2>
          <p>Your order status has changed:</p>
          <pre>${JSON.stringify(content, null, 2)}</pre>
        </div>
      `;
    default:
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Notification</h2>
          <pre>${JSON.stringify(content, null, 2)}</pre>
        </div>
      `;
  }
};

const senderEmail = process.env.SENDER_EMAIL;
if (!senderEmail) {
  throw new Error("SENDER_EMAIL is not defined");
}

/**
 * Sends an email notification.
 * @param {string} userId - User ID to retrieve email for.
 * @param {string} subject - Subject of the email.
 * @param {NotificationType} type - Type of notification.
 * @param {any} content - Notification content.
 * @returns {Promise<{success: boolean, messageId: string | null}>} - Email sending status.
 */
export const sendEmail = async (userId: string, subject: string, type: NotificationType, content: any) => {
  console.log("Sending Email - Context:", {
    userId,
    subject,
    type,
    content,
    smtpHost: process.env.SMTP_HOST,
    smtpUser: process.env.SMTP_USER ? "Configured" : "Missing",
  });

  try {
    let userResponse;
    try {
      userResponse = await axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`, { timeout: 5000 });
    } catch (fetchError) {
      console.error("User Retrieval Error:", {
        message: (fetchError as Error).message,
        url: `${process.env.USERS_SERVICE_URL}/${userId}`,
      });
      throw new Error(`Failed to retrieve user details: ${(fetchError as Error).message}`);
    }

    const userEmail = userResponse.data?.result?.email || userResponse.data?.email;
    console.log("User Email Retrieved:", { userId, email: userEmail });

    if (!userEmail) {
      console.warn(`No email found for user ${userId}`);
      return null;
    }

    const htmlContent = formatEmailContent(type, content);

    const mailOptions = {
      from: senderEmail,
      to: userEmail,
      subject,
      text: JSON.stringify(content),
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`Email sent to ${userEmail} for user ${userId}. Message ID:`, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`Error sending email for user ${userId}:`, error);
    throw new Error("Failed to send email");
  }
};
