import { ApiError } from "../_shared/http/ApiError.ts";
import { bearerToken, type HttpRequest, type HttpResponse } from "../_shared/http/Http.ts";

/** What the handler needs from the outside world. Injected, so tests use fakes. */
export interface DeleteAccountDeps {
  /** Verifies a Supabase access token. Returns the user's ID, or null if it isn't valid. */
  verifyAccessToken(token: string): Promise<string | null>;
  /**
   * Permanently deletes the auth user. The database cascades the delete to
   * `users`, `progress` and `events`, so no personal data is left behind.
   */
  deleteUser(userId: string): Promise<void>;
  /** Server-side log for unexpected failures. Never sent to the client. */
  logError(message: string, error: unknown): void;
}

/**
 * POST /delete-account: permanently deletes the signed-in user's account
 * (required by the App Store for apps with sign-up).
 *
 * There is no body: the account to delete always comes from the verified
 * token, so a user can only ever delete themselves. Returns 204 on success.
 */
export class DeleteAccountHandler {
  constructor(private readonly deps: DeleteAccountDeps) {}

  async handle(request: HttpRequest): Promise<HttpResponse> {
    if (request.method === "OPTIONS") return { status: 204, body: null };
    if (request.method !== "POST") {
      return DeleteAccountHandler.error(ApiError.of("METHOD_NOT_ALLOWED", "Use POST."));
    }

    try {
      const token = bearerToken(request.authorization);
      const userId = token ? await this.deps.verifyAccessToken(token) : null;
      if (!userId) return DeleteAccountHandler.error(ApiError.unauthenticated());

      await this.deps.deleteUser(userId);
      return { status: 204, body: null };
    } catch (error) {
      this.deps.logError("delete-account failed", error);
      return DeleteAccountHandler.error(ApiError.internal());
    }
  }

  private static error(error: ApiError): HttpResponse {
    return { status: error.status, body: JSON.stringify(error.toBody()) };
  }
}
