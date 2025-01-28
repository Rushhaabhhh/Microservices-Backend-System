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
 * Generates a personalized email template with dynamic content.
 * @param {NotificationType} type - Type of notification
 * @param {any} content - Notification content
 * @returns {string} - Formatted HTML email content
 * @param {string} userName - User's name
 * @param {String} emailId - Email identifier
 */
const formatEmailContent = (type: NotificationType, content: any, userName: string, emailId: String) => {

  const trackingUrl = `${process.env.NOTIFICATIONS_SERVICE_URL}/track-email/${emailId}`; 


  // Common email styles
  const emailStyles = `
    <style>
      body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
      .content { background-color: #ffffff; padding: 20px; border-radius: 5px; }
      .footer { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
    </style>
  `;

  switch (type) {
    case NotificationType.USER_UPDATE:
      return `
        ${emailStyles}
        <div>
          <div class="header">
            <h1>Welcome to Our Backend System, ${userName}!</h1>
          </div>
          <div class="content">
            <p>Great news! Your account has been successfully created and configured in our backend system.</p>
            
            <h3>What This Means for You:</h3>
            <ul>
              <li>You now have full access to our platform's features</li>
              <li>Your profile is set up and ready to go</li>
              <li>You'll receive important updates directly to this email</li>
            </ul>

            <p>We're excited to have you on board. If you have any questions, our support team is always here to help!</p>
          </div>
          <img src="${trackingUrl}" style="display:none;" alt="tracker" />

          <div class="footer">
            © ${new Date().getFullYear()} Our Backend System. All rights reserved.
          </div>
        </div>
      `;

      case NotificationType.ORDER_UPDATE:
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2>Order Status Update</h2>
              <img src="${trackingUrl}" style="display:none;" alt="tracker" />
            <pre style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word;">
              ${JSON.stringify(content, null, 2)}
            </pre>
          </div>
        `;

      case NotificationType.PROMOTION: 
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
              <img src="${trackingUrl}" style="display:none;" alt="tracker" />
            <h2>Special Promotion Alert</h2>
            <pre style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word;">
              ${JSON.stringify(content, null, 2)}
            </pre>
          </div>
        `;

    default:
      return `
        ${emailStyles}
        <div>
          <div class="header">
            <h1>Notification for ${userName}</h1>
          </div>
          <div class="content">
            <p>You have a new notification:</p>
              <img src="${trackingUrl}" style="display:none;" alt="tracker" />
            <pre>${JSON.stringify(content, null, 2)}</pre>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} Our Backend System
          </div>
        </div>
      `;
  }
};

const senderEmail = process.env.SENDER_EMAIL;
if (!senderEmail) {
  throw new Error("SENDER_EMAIL is not defined in environment variables");
}

/**
 * Sends a comprehensive email notification with personalized content.
 * @param {string} userId - User identifier
 * @param {string} subject - Email subject line
 * @param {NotificationType} type - Notification type
 * @param {any} content - Notification payload
 * @returns {Promise<{success: boolean, messageId: string | null}>} Email sending result
 */
export const sendEmail = async (
  userId: string, 
  subject: string, 
  type: NotificationType, 
  content: any
) => {
  console.log("Preparing to send email", { userId, subject, type });

  try {
    // Retrieve user details
    const userResponse = await axios.get(
      `${process.env.USERS_SERVICE_URL}/${userId}`, 
      { timeout: 5000 }
    );

    const userData = userResponse.data?.result || userResponse.data;
    const userEmail = userData?.email;
    const userName = userData?.name || userData?.username || 'Valued Customer';

    if (!userEmail) {
      console.warn(`No email found for user ${userId}`);
      return null;
    }

    // Generate personalized HTML content
    const htmlContent = formatEmailContent(type, content, userName, userId);

    // Prepare email options
    const mailOptions = {
      from: senderEmail,
      to: userEmail,
      subject,
      text: JSON.stringify(content),
      html: htmlContent,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log(`Personalized email sent to ${userEmail}. Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`Email sending failed for user ${userId}:`, error);
    throw new Error("Comprehensive email notification failed");
  }
};