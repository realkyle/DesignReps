/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Guards the build configuration (app.json + eas.json) that EAS reads.
 * No build runs in CI, so a broken profile or a forgotten env var would
 * otherwise only show up the day someone runs `eas build`.
 */
const ROOT = resolve(__dirname, "../../..");
const readJson = (file: string) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));

const APP_ID = "io.designreps.app";
const expo = readJson("app.json").expo;
const eas = readJson("eas.json");

/** Variable names documented in .env.example (the list Kyle sets in EAS). */
const documentedEnvNames = new Set(
  readFileSync(join(ROOT, ".env.example"), "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter((name): name is string => name !== undefined),
);

/** Every non-test source file under src/, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("app.json identifiers", () => {
  it("uses the same reverse-DNS ID for iOS and Android", () => {
    expect(expo.ios.bundleIdentifier).toBe(APP_ID);
    expect(expo.android.package).toBe(APP_ID);
  });

  it("leaves build numbers to EAS (remote version source)", () => {
    expect(expo.ios.buildNumber).toBeUndefined();
    expect(expo.android.versionCode).toBeUndefined();
  });
});

describe("eas.json", () => {
  it("keeps build numbers on EAS servers", () => {
    expect(eas.cli.appVersionSource).toBe("remote");
  });

  it("has a preview profile that builds an installable Android APK", () => {
    expect(eas.build.preview.distribution).toBe("internal");
    expect(eas.build.preview.android.buildType).toBe("apk");
  });

  it("bumps the build number on every production build", () => {
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it("gives every build profile an EAS environment, so env vars are loaded", () => {
    for (const [name, profile] of Object.entries<{ environment?: string }>(eas.build)) {
      expect({ name, environment: profile.environment }).toEqual({ name, environment: expect.stringMatching(/^(development|preview|production)$/) });
    }
  });
});

describe("EAS environment variables", () => {
  it("documents every EXPO_PUBLIC_ variable the app reads in .env.example", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(ROOT, "src"))) {
      for (const match of readFileSync(file, "utf8").matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(documentedEnvNames).toContain(name);
  });
});
