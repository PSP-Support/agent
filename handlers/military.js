import { militaryUnitResourceCosts, strategicResourceCosts } from "../data/action-costs.js";

export function registerMilitaryHandlers({
  bot,
  pool,
  ready,
  say,
  edit,
  K,
  nation,
  money,
  getCountryWeapons,
  countryWeapons,
  weaponLabel,
  resourceShortages,
  resourceCostDescription,
  resourceCostAssignments,
  resourceCostValues,
}) {
bot.callbackQuery(/^mil:(army|navy|air|defense)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const type = ctx.match[1],
    cfg = {
      army: ["army", "🪖 یک واحد زمینی"],
      navy: ["navy", "⚓ یک شناور"],
      air: ["air_force", "✈️ یک هواپیما"],
      defense: ["air_defense", "🛡️ یک قبضه پدافند"],
    }[type],
    field = cfg[0],
    costs = militaryUnitResourceCosts[type],
    shortage = resourceShortages(p, costs);
  if (shortage.length) {
    await say(
      ctx,
      "مواد اولیه برای تجهیز نیرو کافی نیست: " +
        resourceCostDescription(Object.fromEntries(shortage)) +
        ".",
      nation(),
    );
    return;
  }
  const assignments = [field + "=" + field + "+1", ...resourceCostAssignments(costs)];
  await pool.query("UPDATE game_players SET " + assignments.join(",") + " WHERE telegram_id=$1", [
    ctx.from.id,
    ...resourceCostValues(costs),
  ]);
  await pool.query(
    "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
    [ctx.from.id, "تجهیز نیرو: " + cfg[1] + " (هزینه منابع)", 0, Number(p.treasury)],
  );
  await say(
    ctx,
    "✅ افزوده شد: " +
      cfg[1] +
      "\n🧱 منابع مصرف‌شده: " +
      resourceCostDescription(costs) +
      "\n💰 خزانه تغییر نکرد: " +
      money(Number(p.treasury)),
    nation(),
  );
});

bot.callbackQuery(/^weaponrepair$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const r = await pool.query(
    "SELECT weapon_key,quantity,damaged FROM game_weapon_stock WHERE telegram_id=$1 AND COALESCE(damaged,0)>0 ORDER BY weapon_key",
    [ctx.from.id],
  );
  const rows = r.rows
    .map((x) => {
      const w =
        getCountryWeapons(p.country_id).find((z) => z[0] === x.weapon_key) ||
        Object.values(countryWeapons)
          .flat()
          .find((z) => z[0] === x.weapon_key);
      return w
        ? [
            {
              text:
                "🔧 " +
                weaponLabel(w) +
                " · آسیب " +
                x.damaged +
                " · " +
                "50 آهن",
              callback_data: "weaponrepair:" + x.weapon_key,
            },
          ]
        : null;
    })
    .filter(Boolean);
  if (!rows.length) rows.push([{ text: "✅ تسلیحات آسیب‌دیده‌ای ندارید.", callback_data: "noop" }]);
  rows.push([{ text: "↩️ تسلیحات", callback_data: "shopweapons" }]);
  await edit(
    ctx,
    "<b>🔧 تعمیر زرادخانه</b>\n\nبرای تعمیر هر واحد: 50 آهن؛ خزانه کسر نمی‌شود. تعمیر یک‌باره است، نه روزانه.",
    K(rows),
  );
});
bot.callbackQuery(/^weaponrepair:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const key = ctx.match[1],
    w =
      getCountryWeapons(p.country_id).find((x) => x[0] === key) ||
      Object.values(countryWeapons)
        .flat()
        .find((x) => x[0] === key);
  if (!w) {
    await say(ctx, "سلاح نامعتبر است.");
    return;
  }
  const costs = strategicResourceCosts.repair,
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    const player = (
        await client.query(
          "SELECT treasury,iron FROM game_players WHERE telegram_id=$1 FOR UPDATE",
          [ctx.from.id],
        )
      ).rows[0],
      stock = (
        await client.query(
          "SELECT quantity,damaged FROM game_weapon_stock WHERE telegram_id=$1 AND weapon_key=$2 FOR UPDATE",
          [ctx.from.id, key],
        )
      ).rows[0];
    if (!player || resourceShortages(player, costs).length || !stock || Number(stock.damaged) < 1) {
      await client.query("ROLLBACK");
      await say(ctx, "برای تعمیر یک واحد، 50 آهن و یک واحد آسیب‌دیده لازم است.");
      return;
    }
    await client.query(
      "UPDATE game_players SET " +
        resourceCostAssignments(costs).join(",") +
        " WHERE telegram_id=$1",
      [ctx.from.id, ...resourceCostValues(costs)],
    );
    await client.query(
      "UPDATE game_weapon_stock SET damaged=GREATEST(0,damaged-1) WHERE telegram_id=$1 AND weapon_key=$2",
      [ctx.from.id, key],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,0,$3)",
      [ctx.from.id, "تعمیر " + w[1] + " (هزینه منابع)", Number(player.treasury)],
    );
    await client.query("COMMIT");
    await edit(
      ctx,
      "✅ یک واحد " +
        weaponLabel(w) +
        " تعمیر شد و به وضعیت آماده برگشت.\n🧱 منابع مصرف‌شده: " +
        resourceCostDescription(costs) +
        "\n💰 خزانه تغییر نکرد.",
      K([
        [{ text: "🔧 تعمیر واحد دیگر", callback_data: "weaponrepair" }],
        [{ text: "⚔️ دیپلماسی", callback_data: "n:diplomacy" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

}
