import { AuthFailure } from "../AuthFailure";
import { type AuthClient, AuthService } from "../AuthService";
import { Credentials } from "../Credentials";

const STRONG = "Design_Reps1";

describe("Credentials.forSignUp", () => {
  it("accepts a strong password and normalizes the email", () => {
    const result = Credentials.forSignUp("  Kyle@Example.COM ", STRONG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentials.email).toBe("kyle@example.com");
      expect(result.credentials.password).toBe(STRONG);
    }
  });

  it.each([
    ["_", "Design_Reps1"],
    ["!", "Design!Reps1"],
    ["space", "Design Reps1"],
  ])("counts %s as a special character", (_label, password) => {
    expect(Credentials.forSignUp("a@b.co", password).ok).toBe(true);
  });

  it.each([
    ["too short", "De_sig1", "at least 8 characters"],
    ["no uppercase", "design_reps1", "an uppercase letter"],
    ["no lowercase", "DESIGN_REPS1", "a lowercase letter"],
    ["no number", "Design_Reps", "a number"],
    ["no special character", "DesignReps1", "a special character"],
  ])("rejects a password with %s", (_label, password, rule) => {
    const result = Credentials.forSignUp("a@b.co", password);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.password).toContain(rule);
  });

  it("lists every missing rule at once", () => {
    const result = Credentials.forSignUp("a@b.co", "abc");
    expect(result).toEqual({
      ok: false,
      errors: {
        password:
          "Password needs at least 8 characters, an uppercase letter, a number, a special character (e.g. _ ! @ #).",
      },
    });
  });

  it("asks for a password when it's empty", () => {
    expect(Credentials.forSignUp("a@b.co", "")).toEqual({ ok: false, errors: { password: "Enter a password." } });
  });

  it("reports each rule's status for the live checklist", () => {
    expect(Credentials.checkPassword("design1")).toEqual([
      { description: "at least 8 characters", met: false },
      { description: "an uppercase letter", met: false },
      { description: "a lowercase letter", met: true },
      { description: "a number", met: true },
      { description: "a special character (e.g. _ ! @ #)", met: false },
    ]);
  });

  it("marks every rule met for a strong password", () => {
    expect(Credentials.checkPassword(STRONG).every((rule) => rule.met)).toBe(true);
  });

  it("agrees with forSignUp (checklist all green ⇔ password accepted)", () => {
    for (const password of ["", "abc", "Design_Reps", "design_reps1", STRONG, "Aa1_aaaa"]) {
      const allMet = Credentials.checkPassword(password).every((rule) => rule.met);
      expect(Credentials.forSignUp("a@b.co", password).ok).toBe(allMet);
    }
  });
});

describe("Credentials.forSignIn", () => {
  it("does not apply strength rules, so older accounts can still sign in", () => {
    expect(Credentials.forSignIn("a@b.co", "simple").ok).toBe(true);
  });

  it.each([
    ["", "Enter your email."],
    ["not-an-email", "Enter a valid email address."],
    ["a@b", "Enter a valid email address."],
  ])("rejects email %j", (email, message) => {
    expect(Credentials.forSignIn(email, "anything")).toEqual({ ok: false, errors: { email: message } });
  });

  it("reports both fields at once", () => {
    const result = Credentials.forSignIn("", "");
    expect(result).toEqual({ ok: false, errors: { email: "Enter your email.", password: "Enter your password." } });
  });
});

describe("AuthFailure.from", () => {
  it.each([
    [{ code: "invalid_credentials", status: 400 }, "invalid_credentials"],
    [{ code: "email_not_confirmed", status: 400 }, "email_not_confirmed"],
    [{ code: "user_already_exists", status: 422 }, "email_taken"],
    [{ code: "weak_password", status: 422 }, "weak_password"],
    [{ code: "email_address_invalid", status: 400 }, "email_rejected"],
    [{ code: "email_address_not_authorized", status: 400 }, "email_rejected"],
    [{ code: "signup_disabled", status: 422 }, "signup_disabled"],
    [{ code: "over_request_rate_limit", status: 429 }, "rate_limited"],
    [{ status: 429 }, "rate_limited"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "network"],
    [new TypeError("Network request failed"), "network"],
    [{ code: "something_new", status: 500 }, "unknown"],
    [undefined, "unknown"],
  ])("maps %j to %s", (error, kind) => {
    expect(AuthFailure.from(error).kind).toBe(kind);
  });

  it("keeps the raw code for developer logs", () => {
    expect(AuthFailure.from({ code: "email_address_not_authorized", status: 400 }).code).toBe(
      "email_address_not_authorized",
    );
  });

  it("never exposes the raw server message", () => {
    const failure = AuthFailure.from({ code: "unexpected", message: "internal stack trace…" });
    expect(failure.message).toBe("Something went wrong. Please try again.");
  });
});

