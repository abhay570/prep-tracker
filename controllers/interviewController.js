const Interview = require("../models/Interview");
const Resume = require("../models/Resume");
const {
    extractChecklist,
    calculateReadiness,
} = require("../utils/calculateReadiness");

const STATUSES = ["Scheduled", "Completed", "Selected", "Rejected"];
const DONE_STATUSES = ["Completed", "Selected", "Rejected"];
const TABS = ["upcoming", "completed", "all"];
const SORTS = ["date_asc", "date_desc", "readiness_desc"];

// User input must never be passed to RegExp raw — an unescaped "(" would
// crash the request, and crafted patterns can freeze the server.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redirectWith = (res, path, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return res.redirect(qs ? `${path}?${qs}` : path);
};

// ==========================
// Shared helper — dashboard stats for a user
// ==========================
async function computeStats(userId) {
    const all = await Interview.find({ user: userId }).select("status readiness");

    return {
        total: all.length,
        scheduled: all.filter((i) => i.status === "Scheduled").length,
        // "completed" = every interview that has already happened,
        // whatever the result was
        completed: all.filter((i) => DONE_STATUSES.includes(i.status)).length,
        selected: all.filter((i) => i.status === "Selected").length,
        rejected: all.filter((i) => i.status === "Rejected").length,
        avgReadiness: all.length
            ? Math.round(all.reduce((sum, i) => sum + i.readiness, 0) / all.length)
            : 0,
    };
}

// ==========================
// Dashboard
// ==========================
exports.dashboard = async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const tab = TABS.includes(req.query.tab) ? req.query.tab : "upcoming";

        const filter = { user: req.user.id };

        if (tab === "upcoming") filter.status = "Scheduled";
        else if (tab === "completed") filter.status = { $in: DONE_STATUSES };

        if (q) {
            const regex = new RegExp(escapeRegex(q), "i");
            filter.$or = [{ company: regex }, { role: regex }];
        }

        // Upcoming reads best soonest-first; completed reads best newest-first
        const defaultSort = tab === "completed" ? "date_desc" : "date_asc";
        const sort = SORTS.includes(req.query.sort) ? req.query.sort : defaultSort;

        const sortOption =
            sort === "date_desc"
                ? { interviewDate: -1 }
                : sort === "readiness_desc"
                ? { readiness: -1 }
                : { interviewDate: 1 };

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const [interviews, stats, nextUp] = await Promise.all([
            Interview.find(filter).sort(sortOption),
            computeStats(req.user.id),
            Interview.findOne({
                user: req.user.id,
                status: "Scheduled",
                interviewDate: { $gte: today },
            }).sort({ interviewDate: 1 }),
        ]);

        const daysUntil = nextUp
            ? Math.round((new Date(nextUp.interviewDate) - today) / 86400000)
            : null;

        // Which interviews already have a resume practice set attached
        const idsToCheck = interviews.map((i) => i._id);
        if (nextUp) idsToCheck.push(nextUp._id);

        const linkedResumes = await Resume.find({
            user: req.user.id,
            interview: { $in: idsToCheck },
        }).select("_id interview");

        const resumeByInterview = {};
        linkedResumes.forEach((r) => {
            resumeByInterview[r.interview.toString()] = r._id.toString();
        });

        res.render("dashboard", {
            interviews,
            stats,
            nextUp,
            daysUntil,
            today,
            resumeByInterview,
            tab,
            filters: { q, sort },
            error: req.query.error || null,
            notice: req.query.notice || null,
        });
    } catch (error) {
        console.log(error);
        res.status(500).render("notFound", {
            code: "500",
            message: "Couldn't load your dashboard.",
        });
    }
};

// ==========================
// Dashboard Stats (JSON)
// ==========================
exports.dashboardStats = async (req, res) => {
    try {
        res.json(await computeStats(req.user.id));
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Unable to load stats." });
    }
};

// ==========================
// Add Interview
// ==========================
exports.addPage = (req, res) => {
    res.render("addInterview", { error: req.query.error || null });
};

