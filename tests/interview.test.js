const request = require("supertest");
const app = require("../server");
const Interview = require("../models/Interview");

// Small helper: registers + logs in a user, returns the session cookie
async function loginAsNewUser(email) {
    const user = { name: "Tester", email, password: "Password123" };
    await request(app).post("/register").send(user);
    const res = await request(app)
        .post("/login")
        .send({ email: user.email, password: user.password });
    return res.headers["set-cookie"];
}

describe("Interview CRUD", () => {
    let cookie;

    beforeEach(async () => {
        cookie = await loginAsNewUser("owner@example.com");
    });

    const sampleInterview = {
        company: "Google",
        role: "SDE Intern",
        interviewDate: "2026-12-01",
        status: "Scheduled",
        notes: "Focus on graphs",
        resume: "on",
        dsa: "on",
    };

    test("creates an interview and computes readiness correctly", async () => {
        const res = await request(app)
            .post("/add")
            .set("Cookie", cookie)
            .send(sampleInterview);

        expect(res.status).toBe(302);

        const saved = await Interview.findOne({ company: "Google" });
        expect(saved).not.toBeNull();
        // resume + dsa checked out of 6 fields = 33% (rounded)
        expect(saved.readiness).toBe(33);
        expect(saved.oop).toBe(false);
    });

    test("rejects an interview missing required fields", async () => {
        const res = await request(app)
            .post("/add")
            .set("Cookie", cookie)
            .send({ company: "Google" }); // missing role & date

        expect(res.status).toBe(400);
    });

    test("lists only the logged-in user's interviews", async () => {
        await request(app).post("/add").set("Cookie", cookie).send(sampleInterview);

        const otherCookie = await loginAsNewUser("other@example.com");
        await request(app)
            .post("/add")
            .set("Cookie", otherCookie)
            .send({ ...sampleInterview, company: "Amazon" });

        const res = await request(app).get("/dashboard").set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.text).toContain("Google");
        expect(res.text).not.toContain("Amazon");
    });

    test("filters the dashboard by status", async () => {
        await request(app).post("/add").set("Cookie", cookie).send(sampleInterview);
        await request(app)
            .post("/add")
            .set("Cookie", cookie)
            .send({ ...sampleInterview, company: "Meta", status: "Rejected" });

        const res = await request(app)
            .get("/dashboard?status=Rejected")
            .set("Cookie", cookie);

        expect(res.text).toContain("Meta");
        expect(res.text).not.toContain("Google");
    });

    test("prevents a user from editing another user's interview", async () => {
        const created = await request(app)
            .post("/add")
            .set("Cookie", cookie)
            .send(sampleInterview);

        const interview = await Interview.findOne({ company: "Google" });

        const otherCookie = await loginAsNewUser("intruder@example.com");
        const res = await request(app)
            .post(`/edit/${interview._id}`)
            .set("Cookie", otherCookie)
            .send({ ...sampleInterview, company: "Hacked" });

        expect(res.status).toBe(404);

        const unchanged = await Interview.findById(interview._id);
        expect(unchanged.company).toBe("Google");
    });

    test("deletes an interview owned by the current user", async () => {
        await request(app).post("/add").set("Cookie", cookie).send(sampleInterview);
        const interview = await Interview.findOne({ company: "Google" });

        const res = await request(app)
            .post(`/delete/${interview._id}`)
            .set("Cookie", cookie);

        expect(res.status).toBe(302);
        const gone = await Interview.findById(interview._id);
        expect(gone).toBeNull();
    });
});
