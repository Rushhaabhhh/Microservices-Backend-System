# Product Service

The **Product Service** is responsible for managing product data, including adding new products, retrieving product details, and updating product inventory. It exposes API endpoints for these operations and integrates with other services through Kafka-based event-driven updates.

## Features

### **Service Integration**
- Communicates with the **GraphQL Gateway** via Axios to integrate with other microservices.
- **Kafka-based event-driven updates** for real-time data updates across the system.
- **Redis caching** for frequently accessed product data.

### Monitoring and Observability

- **Prometheus-compatible metrics** for monitoring the performance and usage of the Product service.
- Metrics will be exposed at **`http://localhost:9203/metrics`** for real-time monitoring.

### Kafka Integration

- The **product-service** publishes : 
  - **inventory-events** to Kafka on `POST /products`, so **order-service** can subscribe to relevant topic for inventory updation.
  - **promotional-events** to Kafka using cron-jobs, that runs every day so **notifications-service** can subscribe to get promotional emails data.


## API Endpoints

### **GET /**
- **Description**: Fetches a list of all products.
- **Response**:
  ```json
  [
    {
      "_id": "product_id_1",
      "name": "Product One",
      "price": 29.99,
      "quantity": 100,
      "category": "Electronics",
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T00:00:00Z"
    },
    ...
  ]
  ```

### **GET /id/:id**
- **Description**: Fetches a single product by its ID.

- **Response**:
  ```json
  {
    "_id": "product_id_1",
    "name": "Product One",
    "price": 29.99,
    "quantity": 100,
    "category": "Electronics",
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }

### **GET /category?category=""**
- **Description**: Fetches all product by its category.

- **Response**:
  ```json
  {
    "_id": "product_id_1",
    "name": "Product One",
    "price": 29.99,
    "quantity": 100,
    "category": "Electronics",
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

### **POST /**
- **Description**: Adds a new product with the provided details.
- **Request Body**:
  ```json
  {
    "name": "Product Two",
    "price": 19.99,
    "quantity": 50,
    "category": "Home Appliances"
  }
  ```
- **Response**:
  ```json
  {
    "_id": "product_id_2",
    "name": "Product Two",
    "price": 19.99,
    "quantity": 50,
    "category": "Home Appliances",
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

## Architecture

```bash
product-service/
├── src/
│   ├── app.ts                    # Logic for product CRUD operations and integration
│   ├── index.ts                  # Service entry point
│   ├── kafka.ts                  # Kafka producer/consumer logic
│   ├── models.ts                 # Product MongoDB model (product schema)
│   ├── promoEvents.ts            # Promotional-events triggers using cron-jobs
│   ├── types.ts                  # Order event payload
├── package.json                  # Project dependencies
├── Dockerfile                    # Containerized deployment configuration
```

---

## Running the Product Service Locally

Ensure that all dependent services (e.g., MongoDB, Kafka, Redis) are up and running before starting the product service. Use the following commands to start the service:

```bash
cp .env.example .env  # Create and update env 
yarn install
yarn start
```

The Product API will be accessible at **`http://localhost:8003`**.

For deployment, use **Docker Compose** to start the service with the necessary dependencies:

```bash
docker-compose up
```
