import { AccountDeletionClient, type InvokeDeleteFunction } from "../AccountDeletionClient";

function setup(invokeResult: Awaited<ReturnType<InvokeDeleteFunction>> | Error = { error: null }) {
  const invoke = jest.fn<ReturnType<InvokeDeleteFunction>, Parameters<InvokeDeleteFunction>>(async () => {
    if (invokeResult instanceof Error) throw invokeResult;
    return invokeResult;
  });
  const signOut = jest.fn(async () => {});
  return { invoke, signOut, client: new AccountDeletionClient(invoke, signOut) };
}

describe("AccountDeletionClient", () => {
  it("calls the delete-account function with POST and no body", async () => {
    const { invoke, client } = setup();
    await client.deleteAccount();
    expect(invoke).toHaveBeenCalledWith("delete-account", { method: "POST" });
  });

  it("signs out after a successful delete", async () => {
    const { signOut, client } = setup();
    expect(await client.deleteAccount()).toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the user signed in when the server refuses, so they can retry", async () => {
    const { signOut, client } = setup({ error: { context: { status: 500 } } });
    const result = await client.deleteAccount();
    expect(result).toEqual({ ok: false, message: "Your account couldn't be deleted. Please try again." });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("says the account was not deleted when the server can't be reached", async () => {
    const { signOut, client } = setup(new Error("Network request failed"));
    const result = await client.deleteAccount();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/not deleted/);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("treats an error without a response as a network failure", async () => {
    const { client } = setup({ error: { message: "Failed to send a request" } });
    const result = await client.deleteAccount();
    expect(!result.ok && result.message).toMatch(/Couldn't reach the server/);
  });

  it.each([
    ["DELETE", true],
    ["  DELETE ", true],
    ["delete", false],
    ["DELET", false],
    ["", false],
  ])("isConfirmed(%p) is %p", (typed, expected) => {
    expect(AccountDeletionClient.isConfirmed(typed)).toBe(expected);
  });
});