/** A fake Supabase auth client; each test sets the responses it needs. */
function fakeClient(overrides: Partial<Record<keyof AuthClient, jest.Mock>> = {}) {
  const client = {
    signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: jest.fn(),
    ...overrides,
  };
  const logFailure = jest.fn();
  return { client, logFailure, service: new AuthService(client as unknown as AuthClient, logFailure) };
}

describe("AuthService", () => {
  it("signs in with the normalized email", async () => {
    const { client, service } = fakeClient();
    await expect(service.signIn(" A@B.co ", "password1")).resolves.toEqual({ ok: true });
    expect(client.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "password1" });
  });

  it("does not call Supabase when the input is invalid", async () => {
    const { client, service } = fakeClient();
    const result = await service.signIn("bad", "x");
    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ email: expect.any(String) }) });
    expect(client.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a weak password on sign-up without calling Supabase", async () => {
    const { client, service } = fakeClient();
    const result = await service.signUp("a@b.co", "password1");
    expect(result).toEqual({ ok: false, fieldErrors: { password: expect.stringContaining("an uppercase letter") } });
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("turns a rejected sign-in into a friendly failure", async () => {
    const { service } = fakeClient({
      signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } }),
    });
    const result = await service.signIn("a@b.co", "password1");
    expect(result.ok).toBe(false);
    if (!result.ok && "failure" in result) expect(result.failure.message).toBe("Incorrect email or password.");
  });

  it("logs failures by code only, for debugging", async () => {
    const { service, logFailure } = fakeClient({
      signUp: jest.fn().mockResolvedValue({ data: {}, error: { code: "email_address_not_authorized", status: 400 } }),
    });
    await service.signUp("a@b.co", STRONG);
    expect(logFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: "email_rejected", code: "email_address_not_authorized" }));
  });

  it("reports a network error instead of throwing", async () => {
    const { service } = fakeClient({
      signInWithPassword: jest.fn().mockRejectedValue(new TypeError("Network request failed")),
    });
    const result = await service.signIn("a@b.co", "password1");
    expect(!result.ok && "failure" in result && result.failure.kind).toBe("network");
  });

  it("signs up and reports signed_in when Supabase returns a session", async () => {
    const { service } = fakeClient();
    await expect(service.signUp("a@b.co", STRONG)).resolves.toEqual({ ok: true, status: "signed_in" });
  });

  it("reports confirmation_required when email confirmation is on (no session yet)", async () => {
    const { service } = fakeClient({
      signUp: jest.fn().mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null }),
    });
    await expect(service.signUp("a@b.co", STRONG)).resolves.toEqual({
      ok: true,
      status: "confirmation_required",
    });
  });

  it("maps an existing account on sign-up", async () => {
    const { service } = fakeClient({
      signUp: jest.fn().mockResolvedValue({ data: {}, error: { code: "user_already_exists", status: 422 } }),
    });
    const result = await service.signUp("a@b.co", STRONG);
    expect(!result.ok && "failure" in result && result.failure.kind).toBe("email_taken");
  });

  it("signs out without throwing even if the network call fails", async () => {
    const { client, service } = fakeClient({ signOut: jest.fn().mockRejectedValue(new Error("offline")) });
    await expect(service.signOut()).resolves.toBeUndefined();
    expect(client.signOut).toHaveBeenCalled();
  });

  it("returns the stored session", async () => {
    const session = { access_token: "t", user: { id: "u1" } };
    const { service } = fakeClient({ getSession: jest.fn().mockResolvedValue({ data: { session } }) });
    await expect(service.currentSession()).resolves.toBe(session);
  });

  it("forwards session changes and can unsubscribe", () => {
    const unsubscribe = jest.fn();
    let emit: (event: string, session: unknown) => void = () => {};
    const { service } = fakeClient({
      onAuthStateChange: jest.fn((callback) => {
        emit = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
    });
    const listener = jest.fn();
    const stop = service.onSessionChange(listener);
    emit("SIGNED_IN", { access_token: "t" });
    emit("SIGNED_OUT", null);
    expect(listener.mock.calls).toEqual([[{ access_token: "t" }], [null]]);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
