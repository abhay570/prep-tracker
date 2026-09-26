const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    interview: { type: mongoose.Schema.Types.ObjectId, ref: "Interview", default: null },
    fileName: { type: String, required: true },
    extractedText: { type: String, required: true },
    role: { type: String, default: "" },
    company: { type: String, default: "" },
    skills: { type: [String], default: [] },

    generatedQuestions: [
      {
        question: { type: String, required: true },
        category: { type: String, default: "General" },
        userAnswer: { type: String, default: "" },
        reviewed: { type: Boolean, default: false },
        rating: { type: Number, default: null },
        feedback: { type: String, default: "" },
        idealAnswer: { type: String, default: "" },
      },
    ],

    generationStatus: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);
