export type AuthFailureKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "email_rejected"
  | "signup_disabled"
  | "rate_limited"
  | "network"
  | "unknown";

const MESSAGES: Record<AuthFailureKind, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  email_taken: "An account with this email already exists. Try signing in.",
  weak_password: "That password is too weak. Try a longer one.",
  email_rejected: "That email address can't be used. Please use a real email you can access.",
  signup_disabled: "New sign-ups are turned off right now.",
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
  /**
   * @param kind - Stable category used by the UI.
   * @param code - Supabase's raw error code, kept for developer logs only (never shown to users).
   */
  private constructor(
    readonly kind: AuthFailureKind,
    readonly code?: string,
  ) {}

  /** Maps a Supabase auth error (or any thrown value) to a known failure kind. */
  static from(error: unknown): AuthFailure {
    const e = (error ?? {}) as SupabaseAuthErrorLike;
    if (e.name === "AuthRetryableFetchError" || e.status === 0 || error instanceof TypeError) {
      return new AuthFailure("network", e.code);
    }
    return new AuthFailure(AuthFailure.kindForCode(e.code, e.status), e.code);
  }

  private static kindForCode(code: string | undefined, status: number | undefined): AuthFailureKind {
    switch (code) {
      case "invalid_credentials":
        return "invalid_credentials";
      case "email_not_confirmed":
        return "email_not_confirmed";
      case "user_already_exists":
      case "email_exists":
        return "email_taken";
      case "weak_password":
        return "weak_password";
      // Invalid domain, or Supabase's built-in mailer refusing addresses
      // outside the project's team while "Confirm email" is on.
      case "email_address_invalid":
      case "email_address_not_authorized":
        return "email_rejected";
      case "signup_disabled":
      case "email_provider_disabled":
        return "signup_disabled";
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return "rate_limited";
      default:
        return status === 429 ? "rate_limited" : "unknown";
    }
  }

  /** User-facing explanation for this failure. */
  get message(): string {
    return MESSAGES[this.kind];
  }
}
