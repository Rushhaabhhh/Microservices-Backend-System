import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  throw new Error("SENDGRID_API_KEY is not defined");
}
sgMail.setApiKey(apiKey); 

export const sendEmail = async (to: string, subject: string, content: string) => {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error("SENDER_EMAIL is not defined");
  }

  const msg = {
    to, 
    from: senderEmail, 
    subject, 
    text: content,
    html: `<p>${content}</p>`,
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    if (error instanceof Error && (error as any).response) {
      console.error((error as any).response.body);
    }
    throw new Error("Failed to send email.");
  }
};
