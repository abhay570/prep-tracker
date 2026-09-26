# Prep Tracker

Track your interviews, tick off a six-item prep checklist, and practise with
AI-generated questions built from your own resume.

## Structure

```
prep-tracker/
  server.js              entry point
  config/db.js            Mongo connection
  controllers/            route handlers
  middleware/              auth, upload, rate limiting, error handling
  models/                  Mongoose schemas (User, Interview, Resume)
  routes/                  Express routers
  utils/                   readiness scoring, resume parsing, Gemini calls
  validators/              express-validator rule sets
  views/                   EJS templates
    partials/sidebar.ejs   left-rail nav (desktop) / bottom tab bar (phone)
    partials/interviewForm.ejs
  public/style.css         dark theme (indigo surfaces, coral–saffron accent)
  tests/                   Jest + Supertest, run against an in-memory Mongo
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy the environment template and fill in real values:
   ```
   cp .env.example .env
   ```
   - `MONGO_URI`: a local MongoDB instance or a MongoDB Atlas connection string.
   - `JWT_SECRET`: generate one with
     `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.
   - `GEMINI_API_KEY`: an API key from Google AI Studio. Question generation and
     answer review won't work without it, but the rest of the app will.
3. Start the app:
   ```
   npm start
   ```
   The server listens on `PORT` (default `4000`).

## Tests

```
npm test
```

Tests spin up an in-memory MongoDB instance (`mongodb-memory-server`), so no
running database is needed to run them.

## Notes on this pass

- `views/resumeQuestion.ejs` was renamed to `resumeQuestions.ejs` to match
  `res.render("resumeQuestions", ...)` in `resumeController.js`.
- The two competing `partials/interviewForm*.ejs` files were merged into one
  canonical `partials/interviewForm.ejs`, matching the `include('partials/interviewForm', ...)`
  calls in `addInterview.ejs` and `editInterview.ejs`.
- `partials/sidebar.ejs` is a left-rail navigation on desktop that collapses to
  a bottom tab bar under 800px width, so it's usable one-handed on a phone.
- Never commit a real `.env`. Rotate any secret that was ever pasted into a
  chat, document, or shared file.
