import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { AuthFailure } from "./AuthFailure";
import { type CredentialErrors, Credentials } from "./Credentials";

/** Only the Supabase auth calls this service needs, so tests can supply a small fake. */
export type AuthClient = Pick<
  SupabaseClient["auth"],
  "signInWithPassword" | "signUp" | "signOut" | "getSession" | "onAuthStateChange"
>;

export type SignInResult =
  | { ok: true }
  | { ok: false; fieldErrors: CredentialErrors }
  | { ok: false; failure: AuthFailure };

export type SignUpResult =
  | { ok: true; status: "signed_in" | "confirmation_required" }
  | { ok: false; fieldErrors: CredentialErrors }
  | { ok: false; failure: AuthFailure };

/**
 * Account operations for the app: sign up, sign in, sign out, and session
 * tracking. Screens call this instead of Supabase directly, so validation,
 * error wording, and the Supabase dependency live in one tested place.
 *
 * Methods never throw: every outcome is a typed result the UI can render.
 */
export class AuthService {
  /**
   * @param client - Supabase auth (or a fake in tests).
   * @param logFailure - Where failures are reported for debugging. Defaults to
   *   a console warning in development builds only. It logs the error code and
   *   status, never the email, password or tokens.
   */
  constructor(
    private readonly client: AuthClient,
    private readonly logFailure: (failure: AuthFailure) => void = defaultFailureLogger,
  ) {}

  async signIn(email: string, password: string): Promise<SignInResult> {
    const parsed = Credentials.forSignIn(email, password);
    if (!parsed.ok) return { ok: false, fieldErrors: parsed.errors };
    try {
      const { error } = await this.client.signInWithPassword({
        email: parsed.credentials.email,
        password: parsed.credentials.password,
      });
      return error ? { ok: false, failure: this.fail(error) } : { ok: true };
    } catch (error) {
      return { ok: false, failure: this.fail(error) };
    }
  }

  /**
   * Creates an account. When the project requires email confirmation,
   * Supabase returns no session, so the result says the user must check
   * their inbox. (For privacy, Supabase may also answer this way for an
   * email that already exists, so we never reveal which emails have accounts.)
   */
  async signUp(email: string, password: string): Promise<SignUpResult> {
    const parsed = Credentials.forSignUp(email, password);
    if (!parsed.ok) return { ok: false, fieldErrors: parsed.errors };
    try {
      const { data, error } = await this.client.signUp({
        email: parsed.credentials.email,
        password: parsed.credentials.password,
      });
      if (error) return { ok: false, failure: this.fail(error) };
      return { ok: true, status: data.session ? "signed_in" : "confirmation_required" };
    } catch (error) {
      return { ok: false, failure: this.fail(error) };
    }
  }

  /** Signs out on this device. Local sign-out always succeeds, so this never fails visibly. */
  async signOut(): Promise<void> {
    try {
      await this.client.signOut();
    } catch {
      // The session is cleared locally even if the network call fails.
    }
  }

  /** The stored session, if any (read from device storage, no network). */
  async currentSession(): Promise<Session | null> {
    const { data } = await this.client.getSession();
    return data.session;
  }

  /**
   * Calls `listener` whenever the user signs in, signs out, or the session
   * refreshes.
   *
   * @returns a function that stops listening.
   */
  onSessionChange(listener: (session: Session | null) => void): () => void {
    const { data } = this.client.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  }

  private fail(error: unknown): AuthFailure {
    const failure = AuthFailure.from(error);
    this.logFailure(failure);
    return failure;
  }
}

function defaultFailureLogger(failure: AuthFailure): void {
  if (__DEV__) console.warn(`[auth] ${failure.kind} (code: ${failure.code ?? "none"})`);
}
