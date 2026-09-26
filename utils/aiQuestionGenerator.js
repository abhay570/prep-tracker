// ==========================
// Config
// ==========================
// Set GEMINI_MODEL in .env to change models without touching code.
// GEMINI_MODEL_FALLBACK is optional: if set, it is tried when the primary
// model is out of quota or has been retired (404).
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const FALLBACK_MODEL = process.env.GEMINI_MODEL_FALLBACK || "";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 60000;

// Custom error so controllers can tell quota / model problems apart from
// real bugs and show the user something sensible instead of a stack trace.
class GeminiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = status; // HTTP status from Gemini, if any
    // "QUOTA_EXCEEDED" | "MODEL_NOT_FOUND" | "NETWORK_ERROR" | "BAD_RESPONSE" | "UNKNOWN"
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => Math.min(1000 * Math.pow(2, attempt), 15000);

// ==========================
// Low-level call to a single model
// ==========================
async function callGeminiModel(model, prompt, retries) {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Key goes in a header, not the URL, so it doesn't end up in logs
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (networkErr) {
      // DNS failure, timeout, offline, etc.
      if (attempt < retries) {
        const delay = backoff(attempt);
        console.log(`Network error calling Gemini, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      throw new GeminiError(`Network error reaching Gemini: ${networkErr.message}`, {
        code: "NETWORK_ERROR",
      });
    }

    if (response.ok) {
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];

      // Skip any "thought" parts some models include; keep only the answer text
      const text = parts
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("");

      if (!text) {
        throw new GeminiError("No text content returned from Gemini", { code: "BAD_RESPONSE" });
      }

      return text.replace(/```json|```/g, "").trim();
    }

    // Model overloaded — worth a short backoff-and-retry
    if (response.status === 503 && attempt < retries) {
      const delay = backoff(attempt);
      console.log(`Gemini 503 (overloaded), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(delay);
      continue;
    }

    // Quota exceeded — retrying immediately won't help for a daily cap
    if (response.status === 429) {
      throw new GeminiError(`Gemini quota exceeded for model "${model}"`, {
        status: 429,
        code: "QUOTA_EXCEEDED",
      });
    }

    // Model retired or not available to this API key
    if (response.status === 404) {
      throw new GeminiError(`Gemini model "${model}" was not found or is no longer available`, {
        status: 404,
        code: "MODEL_NOT_FOUND",
      });
    }

    // Any other error: fail immediately
    const errText = await response.text();
    throw new GeminiError(`Gemini API error (${response.status}): ${errText}`, {
      status: response.status,
      code: "UNKNOWN",
    });
  }
}

// ==========================
// Public entry point: primary model, then optional fallback
// ==========================
async function callGemini(prompt, retries = 3) {
  try {
    return await callGeminiModel(PRIMARY_MODEL, prompt, retries);
  } catch (err) {
    const canFallBack =
      err instanceof GeminiError &&
      (err.code === "QUOTA_EXCEEDED" || err.code === "MODEL_NOT_FOUND") &&
      FALLBACK_MODEL &&
      FALLBACK_MODEL !== PRIMARY_MODEL;

    if (!canFallBack) throw err;

    console.log(`Primary model "${PRIMARY_MODEL}" failed (${err.code}), falling back to "${FALLBACK_MODEL}"`);

    try {
      return await callGeminiModel(FALLBACK_MODEL, prompt, retries);
    } catch (fallbackErr) {
      if (fallbackErr instanceof GeminiError) {
        fallbackErr.message = `Primary model failed (${err.code}) and fallback failed: ${fallbackErr.message}`;
      }
      throw fallbackErr;
    }
  }
}

// ==========================
// JSON parsing helper
// ==========================
function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GeminiError(`Gemini returned malformed JSON for ${label}`, { code: "BAD_RESPONSE" });
  }
}

// ==========================
// Generate the initial question set
// ==========================
async function generateQuestionsFromResume({ resumeText, role, company }) {
  const prompt = `
You are an expert technical interviewer. Based on the resume text below, generate interview questions tailored to the candidate's actual background for a "${role || "the target role"}" position${company ? ` at "${company}"` : ""}.

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "skills": ["skill1", "skill2"],
  "questions": [
    { "question": "...", "category": "Technical" },
    { "question": "...", "category": "Behavioral" },
    { "question": "...", "category": "Project Deep-Dive" }
  ]
}

Generate 6 Technical, 4 Behavioral, and 4 Project Deep-Dive questions (14 total). Each question must reference something specific and real from the resume (a named project, tool, past role, or achievement) rather than being generic.

Resume text:
"""
${resumeText.slice(0, 12000)}
"""
`.trim();

  const cleaned = await callGemini(prompt);
  const parsed = parseJson(cleaned, "question generation");

  if (!Array.isArray(parsed.questions)) {
    throw new GeminiError("AI response missing 'questions' array", { code: "BAD_RESPONSE" });
  }

  return {
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    questions: parsed.questions,
  };
}

