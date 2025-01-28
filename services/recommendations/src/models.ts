import mongoose from "mongoose";

// Order Schema to store orders from external service
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    quantity: { type: Number, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true }
  }],
  date: { type: Date, default: Date.now }
});

// Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  category: { type: String, required: true },
});

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  purchaseHistory: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      category: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
});

const Order = mongoose.model("Order", orderSchema);
const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);

export { Order, Product, User };