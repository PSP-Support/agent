import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { migrationVersionFromFilename } from "../db.js";

test("migration filenames require a three-digit version and SQL extension", () => {
  assert.equal(migrationVersionFromFilename("001_initial_schema.sql"), "001");
  assert.equal(migrationVersionFromFilename("012_add_indexes.sql"), "012");
  assert.equal(migrationVersionFromFilename("1_initial_schema.sql"), null);
  assert.equal(migrationVersionFromFilename("001_initial_schema.down.sql"), null);
  assert.equal(migrationVersionFromFilename("README.md"), null);
});

test("initial migration is idempotent for existing tables and columns", async () => {
  const sql = await readFile(new URL("../migrations/001_initial_schema.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS game_players/);
  assert.match(sql, /ALTER TABLE game_players ADD COLUMN IF NOT EXISTS/);
  assert.ok(!/ALTER TABLE game_players ADD COLUMN (?!IF NOT EXISTS)/.test(sql));
});

test("migration versions are unique and ordered", async () => {
  const files = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((file) => migrationVersionFromFilename(file))
    .sort();
  const versions = files.map(migrationVersionFromFilename);
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(versions, [...versions].sort());
  assert.ok(files.includes("001_initial_schema.sql"));
});
