export type AuthFailureKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "unknown";

const MESSAGES: Record<AuthFailureKind, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  email_taken: "An account with this email already exists. Try signing in.",
  weak_password: "That password is too weak. Try a longer one.",
  rate_limited: "Too many attempts. Please wait a minute and try again.",
  network: "Can't reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

/** The parts of a Supabase auth error this class reads. */
interface SupabaseAuthErrorLike {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

/**
 * A sign-in/sign-up failure with a stable `kind` for logic and a message
 * that is safe to show users. Raw Supabase messages are never shown, so
 * wording changes upstream can't leak internals or break the UI.
 */
export class AuthFailure {
  private constructor(readonly kind: AuthFailureKind) {}

  /** Maps a Supabase auth error (or any thrown value) to a known failure kind. */
  static from(error: unknown): AuthFailure {
    const e = (error ?? {}) as SupabaseAuthErrorLike;
    if (e.name === "AuthRetryableFetchError" || e.status === 0 || error instanceof TypeError) {
      return new AuthFailure("network");
    }
    switch (e.code) {
      case "invalid_credentials":
        return new AuthFailure("invalid_credentials");
      case "email_not_confirmed":
        return new AuthFailure("email_not_confirmed");
      case "user_already_exists":
      case "email_exists":
        return new AuthFailure("email_taken");
      case "weak_password":
        return new AuthFailure("weak_password");
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return new AuthFailure("rate_limited");
      default:
        return new AuthFailure(e.status === 429 ? "rate_limited" : "unknown");
    }
  }

  /** User-facing explanation for this failure. */
  get message(): string {
    return MESSAGES[this.kind];
  }
}
