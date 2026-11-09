/** The parts of an HTTP request a handler looks at, so handlers can be tested without a server. */
export interface HttpRequest {
  method: string;
  authorization: string | null;
  readBody(): Promise<string>;
}

export interface HttpResponse {
  status: number;
  body: string | null;
}

/** Reads the token from an `Authorization: Bearer <token>` header, or null if there isn't one. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** Headers for every Edge Function response (the app calls from a phone, so CORS is permissive). */
export const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
