/**
 * Edge Function entry point: wires DeleteAccountHandler to Supabase.
 * All logic lives in the handler (unit-tested); this file only connects it.
 *
 * Deleting an auth user needs the admin API, which needs the service-role
 * key. That key is provided by Supabase to every Edge Function and never
 * leaves the server.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { RESPONSE_HEADERS } from "../_shared/http/Http.ts";
import { DeleteAccountHandler } from "./DeleteAccountHandler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = new DeleteAccountHandler({
  async verifyAccessToken(token) {
    const { data, error } = await admin.auth.getClaims(token);
    if (error || !data?.claims?.sub || data.claims.role !== "authenticated") return null;
    return data.claims.sub;
  },

  async deleteUser(userId) {
    // Hard delete (not soft): the cascade removes users, progress and events.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },

  logError(message, error) {
    console.error(message, error);
  },
});

Deno.serve(async (req) => {
  const started = performance.now();
  const response = await handler.handle({
    method: req.method,
    authorization: req.headers.get("Authorization"),
    readBody: () => req.text(),
  });
  // Never logs the user ID: after deletion, nothing should tie logs to the person.
  console.log(JSON.stringify({ fn: "delete-account", status: response.status, ms: Math.round(performance.now() - started) }));
  return new Response(response.body, { status: response.status, headers: RESPONSE_HEADERS });
});
