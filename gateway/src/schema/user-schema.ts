import { buildSchema } from "graphql";

const userTypeDefs = buildSchema(`
    type User {
        id: ID!
        email: String!
        name: String!
        preferences: UserPreferences!
        createdAt: String!
        updatedAt: String!
    }

    type UserPreferences {
        promotions: Boolean!
        orderUpdates: Boolean!
        recommendations: Boolean!
    }

    input CreateUserInput {
        email: String!
        name: String!
        preferences: UserPreferencesInput
    }

    input UserPreferencesInput {
        promotions: Boolean
        orderUpdates: Boolean
        recommendations: Boolean
    }

    input UpdateUserPreferencesInput {
        promotions: Boolean
        orderUpdates: Boolean
        recommendations: Boolean
    }

    type Query {
        users: [User]
        getUserByEmail(email: String!): User
    }

    type Mutation {
        createUser(input: CreateUserInput!): User!
        updateUserPreferences(id: ID!, preferences: UpdateUserPreferencesInput!): User!
    }
`);

export { userTypeDefs};
