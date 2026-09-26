const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const interviewController = require("../controllers/interviewController");
const {
    interviewValidation,
    handleValidation,
} = require("../validators/interviewValidator");

// Dashboard (supports ?tab=upcoming|completed|all &q= &sort=)
router.get("/dashboard", auth, interviewController.dashboard);
router.get("/dashboard/stats", auth, interviewController.dashboardStats);

// Add Interview
router.get("/add", auth, interviewController.addPage);
router.post(
    "/add",
    auth,
    interviewValidation,
    handleValidation,
    interviewController.addInterview
);

// Edit Interview
router.get("/edit/:id", auth, interviewController.editPage);
router.post(
    "/edit/:id",
    auth,
    interviewValidation,
    handleValidation,
    interviewController.updateInterview
);

// Mark complete / selected / rejected / back to scheduled
router.post("/interviews/:id/status", auth, interviewController.setStatus);

// Pick a new date (puts the interview back in "Scheduled")
router.post("/interviews/:id/reschedule", auth, interviewController.reschedule);

// Delete Interview
router.post("/delete/:id", auth, interviewController.deleteInterview);

module.exports = router;
