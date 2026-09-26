const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    interviewDate: { type: Date, required: true },
    status: { type: String, enum: ["Scheduled", "Completed", "Selected", "Rejected"], default: "Scheduled" },
    notes: { type: String, default: "" },

    resume: { type: Boolean, default: false },
    dsa: { type: Boolean, default: false },
    oop: { type: Boolean, default: false },
    dbms: { type: Boolean, default: false },
    sql: { type: Boolean, default: false },
    hr: { type: Boolean, default: false },

    readiness: { type: Number, default: 0 },
    experience: { type: String, default: "" },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

interviewSchema.index({ user: 1, interviewDate: 1 });
interviewSchema.index({ user: 1, status: 1 });
interviewSchema.index({ user: 1, company: "text" });

module.exports = mongoose.model("Interview", interviewSchema);
