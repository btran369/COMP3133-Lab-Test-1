const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;

    if (!username || !firstname || !lastname || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      firstname,
      lastname,
      password: hashed
    });

    return res.status(201).json({
      message: "Signup successful",
      user: { username: user.username, firstname: user.firstname, lastname: user.lastname }
    });
  } catch (err) {
    // Dupe username
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Username already exists." });
    }
    return res.status(500).json({ message: "Server error", error: String(err) });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Missing credentials." });

    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(401).json({ message: "Invalid username or password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid username or password." });

    // Client stores username in local storage
    return res.json({
      message: "Login successful",
      user: { username: user.username, firstname: user.firstname, lastname: user.lastname }
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: String(err) });
  }
});

module.exports = router;
