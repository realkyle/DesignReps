/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Lesson } from "../Lesson";

/**
 * Validates every real lesson file under content/<track>/ as part of `npm test`,
 * so a broken lesson can't be merged. Also checks track-level rules a single
 * file can't know about: file names, unique slugs, and positions 1..n.
 */
const CONTENT_DIR = resolve(__dirname, "../../../../content");
const LESSON_FILE = /^(\d{2})-([a-z0-9-]+)\.json$/;

const tracks = readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const lessonFiles = tracks.flatMap((track) =>
  readdirSync(join(CONTENT_DIR, track))
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ track, name, path: join(CONTENT_DIR, track, name) })),
);

describe("content/ lesson files", () => {
  if (lessonFiles.length === 0) {
    it.todo("no lesson files yet; add them under content/<track>/NN-slug.json");
    return;
  }

  it.each(lessonFiles)("$track/$name is a valid lesson named NN-<slug>.json", ({ name, path }) => {
    const lesson = Lesson.parse(JSON.parse(readFileSync(path, "utf8")), name);
    const match = LESSON_FILE.exec(name);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(lesson.position);
    expect(match![2]).toBe(lesson.slug);
  });

  it.each(tracks)("track %s has unique slugs and positions 1..n", (track) => {
    const lessons = lessonFiles
      .filter((file) => file.track === track)
      .map((file) => Lesson.parse(JSON.parse(readFileSync(file.path, "utf8")), file.name));
    const positions = lessons.map((lesson) => lesson.position).sort((a, b) => a - b);
    expect(positions).toEqual(lessons.map((_, index) => index + 1));
    expect(new Set(lessons.map((lesson) => lesson.slug)).size).toBe(lessons.length);
  });
});
