const request = require("supertest");
const app = require("../server");
const User = require("../models/User");

describe("Auth flows", () => {
    const user = {
        name: "Test User",
        email: "testuser@example.com",
        password: "Password123",
    };

    test("registers a new user and redirects to /login", async () => {
        const res = await request(app).post("/register").send(user);

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/login");

        const saved = await User.findOne({ email: user.email });
        expect(saved).not.toBeNull();
        expect(saved.password).not.toBe(user.password); // must be hashed
    });

    test("rejects registration with an invalid email", async () => {
        const res = await request(app)
            .post("/register")
            .send({ ...user, email: "not-an-email" });

        expect(res.status).toBe(400);
    });

    test("rejects registration with a weak password", async () => {
        const res = await request(app)
            .post("/register")
            .send({ ...user, email: "weak@example.com", password: "abc" });

        expect(res.status).toBe(400);
    });

    test("prevents duplicate registration with the same email", async () => {
        await request(app).post("/register").send(user);
        const res = await request(app).post("/register").send(user);

        expect(res.status).toBe(409);
    });

    test("logs in with correct credentials and sets a cookie", async () => {
        await request(app).post("/register").send(user);

        const res = await request(app)
            .post("/login")
            .send({ email: user.email, password: user.password });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/dashboard");
        expect(res.headers["set-cookie"]).toBeDefined();
        expect(res.headers["set-cookie"][0]).toMatch(/token=/);
    });

    test("rejects login with wrong password", async () => {
        await request(app).post("/register").send(user);

        const res = await request(app)
            .post("/login")
            .send({ email: user.email, password: "WrongPassword1" });

        expect(res.status).toBe(401);
    });

    test("rejects login for a non-existent email", async () => {
        const res = await request(app)
            .post("/login")
            .send({ email: "nobody@example.com", password: "Password123" });

        expect(res.status).toBe(401);
    });

    test("blocks unauthenticated access to the dashboard", async () => {
        const res = await request(app).get("/dashboard");

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/login");
    });
});
