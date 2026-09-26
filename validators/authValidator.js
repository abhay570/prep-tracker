const { body, validationResult } = require("express-validator");

const registerValidation = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required")
        .isLength({ max: 100 })
        .withMessage("Name is too long"),

    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Enter a valid email address")
        .normalizeEmail(),

    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/\d/)
        .withMessage("Password must contain at least one number"),
];

const loginValidation = [
    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Enter a valid email address")
        .normalizeEmail(),

    body("password").notEmpty().withMessage("Password is required"),
];

// Route-agnostic middleware: redirect back to the form with a
// friendly error banner instead of a blank text page.
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const message = errors.array().map((e) => e.msg).join(" ");

        if (req.accepts("html")) {
            return res.redirect(`${req.path}?error=${encodeURIComponent(message)}`);
        }
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

module.exports = { registerValidation, loginValidation, handleValidation };
