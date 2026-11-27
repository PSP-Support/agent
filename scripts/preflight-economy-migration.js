import pg from "pg";

const { Pool } = pg;
const appEnv = process.env.APP_ENV || "production";
const databaseUrl =
  appEnv === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    appEnv === "test" ? "TEST_DATABASE_URL is required" : "DATABASE_URL is required",
  );
}
const ssl =
  /railway|rlwy\.net/i.test(new URL(databaseUrl).hostname) ||
  process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: false }
    : undefined;
const pool = new Pool({ connectionString: databaseUrl, ssl });
const safeMax = 9223372036854775n;

const checks = [
  ["game_players", ["treasury", "wage", "service_budget"]],
  ["game_ledger", ["amount", "balance"]],
  ["game_stocks", ["price"]],
  ["game_commodities", ["price"]],
  ["game_trade", ["unit_price"]],
  ["game_trade_contracts", ["transit_cost"]],
  ["game_weapon_market", ["unit_price"]],
  ["game_exchange_orders", ["unit_price"]],
  ["game_international_loans", ["amount"]],
];

try {
  console.log("Economy ×1000 migration preflight (read-only)");
  for (const [table, columns] of checks) {
    const select = columns
      .map(
        (column) =>
          "MAX(ABS(" + column + "::numeric)) AS " + column + "_max",
      )
      .join(", ");
    const result = await pool.query("SELECT COUNT(*) AS rows, " + select + " FROM " + table);
    const row = result.rows[0];
    const report = { table, rows: Number(row.rows), columns: {} };
    for (const column of columns) {
      const max = row[column + "_max"] == null ? 0n : BigInt(row[column + "_max"]);
      const projected = max * 1000n;
      report.columns[column] = {
        currentMax: max.toString(),
        projectedMax: projected.toString(),
        safe: max <= safeMax,
      };
      if (max > safeMax) throw new Error(table + "." + column + " exceeds BIGINT scale limit");
    }
    console.log(JSON.stringify(report));
  }
  const cashContracts = await pool.query(
    "SELECT COUNT(*) AS rows, MAX(ABS(offer_quantity::numeric)) FILTER (WHERE offer_resource='cash') AS offer_cash_max, MAX(ABS(want_quantity::numeric)) FILTER (WHERE want_resource='cash') AS want_cash_max FROM game_trade_contracts",
  );
  const cashRow = cashContracts.rows[0];
  for (const column of ["offer_cash_max", "want_cash_max"]) {
    const max = cashRow[column] == null ? 0n : BigInt(cashRow[column]);
    if (max > safeMax) throw new Error("game_trade_contracts." + column + " exceeds BIGINT scale limit");
    cashRow[column] = max.toString();
  }
  console.log("cash contract quantities:", JSON.stringify(cashRow));
  console.log("Preflight completed. No rows were modified.");
} finally {
  await pool.end();
}
