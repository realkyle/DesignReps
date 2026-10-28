/** Field-level problems, shaped for showing under each input. */
export interface CredentialErrors {
  email?: string;
  password?: string;
}

export type CredentialsResult =
  | { ok: true; credentials: Credentials }
  | { ok: false; errors: CredentialErrors };

/** A password rule and whether a given password satisfies it. */
export interface PasswordRuleStatus {
  description: string;
  met: boolean;
}

/** One password strength rule, with the phrase used to name it when it's missing. */
interface PasswordRule {
  description: string;
  test: (password: string) => boolean;
}

/**
 * A validated email + password pair.
 *
 * Checking input before calling Supabase gives instant, field-specific
 * feedback and avoids spending the auth rate limit on requests that would
 * fail anyway. The server still enforces its own rules; this is not a
 * security boundary.
 *
 * Strength rules apply only to NEW passwords (`forSignUp`). Sign-in only
 * checks that a password was entered, so accounts created under older rules
 * can still sign in.
 */
export class Credentials {
  /**
   * App minimum. Supabase's default is 6; set its Auth "Minimum password
   * length" to 8 so the server enforces the same rule.
   */
  static readonly MIN_PASSWORD_LENGTH = 8;

  /**
   * Requirements for a new password. "Special character" is anything that
   * isn't a letter or digit, so `_` counts, matching Supabase's
   * "lowercase, uppercase, digits and symbols" option.
   */
  static readonly PASSWORD_RULES: readonly PasswordRule[] = [
    { description: `at least ${Credentials.MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= Credentials.MIN_PASSWORD_LENGTH },
    { description: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
    { description: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
    { description: "a number", test: (p) => /[0-9]/.test(p) },
    { description: "a special character (e.g. _ ! @ #)", test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  private constructor(
    private readonly emailAddress: string,
    private readonly secret: string,
  ) {}

  /** For creating an account: valid email plus every password rule. */
  static forSignUp(email: string, password: string): CredentialsResult {
    return Credentials.build(email, password, Credentials.newPasswordError(password));
  }

  /** For signing in: valid email and a non-empty password (no strength rules). */
  static forSignIn(email: string, password: string): CredentialsResult {
    return Credentials.build(email, password, password ? undefined : "Enter your password.");
  }

  /**
   * Which password rules `password` meets, in display order. Drives the live
   * checklist on the sign-up screen; uses the same rules as `forSignUp`, so
   * the checklist and the validation can never disagree.
   */
  static checkPassword(password: string): PasswordRuleStatus[] {
    return Credentials.PASSWORD_RULES.map((rule) => ({ description: rule.description, met: rule.test(password) }));
  }

  get email(): string {
    return this.emailAddress;
  }

  get password(): string {
    return this.secret;
  }

  private static build(email: string, password: string, passwordError: string | undefined): CredentialsResult {
    const normalizedEmail = email.trim().toLowerCase();
    const errors: CredentialErrors = {};
    const emailError = Credentials.emailError(normalizedEmail);
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;

    if (errors.email || errors.password) return { ok: false, errors };
    return { ok: true, credentials: new Credentials(normalizedEmail, password) };
  }

  private static emailError(email: string): string | undefined {
    if (!email) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    return undefined;
  }

  /** Names every rule the password misses, so the user can fix them all at once. */
  private static newPasswordError(password: string): string | undefined {
    if (!password) return "Enter a password.";
    const missing = Credentials.PASSWORD_RULES.filter((rule) => !rule.test(password));
    if (missing.length === 0) return undefined;
    return `Password needs ${missing.map((rule) => rule.description).join(", ")}.`;
  }
}
