/**
 * Triggers five known, harmless errors against a Supabase project, so the
 * daily-review queries can be checked (docs: "Backend monitoring").
 *
 *   npm run monitor:trigger
 *
 * Needs four variables in your shell (this script never reads .env files
 * and never prints their values):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   MONITOR_TEST_EMAIL (the +monitor account), MONITOR_TEST_PASSWORD.
 *
 * Exits with 1 if any response didn't have the expected status.
 */
import { MonitoringTriggers } from "./MonitoringTriggers";

async function main(): Promise<void> {
  const triggers = MonitoringTriggers.of(
    {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      testEmail: process.env.MONITOR_TEST_EMAIL,
      testPassword: process.env.MONITOR_TEST_PASSWORD,
    },
    (input, init) => fetch(input, init),
  );

  const startedAt = new Date().toISOString();
  const results = await triggers.runAll();

  console.log(`Triggered at ${startedAt} (UTC). Look for these in the logs:\n`);
  for (const r of results) {
    const verdict = r.ok ? "OK  " : "FAIL";
    console.log(`${verdict} ${r.id}. ${r.name}: expected ${r.expectedStatus}, got ${r.actualStatus}${r.code ? ` (${r.code})` : ""}`);
    console.log(`        → ${r.whereToLook}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
