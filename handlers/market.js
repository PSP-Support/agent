export function registerMarketHandlers({
  bot,
  pool,
  ready,
  say,
  K,
  nation,
  resourceNames,
  resourceLabel,
  country,
  fmt,
  money,
}) {
bot.callbackQuery(/^sell:(grain|coal|iron|cloth|oil|gold_stock)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const res = ctx.match[1];
  pendingTradeInput.set(ctx.from.id, { step: "quantity", resource: res });
  await ctx.reply(
    "<b>مرحله ۲ از ۳ — مقدار عرضه</b>\nمنبع: " +
      resourceNames[res] +
      "\nموجودی کشور: " +
      fmt(p[res]) +
      "\n\nمقدار موردنظر برای فروش را به عدد ارسال کنید.",
    { parse_mode: "HTML", reply_markup: { force_reply: true, selective: true } },
  );
});
bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query("SELECT * FROM game_trade WHERE id=$1 AND status='open' FOR UPDATE", [
        Number(ctx.match[1]),
      ])
    ).rows[0];
    if (!t || Number(t.seller_id) === Number(ctx.from.id)) {
      await client.query("ROLLBACK");
      await say(ctx, "پیشنهاد دیگر موجود نیست.", nation());
      return;
    }
    const pact = (
      await client.query("SELECT relation FROM game_relations WHERE player_id=$1 AND other_id=$2", [
        ctx.from.id,
        t.seller_id,
      ])
    ).rows[0];
    if (pact?.relation !== "trade_pact") {
      await client.query("ROLLBACK");
      await say(
        ctx,
        "برای تجارت با این کشور باید پیمان تجاری دوطرفه داشته باشید. از وزارت امور خارجه پیشنهاد پیمان بفرستید و پس از پذیرش، بازار را تازه‌سازی کنید.",
        K([
          [{ text: "🤝 وزارت امور خارجه", callback_data: "n:diplomacy" }],
          [{ text: "↩️ بازار", callback_data: "n:trade" }],
        ]),
      );
      return;
    }
    const blocked = (
      await client.query(
        "SELECT EXISTS(SELECT 1 FROM game_sanctions WHERE active=TRUE AND ((issuer_id=$1 AND target_id=$2) OR (issuer_id=$2 AND target_id=$1))) AS blocked",
        [ctx.from.id, t.seller_id],
      )
    ).rows[0]?.blocked;
    if (blocked) {
      await client.query("ROLLBACK");
      await say(ctx, "🚫 معامله به‌دلیل تحریم اقتصادی مسدود است.");
      return;
    }
    const total = Number(t.quantity) * Number(t.unit_price);
    const buyer = (
      await client.query(
        "SELECT treasury,country_id FROM game_players WHERE telegram_id=$1 FOR UPDATE",
        [ctx.from.id],
      )
    ).rows[0];
    if (!buyer || Number(buyer.treasury) < total) {
      await client.query("ROLLBACK");
      await say(ctx, "خزانه برای خرید کافی نیست.", nation());
      return;
    }
    const seller = (
      await client.query("SELECT country_id FROM game_players WHERE telegram_id=$1 FOR UPDATE", [
        t.seller_id,
      ])
    ).rows[0];
    await client.query(
      "UPDATE game_players SET treasury=treasury-$2," +
        t.resource +
        "=" +
        t.resource +
        "+$3 WHERE telegram_id=$1",
      [ctx.from.id, total, t.quantity],
    );
    await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1", [
      t.seller_id,
      total,
    ]);
    await client.query("UPDATE game_trade SET status='sold',buyer_id=$2 WHERE id=$1", [
      t.id,
      ctx.from.id,
    ]);
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [
        ctx.from.id,
        "خرید " +
          resourceLabel(t.resource) +
          " از " +
          (country(seller?.country_id)?.[1] || "کشور دیگر"),
        -total,
        Number(buyer.treasury) - total,
      ],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [
        t.seller_id,
        "فروش " +
          resourceLabel(t.resource) +
          " به " +
          (country(buyer.country_id)?.[1] || "کشور دیگر"),
        total,
        Number(
          (
            await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1", [
              t.seller_id,
            ])
          ).rows[0].treasury,
        ),
      ],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "🤝 معامله‌ی بین کشورها انجام شد.\n\nخریدار: " +
        (country(buyer.country_id)?.[1] || "کشور شما") +
        "\nفروشنده: " +
        (country(seller?.country_id)?.[1] || "کشور فروشنده") +
        "\nکالا: " +
        resourceLabel(t.resource) +
        " ×" +
        fmt(t.quantity) +
        "\nمبلغ پرداختی: " +
        money(total),
      K([
        [{ text: "🛒 ادامه‌ی تجارت", callback_data: "n:stocks" }],
        [{ text: "🏛 بازگشت به دربار", callback_data: "m:n" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^tradecancel:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        "SELECT * FROM game_trade WHERE id=$1 AND seller_id=$2 AND status='open' FOR UPDATE",
        [Number(ctx.match[1]), ctx.from.id],
      )
    ).rows[0];
    if (!t) {
      await client.query("ROLLBACK");
      await say(ctx, "این پیشنهاد دیگر فعال نیست.", nation());
      return;
    }
    await client.query(
      "UPDATE game_players SET " + t.resource + "=" + t.resource + "+$2 WHERE telegram_id=$1",
      [ctx.from.id, t.quantity],
    );
    await client.query("UPDATE game_trade SET status='cancelled' WHERE id=$1", [t.id]);
    await client.query("COMMIT");
    await say(
      ctx,
      "پیشنهاد لغو شد و منابع به خزانه‌ی کشور بازگشت.",
      K([
        [{ text: "🛒 بازار تجارت", callback_data: "n:trade" }],
        [{ text: "🏛️ دربار", callback_data: "m:n" }],
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
