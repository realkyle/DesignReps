/** The Supabase call this class needs, so tests can pass a fake. */
export type LogEventRpc = (
  fn: "log_event",
  args: { p_type: ClientEventType; p_lesson_id?: string },
) => PromiseLike<{ error: { code?: string; message?: string } | null }>;

/**
 * The events the app reports itself. `lesson_completed` and
 * `scenario_completed` are written by the server inside complete_lesson,
 * so the app can't fake them.
 */
export type ClientEventType = "app_opened" | "lesson_started";

/**
 * Reports usage events for the project metrics through the `log_event`
 * database function (which takes the user from the JWT and rate-limits
 * repeats).
 *
 * Fire-and-forget: methods never throw and never block the UI. A lost event
 * only makes a metric slightly low, so failures are reported to the dev log
 * and otherwise ignored.
 */
export class UsageEvents {
  constructor(
    private readonly rpc: LogEventRpc,
    private readonly report: (message: string) => void = defaultReporter,
  ) {}

  /** The app came to the foreground while signed in. */
  appOpened(): Promise<void> {
    return this.log("app_opened");
  }

  /** The user opened a lesson (by its database ID). */
  lessonStarted(lessonId: string): Promise<void> {
    return this.log("lesson_started", lessonId);
  }

  private async log(type: ClientEventType, lessonId?: string): Promise<void> {
    try {
      const { error } = await this.rpc("log_event", lessonId ? { p_type: type, p_lesson_id: lessonId } : { p_type: type });
      if (error) this.report(`[events] ${type} not logged (code: ${error.code ?? "none"})`);
    } catch {
      this.report(`[events] ${type} not logged (network)`);
    }
  }
}

function defaultReporter(message: string): void {
  if (__DEV__) console.warn(message);
}
