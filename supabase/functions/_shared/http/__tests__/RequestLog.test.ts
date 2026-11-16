import { RequestLog } from "../RequestLog.ts";

describe("RequestLog.levelFor", () => {
  it.each([
    [200, "info"],
    [204, "info"],
    [399, "info"],
    [400, "warn"],
    [401, "warn"],
    [404, "warn"],
    [499, "warn"],
    [500, "error"],
    [503, "error"],
  ])("maps %i to %s", (status, level) => {
    expect(RequestLog.levelFor(status)).toBe(level);
  });
});

describe("RequestLog.summary", () => {
  it("writes one JSON line with fn, level, status, code and rounded ms", () => {
    const line = RequestLog.summary({ fn: "complete-lesson", status: 404, ms: 87.6, code: "LESSON_NOT_FOUND" });
    expect(JSON.parse(line)).toEqual({ fn: "complete-lesson", level: "warn", status: 404, code: "LESSON_NOT_FOUND", ms: 88 });
  });

  it("leaves code out on success", () => {
    const line = RequestLog.summary({ fn: "delete-account", status: 204, ms: 12 });
    expect(JSON.parse(line)).toEqual({ fn: "delete-account", level: "info", status: 204, ms: 12 });
  });

  it("marks a 500 as error", () => {
    const line = RequestLog.summary({ fn: "complete-lesson", status: 500, ms: 5, code: "INTERNAL_ERROR" });
    expect(JSON.parse(line).level).toBe("error");
  });
});

describe("RequestLog.failure", () => {
  it("keeps only name, code and message from a database error", () => {
    const dbError = { name: "PostgrestError", code: "P0001", message: "boom", details: "row data", hint: "secret hint" };
    const parsed = JSON.parse(RequestLog.failure("complete-lesson", "complete-lesson failed", dbError));
    expect(parsed).toEqual({
      fn: "complete-lesson",
      level: "error",
      msg: "complete-lesson failed",
      error: { name: "PostgrestError", code: "P0001", message: "boom" },
    });
    expect(JSON.stringify(parsed)).not.toContain("row data");
    expect(JSON.stringify(parsed)).not.toContain("secret hint");
  });

  it("handles a plain Error (code is left out when missing)", () => {
    const parsed = JSON.parse(RequestLog.failure("delete-account", "delete-account failed", new Error("network down")));
    expect(parsed.error).toEqual({ name: "Error", message: "network down" });
  });

  it("handles a non-object thrown value", () => {
    const parsed = JSON.parse(RequestLog.failure("delete-account", "delete-account failed", "oops"));
    expect(parsed.error).toEqual({ message: "oops" });
  });

  it("does not crash on an object without a string message", () => {
    const parsed = JSON.parse(RequestLog.failure("x", "x failed", { code: 42 }));
    expect(parsed.error).toEqual({ message: "unknown error" });
  });
});

describe("RequestLog.errorCodeOf", () => {
  it("reads the code from an API error body", () => {
    expect(RequestLog.errorCodeOf(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sign in" } }))).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["a null body", null],
    ["an empty body", ""],
    ["a success body", JSON.stringify({ xpEarned: 10 })],
    ["invalid JSON", "{not json"],
    ["a non-string code", JSON.stringify({ error: { code: 5 } })],
    ["JSON null", "null"],
  ])("returns undefined for %s", (_label, body) => {
    expect(RequestLog.errorCodeOf(body)).toBeUndefined();
  });
});
