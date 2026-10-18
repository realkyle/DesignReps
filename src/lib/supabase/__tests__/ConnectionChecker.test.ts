import { ConnectionChecker } from "../ConnectionChecker";
import { SupabaseConfig } from "../SupabaseConfig";

const config = SupabaseConfig.fromEnv({
  url: "https://abcdefghij.supabase.co",
  publishableKey: "sb_publishable_test123",
});

/** A clock that advances 42 ms between its first and second reading. */
function fakeClock(): () => number {
  const readings = [1_000, 1_042];
  return () => readings.shift() ?? 1_042;
}

function respondWith(status: number): jest.MockedFunction<typeof fetch> {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status } as Response);
}

describe("ConnectionChecker", () => {
  it("calls the auth health endpoint with the publishable key", async () => {
    const fetchFn = respondWith(200);
    await new ConnectionChecker(config, fetchFn).check();
    expect(fetchFn).toHaveBeenCalledWith("https://abcdefghij.supabase.co/auth/v1/health", {
      headers: { apikey: "sb_publishable_test123" },
    });
  });

  it("reports success with latency", async () => {
    const result = await new ConnectionChecker(config, respondWith(200), fakeClock()).check();
    expect(result).toEqual({ ok: true, latencyMs: 42 });
  });

  it.each([401, 403])("explains a rejected key (HTTP %i)", async (status) => {
    const result = await new ConnectionChecker(config, respondWith(status)).check();
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/Key rejected/) });
  });

  it("reports other HTTP errors", async () => {
    const result = await new ConnectionChecker(config, respondWith(503)).check();
    expect(result).toEqual({ ok: false, reason: "Supabase responded with HTTP 503." });
  });

  it("turns network failures into a result instead of throwing", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    const result = await new ConnectionChecker(config, fetchFn).check();
    expect(result).toEqual({ ok: false, reason: "Network error: Network request failed" });
  });
});
