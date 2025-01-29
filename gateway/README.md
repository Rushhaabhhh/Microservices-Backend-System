# GraphQL Gateway

The **GraphQL Gateway** acts as the unified API layer for the microservices in the system, enabling efficient and flexible querying of data from multiple services, including **User**, **Product**, and **Order**. It orchestrates requests to backend services while supporting **caching, messaging, and distributed system integration** for optimal performance.


## Features

### **GraphQL API**
- Centralized API for querying and managing user, product, and order data.
- Flexible schema design with efficient resolvers.
- Accessible at **`http://localhost:4000/graphql`**.
- Direct access to individual service URLs is restricted ; all operations must go through GraphQL.

### **Service Integration**
- Communicates with individual services (**User, Product, Order**) using **Axios**.
- **Kafka-based event-driven updates** for real-time data synchronization.
- Shared **Redis caching** for optimized performance and lower latency.

### **Caching and Optimization**
- Frequently accessed resources (e.g., recommendations) **cached in Redis**.
- **Global cache middleware** for efficient caching and cache invalidation.

### **Monitoring and Metrics**
- Exposes system performance metrics at **`http://localhost:9200/metrics`**.
- **Prometheus-compatible metrics** for monitoring API usage and system health.

---

## Architecture

```bash
gateway/
├── src/
│   ├── schemas/
│   │   ├── user-schema.ts        # User GraphQL schema and resolvers
│   │   ├── product-schema.ts     # Product GraphQL schema and resolvers
│   │   ├── order-schema.ts       # Order GraphQL schema and resolvers
│   │   ├── index.ts              # Schema aggregation
│   ├── services/
│   │   ├── user-service.ts       # Axios logic for User service
│   │   ├── product-service.ts    # Axios logic for Product service
│   │   ├── order-service.ts      # Axios logic for Order service
│   ├── library/
│   │   ├── kafka.ts              # Kafka producer/consumer logic
│   │   ├── redis.ts              # Redis connection and utilities
│   │   ├── http.ts               # HTTP connection using Axios
│   ├── middleware/
│   │   ├── auth-middleware.ts    # JWT authentication middleware
│   │   ├── cache-middleware.ts   # Redis caching middleware
│   ├── app.ts                    # Express server and middleware configuration
│   ├── index.ts                  # Gateway entry point
│   ├── types.ts                  # Type definitions for context headers
├── package.json                  # Project dependencies
├── Dockerfile                    # Containerized deployment configuration
```

---

## Running the Gateway Locally

Before running the GraphQL Gateway, ensure that all dependent services (**User, Product, Order, Kafka, Redis**) are up and running. Then execute the following commands:

```bash
cp en.example .env  #Create and update env 
yarn install
yarn start
```

This will start the gateway and make the GraphQL API accessible at **`http://localhost:4000/graphql`**.

For monitoring and observability, visit **`http://localhost:9200/metrics`**.

---

For a complete setup, use **Docker Compose** to run all services together.

```bash
docker-compose up
```

