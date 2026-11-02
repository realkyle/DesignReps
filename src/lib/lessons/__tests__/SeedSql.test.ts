import { Lesson } from "../Lesson";
import { SeedSql, trackSchema } from "../SeedSql";

const track = { slug: "system-design", title: "System Design", description: "Basics", position: 1 };

function lesson(position: number, title = `Lesson ${position}`) {
  const question = (id: string) => ({
    type: "question",
    id,
    prompt: "?",
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctChoiceId: "a",
    explanation: "Because.",
  });
  return Lesson.parse({
    schemaVersion: 1,
    slug: `lesson-${position}`,
    title,
    kind: "lesson",
    position,
    estimatedMinutes: 5,
    steps: [{ type: "concept", id: "c1", title: "Idea", body: "Body" }, ...["q1", "q2", "q3", "q4", "q5"].map(question)],
    sources: [{ title: "Source", url: "https://example.com" }],
  });
}

describe("SeedSql", () => {
  it("upserts the track, then each lesson by (track, slug)", () => {
    const sql = SeedSql.from([{ track, lessons: [lesson(1), lesson(2)] }]).toSql();

    expect(sql.indexOf("insert into public.tracks")).toBeLessThan(sql.indexOf("insert into public.lessons"));
    expect(sql.match(/insert into public\.lessons/g)).toHaveLength(2);
    expect(sql).toContain("on conflict (slug) do update");
    expect(sql).toContain("on conflict (track_id, slug) do update");
    expect(sql).toContain("where t.slug = 'system-design'");
  });

  it("stores columns separately and the rest as JSON content", () => {
    const sql = SeedSql.from([{ track, lessons: [lesson(1)] }]).toSql();
    expect(sql).toContain("'lesson-1', 'Lesson 1', 'lesson', 1,");
    expect(sql).toContain('"steps":');
    expect(sql).not.toContain('"slug":"lesson-1"');
  });

  it("escapes single quotes so content can't break out of the SQL string", () => {
    const sql = SeedSql.from([{ track, lessons: [lesson(1, "Don't'; drop table users; --")] }]).toSql();
    expect(sql).toContain("'Don''t''; drop table users; --'");
    expect(SeedSql.text("it's")).toBe("'it''s'");
  });

  it("marks the file as generated", () => {
    expect(SeedSql.from([]).toSql()).toMatch(/^-- GENERATED/);
  });

  it("validates track definitions", () => {
    expect(trackSchema.safeParse(track).success).toBe(true);
    expect(trackSchema.safeParse({ ...track, slug: "Bad Slug" }).success).toBe(false);
    expect(trackSchema.safeParse({ ...track, extra: 1 }).success).toBe(false);
  });
});
