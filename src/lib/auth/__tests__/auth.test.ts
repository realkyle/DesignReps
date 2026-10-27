import { AuthFailure } from "../AuthFailure";
import { type AuthClient, AuthService } from "../AuthService";
import { Credentials } from "../Credentials";

describe("Credentials.parse", () => {
  it("normalizes the email and keeps the password as typed", () => {
    const result = Credentials.parse("  Kyle@Example.COM ", "Secret123 ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentials.email).toBe("kyle@example.com");
      expect(result.credentials.password).toBe("Secret123 ");
    }
  });

  it.each([
    ["", "Enter your email."],
    ["not-an-email", "Enter a valid email address."],
    ["a@b", "Enter a valid email address."],
  ])("rejects email %j", (email, message) => {
    expect(Credentials.parse(email, "longenough")).toEqual({ ok: false, errors: { email: message } });
  });

  it.each([
    ["", "Enter your password."],
    ["short", "Use at least 8 characters."],
  ])("rejects password %j", (password, message) => {
    expect(Credentials.parse("a@b.co", password)).toEqual({ ok: false, errors: { password: message } });
  });

  it("reports both fields at once", () => {
    const result = Credentials.parse("", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["email", "password"]);
  });
});

describe("AuthFailure.from", () => {
  it.each([
    [{ code: "invalid_credentials", status: 400 }, "invalid_credentials"],
    [{ code: "email_not_confirmed", status: 400 }, "email_not_confirmed"],
    [{ code: "user_already_exists", status: 422 }, "email_taken"],
    [{ code: "weak_password", status: 422 }, "weak_password"],
    [{ code: "over_request_rate_limit", status: 429 }, "rate_limited"],
    [{ status: 429 }, "rate_limited"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "network"],
    [new TypeError("Network request failed"), "network"],
    [{ code: "something_new", status: 500 }, "unknown"],
    [undefined, "unknown"],
  ])("maps %j to %s", (error, kind) => {
    expect(AuthFailure.from(error).kind).toBe(kind);
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
  return { client, service: new AuthService(client as unknown as AuthClient) };
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

  it("turns a rejected sign-in into a friendly failure", async () => {
    const { service } = fakeClient({
      signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } }),
    });
    const result = await service.signIn("a@b.co", "password1");
    expect(result.ok).toBe(false);
    if (!result.ok && "failure" in result) expect(result.failure.message).toBe("Incorrect email or password.");
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
    await expect(service.signUp("a@b.co", "password1")).resolves.toEqual({ ok: true, status: "signed_in" });
  });

  it("reports confirmation_required when email confirmation is on (no session yet)", async () => {
    const { service } = fakeClient({
      signUp: jest.fn().mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null }),
    });
    await expect(service.signUp("a@b.co", "password1")).resolves.toEqual({
      ok: true,
      status: "confirmation_required",
    });
  });

  it("maps an existing account on sign-up", async () => {
    const { service } = fakeClient({
      signUp: jest.fn().mockResolvedValue({ data: {}, error: { code: "user_already_exists", status: 422 } }),
    });
    const result = await service.signUp("a@b.co", "password1");
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
