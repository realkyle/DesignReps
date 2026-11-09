/** The Supabase call this client needs, so tests can pass a fake. */
export type InvokeDeleteFunction = (
  name: string,
  options: { method: "POST" },
) => Promise<{ error: { context?: unknown; message?: string } | null }>;

export type DeletionResult = { ok: true } | { ok: false; message: string };

/** The word the user types to confirm, so deletion can't happen by a stray tap. */
export const DELETE_CONFIRMATION_WORD = "DELETE";

const NETWORK_MESSAGE = "Couldn't reach the server. Your account was not deleted. Please try again.";
const FAILED_MESSAGE = "Your account couldn't be deleted. Please try again.";

/**
 * Permanently deletes the signed-in user's account through the
 * `delete-account` Edge Function, then signs out on this device.
 *
 * Never throws: every outcome is a typed result the screen can render.
 * On failure nothing is signed out, so the user can retry.
 */
export class AccountDeletionClient {
  constructor(
    private readonly invoke: InvokeDeleteFunction,
    private readonly signOut: () => Promise<void>,
  ) {}

  /** True only for the exact confirmation word (spaces around it are ignored). */
  static isConfirmed(typed: string): boolean {
    return typed.trim() === DELETE_CONFIRMATION_WORD;
  }

  async deleteAccount(): Promise<DeletionResult> {
    try {
      const { error } = await this.invoke("delete-account", { method: "POST" });
      if (error) return { ok: false, message: AccountDeletionClient.hasResponse(error) ? FAILED_MESSAGE : NETWORK_MESSAGE };
    } catch {
      return { ok: false, message: NETWORK_MESSAGE };
    }
    // The account is gone; clear the stored session so the app returns to sign-in.
    await this.signOut();
    return { ok: true };
  }

  /** An HTTP error carries the response; a network failure doesn't. */
  private static hasResponse(error: { context?: unknown }): boolean {
    return typeof (error.context as { status?: unknown } | undefined)?.status === "number";
  }
}
