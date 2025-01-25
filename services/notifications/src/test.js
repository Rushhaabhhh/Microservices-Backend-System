const nodemailer = require('nodemailer');
const { Kafka } = require('kafkajs');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rushabhkhatri748@gmail.com',
    pass: 'bxsd qvhc nxeb mrpm',
  },
});

const mailOptions = {
  from: 'rushabhmistry16@gmail.com',
  to: 'rushabhkhatri748@gmail.com',
  subject: 'Test Email from Nodemailer',
  text: 'Hello! This is a test email sent using Nodemailer via kafka events.',
};

const kafka = new Kafka({
  clientId: 'email-service',
  brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'order-email-group' });

const run = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'order-events', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log(`Received message: ${message.value.toString()}`);
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error occurred:', error);
        } else {
          console.log('Email sent:', info.response);
        }
      });
    },
  });
};

run().catch(console.error);
