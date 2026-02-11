const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3
    },
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 4 },
    createon: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

// Error message
UserSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model("User", UserSchema);
