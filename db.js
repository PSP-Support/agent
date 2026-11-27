import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/;

export function migrationVersionFromFilename(filename) {
  return filename.match(migrationPattern)?.[1] ?? null;
}

async function runMigrations(pool) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, filename TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  const files = (await readdir(migrationsDirectory))
    .filter((filename) => migrationVersionFromFilename(filename))
    .sort();
  const versions = files.map(migrationVersionFromFilename);
  if (new Set(versions).size !== versions.length)
    throw new Error("Duplicate migration version detected");

  for (const filename of files) {
    const version = migrationVersionFromFilename(filename),
      client = await pool.connect();
    try {
      await client.query("BEGIN");
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (applied.rows.length) {
        await client.query("COMMIT");
        continue;
      }
      const sql = await readFile(join(migrationsDirectory, filename), "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version,filename) VALUES($1,$2)",
        [version, filename],
      );
      await client.query("COMMIT");
      console.log("Database migration applied:", filename);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error("Database migration " + filename + " failed: " + error.message, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }
}

export async function initDb({ pool, ownerTelegramId, oilField, oilStartingStock }) {
  await runMigrations(pool);

  const uninitializedOil = (
    await pool.query(
      "SELECT telegram_id,country_id FROM game_players WHERE approved=TRUE AND oil_initialized=FALSE",
    )
  ).rows;
  for (const player of uninitializedOil) {
    const field = oilField(player.country_id);
    await pool.query(
      "UPDATE game_players SET oil_field_level=$2,oil_reserves=$3,oil_stock=$4,oil_initialized=TRUE WHERE telegram_id=$1",
      [player.telegram_id, field.daily, field.reserves, oilStartingStock(player.country_id)],
    );
  }
  await pool.query(
    "UPDATE game_players SET approved=FALSE,country_id=NULL,ruler=NULL,government=NULL WHERE telegram_id=$1",
    [ownerTelegramId],
  );
}

