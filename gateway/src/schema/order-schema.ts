import { buildSchema } from "graphql";

const orderTypeDefs = buildSchema(`

  type OrderProduct {
    _id: ID!
    quantity: Int!
  }

  type Order {
    _id: ID!
    userId: ID!
    products: [OrderProduct]
  }

  input OrderProductInput {
    _id: String!
    quantity: Int!
  }

  type Query {
    orders: [Order]
    order(id: ID!): Order
  }

  type Mutation {
    placeOrder(products: [OrderProductInput]): Order
  }
`);

export { orderTypeDefs };