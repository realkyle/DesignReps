/**
 * Measures complete-lesson latency (p50/p95) against a Supabase project.
 *
 *   npm run perf:complete-lesson            # 3 warm-up + 50 measured calls
 *   npm run perf:complete-lesson -- 100     # 3 warm-up + 100 measured calls
 *
 * Needs the same four shell variables as monitor:trigger (this script never
 * reads .env files and never prints their values):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   MONITOR_TEST_EMAIL (the +monitor account), MONITOR_TEST_PASSWORD.
 *
 * Writes only the +monitor account's own progress row and lesson_completed
 * events. Exits with 1 if any measured call did not return 200.
 */
import { CompleteLessonBenchmark } from "./CompleteLessonBenchmark";

const WARMUP_RUNS = 3;
const DEFAULT_MEASURED_RUNS = 50;

async function main(): Promise<void> {
  const measuredRuns = Number(process.argv[2] ?? DEFAULT_MEASURED_RUNS);
  if (!Number.isInteger(measuredRuns) || measuredRuns < 1) throw new Error("Run count must be a positive integer.");

  const benchmark = CompleteLessonBenchmark.of(
    {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      testEmail: process.env.MONITOR_TEST_EMAIL,
      testPassword: process.env.MONITOR_TEST_PASSWORD,
    },
    (input, init) => fetch(input, init),
    () => performance.now(),
  );

  const startedAt = new Date().toISOString();
  const r = await benchmark.run({ warmupRuns: WARMUP_RUNS, measuredRuns });
  const ms = (n: number): string => `${Math.round(n)} ms`;

  console.log(`complete-lesson, started ${startedAt} (UTC), lesson ${r.lessonId}`);
  console.log(`  first call (may be a cold start): ${ms(r.firstCallMs)}`);
  console.log(`  measured: ${r.measuredRuns} sequential calls after ${WARMUP_RUNS} warm-ups`);
  console.log(`  p50 ${ms(r.p50Ms)}   p95 ${ms(r.p95Ms)}   max ${ms(r.maxMs)}   failures ${r.failures}`);
  if (r.failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
