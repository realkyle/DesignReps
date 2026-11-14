/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Keeps the public privacy policy (site/privacy/index.html) in sync with the
 * schema. Every column of a per-user table must appear in that table's rows of
 * the policy's reference table, and every event type must be listed.
 * A migration that adds a stored field without updating the policy fails here.
 */
const ROOT = resolve(__dirname, "../../..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const POLICY = readFileSync(join(ROOT, "site/privacy/index.html"), "utf8");

/** Tables holding per-user data. tracks/lessons are shared content, not personal data. */
const PERSONAL_TABLES = ["users", "progress", "events"] as const;

/** Keywords that start a line inside `create table (...)` but are not columns. */
const NOT_COLUMNS = new Set(["primary", "check", "unique", "foreign", "constraint", "exclude", "like"]);

const IDENT = "([a-z_][a-z0-9_]*)";

/** All migrations in order, lower-cased with comments removed. */
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/--.*$/gm, "").toLowerCase());

const statements = migrations.flatMap((sql) => sql.split(";"));

/** Body of every `create table public.<name> (...)`, keyed by table name. */
function createdTables(): Map<string, string> {
  const tables = new Map<string, string>();
  const create = new RegExp(`create table (?:if not exists )?public\\.${IDENT}\\s*\\(([\\s\\S]*)\\)\\s*$`);
  for (const statement of statements) {
    const match = statement.trim().match(create);
    if (match) tables.set(match[1], match[2]);
  }
  return tables;
}

/** Columns of a table: from its `create table`, then `alter table` adds and renames in order. */
function columnsOf(table: string): string[] {
  const columns = new Set<string>();
  const body = createdTables().get(table) ?? "";
  for (const line of body.split("\n")) {
    const first = line.trim().match(new RegExp(`^${IDENT}\\s`))?.[1];
    if (first && !NOT_COLUMNS.has(first)) columns.add(first);
  }
  const alter = new RegExp(`^alter table (?:if exists )?(?:only )?public\\.${table}\\s`);
  const add = new RegExp(`\\badd (?:column )?(?:if not exists )?${IDENT}`, "g");
  const rename = new RegExp(`\\brename (?:column )?${IDENT} to ${IDENT}`, "g");
  for (const statement of statements.map((s) => s.trim()).filter((s) => alter.test(s))) {
    for (const [, name] of statement.matchAll(add)) {
      if (!NOT_COLUMNS.has(name)) columns.add(name);
    }
    for (const [, from, to] of statement.matchAll(rename)) {
      columns.delete(from);
      columns.add(to);
    }
  }
  return [...columns];
}

/** Every value allowed by a `type in (...)` or `type = any (array[...])` check, across all migrations. */
function eventTypes(): string[] {
  const types = new Set<string>();
  for (const sql of migrations) {
    for (const match of sql.matchAll(/\btype\s*(?:in\s*\(|=\s*any\s*\(\s*array\s*\[)([^)\]]*)/g)) {
      for (const [, value] of match[1].matchAll(/'([a-z_]+)'/g)) types.add(value);
    }
  }
  return [...types];
}

/** `<code>` names in the policy's reference rows for one table (rows whose first cell is that table). */
function policyFieldsOf(table: string): Set<string> {
  const fields = new Set<string>();
  for (const [row] of POLICY.matchAll(/<tr>[\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    if (cells[0] !== `<code>${table}</code>`) continue;
    for (const [, name] of cells.slice(1).join(" ").matchAll(/<code>([a-z_]+)<\/code>/g)) fields.add(name);
  }
  return fields;
}

describe("privacy policy matches the schema", () => {
  it.each(PERSONAL_TABLES)("finds the columns of %s in the migrations", (table) => {
    expect(columnsOf(table).length).toBeGreaterThan(0);
  });

  it.each(PERSONAL_TABLES.flatMap((table) => columnsOf(table).map((column) => [table, column])))(
    "lists %s.%s in that table's rows",
    (table, column) => {
      expect(policyFieldsOf(table).has(column)).toBe(true);
    },
  );

  it("covers every table that holds per-user data", () => {
    const perUser = [...createdTables()]
      .filter(([, body]) => /\buser_id\b|references (?:public\.users|auth\.users)/.test(body))
      .map(([name]) => name);
    expect(perUser.filter((name) => !(PERSONAL_TABLES as readonly string[]).includes(name))).toEqual([]);
  });

  it("lists every event type", () => {
    const types = eventTypes();
    expect(types).toEqual(
      expect.arrayContaining(["app_opened", "lesson_started", "lesson_completed", "scenario_completed"]),
    );
    expect(types.filter((type) => !POLICY.includes(`<code>${type}</code>`))).toEqual([]);
  });

  it("contains exactly one email address (the project contact), and no school address", () => {
    const addresses = new Set(POLICY.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []);
    expect(addresses.size).toBe(1);
    expect(POLICY).not.toMatch(/@[a-z0-9.-]*\.edu\b/i);
  });

  it("has no unfilled placeholder, so a draft can't be published", () => {
    expect(POLICY).not.toContain("CONTACT_EMAIL");
  });
});
