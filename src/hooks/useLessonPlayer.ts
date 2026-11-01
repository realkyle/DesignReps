import { useCallback, useEffect, useState } from "react";

import { type CompletionOutcome, learningRepository, lessonCompletion, LessonSession } from "@/lib/learning";

export type PlayerPhase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "playing"; session: LessonSession }
  | { kind: "submitting"; session: LessonSession }
  | { kind: "submitFailed"; session: LessonSession; message: string }
  | { kind: "done"; session: LessonSession; outcome: CompletionOutcome };

/**
 * Drives one lesson: load it, step through it, then submit the answers to
 * complete-lesson and show the server's result. The screen renders `phase`
 * and calls `answer` / `next` / `retry`.
 */
export function useLessonPlayer(lessonId: string) {
  const [phase, setPhase] = useState<PlayerPhase>({ kind: "loading" });
  const [databaseId, setDatabaseId] = useState(lessonId);

  useEffect(() => {
    let cancelled = false;
    learningRepository.loadLesson(lessonId).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setPhase({ kind: "error", message: result.message });
      setDatabaseId(result.value.id);
      setPhase({ kind: "playing", session: LessonSession.start(result.value.lesson) });
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const submit = useCallback(
    async (session: LessonSession) => {
      setPhase({ kind: "submitting", session });
      const result = await lessonCompletion.complete(databaseId, session.submission);
      setPhase(
        result.ok
          ? { kind: "done", session, outcome: result.outcome }
          : { kind: "submitFailed", session, message: result.message },
      );
    },
    [databaseId],
  );

  const answer = useCallback((choiceId: string) => {
    setPhase((current) => (current.kind === "playing" ? { kind: "playing", session: current.session.answer(choiceId) } : current));
  }, []);

  const next = useCallback(() => {
    if (phase.kind !== "playing") return;
    const advanced = phase.session.next();
    if (advanced.isFinished) void submit(advanced);
    else setPhase({ kind: "playing", session: advanced });
  }, [phase, submit]);

  const retry = useCallback(() => {
    if (phase.kind === "submitFailed") void submit(phase.session);
  }, [phase, submit]);

  return { phase, answer, next, retry };
}
