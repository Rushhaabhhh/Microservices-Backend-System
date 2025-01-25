import { buildSchema } from "graphql";

const productTypeDefs = buildSchema(`

  type Product {
    _id: ID!
    name: String!
    price: Float!
    quantity: Int!
  } 

  input CreateProductInput {
    name: String!
    price: Float!
    quantity: Int!
  }

  type Query {
    products: [Product]
    product(id: ID!): Product
  }

  type Mutation {
    createProduct(input: CreateProductInput): Product
    deleteProduct(id: ID!): Product
  }
`);

export { productTypeDefs };