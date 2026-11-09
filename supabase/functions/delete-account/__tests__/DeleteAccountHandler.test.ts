import type { HttpRequest } from "../../_shared/http/Http.ts";
import { type DeleteAccountDeps, DeleteAccountHandler } from "../DeleteAccountHandler.ts";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function setup(overrides: Partial<DeleteAccountDeps> = {}) {
  const deps = {
    verifyAccessToken: jest.fn(async (token: string) => (token === "good-token" ? USER_ID : null)),
    deleteUser: jest.fn(async () => {}),
    logError: jest.fn(),
    ...overrides,
  };
  return { deps, handler: new DeleteAccountHandler(deps) };
}

function request(method = "POST", authorization: string | null = "Bearer good-token", body = ""): HttpRequest {
  return { method, authorization, readBody: async () => body };
}

function errorCode(body: string | null): string {
  return JSON.parse(body!).error.code;
}

describe("DeleteAccountHandler", () => {
  it("deletes the signed-in user and returns 204 with no body", async () => {
    const { deps, handler } = setup();
    const response = await handler.handle(request());
    expect(response).toEqual({ status: 204, body: null });
    expect(deps.deleteUser).toHaveBeenCalledTimes(1);
    expect(deps.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("only ever deletes the user from the token, ignoring any body", async () => {
    const { deps, handler } = setup();
    await handler.handle(request("POST", "Bearer good-token", JSON.stringify({ userId: "someone-else" })));
    expect(deps.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it.each([
    ["no Authorization header", null],
    ["a header that isn't a bearer token", "Basic abc"],
    ["an invalid token", "Bearer bad-token"],
  ])("returns 401 and deletes nothing with %s", async (_case, authorization) => {
    const { deps, handler } = setup();
    const response = await handler.handle(request("POST", authorization));
    expect(response.status).toBe(401);
    expect(errorCode(response.body)).toBe("UNAUTHENTICATED");
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("returns 405 for methods other than POST", async () => {
    const { deps, handler } = setup();
    const response = await handler.handle(request("DELETE"));
    expect(response.status).toBe(405);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("answers the CORS preflight with 204", async () => {
    const { handler } = setup();
    expect(await handler.handle(request("OPTIONS", null))).toEqual({ status: 204, body: null });
  });

  it("returns a generic 500 and logs the cause when the delete fails", async () => {
    const cause = new Error("auth admin API down");
    const { deps, handler } = setup({ deleteUser: jest.fn(async () => Promise.reject(cause)) });
    const response = await handler.handle(request());
    expect(response.status).toBe(500);
    expect(errorCode(response.body)).toBe("INTERNAL_ERROR");
    expect(response.body).not.toContain("auth admin API down");
    expect(deps.logError).toHaveBeenCalledWith("delete-account failed", cause);
  });

  it("returns 500 when token verification itself fails", async () => {
    const { deps, handler } = setup({ verifyAccessToken: jest.fn(async () => Promise.reject(new Error("jwks"))) });
    const response = await handler.handle(request());
    expect(response.status).toBe(500);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
