// Extracts the six prep-checklist booleans from a request body
// (checkbox fields arrive as the string "on" when checked, or are
// absent entirely when unchecked) and turns them into a 0-100 score.
const CHECKLIST_FIELDS = ["resume", "dsa", "oop", "dbms", "sql", "hr"];

function extractChecklist(body) {
    const checklist = {};
    for (const field of CHECKLIST_FIELDS) {
        checklist[field] = body[field] === "on";
    }
    return checklist;
}

function calculateReadiness(checklist) {
    const score = CHECKLIST_FIELDS.reduce(
        (total, field) => total + (checklist[field] ? 1 : 0),
        0
    );
    return Math.round((score / CHECKLIST_FIELDS.length) * 100);
}

module.exports = { extractChecklist, calculateReadiness, CHECKLIST_FIELDS };
