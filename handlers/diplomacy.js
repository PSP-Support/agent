export function registerDiplomacyHandlers({
  bot,
  pool,
  ready,
  say,
  edit,
  K,
  get,
  country,
  diplomacyResourceCosts,
  resourceShortages,
  resourceCostDescription,
  resourceCostAssignments,
  resourceCostValues,
}) {
bot.callbackQuery(/^dipmissions$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const r = await pool.query(
    "SELECT telegram_id,display_name,country_id FROM game_players WHERE approved=TRUE AND telegram_id<>$1 ORDER BY display_name LIMIT 30",
    [ctx.from.id],
  );
  const rows = r.rows.map((x) => [
    {
      text: "🕊️ اعزام هیئت به " + (country(x.country_id)?.[1] || x.display_name) + " · $5,000",
      callback_data: "dipmission:" + x.telegram_id,
    },
  ]);
  if (!rows.length)
    rows.push([{ text: "کشور دیگری برای اعزام هیئت وجود ندارد", callback_data: "noop" }]);
  rows.push([{ text: "↩️ دیپلماسی", callback_data: "n:diplomacy" }]);
  return edit(
    ctx,
    "<b>🚩 مأموریت‌های راهبردی</b>\n\nاعزام هیئت دیپلماتیک به کشور دیگر، هزینه‌ی $5,000 دارد و اعتماد دوطرفه را ۵ واحد افزایش می‌دهد.",
    K(rows),
  );
});
bot.callbackQuery(/^dipembassies$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const r = await pool.query(
    "SELECT p.telegram_id,p.display_name,p.country_id,COALESCE(e.level,0) AS level FROM game_players p LEFT JOIN game_embassies e ON e.player_id=$1 AND e.other_id=p.telegram_id WHERE p.approved=TRUE AND p.telegram_id<>$1 ORDER BY p.display_name LIMIT 30",
    [ctx.from.id],
  );
  const rows = r.rows.map((x) => [
    {
      text: "🏛️ " + (country(x.country_id)?.[1] || x.display_name) + " · سفارت " + x.level + "/3",
      callback_data: "dipembassy:" + x.telegram_id,
    },
  ]);
  if (!rows.length)
    rows.push([{ text: "کشور دیگری برای سفارت وجود ندارد", callback_data: "noop" }]);
  rows.push([{ text: "↩️ دیپلماسی", callback_data: "n:diplomacy" }]);
  return edit(
    ctx,
    "<b>🏛️ سفارت‌ها و ارتقای روابط</b>\n\nساخت یا ارتقای سفارت: ۱۰۰ آهن و ۵۰ پارچه؛ هر سطح اعتماد را ۸ واحد افزایش می‌دهد. حداکثر سطح: ۳.",
    K(rows),
  );
});
bot.callbackQuery(/^dipmission:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const other = Number(ctx.match[1]);
  if (other === ctx.from.id || !(await get(other))?.approved) {
    await say(ctx, "کشور مقصد معتبر نیست.");
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const me = (
      await client.query(
        "SELECT treasury,cloth,grain FROM game_players WHERE telegram_id=$1 FOR UPDATE",
        [ctx.from.id],
      )
    ).rows[0];
    const missionCosts = diplomacyResourceCosts.mission,
      shortage = resourceShortages(me, missionCosts);
    if (!me || shortage.length) {
      await client.query("ROLLBACK");
      await say(
        ctx,
        "مواد اولیه برای اعزام هیئت کافی نیست: " +
          resourceCostDescription(Object.fromEntries(shortage)) +
          ".",
      );
      return;
    }
    await client.query(
      "UPDATE game_players SET " +
        resourceCostAssignments(missionCosts).join(",") +
        " WHERE telegram_id=$1",
      [ctx.from.id, ...resourceCostValues(missionCosts)],
    );
    for (const [a, b] of [
      [ctx.from.id, other],
      [other, ctx.from.id],
    ])
      await client.query(
        "INSERT INTO game_relations(player_id,other_id,relation,trust) VALUES($1,$2,'neutral',5) ON CONFLICT(player_id,other_id) DO UPDATE SET trust=LEAST(100,game_relations.trust+5)",
        [a, b],
      );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,'اعزام هیئت دیپلماتیک (هزینه منابع)',0,$2)",
      [ctx.from.id, Number(me.treasury)],
    );
    await client.query(
      "INSERT INTO game_diplomacy_log(player_id,other_id,event,details) VALUES($1,$2,'mission','هیئت دیپلماتیک اعزام شد')",
      [ctx.from.id, other],
    );
    await client.query("COMMIT");
    try {
      await bot.api.sendMessage(
        other,
        "🕊️ یک هیئت دیپلماتیک از سوی " +
          ((await get(ctx.from.id))?.display_name || "کشوری") +
          " اعزام شد؛ اعتماد روابط افزایش یافت.",
      );
    } catch {}
    await edit(
      ctx,
      "🕊️ هیئت دیپلماتیک اعزام شد.\n🧱 منابع مصرف‌شده: " +
        resourceCostDescription(missionCosts) +
        "\n💰 خزانه تغییر نکرد.\n💗 اعتماد دوطرفه: +5",
      K([
        [{ text: "↩️ پرونده‌ی دیپلماتیک", callback_data: "dip:" + other }],
        [{ text: "📜 دفتر روابط", callback_data: "diprelations" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^dipembassy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const other = Number(ctx.match[1]);
  if (other === ctx.from.id || !(await get(other))?.approved) {
    await say(ctx, "کشور مقصد معتبر نیست.");
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const me = (
        await client.query(
          "SELECT treasury,iron,cloth FROM game_players WHERE telegram_id=$1 FOR UPDATE",
          [ctx.from.id],
        )
      ).rows[0],
      e = (
        await client.query(
          "SELECT level FROM game_embassies WHERE player_id=$1 AND other_id=$2 FOR UPDATE",
          [ctx.from.id, other],
        )
      ).rows[0],
      level = Number(e?.level || 0);
    if (level >= 3) {
      await client.query("ROLLBACK");
      await say(ctx, "سفارت به حداکثر سطح ۳ رسیده است.");
      return;
    }
    const embassyCosts = diplomacyResourceCosts.embassy,
      embassyShortage = resourceShortages(me, embassyCosts);
    if (!me || embassyShortage.length) {
      await client.query("ROLLBACK");
      await say(
        ctx,
        "مواد اولیه برای سفارت کافی نیست: " +
          resourceCostDescription(Object.fromEntries(embassyShortage)) +
          ".",
      );
      return;
    }
    await client.query(
      "UPDATE game_players SET " +
        resourceCostAssignments(embassyCosts).join(",") +
        " WHERE telegram_id=$1",
      [ctx.from.id, ...resourceCostValues(embassyCosts)],
    );
    await client.query(
      "INSERT INTO game_embassies(player_id,other_id,level) VALUES($1,$2,1) ON CONFLICT(player_id,other_id) DO UPDATE SET level=LEAST(3,game_embassies.level+1)",
      [ctx.from.id, other],
    );
    await client.query(
      "INSERT INTO game_relations(player_id,other_id,relation,trust) VALUES($1,$2,'neutral',8) ON CONFLICT(player_id,other_id) DO UPDATE SET trust=LEAST(100,game_relations.trust+8)",
      [ctx.from.id, other],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,'ساخت یا ارتقای سفارت (هزینه منابع)',0,$2)",
      [ctx.from.id, Number(me.treasury)],
    );
    await client.query(
      "INSERT INTO game_diplomacy_log(player_id,other_id,event,details) VALUES($1,$2,'embassy',$3)",
      [ctx.from.id, other, "سفارت سطح " + (level + 1)],
    );
    await client.query("COMMIT");
    await edit(
      ctx,
      "🏛️ سفارت ساخته/ارتقا یافت.\n📈 سطح: " +
        (level + 1) +
        "/3\n🧱 منابع مصرف‌شده: " +
        resourceCostDescription(embassyCosts) +
        "\n💰 خزانه تغییر نکرد.\n💗 اعتماد: +8",
      K([[{ text: "↩️ پرونده‌ی دیپلماتیک", callback_data: "dip:" + other }]]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

}