exports.addInterview = async (req, res) => {
    try {
        const { company, role, interviewDate, status, notes } = req.body;

        const checklist = extractChecklist(req.body);
        const readiness = calculateReadiness(checklist);

        await Interview.create({
            company,
            role,
            interviewDate,
            status,
            notes,
            ...checklist,
            readiness,
            user: req.user.id,
        });

        const tab = status && status !== "Scheduled" ? "completed" : "upcoming";
        redirectWith(res, "/dashboard", { tab, notice: "Interview added." });
    } catch (error) {
        console.log(error);
        redirectWith(res, "/add", {
            error: "Unable to add interview. Please check the form and try again.",
        });
    }
};

// ==========================
// Edit Interview
// ==========================
exports.editPage = async (req, res) => {
    try {
        const interview = await Interview.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!interview) {
            return redirectWith(res, "/dashboard", { error: "Interview not found." });
        }

        res.render("editInterview", { interview, error: req.query.error || null });
    } catch (error) {
        console.log(error);
        redirectWith(res, "/dashboard", {
            error: "Something went wrong loading that interview.",
        });
    }
};

exports.updateInterview = async (req, res) => {
    try {
        const { company, role, interviewDate, status, notes } = req.body;

        const checklist = extractChecklist(req.body);
        const readiness = calculateReadiness(checklist);

        const updated = await Interview.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { company, role, interviewDate, status, notes, ...checklist, readiness },
            { runValidators: true }
        );

        if (!updated) {
            return redirectWith(res, "/dashboard", { error: "Interview not found." });
        }

        redirectWith(res, "/dashboard", {
            tab: status && status !== "Scheduled" ? "completed" : "upcoming",
            notice: "Changes saved.",
        });
    } catch (error) {
        console.log(error);
        redirectWith(res, `/edit/${req.params.id}`, {
            error: "Update failed. Please try again.",
        });
    }
};

// ==========================
// Change status — powers "Mark complete", "Selected", "Rejected", "Undo result"
// ==========================
exports.setStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!STATUSES.includes(status)) {
            return redirectWith(res, "/dashboard", { error: "Invalid status." });
        }

        const updated = await Interview.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { status }
        );

        if (!updated) {
            return redirectWith(res, "/dashboard", { error: "Interview not found." });
        }

        const messages = {
            Scheduled: "Moved back to upcoming.",
            Completed: "Marked as complete.",
            Selected: "Marked as selected. Congratulations!",
            Rejected: "Marked as rejected. On to the next one.",
        };

        redirectWith(res, "/dashboard", {
            tab: status === "Scheduled" ? "upcoming" : "completed",
            notice: messages[status],
        });
    } catch (error) {
        console.log(error);
        redirectWith(res, "/dashboard", { error: "Couldn't update that interview." });
    }
};

// ==========================
// Reschedule — new date, and the interview goes back to "Scheduled"
// ==========================
exports.reschedule = async (req, res) => {
    try {
        const date = new Date(req.body.interviewDate);

        if (isNaN(date.getTime())) {
            return redirectWith(res, "/dashboard", { error: "Enter a valid date." });
        }

        const updated = await Interview.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { interviewDate: date, status: "Scheduled" }
        );

        if (!updated) {
            return redirectWith(res, "/dashboard", { error: "Interview not found." });
        }

        redirectWith(res, "/dashboard", {
            tab: "upcoming",
            notice: "Interview scheduled.",
        });
    } catch (error) {
        console.log(error);
        redirectWith(res, "/dashboard", { error: "Couldn't reschedule that interview." });
    }
};

// ==========================
// Delete Interview
// ==========================
exports.deleteInterview = async (req, res) => {
    try {
        const deleted = await Interview.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!deleted) {
            return redirectWith(res, "/dashboard", { error: "Interview not found." });
        }

        // Keep the practice set, just detach it from the deleted interview
        await Resume.updateMany(
            { user: req.user.id, interview: deleted._id },
            { interview: null }
        );

        redirectWith(res, "/dashboard", { notice: "Interview deleted." });
    } catch (error) {
        console.log(error);
        redirectWith(res, "/dashboard", { error: "Delete failed. Please try again." });
    }
};
