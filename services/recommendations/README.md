# Recommendation Service

The **Recommendation Service** is responsible for processing user orders and generating personalized product recommendations based on purchase history. It uses a scheduled job to process orders daily and maintains user purchase patterns for improved recommendation accuracy.

## Features

### **Core Functionality**
- **Daily Order Processing**: Automatically processes all orders at midnight UTC
- **Purchase History Tracking**: Maintains detailed user purchase history in Redis
- **Smart Recommendations**: Generates personalized product recommendations based on:
  - User purchase patterns
  - Category preferences
  - Product availability
  - Purchase recency

### **Service Integration**
- Communicates with the **Orders Service** and **Products Service** via HTTP
- **Kafka-based event publishing** for recommendation events
- **Redis caching** for user purchase history and order data

### **Monitoring and Observability**
- **Prometheus-compatible metrics** exposed at **`http://localhost:9205/metrics`**
- Comprehensive metrics tracking:
  - Order processing duration
  - Recommendations generated
  - Processing errors
  - Service connection status
  - System metrics (CPU, memory, etc.)

### **Kafka Integration**
- Publishes to:
  - `recommendation-events` : Product recommendations for user notification processing

## API Endpoints


### **GET /metrics**

- **Description**: Prometheus metrics endpoint
- **Response**: Prometheus-formatted metrics

### **POST /process**
- **Description**: Manually triggers order processing and recommendation generation
- **Response**:
  ```json
  {
    "status": "success"
  }
  ```

## Architecture

```bash
recommendation-service/
├── src/
│   ├── app.ts                            # Main application class
│   ├── index.ts                          # Service entry point
│   ├── kafka.ts                          # Kafka producer configuration
│   ├── processor/
│   │    ├── orderProcessor.ts            # Order processing logic
│   │    └── recommendationProcessor.ts   # Recommendation generation logic
│   ├── scheduler.ts                      # Cron job scheduler
│   └── types.ts                          # Type definitions
├── package.json
└── Dockerfile
```

## Running the Product Service Locally

Ensure that all dependent services (e.g., MongoDB, Kafka, Redis) are up and running before starting the product service. Use the following commands to start the service:

```bash
cp .env.example .env  # Create and update env 
yarn install
yarn start
```

The Product API will be accessible at **`http://localhost:8005`**.

For deployment, use **Docker Compose** to start the service with the necessary dependencies:

```bash
docker-compose up
```
