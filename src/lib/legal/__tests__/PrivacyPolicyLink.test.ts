/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import * as WebBrowser from "expo-web-browser";

import { privacyPolicyLink } from "..";
import { PRIVACY_POLICY_URL, PrivacyPolicyLink } from "../PrivacyPolicyLink";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: "opened" }) }));

const ROOT = resolve(__dirname, "../../../..");

describe("PrivacyPolicyLink", () => {
  it("opens the public privacy policy URL, and nothing else", async () => {
    const openBrowser = jest.fn().mockResolvedValue({ type: "opened" });

    const result = await new PrivacyPolicyLink(openBrowser).open();

    expect(result).toEqual({ ok: true });
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(openBrowser).toHaveBeenCalledWith("https://realkyle.github.io/DesignReps/privacy/");
  });

  it("treats the iOS 'cancel' result (user closed the browser) as success", async () => {
    const result = await new PrivacyPolicyLink(jest.fn().mockResolvedValue({ type: "cancel" })).open();

    expect(result).toEqual({ ok: true });
  });

  it("returns a message with the URL instead of throwing when no browser can open", async () => {
    const result = await new PrivacyPolicyLink(jest.fn().mockRejectedValue(new Error("no browser"))).open();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(PRIVACY_POLICY_URL);
  });

  it("opens the browser once when tapped twice while it is opening", async () => {
    let finish: () => void = () => {};
    const openBrowser = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const link = new PrivacyPolicyLink(openBrowser);

    const first = link.open();
    const second = link.open();
    finish();

    expect(await first).toEqual({ ok: true });
    expect(await second).toEqual({ ok: true });
    expect(openBrowser).toHaveBeenCalledTimes(1);
  });

  it("can open again after the browser is closed, and after a failure", async () => {
    const openBrowser = jest.fn().mockRejectedValueOnce(new Error("no browser")).mockResolvedValue({ type: "cancel" });
    const link = new PrivacyPolicyLink(openBrowser);

    expect((await link.open()).ok).toBe(false);
    expect(await link.open()).toEqual({ ok: true });
    expect(await link.open()).toEqual({ ok: true });
    expect(openBrowser).toHaveBeenCalledTimes(3);
  });
});

describe("privacyPolicyLink (the app-wide instance)", () => {
  it("opens the policy with expo-web-browser", async () => {
    expect(await privacyPolicyLink.open()).toEqual({ ok: true });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});

describe("PRIVACY_POLICY_URL", () => {
  it("is HTTPS on the repo's GitHub Pages site (the repo name in the path is case-sensitive)", () => {
    expect(PRIVACY_POLICY_URL).toMatch(/^https:\/\/realkyle\.github\.io\/DesignReps\//);
  });

  it("points at a page the Pages workflow actually publishes", () => {
    // pages.yml uploads site/ as the site root, so /DesignReps/<path> is site/<path>.
    const workflow = readFileSync(join(ROOT, ".github/workflows/pages.yml"), "utf8");
    expect(workflow).toMatch(/path:\s*site\s*$/m);

    const pagePath = new URL(PRIVACY_POLICY_URL).pathname.replace(/^\/DesignReps\//, "");
    expect(existsSync(join(ROOT, "site", pagePath, "index.html"))).toBe(true);
  });
});
