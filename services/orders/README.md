
# Order Service

The **Order Service** is responsible for managing order-related data, including creating new orders, and retrieving order details. It exposes API endpoints for these operations and integrates with other services through Kafka-based event-driven updates.

## Features

### **Service Integration**
- Communicates with the **GraphQL Gateway** via Axios to integrate with other microservices.
- **Kafka-based event-driven updates** for real-time data updates across the system.
- **Redis caching** for frequently accessed order data.

### Monitoring and Observability

- **Prometheus-compatible metrics** for monitoring the performance and usage of the Order service.
- Metrics will be exposed at **`http://localhost:9202/metrics`** for real-time monitoring.

### Kafka Integration

- The **order-service** publishes **order-events** to Kafka on `POST /orders`, so the **notifications-service**, and **product-service** can subscribe to relevant topics for processing.


## API Endpoints

### **GET /**
- **Description**: Fetches a list of all orders.
- **Response**:
  ```json
  [
    {
      "_id": "order_id_1",
      "userId": "user_id_1",
      "products": [
        {
          "_id": "product_id_1",
          "quantity": 2
        }
      ],
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T00:00:00Z"
    },
    ...
  ]
  ```

### **GET /:id**
- **Description**: Fetches a single order by its ID.
- **Parameters**:
  - `id`: The unique identifier of the order.
- **Response**:
  ```json
  {
    "_id": "order_id_1",
    "userId": "user_id_1",
    "products": [
      {
        "_id": "product_id_1",
        "quantity": 2
      }
    ],
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

### **POST /**
- **Description**: Creates a new order with the provided user and product details.
- **Request Body**:
  ```json
  {
    "userId": "user_id_1",
    "products": [
      {
        "_id": "product_id_1",
        "quantity": 2
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "_id": "order_id_2",
    "userId": "user_id_1",
    "products": [
      {
        "_id": "product_id_1",
        "quantity": 2
      }
    ],
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

## Architecture

```bash
order-service/
├── src/
│   ├── app.ts                    # Logic for order CRUD operations and integration
│   ├── index.ts                  # Service entry point
│   ├── kafka.ts                  # Kafka producer/consumer logic
│   ├── models.ts                 # Order MongoDB model (order schema)
├── package.json                  # Project dependencies
├── Dockerfile                    # Containerized deployment configuration
```

---

## Running the Order Service Locally

Ensure that all dependent services (e.g., MongoDB, Kafka, Redis) are up and running before starting the order service. Use the following commands to start the service:

```bash
cp .env.example .env  # Create and update env 
yarn install
yarn start
```

The Order API will be accessible at **`http://localhost:8002`**.

For deployment, use **Docker Compose** to start the service with the necessary dependencies:

```bash
docker-compose up
```
