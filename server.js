const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const socketIo = require("socket.io");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB Connected")).catch(err => console.error("DB Connection Error:", err));

app.use(express.json());
app.use(cors());

// User Schema & Model
const User = mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String
}));

// Recipe Schema & Model
const Recipe = mongoose.model("Recipe", new mongoose.Schema({
  title: String, ingredients: [String], instructions: String, user: mongoose.Schema.Types.ObjectId
}));

// User Registration
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User registered" });
  } catch (error) {
    res.status(400).json({ message: "Registration failed" });
  }
});

// User Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Middleware for Protected Routes
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid Token" });
  }
};

// Get All Recipes
app.get("/api/recipes", async (req, res) => {
  const recipes = await Recipe.find();
  res.json(recipes);
});

// Create a Recipe
app.post("/api/recipes", authMiddleware, async (req, res) => {
  const { title, ingredients, instructions } = req.body;
  const newRecipe = new Recipe({ title, ingredients, instructions, user: req.user.id });
  await newRecipe.save();
  io.emit("updateRecipes", newRecipe);
  res.status(201).json(newRecipe);
});

// WebSocket for Real-time Updates
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("newRecipe", (recipe) => {
    io.emit("updateRecipes", recipe);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
