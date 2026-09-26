const { extractChecklist, calculateReadiness } = require("../utils/calculateReadiness");

describe("calculateReadiness", () => {
    test("returns 0 when nothing is checked", () => {
        const checklist = extractChecklist({});
        expect(calculateReadiness(checklist)).toBe(0);
    });

    test("returns 100 when everything is checked", () => {
        const body = { resume: "on", dsa: "on", oop: "on", dbms: "on", sql: "on", hr: "on" };
        const checklist = extractChecklist(body);
        expect(calculateReadiness(checklist)).toBe(100);
    });

    test("rounds correctly for partial completion", () => {
        const body = { resume: "on", dsa: "on" }; // 2 of 6
        const checklist = extractChecklist(body);
        expect(calculateReadiness(checklist)).toBe(33);
    });

    test("treats missing/unchecked checkboxes as false", () => {
        const checklist = extractChecklist({ resume: "on" });
        expect(checklist.dsa).toBe(false);
        expect(checklist.hr).toBe(false);
    });
});
