import nodemailer from "nodemailer";
import { NotificationType } from "./models";
import mongoose from "mongoose";

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

// Email Template Formatter
const formatEmailContent = (type: NotificationType, content: any): string => {
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

// Comprehensive Email Sending Service
export const sendEmail = async (
  userId: string,
  subject: string,
  type: NotificationType,
  content: any
) => {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error("SENDER_EMAIL is not defined");
  }

  try {
    // Fetch user to get email
    const user = await mongoose.model("User").findById(userId);

    if (!user || !user.email) {
      console.warn(`No email found for user ${userId}`);
      return {
        success: false,
        reason: "No user email found",
      };
    }

    const htmlContent = formatEmailContent(type, content);

    const mailOptions = {
      from: senderEmail,
      to: user.email,
      subject: subject,
      text: JSON.stringify(content), // Plaintext alternative
      html: htmlContent, // HTML content
    };

    // Send email using Nodemailer
    const info = await transporter.sendMail(mailOptions);

    // Log successful email delivery
    console.log(`Email sent to ${user.email} for user ${userId}. Message ID:`, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`Error sending email for user ${userId}:`, error);

    throw new Error("Failed to send email");
  }
};
