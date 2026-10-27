/** Field-level problems, shaped for showing under each input. */
export interface CredentialErrors {
  email?: string;
  password?: string;
}

export type CredentialsResult =
  | { ok: true; credentials: Credentials }
  | { ok: false; errors: CredentialErrors };

/**
 * A validated email + password pair.
 *
 * Checking input before calling Supabase gives instant, field-specific
 * feedback and avoids spending the auth rate limit on requests that would
 * fail anyway. The server still enforces its own rules; this is not a
 * security boundary.
 */
export class Credentials {
  /**
   * App minimum. Supabase's default is 6; set its Auth "Minimum password
   * length" to 8 so the server enforces the same rule.
   */
  static readonly MIN_PASSWORD_LENGTH = 8;

  private constructor(
    private readonly emailAddress: string,
    private readonly secret: string,
  ) {}

  /** Normalizes the email (trimmed, lower-case) and validates both fields. */
  static parse(email: string, password: string): CredentialsResult {
    const normalizedEmail = email.trim().toLowerCase();
    const errors: CredentialErrors = {};

    if (!normalizedEmail) {
      errors.email = "Enter your email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Enter your password.";
    } else if (password.length < Credentials.MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${Credentials.MIN_PASSWORD_LENGTH} characters.`;
    }

    if (errors.email || errors.password) return { ok: false, errors };
    return { ok: true, credentials: new Credentials(normalizedEmail, password) };
  }

  get email(): string {
    return this.emailAddress;
  }

  get password(): string {
    return this.secret;
  }
}
