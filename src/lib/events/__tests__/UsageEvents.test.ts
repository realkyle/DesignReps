import { type LogEventRpc, UsageEvents } from "../UsageEvents";

const LESSON_ID = "6f1c2a9e-3b7d-4c55-9a10-2f8e4d1b7c33";

function setup(result: Awaited<ReturnType<LogEventRpc>> | Error = { error: null }) {
  const rpc = jest.fn<ReturnType<LogEventRpc>, Parameters<LogEventRpc>>(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const report = jest.fn();
  return { rpc, report, events: new UsageEvents(rpc, report) };
}

describe("UsageEvents", () => {
  it("logs app_opened with no lesson", async () => {
    const { rpc, report, events } = setup();
    await events.appOpened();
    expect(rpc).toHaveBeenCalledWith("log_event", { p_type: "app_opened" });
    expect(report).not.toHaveBeenCalled();
  });

  it("logs lesson_started with the lesson's database ID", async () => {
    const { rpc, events } = setup();
    await events.lessonStarted(LESSON_ID);
    expect(rpc).toHaveBeenCalledWith("log_event", { p_type: "lesson_started", p_lesson_id: LESSON_ID });
  });

  it("never throws when the database rejects the event, and reports only the code", async () => {
    const { report, events } = setup({ error: { code: "22023", message: "lesson_started needs a published lesson" } });
    await expect(events.lessonStarted(LESSON_ID)).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("[events] lesson_started not logged (code: 22023)");
  });

  it("never throws when the network fails", async () => {
    const { report, events } = setup(new Error("Network request failed"));
    await expect(events.appOpened()).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("[events] app_opened not logged (network)");
  });
});
