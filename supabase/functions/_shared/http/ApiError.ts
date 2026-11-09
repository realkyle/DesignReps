/** Error codes from api/complete-lesson.md, with their HTTP status. */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  LESSON_NOT_FOUND: 404,
  LESSON_LOCKED: 403,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * One API error in the contract's shape:
 * `{ "error": { code, message, details? } }`. `message` is safe to show users.
 */
export class ApiError {
  private constructor(
    readonly code: ErrorCode,
    readonly message: string,
    readonly details?: Record<string, unknown>,
  ) {}

  static of(code: ErrorCode, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(code, message, details);
  }

  static invalid(field: string, reason: string): ApiError {
    return new ApiError("INVALID_REQUEST", "Something went wrong. Please try again.", { field, reason });
  }

  static unauthenticated(): ApiError {
    return new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  }

  static internal(): ApiError {
    // Never includes internal details; those go to the server log only.
    return new ApiError("INTERNAL_ERROR", "Something went wrong on our side. Please try again.");
  }

  /** True if `code` is one of the contract's codes (used for database results). */
  static isKnownCode(code: unknown): code is ErrorCode {
    return typeof code === "string" && Object.hasOwn(ERROR_STATUS, code);
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(): { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}
