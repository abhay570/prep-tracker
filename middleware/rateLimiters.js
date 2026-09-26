const rateLimit = require("express-rate-limit");

// Applies to login/register: 10 attempts per 15 minutes per IP.
// Keeps brute-force / credential-stuffing attempts slow without
// blocking normal users who mistype a password once or twice.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many attempts from this IP. Please try again in 15 minutes.",
});

module.exports = { authLimiter };