// ==========================
// Generate additional questions (avoiding repeats)
// ==========================
async function generateMoreQuestions({ resumeText, role, company, existingQuestions }) {
  const existingList = (existingQuestions || []).map((q) => `- ${q}`).join("\n");

  const prompt = `
You are an expert technical interviewer. Based on the resume text below, generate NEW interview questions for a "${role || "the target role"}" position${company ? ` at "${company}"` : ""}.

Do NOT repeat or closely rephrase any of these questions already asked:
${existingList || "(none yet)"}

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "questions": [
    { "question": "...", "category": "Technical" },
    { "question": "...", "category": "Behavioral" },
    { "question": "...", "category": "Project Deep-Dive" }
  ]
}

Generate 4 Technical, 3 Behavioral, and 3 Project Deep-Dive questions (10 total), each referencing something specific and real from the resume.

Resume text:
"""
${resumeText.slice(0, 12000)}
"""
`.trim();

  const cleaned = await callGemini(prompt);
  const parsed = parseJson(cleaned, "follow-up questions");

  if (!Array.isArray(parsed.questions)) {
    throw new GeminiError("AI response missing 'questions' array", { code: "BAD_RESPONSE" });
  }

  return { questions: parsed.questions };
}

// ==========================
// Evaluate a user's answer (or give the ideal answer if left blank)
// ==========================
async function evaluateAnswer({ question, userAnswer, resumeText, role }) {
  const hasAnswer = userAnswer && userAnswer.trim().length > 0;

  const prompt = hasAnswer
    ? `
You are an expert interview coach. The candidate is preparing for a "${role || "job"}" interview.

Question: "${question}"

Candidate's answer:
"""
${userAnswer.slice(0, 4000)}
"""

Evaluate this answer. Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "rating": <integer 1-10>,
  "feedback": "2-4 sentences of specific, constructive feedback on strengths and what to improve",
  "idealAnswer": "A strong example answer to this question, written as if the candidate is speaking, using relevant details from the resume where natural"
}

Resume context (for the ideal answer):
"""
${resumeText.slice(0, 8000)}
"""
`.trim()
    : `
You are an expert interview coach. The candidate skipped this question and wants to see a strong example answer.

Question: "${question}"

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "rating": null,
  "feedback": "A short note encouraging them to practice this one",
  "idealAnswer": "A strong example answer to this question, written as if the candidate is speaking, using relevant details from the resume where natural"
}

Resume context:
"""
${resumeText.slice(0, 8000)}
"""
`.trim();

  const cleaned = await callGemini(prompt);
  const parsed = parseJson(cleaned, "answer evaluation");

  const rating =
    typeof parsed.rating === "number"
      ? Math.min(10, Math.max(1, Math.round(parsed.rating)))
      : null;

  return {
    rating,
    feedback: parsed.feedback || "",
    idealAnswer: parsed.idealAnswer || "",
  };
}

// ==========================
// Evaluate MANY answers at once (used by "Submit all answers")
// ==========================
// Answers are sent to the model in small batches, and the batches run in
// parallel. That keeps each response short enough to be reliable, while
// the person still only waits for one round trip's worth of time.
const EVAL_BATCH_SIZE = 4;

async function evaluateBatch({ items, resumeText, role }) {
  const payload = items.map((item, i) => ({
    id: i + 1,
    question: item.question,
    answer: item.userAnswer.slice(0, 4000),
  }));

  const prompt = `
You are an expert interview coach. The candidate is preparing for a "${role || "job"}" interview.

Below is a JSON list of interview questions with the candidate's answers. Evaluate EACH answer on its own merits.

${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape, with exactly one entry per id:
{
  "evaluations": [
    {
      "id": 1,
      "rating": <integer 1-10>,
      "feedback": "2-4 sentences of specific, constructive feedback on strengths and what to improve",
      "idealAnswer": "A strong example answer to this question, written as if the candidate is speaking, using relevant details from the resume where natural"
    }
  ]
}

Rating guide: 1-3 weak or off-topic, 4-6 partially correct or vague, 7-8 solid, 9-10 excellent and specific.

Resume context (use it for the ideal answers where natural):
"""
${resumeText.slice(0, 8000)}
"""
`.trim();

  const cleaned = await callGemini(prompt);
  const parsed = parseJson(cleaned, "answer evaluation");

  if (!Array.isArray(parsed.evaluations)) {
    throw new GeminiError("AI response missing 'evaluations' array", { code: "BAD_RESPONSE" });
  }

  const byId = new Map(parsed.evaluations.map((e) => [Number(e.id), e]));

  // Aligned with `items`; null where the model skipped or garbled an entry
  return items.map((_, i) => {
    const e = byId.get(i + 1);
    if (!e || typeof e.rating !== "number") return null;

    return {
      rating: Math.min(10, Math.max(1, Math.round(e.rating))),
      feedback: e.feedback || "",
      idealAnswer: e.idealAnswer || "",
    };
  });
}

// items: [{ question, userAnswer }]
// returns: { results: [ {rating, feedback, idealAnswer} | null, ... ], error }
// `results` lines up with `items`. `error` is the first failure, if any,
// so the caller can save whatever succeeded and report the rest.
async function evaluateAnswers({ items, resumeText, role }) {
  const chunks = [];
  for (let start = 0; start < items.length; start += EVAL_BATCH_SIZE) {
    chunks.push({ start, items: items.slice(start, start + EVAL_BATCH_SIZE) });
  }

  const settled = await Promise.allSettled(
    chunks.map((chunk) => evaluateBatch({ items: chunk.items, resumeText, role }))
  );

  const results = new Array(items.length).fill(null);
  let firstError = null;

  settled.forEach((outcome, idx) => {
    if (outcome.status === "fulfilled") {
      outcome.value.forEach((r, i) => {
        results[chunks[idx].start + i] = r;
      });
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  });

  return { results, error: firstError };
}

module.exports = {
  generateQuestionsFromResume,
  generateMoreQuestions,
  evaluateAnswer,
  evaluateAnswers,
  GeminiError,
};
