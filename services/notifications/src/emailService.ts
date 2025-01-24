import sgMail from "@sendgrid/mail";
import { NotificationType } from "./models";

// Configure SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  throw new Error("SENDGRID_API_KEY is not defined");
}
sgMail.setApiKey(apiKey);

// Email Template Formatter
const formatEmailContent = (type: NotificationType, content: any): string => {
  switch(type) {
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
  to: string, 
  subject: string, 
  type: NotificationType,
  content: any
) => {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error("SENDER_EMAIL is not defined");
  }

  const htmlContent = formatEmailContent(type, content);

  const msg = {
    to, 
    from: senderEmail, 
    subject, 
    text: JSON.stringify(content),
    html: htmlContent,
  };

  try {
    const [response] = await sgMail.send(msg);
    
    // Log successful email delivery
    console.log(`Email sent to ${to}. Response:`, response);
    
    return {
      success: true,
      messageId: response.headers['x-message-id']
    };
  } catch (error) {
    console.error("Error sending email:", error);
    
    // Detailed error logging
    if (error instanceof Error && (error as any).response) {
      console.error('SendGrid Error Details:', (error as any).response.body);
    }
    
    throw new Error("Failed to send email");
  }
};