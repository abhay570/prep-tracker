require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const expressLayouts = require("express-ejs-layouts");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const interviewRoutes = require("./routes/interviewRoutes");
const resumeRoutes = require("./routes/resumeRoutes");

const app = express();

app.set("trust proxy", 1);

connectDB();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Static Folder
app.use(express.static(path.join(__dirname, "public")));

// View Engine
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", false);

// Defaults available in every view, so templates never hit an
// undefined variable. auth middleware fills in `user` when logged in.
app.use((req, res, next) => {
    res.locals.user = null;
    res.locals.error = req.query.error || null;
    res.locals.notice = req.query.notice || null;
    next();
});

// Routes
app.use("/", authRoutes);
app.use("/", interviewRoutes);
app.use("/", resumeRoutes);

// Landing Page
app.get("/", (req, res) => {
    res.render("landing");
});

// 404 Handler — anything not matched above
app.use((req, res) => {
    res.status(404).render("notFound", {
        code: "404",
        message: "That page doesn't exist.",
    });
});

// Global Error Handler — catches anything thrown/rejected in a route
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render("notFound", {
        code: "500",
        message: "Something went wrong on our end. Please try again.",
    });
});

// Start Server (skipped under Jest so tests can import `app` directly)
const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`Server Running on http://localhost:${PORT}`);
    });
}

module.exports = app;
