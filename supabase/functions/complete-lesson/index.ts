/**
 * Edge Function entry point: wires CompleteLessonHandler to Supabase.
 * All logic lives in the handler (unit-tested); this file only connects it.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to
 * every Edge Function automatically. The service-role key stays on the
 * server; it's what allows calling complete_lesson.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { CompleteLessonHandler } from "./CompleteLessonHandler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = new CompleteLessonHandler({
  async verifyAccessToken(token) {
    // Verifies the token's signature and expiry. Only signed-in users
    // (role "authenticated") count: the public key alone is not a user.
    const { data, error } = await admin.auth.getClaims(token);
    if (error || !data?.claims?.sub || data.claims.role !== "authenticated") return null;
    return data.claims.sub;
  },

  async completeLesson({ userId, lessonId, answers, timezone }) {
    const { data, error } = await admin.rpc("complete_lesson", {
      p_user_id: userId,
      p_lesson_id: lessonId,
      p_answers: answers,
      p_timezone: timezone,
    });
    if (error) throw error;
    return data;
  },

  logError(message, error) {
    console.error(message, error);
  },
});

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const started = performance.now();
  const response = await handler.handle({
    method: req.method,
    authorization: req.headers.get("Authorization"),
    readBody: () => req.text(),
  });
  // Duration feeds the "95% under 1 second" performance metric.
  console.log(JSON.stringify({ fn: "complete-lesson", status: response.status, ms: Math.round(performance.now() - started) }));
  return new Response(response.body, { status: response.status, headers: HEADERS });
});
