const mongoose = require("mongoose");

let conn = null;

const connectDB = async () => {
    if (conn) return conn;

    try {
        conn = await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");
        return conn;
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        conn = null;
        throw error;
    }
};

module.exports = connectDB;