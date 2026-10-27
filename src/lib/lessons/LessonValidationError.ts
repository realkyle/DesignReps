/** One problem in a lesson file, located by a readable path such as `steps[3].correctChoiceId`. */
export interface LessonIssue {
  path: string;
  message: string;
}

/**
 * Thrown when a lesson file breaks the format. Carries every issue found,
 * not just the first, so an author can fix a file in one pass.
 */
export class LessonValidationError extends Error {
  readonly issues: readonly LessonIssue[];

  constructor(issues: readonly LessonIssue[], source?: string) {
    const where = source ? ` in ${source}` : "";
    super(
      `Invalid lesson${where} (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((issue) => `  • ${issue.path || "(root)"}: ${issue.message}`).join("\n"),
    );
    this.name = "LessonValidationError";
    this.issues = issues;
  }

  /** Turns a schema path like `["steps", 3, "id"]` into `steps[3].id`. */
  static formatPath(path: readonly PropertyKey[]): string {
    return path.reduce<string>((formatted, segment) => {
      if (typeof segment === "number") return `${formatted}[${segment}]`;
      return formatted ? `${formatted}.${String(segment)}` : String(segment);
    }, "");
  }
}
