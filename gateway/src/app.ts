import express from "express";
import { createHandler } from "graphql-http/lib/use/express";

import { UserService } from "./services/user-service";
import { userTypeDefs } from "../src/schema/user-schema";

const root = {
  users: UserService.getAll,
  user: UserService.getById,
  createUser: UserService.createUser,
  updateUserPreferences: UserService.updatePreferences,
};

const app = express();

app.all(
  "/graphql",
  createHandler({
    schema: userTypeDefs,
    rootValue: root,
    context: (req: { headers: any; }) => ({
      headers: req.headers,
    }),
  })
);

export default app;