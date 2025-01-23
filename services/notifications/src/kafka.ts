import { Kafka, logLevel } from "kafkajs";
const kafka = new Kafka({
  clientId: "notifications",
  brokers: (process.env["KAFKA_BROKERS"] || "").split(" "),
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({ groupId: "notifications" });
const producer = kafka.producer();

export { consumer, producer };