import mongoose from "mongoose";

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

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);

export { Product, User };
