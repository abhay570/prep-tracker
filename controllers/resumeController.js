const fs = require("fs");

const Resume = require("../models/Resume");
const Interview = require("../models/Interview");
const { extractResumeText } = require("../utils/resumeParser");
const {
  generateQuestionsFromResume,
  generateMoreQuestions,
  evaluateAnswers,
} = require("../utils/aiQuestionGenerator");

const redirectWith = (res, path, params = {}, hash = "") => {
  const qs = new URLSearchParams(params).toString();
  return res.redirect(`${path}${qs ? `?${qs}` : ""}${hash}`);
};

// Turns AI failures into something a person can act on
function aiMessage(err, fallback) {
  if (err && err.code === "QUOTA_EXCEEDED") {
    return "The AI service has hit its usage limit for now. Please try again later.";
  }
  if (err && err.code === "MODEL_NOT_FOUND") {
    return "The AI model is unavailable. Check the GEMINI_MODEL value in your .env file.";
  }
  if (err && err.code === "NETWORK_ERROR") {
    return "Couldn't reach the AI service. Check your internet connection and try again.";
  }
  if (err && err.status === 503) {
    return "The AI service is busy right now. Wait a moment and try again.";
  }
  return fallback;
}

// ==========================
// Upload page
// ==========================
exports.uploadPage = async (req, res) => {
  try {
    const interviews = await Interview.find({ user: req.user.id }).sort({
      interviewDate: 1,
    });

    res.render("uploadResume", { interviews, error: req.query.error || null });
  } catch (error) {
    console.log(error);
    res.status(500).render("notFound", {
      code: "500",
      message: "Couldn't load the upload page.",
    });
  }
};

// ==========================
// Upload + generate questions
// ==========================
exports.uploadResume = async (req, res) => {
  const filePath = req.file && req.file.path;

  try {
    if (!req.file) {
      return redirectWith(res, "/resume/upload", {
        error: "Choose a PDF or DOCX file first.",
      });
    }

    const { role, company, interviewId } = req.body;

    let extractedText;
    try {
      extractedText = await extractResumeText(filePath);
    } catch (parseError) {
      console.log("Resume parse failed:", parseError.message);
      return redirectWith(res, "/resume/upload", {
        error: "That file couldn't be read. Try exporting it as a fresh PDF.",
      });
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return redirectWith(res, "/resume/upload", {
        error:
          "We couldn't find enough text in that file. Scanned images aren't supported, so try a text-based PDF or DOCX.",
      });
    }

    // Only link to an interview that belongs to this user
    let linkedInterview = null;
    if (interviewId) {
      const owned = await Interview.findOne({ _id: interviewId, user: req.user.id });
      linkedInterview = owned ? owned._id : null;
    }

    const resume = await Resume.create({
      user: req.user.id,
      interview: linkedInterview,
      fileName: req.file.originalname,
      extractedText,
      role: role || "",
      company: company || "",
      generationStatus: "pending",
    });

    try {
      const { skills, questions } = await generateQuestionsFromResume({
        resumeText: extractedText,
        role,
        company,
      });

      resume.skills = skills;
      resume.generatedQuestions = questions;
      resume.generationStatus = "success";
      await resume.save();
    } catch (aiError) {
      console.log("AI generation failed:", aiError.message);
      resume.generationStatus = "failed";
      await resume.save();
      return redirectWith(res, `/resume/${resume._id}`, {
        error: aiMessage(aiError, "Question generation failed. You can try again."),
      });
    }

    res.redirect(`/resume/${resume._id}`);
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume/upload", {
      error: "Something went wrong processing your resume.",
    });
  } finally {
    // The text is stored in the database; the raw file isn't needed any more
    if (filePath) fs.unlink(filePath, () => {});
  }
};

// ==========================
// List all resumes
// ==========================
exports.listResumes = async (req, res) => {
  try {
    const resumes = await Resume.find({ user: req.user.id })
      .select("-extractedText")
      .sort({ createdAt: -1 });

    res.render("resumes", {
      resumes,
      error: req.query.error || null,
      notice: req.query.notice || null,
    });
  } catch (error) {
    console.log(error);
    res.status(500).render("notFound", {
      code: "500",
      message: "Couldn't load your resumes.",
    });
  }
};

// ==========================
// View questions
// ==========================
exports.viewQuestions = async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!resume) {
      return redirectWith(res, "/resume", { error: "Resume not found." });
    }

    res.render("resumeQuestions", { resume, error: req.query.error || null });
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume", { error: "Couldn't load those questions." });
  }
};

// ==========================
// Retry generation
// ==========================
exports.retryGeneration = async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!resume) {
      return redirectWith(res, "/resume", { error: "Resume not found." });
    }

    let errorMessage = null;

    try {
      const { skills, questions } = await generateQuestionsFromResume({
        resumeText: resume.extractedText,
        role: resume.role,
        company: resume.company,
      });

      resume.skills = skills;
      resume.generatedQuestions = questions;
      resume.generationStatus = "success";
    } catch (aiError) {
      console.log("Retry failed:", aiError.message);
      resume.generationStatus = "failed";
      errorMessage = aiMessage(aiError, "Still couldn't generate questions. Try again shortly.");
    }

    await resume.save();
    redirectWith(res, `/resume/${resume._id}`, errorMessage ? { error: errorMessage } : {});
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume", { error: "Couldn't retry generation." });
  }
};

