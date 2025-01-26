import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { makeExecutableSchema } from '@graphql-tools/schema';


import { UserService } from "./services/user-service";
import { OrderService } from "./services/order-service";
import { ProductService } from "./services/product-service";

import { userTypeDefs } from "../src/schema/user-schema";
import { orderTypeDefs } from "../src/schema/order-schema";
import { productTypeDefs } from "../src/schema/product-schema";

const root = {
  users: UserService.getAll,
  user: UserService.getById,
  createUser: UserService.createUser,
  loginUser: UserService.loginUser,
  updateUserPreferences: UserService.updatePreferences,

  products: ProductService.getAll,
  product: ProductService.getById,
  createProduct: ProductService.post,

  orders: OrderService.getAll,
  order: OrderService.getById,
  placeOrder: OrderService.post,
};

const schema = makeExecutableSchema({
  typeDefs: [userTypeDefs, orderTypeDefs, productTypeDefs],
});

const app = express();

app.all(
  "/graphql",
  createHandler({
    schema,
    rootValue: root,
    context: (req: { headers: any }) => ({
      headers: req.headers,
    }),
  })
);

export default app;
