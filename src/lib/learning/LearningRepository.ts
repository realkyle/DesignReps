import type { SupabaseClient } from "@supabase/supabase-js";

import { Lesson } from "@/lib/lessons";
import type { Database } from "@/lib/supabase/database.types";

import { deviceTimeZone } from "./LessonCompletionClient";
import { LessonPath, type PathLesson } from "./LessonPath";
import { LevelProgress } from "./LevelProgress";
import { StreakStatus } from "./StreakStatus";

/** The signed-in user's game state, as shown on Home and the progress screen. */
export interface PlayerSummary {
  level: LevelProgress;
  streak: StreakStatus;
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

const LOAD_FAILED = "Couldn't load your lessons. Pull down to try again.";

/**
 * Reads lessons, progress and the player's stats through the REST API.
 *
 * Every query runs as the signed-in user, so Row Level Security decides what
 * comes back: published lessons only, and only this user's progress and
 * profile. Read-only: all writes go through the complete-lesson function.
 */
export class LearningRepository {
  /**
   * @param client - Supabase client signed in as the user.
   * @param today - The user's calendar day (`YYYY-MM-DD`); injectable for tests.
   */
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly today: () => string = () => StreakStatus.today(deviceTimeZone()),
  ) {}

  /** The first track's lesson path with each lesson's status. */
  async loadPath(): Promise<Loaded<LessonPath>> {
    const [tracks, lessons, progress] = await Promise.all([
      this.client.from("tracks").select("id, title").order("position").limit(1),
      this.client.from("lessons").select("id, slug, title, kind, position, track_id").order("position"),
      this.client.from("progress").select("lesson_id"),
    ]);
    if (tracks.error || lessons.error || progress.error) return { ok: false, message: LOAD_FAILED };

    const track = tracks.data[0];
    if (!track) return { ok: true, value: LessonPath.build("No lessons yet", [], new Set()) };

    const trackLessons = lessons.data.filter((lesson) => lesson.track_id === track.id) as PathLesson[];
    const completed = new Set(progress.data.map((row) => row.lesson_id));
    return { ok: true, value: LessonPath.build(track.title, trackLessons, completed) };
  }

  /** One lesson with its content, re-validated (database content is still input). */
  async loadLesson(id: string): Promise<Loaded<{ id: string; lesson: Lesson }>> {
    const { data, error } = await this.client
      .from("lessons")
      .select("id, slug, title, kind, position, content")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return { ok: false, message: "Couldn't open this lesson." };
    try {
      return { ok: true, value: { id: data.id, lesson: Lesson.fromDatabaseRow(data, data.slug) } };
    } catch {
      return { ok: false, message: "This lesson couldn't be loaded." };
    }
  }

  /** XP, level progress and today's streak. The level is derived from XP, as on the server. */
  async loadPlayer(): Promise<Loaded<PlayerSummary>> {
    const { data, error } = await this.client
      .from("users")
      .select("xp, streak_current, streak_longest, last_active_date")
      .maybeSingle();
    if (error || !data) return { ok: false, message: LOAD_FAILED };
    try {
      const stored = { current: data.streak_current, longest: data.streak_longest, lastActiveDate: data.last_active_date };
      return { ok: true, value: { level: LevelProgress.of(data.xp), streak: StreakStatus.of(stored, this.today()) } };
    } catch {
      return { ok: false, message: LOAD_FAILED };
    }
  }
}