// ==========================
// Submit ALL answers at once -> AI reviews and rates them together
// ==========================
// Only answers that are new or changed since the last review are sent to
// the AI, so re-submitting after editing one answer doesn't re-check the
// rest. Questions left blank are simply skipped.
exports.submitAllAnswers = async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!resume) {
      return redirectWith(res, "/resume", { error: "Resume not found." });
    }

    const submitted =
      req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};

    const toEvaluate = [];
    let hasAnyAnswer = false;

    resume.generatedQuestions.forEach((q) => {
      const text = String(submitted[String(q._id)] || "").trim().slice(0, 4000);
      const previous = (q.userAnswer || "").trim();

      // Answer was cleared: forget its old review
      if (!text) {
        if (previous) {
          q.userAnswer = "";
          q.reviewed = false;
          q.rating = null;
          q.feedback = "";
          q.idealAnswer = "";
        }
        return;
      }

      hasAnyAnswer = true;

      // New or edited answer: needs a (fresh) review
      if (!q.reviewed || text !== previous) {
        q.userAnswer = text;
        q.reviewed = false;
        q.rating = null;
        q.feedback = "";
        q.idealAnswer = "";
        toEvaluate.push(q);
      }
    });

    // Save the text first, so nothing typed is lost if the AI call fails
    await resume.save();

    if (!hasAnyAnswer) {
      return redirectWith(res, `/resume/${resume._id}`, {
        error: "Write at least one answer before submitting.",
      });
    }

    if (toEvaluate.length === 0) {
      return redirectWith(
        res,
        `/resume/${resume._id}`,
        { notice: "Nothing has changed since your last review." },
        "#summary"
      );
    }

    const { results, error: aiError } = await evaluateAnswers({
      items: toEvaluate.map((q) => ({ question: q.question, userAnswer: q.userAnswer })),
      resumeText: resume.extractedText,
      role: resume.role,
    });

    let reviewedCount = 0;
    results.forEach((r, i) => {
      if (!r) return;
      const q = toEvaluate[i];
      q.rating = r.rating;
      q.feedback = r.feedback;
      q.idealAnswer = r.idealAnswer;
      q.reviewed = true;
      reviewedCount++;
    });

    await resume.save();

    const failed = toEvaluate.length - reviewedCount;

    if (reviewedCount === 0) {
      console.log("Answer evaluation failed:", aiError && aiError.message);
      return redirectWith(res, `/resume/${resume._id}`, {
        error: aiMessage(
          aiError,
          "Couldn't check your answers right now. They're saved, so press Submit again to retry."
        ),
      });
    }

    if (failed > 0) {
      console.log("Partial evaluation failure:", aiError && aiError.message);
      return redirectWith(
        res,
        `/resume/${resume._id}`,
        {
          error: `Reviewed ${reviewedCount} of ${toEvaluate.length} answers. The rest are saved, so press Submit again to retry them.`,
        },
        "#summary"
      );
    }

    redirectWith(
      res,
      `/resume/${resume._id}`,
      { notice: `Reviewed ${reviewedCount} ${reviewedCount === 1 ? "answer" : "answers"}.` },
      "#summary"
    );
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume", { error: "Couldn't submit your answers." });
  }
};

// ==========================
// Generate more questions
// ==========================
exports.generateMore = async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!resume) {
      return redirectWith(res, "/resume", { error: "Resume not found." });
    }

    const existingQuestions = resume.generatedQuestions.map((q) => q.question);

    try {
      const { questions } = await generateMoreQuestions({
        resumeText: resume.extractedText,
        role: resume.role,
        company: resume.company,
        existingQuestions,
      });

      resume.generatedQuestions.push(
        ...questions.map((q) => ({
          question: q.question,
          category: q.category,
        }))
      );

      await resume.save();
    } catch (aiError) {
      console.log("Generate more failed:", aiError.message);
      return redirectWith(res, `/resume/${resume._id}`, {
        error: aiMessage(aiError, "Couldn't generate more questions right now. Try again shortly."),
      });
    }

    res.redirect(`/resume/${resume._id}`);
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume", { error: "Couldn't generate more questions." });
  }
};

// ==========================
// Delete a resume
// ==========================
exports.deleteResume = async (req, res) => {
  try {
    const deleted = await Resume.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!deleted) {
      return redirectWith(res, "/resume", { error: "Resume not found." });
    }

    redirectWith(res, "/resume", { notice: "Resume deleted." });
  } catch (error) {
    console.log(error);
    redirectWith(res, "/resume", { error: "Delete failed. Please try again." });
  }
};
