const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const resumeController = require("../controllers/resumeController");

// Turns multer failures (wrong type, too big) into a friendly message
// on the upload page instead of a generic error screen.
const handleUpload = (req, res, next) => {
  upload.single("resume")(req, res, (err) => {
    if (!err) return next();

    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is larger than 5 MB."
        : err.message || "Upload failed.";

    res.redirect("/resume/upload?error=" + encodeURIComponent(message));
  });
};

router.get("/resume", auth, resumeController.listResumes);

router.get("/resume/upload", auth, resumeController.uploadPage);
router.post("/resume/upload", auth, handleUpload, resumeController.uploadResume);

router.get("/resume/:id", auth, resumeController.viewQuestions);
router.post("/resume/:id/retry", auth, resumeController.retryGeneration);
router.post("/resume/:id/more-questions", auth, resumeController.generateMore);
router.post("/resume/:id/delete", auth, resumeController.deleteResume);

router.post("/resume/:id/submit", auth, resumeController.submitAllAnswers);

module.exports = router;
