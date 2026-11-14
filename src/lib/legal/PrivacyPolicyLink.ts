/** Opens a URL in an in-app browser. Matches `WebBrowser.openBrowserAsync`, so tests can pass a fake. */
export type OpenBrowser = (url: string) => Promise<unknown>;

export type OpenResult = { ok: true } | { ok: false; message: string };

/**
 * The public privacy policy, published from `site/privacy/` by the GitHub Pages workflow.
 * App Review (Guideline 5.1.1) requires the app itself to link to it.
 */
export const PRIVACY_POLICY_URL = "https://realkyle.github.io/DesignReps/privacy/";

const OPEN_FAILED_MESSAGE = `Couldn't open the privacy policy. You can read it at ${PRIVACY_POLICY_URL}`;

/**
 * Opens the privacy policy in an in-app browser (Safari View Controller on iOS,
 * Chrome Custom Tabs on Android), so the user stays in the app.
 *
 * Never throws: if no browser can open, the result carries a message that
 * includes the URL, so the user can still reach the policy.
 */
export class PrivacyPolicyLink {
  /** The open in progress, if any. On iOS it stays pending until the user closes the browser. */
  private pending: Promise<OpenResult> | null = null;

  constructor(
    private readonly openBrowser: OpenBrowser,
    private readonly url: string = PRIVACY_POLICY_URL,
  ) {}

  /**
   * Opens the policy. A second tap while it is already opening shares the first
   * call's result, because iOS rejects a second browser and the user would see
   * an error even though the policy opened.
   */
  open(): Promise<OpenResult> {
    this.pending ??= this.openOnce().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async openOnce(): Promise<OpenResult> {
    try {
      await this.openBrowser(this.url);
      return { ok: true };
    } catch {
      return { ok: false, message: OPEN_FAILED_MESSAGE };
    }
  }
}
