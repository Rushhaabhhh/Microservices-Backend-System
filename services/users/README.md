# User Service

The **User Service** is responsible for managing user data, including creating new users, logging in existing users, and retrieving user details. It exposes API endpoints for these operations and integrates with other services through Kafka-based event-driven updates.
## Features

### **Service Integration**
- Communicates with the **GraphQL Gateway** via Axios to integrate with other microservices.
- **Kafka-based event-driven updates** for real-time data updates across the system.

### **Authentication**
- **JWT authentication** for securing endpoints.
- User passwords are hashed using bcrypt before storage for enhanced security.

### Monitoring and Observability

- **Prometheus-compatible metrics** for monitoring the performance and usage of the User service.
- Metrics will be exposed at **`http://localhost:9201/metrics`** for real-time monitoring.

### Kafka Integration

- The user-service publishes **user-events** to Kafka on `POST /login` , so the **notifications-service** can subscribe to relevant topics for processing.


## API Endpoints

### **GET /**
- **Description**: Fetches a list of all users.
- **Response**:
  ```json
  [
    {
      "_id": "user_id_1",
      "email": "user1@example.com",
      "name": "User One",
      "preferences": { "promotions": true, "orderUpdates": true, "recommendations": true },
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T00:00:00Z"
    },
    ...
  ]
  ```

### **GET /:id**
- **Description**: Fetches a single user by their ID.
- **Parameters**:
  - `id`: The unique identifier of the user.
- **Response**:
  ```json
  {
    "_id": "user_id_1",
    "email": "user1@example.com",
    "name": "User One",
    "preferences": { "promotions": true, "orderUpdates": true, "recommendations": true },
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

### **POST /**
- **Description**: Creates a new user with the provided details.
- **Request Body**:
  ```json
  {
    "email": "user2@example.com",
    "name": "User Two",
    "password": "user_password",
    "preferences": {
      "promotions": true,
      "orderUpdates": true,
      "recommendations": false
    }
  }
  ```
- **Response**:
  ```json
  {
    "_id": "user_id_2",
    "email": "user2@example.com",
    "name": "User Two",
    "preferences": { "promotions": true, "orderUpdates": true, "recommendations": false },
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```

### **POST /login**
- **Description**: Authenticates a user with their email and password and generates access_token for JWT authentication.
- **Request Body**:
  ```json
  {
    "email": "user1@example.com",
    "password": "user_password"
  }
  ```
- **Response**:
  ```json
  {
    "token": "jwt_token"
  }
  ```

### **PUT /_:id/preferences**
- **Description**: Updats the notifications preferances for an user.
- **Request Body**:
  ```json
  {
    "id": "userId",
    "preferences": {
        "promotions": true,
        "orderUpdates": true,
        "recommendations": true
    }
  }
  ```
- **Response**:
  ```json
  {
    "data": {
        "updateUserPreferences": {
            "_id": "userId",
            "email": "user3example@gmail.com",
            "name": "user3Example",
            "preferences": {
                "promotions": true,
                "orderUpdates": true,
                "recommendations": true
            },
            "createdAt": "2025-01-25T12:58:45.900Z",
            "updatedAt": "2025-01-25T12:58:45.900Z"
        }
    }
  }
  ```

## Architecture

```bash
user-service/
├── src/
│   ├── app.ts                    # Logic for user CRUD operations and integration
│   ├── index.ts                  # Service entry point
│   ├── kafka.ts                  # Kafka producer/consumer logic
│   ├── models.ts                 # User MongoDB model (user schema)
│   ├── middleware.ts             # JWT authentication middleware
├── package.json                  # Project dependencies
├── Dockerfile                    # Containerized deployment configuration
```

---

## Running the User Service Locally

Ensure that all dependent services (e.g., MongoDB, Kafka, Redis) are up and running before starting the user service. Use the following commands to start the service:

```bash
cp .env.example .env  # Create and update env 
yarn install
yarn start
```

The User API will be accessible at **`http://localhost:8001`**.


For deployment, use **Docker Compose** to start the service with the necessary dependencies:

```bash
docker-compose up
```
