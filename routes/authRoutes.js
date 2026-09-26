const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiters");
const {
    registerValidation,
    loginValidation,
    handleValidation,
} = require("../validators/authValidator");

router.get("/register", authController.registerPage);
router.post(
    "/register",
    authLimiter,
    registerValidation,
    handleValidation,
    authController.registerUser
);

router.get("/login", authController.loginPage);
router.post(
    "/login",
    authLimiter,
    loginValidation,
    handleValidation,
    authController.loginUser
);

router.get("/logout", authController.logout);

module.exports = router;
