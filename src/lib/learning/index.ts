import { supabase } from "@/lib/supabase";

import { LearningRepository } from "./LearningRepository";
import { LessonCompletionClient } from "./LessonCompletionClient";

export { LearningRepository, type Loaded, type PlayerSummary } from "./LearningRepository";
export {
  type CompletionOutcome,
  type CompletionResult,
  deviceTimeZone,
  type InvokeFunction,
  LessonCompletionClient,
} from "./LessonCompletionClient";
export { LessonPath, type LessonStatus, type PathItem, type PathLesson } from "./LessonPath";
export { type AnswerFeedback, LessonSession, type SubmittedAnswer } from "./LessonSession";

/** App-wide instances backed by the shared Supabase client. */
export const learningRepository = new LearningRepository(supabase);
export const lessonCompletion = new LessonCompletionClient((name, options) =>
  supabase.functions.invoke(name, options as { body: Record<string, unknown> }),
);
