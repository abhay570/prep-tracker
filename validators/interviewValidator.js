const { body, validationResult } = require("express-validator");

// ==========================
// Validation rules for the add/edit interview forms
// ==========================
exports.interviewValidation = [
    body("company")
        .trim()
        .notEmpty()
        .withMessage("Company is required."),

    body("role")
        .trim()
        .notEmpty()
        .withMessage("Role is required."),

    body("interviewDate")
        .notEmpty()
        .withMessage("Interview date is required.")
        .isISO8601()
        .withMessage("Enter a valid date."),

    body("status")
        .optional({ checkFalsy: true })
        .isIn(["Scheduled", "Completed", "Selected", "Rejected"])
        .withMessage("Invalid status selected."),

    body("notes")
        .optional({ checkFalsy: true })
        .isLength({ max: 2000 })
        .withMessage("Notes must be under 2000 characters."),
];

// ==========================
// Reads the validation result and, if anything failed,
// redirects back to the same form with a friendly error banner
// instead of letting the request continue.
// ==========================
exports.handleValidation = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const message = errors.array().map((e) => e.msg).join(" ");
        return res.redirect(`${req.path}?error=${encodeURIComponent(message)}`);
    }

    next();
};
