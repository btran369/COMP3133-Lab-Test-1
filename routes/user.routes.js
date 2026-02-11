const express = require("express");
const User = require("../models/User");

const router = express.Router();

// GET /api/users (private chat)
router.get("/", async (_req, res) => {
  const users = await User.find({}, { _id: 0, username: 1, firstname: 1, lastname: 1 })
    .sort({ username: 1 })
    .lean();
  res.json(users);
});

module.exports = router;
