/**
 * Builds supabase/seed.sql from the lesson files in content/.
 *
 *   npm run seed:build   → validate every lesson and write supabase/seed.sql
 *   npm run seed:push    → build, then apply it to the linked (live) project
 *
 * Every lesson goes through the same validation as `npm test`, so an invalid
 * lesson stops the build before anything reaches the database.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Lesson } from "../src/lib/lessons/Lesson";
import { SeedSql, trackSchema, type TrackContent } from "../src/lib/lessons/SeedSql";

const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const OUTPUT = join(ROOT, "supabase", "seed.sql");

const tracks = trackSchema.array().parse(JSON.parse(readFileSync(join(CONTENT_DIR, "tracks.json"), "utf8")));

const content: TrackContent[] = tracks.map((track) => {
  const dir = join(CONTENT_DIR, track.slug);
  const lessons = readdirSync(dir)
    .filter((name) => /^\d{2}-[a-z0-9-]+\.json$/.test(name))
    .sort()
    .map((name) => Lesson.parse(JSON.parse(readFileSync(join(dir, name), "utf8")), `${track.slug}/${name}`));
  return { track, lessons };
});

writeFileSync(OUTPUT, SeedSql.from(content).toSql());

for (const { track, lessons } of content) {
  console.log(`${track.slug}: ${lessons.length} lesson(s) → ${lessons.map((lesson) => lesson.slug).join(", ")}`);
}
console.log(`Wrote ${OUTPUT}`);
