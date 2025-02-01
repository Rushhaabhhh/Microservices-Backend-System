import { buildSchema } from "graphql";

const productTypeDefs = buildSchema(`
  type Product {
    _id: ID!
    name: String!
    price: Float!
    quantity: Int!
    category: String!
  } 

  input CreateProductInput {
    name: String!
    price: Float!
    quantity: Int!
    category: String!
  }

  type Query {
    products: [Product]
    product(id: ID!): Product
  }

  type Mutation {
    createProduct(input: CreateProductInput): Product
  }
`);

export { productTypeDefs };
