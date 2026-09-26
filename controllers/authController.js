const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ==========================
// Register Page
// ==========================
exports.registerPage = (req, res) => {
    res.render("register", { error: req.query.error || null });
};

// ==========================
// Login Page
// ==========================
exports.loginPage = (req, res) => {
    res.render("login", { error: req.query.error || null });
};

// ==========================
// Register User
// ==========================
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.redirect(
                "/register?error=" + encodeURIComponent("An account with that email already exists.")
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            password: hashedPassword,
        });

        await user.save();

        res.redirect("/login");

    } catch (error) {
        console.log(error);
        res.redirect(
            "/register?error=" + encodeURIComponent("Something went wrong. Please try again.")
        );
    }
};

// ==========================
// Login User
// ==========================
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // password has `select: false` in the schema, so it has to be
        // explicitly requested here or bcrypt.compare gets undefined
        const user = await User.findOne({ email }).select("+password");

        // Same generic message for both cases below — avoids revealing
        // whether an email is registered.
        const invalidCredentials = () =>
            res.redirect("/login?error=" + encodeURIComponent("Invalid email or password."));

        if (!user) {
            return invalidCredentials();
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return invalidCredentials();
        }

        const token = jwt.sign(
            {
                id: user._id,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d",
            }
        );

        res.cookie("token", token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
        });

        res.redirect("/dashboard");

    } catch (error) {
        console.log(error);
        res.redirect(
            "/login?error=" + encodeURIComponent("Server error. Please try again.")
        );
    }
};

// ==========================
// Logout
// ==========================
exports.logout = (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
};
