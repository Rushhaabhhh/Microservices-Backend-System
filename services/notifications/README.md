# Notifications Service

The **Notifications Service** is responsible for processing and delivering various types of notifications to users, including promotional offers, order updates, and personalized recommendations. It integrates with multiple services, ensuring timely and reliable communication via email.

## Features

### **Core Functionality**
- **Automated Notification Scheduling** : Processes and sends notifications at scheduled intervals using cron jobs
- **User Preference Management** : Adapts notifications based on user opt-in preferences
- **Priority Handling** : Supports different priority levels for notifications (low-priority, high-priority)
- **Retry & Dead Letter Queue (DLQ)** : Handles failed notifications with retry mechanisms and a dead letter queue for long-term failures

### **Service Integration**
- Communicates with **Orders Service**, **Recommendation Service**, and **Users Service** via HTTP REST requests
- **Kafka-based event consumption** for triggering notifications
- **Email Service Integration** : Uses Nodemailer SMTP-based email service for delivery 

### **Monitoring and Observability**
- **Prometheus-compatible metrics** exposed at **`http://localhost:9204/metrics`**
- Tracks key service metrics:
  - Notifications sent (per type and priority)
  - Email delivery success and failure rates
  - Queue processing times
  - System resource utilization

### **Kafka Integration**
- **Consumes from:**
  - `recommendation-events` → Processes product recommendation notifications
  - `order-events` → Sends order status updates to customers
  - `promotion-events` → Sends marketing and promotional emails
  - `user-events` → Sends welcoming login messages to users
- **Publishes to:**
  - `failed-notifications` → Dead-letter queue for failed deliveries

## API Endpoints

### **GET /metrics**

- **Description**: Prometheus metrics endpoint
- **Response**: Prometheus-formatted metrics

## Architecture

```bash
notifications-service/
├── src/
│   ├── app.ts                              # Main application class
│   ├── index.ts                            # Service entry point
│   ├── kafka.ts                            # Kafka consumer & producer configuration
│   ├── processor/                          # Event processing logic
│   │    ├── processor.ts                   # Notification processing logic
│   │    ├── DeadLetterQueue.ts             # Handling of failed messages
│   │    ├── UserEventProcessor.ts          # Processes user-related events
│   │    ├── OrderEventProcessor.ts         # Processes order-related events
│   │    ├── ProductEventProcessor.ts       # Processes product-related events
│   │    └── RecommendationProcessor.ts     # Processes recommendation events
│   ├── emailService.ts                     # Email sending logic
│   ├── types.ts                            # Type definitions
│   └── models.ts                           # Database models for notifications
├── package.json
└── Dockerfile 
```
## Workflow

- **`index.js`**: Initializes the service, setting up Kafka consumers and producers.  
- **`processor/processor.ts`**: Manages Kafka event consumption, prioritizing critical events like user and order events, and connects event processors.  
- **`processor/{service}EventProcessor.ts`**: Handles service-specific events, delegating email sending to **`emailService.ts`** and routing failed events via **`DeadLetterQueue.ts`**.

## Running the Notifications Service Locally

Ensure that all dependent services (e.g., MongoDB, Kafka, Redis, SMTP) are running before starting the notifications service. Use the following commands to start the service:

```bash
cp .env.example .env  # Create and update env
yarn install
yarn start
```

The Notifications API will be accessible at **`http://localhost:8006`**.

For deployment, use **Docker Compose** to start the service with necessary dependencies:

```bash
docker-compose up
```

