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

export function registerExchangeHandlers({
  bot,
  pool,
  ready,
  say,
  edit,
  K,
  nation,
  get,
  country,
  money,
  fmt,
  resourceAmount,
  resourceNames,
  refreshStocks,
  refreshCommodities,
  resourceShortages,
  resourceCostDescription,
  back,
}) {
bot.callbackQuery(/^commodity:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  await refreshCommodities();
  const r = await pool.query(
    "SELECT c.*,COALESCE(h.units,0) AS units FROM game_commodities c LEFT JOIN game_commodity_holdings h ON h.symbol=c.symbol AND h.telegram_id=$1 WHERE c.symbol=$2",
    [ctx.from.id, ctx.match[1]],
  );
  const x = r.rows[0];
  if (!x) {
    await say(ctx, "کالا پیدا نشد.", nation());
    return;
  }
  await edit(
    ctx,
    "<b>" +
      x.name +
      "</b>\\nقیمت هر واحد: " +
      money(x.price) +
      "\\nتغییر: " +
      x.change_pct +
      "٪\\nموجودی شما: " +
      fmt(x.units),
    K([
      [{ text: "🟢 خرید از بازار پایه", callback_data: "commoditybuy:" + x.symbol }],
      [{ text: "📤 عرضه به کشورهای دیگر", callback_data: "exoffer:commodity:" + x.symbol }],
      [{ text: "🔴 فروش به بازار پایه", callback_data: "commoditysell:" + x.symbol }],
      [{ text: "↩️ بازگشت به بازار بورس و کالا", callback_data: "n:stocks" }],
    ]),
  );
});
bot.callbackQuery(/^commoditybuy:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = (
      await client.query("SELECT * FROM game_commodities WHERE symbol=$1 FOR UPDATE", [
        ctx.match[1],
      ])
    ).rows[0];
    const pl = (
      await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE", [
        ctx.from.id,
      ])
    ).rows[0];
    if (!c || !pl || Number(pl.treasury) < Number(c.price)) {
      await client.query("ROLLBACK");
      await say(ctx, "کالا موجود نیست یا خزانه برای خرید کافی نیست.", nation());
      return;
    }
    const bal = Number(pl.treasury) - Number(c.price);
    await client.query("UPDATE game_players SET treasury=$2 WHERE telegram_id=$1", [
      ctx.from.id,
      bal,
    ]);
    await client.query(
      "INSERT INTO game_commodity_holdings(telegram_id,symbol,units) VALUES($1,$2,1) ON CONFLICT(telegram_id,symbol) DO UPDATE SET units=game_commodity_holdings.units+1",
      [ctx.from.id, c.symbol],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [ctx.from.id, "خرید کالای " + c.symbol, -Number(c.price), bal],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "خرید انجام شد؛ " + money(c.price) + " از خزانه کسر شد.",
      K([
        [{ text: "🛢️ ادامه در بازار کالا", callback_data: "n:commodities" }],
        [{ text: "🏛️ بازگشت به دربار", callback_data: "m:n" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^commoditysell:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = (
      await client.query("SELECT * FROM game_commodities WHERE symbol=$1 FOR UPDATE", [
        ctx.match[1],
      ])
    ).rows[0];
    const h = (
      await client.query(
        "SELECT units FROM game_commodity_holdings WHERE telegram_id=$1 AND symbol=$2 FOR UPDATE",
        [ctx.from.id, ctx.match[1]],
      )
    ).rows[0];
    const pl = (
      await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE", [
        ctx.from.id,
      ])
    ).rows[0];
    if (!c || !h || Number(h.units) < 1 || !pl) {
      await client.query("ROLLBACK");
      await say(ctx, "برای فروش، موجودی کافی ندارید.", nation());
      return;
    }
    const bal = Number(pl.treasury) + Number(c.price);
    await client.query(
      "UPDATE game_commodity_holdings SET units=units-1 WHERE telegram_id=$1 AND symbol=$2",
      [ctx.from.id, c.symbol],
    );
    await client.query("UPDATE game_players SET treasury=$2 WHERE telegram_id=$1", [
      ctx.from.id,
      bal,
    ]);
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [ctx.from.id, "فروش کالای " + c.symbol, Number(c.price), bal],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "فروش انجام شد؛ " + money(c.price) + " به خزانه افزوده شد.",
      K([
        [{ text: "🛢️ ادامه در بازار کالا", callback_data: "n:commodities" }],
        [{ text: "🏛️ بازگشت به دربار", callback_data: "m:n" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^commodityportfolio$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  return edit(
    ctx,
    "سبد کالاها و سهام در بخش پشتوانه بورسی من یکپارچه شده است.",
    K([
      [{ text: "💼 پشتوانه بورسی من", callback_data: "assetportfolio" }],
      [{ text: "📈 بورس و کالا", callback_data: "n:stocks" }],
      [{ text: "🏛️ بازگشت به دربار", callback_data: "m:n" }],
    ]),
  );
});
bot.callbackQuery(/^stock:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  await refreshStocks();
  const r = await pool.query(
    "SELECT s.*,COALESCE(h.shares,0) AS shares FROM game_stocks s LEFT JOIN game_stock_holdings h ON h.symbol=s.symbol AND h.telegram_id=$1 WHERE s.symbol=$2",
    [ctx.from.id, ctx.match[1]],
  );
  const x = r.rows[0];
  if (!x) {
    await say(ctx, "نماد پیدا نشد.", nation());
    return;
  }
  await edit(
    ctx,
    "<b>" +
      x.name +
      " (" +
      x.symbol +
      ")</b>\\nقیمت هر سهم: " +
      money(x.price) +
      "\\nتغییر: " +
      x.change_pct +
      "٪\\nسهام شما: " +
      fmt(x.shares),
    K([
      [{ text: "🟢 خرید از بازار پایه", callback_data: "stockbuy:" + x.symbol }],
      [{ text: "📤 عرضه به کشورهای دیگر", callback_data: "exoffer:stock:" + x.symbol }],
      [{ text: "🔴 فروش به بازار پایه", callback_data: "stocksell:" + x.symbol }],
      [{ text: "↩️ بازگشت به بورس", callback_data: "n:stocks" }],
    ]),
  );
});
bot.callbackQuery(/^stockbuy:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const st = (
      await client.query("SELECT * FROM game_stocks WHERE symbol=$1 FOR UPDATE", [ctx.match[1]])
    ).rows[0];
    const pl = (
      await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE", [
        ctx.from.id,
      ])
    ).rows[0];
    if (!st || !pl || Number(pl.treasury) < Number(st.price)) {
      await client.query("ROLLBACK");
      await say(ctx, "نماد در دسترس نیست یا خزانه برای خرید سهم کافی نیست.", nation());
      return;
    }
    await client.query("UPDATE game_players SET treasury=treasury-$2 WHERE telegram_id=$1", [
      ctx.from.id,
      st.price,
    ]);
    await client.query(
      "INSERT INTO game_stock_holdings(telegram_id,symbol,shares) VALUES($1,$2,1) ON CONFLICT(telegram_id,symbol) DO UPDATE SET shares=game_stock_holdings.shares+1",
      [ctx.from.id, st.symbol],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [
        ctx.from.id,
        "خرید سهم " + st.symbol,
        -Number(st.price),
        Number(pl.treasury) - Number(st.price),
      ],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "✅ یک سهم " + st.symbol + " خریداری شد؛ مبلغ " + money(st.price) + " از خزانه کسر شد.",
      K([
        [{ text: "📈 ادامه در بورس", callback_data: "n:stocks" }],
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
bot.callbackQuery(/^stocksell:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const st = (
      await client.query("SELECT * FROM game_stocks WHERE symbol=$1 FOR UPDATE", [ctx.match[1]])
    ).rows[0];
    const h = (
      await client.query(
        "SELECT shares FROM game_stock_holdings WHERE telegram_id=$1 AND symbol=$2 FOR UPDATE",
        [ctx.from.id, ctx.match[1]],
      )
    ).rows[0];
    if (!st || !h || Number(h.shares) < 1) {
      await client.query("ROLLBACK");
      await say(ctx, "برای فروش، سهمی از این نماد در سبد شما نیست.", nation());
      return;
    }
    await client.query(
      "UPDATE game_stock_holdings SET shares=shares-1 WHERE telegram_id=$1 AND symbol=$2",
      [ctx.from.id, st.symbol],
    );
    await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1", [
      ctx.from.id,
      st.price,
    ]);
    const balance = Number(p.treasury) + Number(st.price);
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [ctx.from.id, "فروش سهم " + st.symbol, Number(st.price), balance],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "✅ یک سهم " + st.symbol + " فروخته شد؛ " + money(st.price) + " به خزانه افزوده شد.",
      K([
        [{ text: "📈 ادامه در بورس", callback_data: "n:stocks" }],
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
bot.callbackQuery(/^exorders$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await pool.query(
    "SELECT o.*,p.display_name,p.country_id,COALESCE(st.name,cm.name) AS asset_name FROM game_exchange_orders o JOIN game_players p ON p.telegram_id=o.seller_id LEFT JOIN game_stocks st ON o.asset_type='stock' AND st.symbol=o.symbol LEFT JOIN game_commodities cm ON o.asset_type='commodity' AND cm.symbol=o.symbol WHERE o.status='open' AND o.seller_id<>$1 ORDER BY o.id DESC LIMIT 20",
    [ctx.from.id],
  );
  const rows = r.rows.map((o) => [
    {
      text: `${country(o.country_id)?.[1] || o.display_name} | ${o.asset_name} ×${fmt(o.quantity)} | ${money(o.unit_price)}/واحد`,
      callback_data: "exbuy:" + o.id,
    },
  ]);
  if (!rows.length) rows.push([{ text: "هنوز سفارش فعالی ثبت نشده", callback_data: "noop" }]);
  rows.push(
    [{ text: "↻ بازگشت به بورس", callback_data: "n:stocks" }],
    [{ text: "🏛 دربار", callback_data: "m:n" }],
  );
  return edit(
    ctx,
    "<b>🌐 سفارش‌های فعال کشورها</b>\nخرید از کشور دیگر: انتخاب سفارش و پرداخت از خزانه‌ی شما.",
    K(rows),
  );
});
bot.callbackQuery(/^exoffer:(stock|commodity):([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const type = ctx.match[1],
    symbol = ctx.match[2];
  const h =
    type === "stock"
      ? (
          await pool.query(
            "SELECT shares AS qty FROM game_stock_holdings WHERE telegram_id=$1 AND symbol=$2",
            [ctx.from.id, symbol],
          )
        ).rows[0]
      : (
          await pool.query(
            "SELECT units AS qty FROM game_commodity_holdings WHERE telegram_id=$1 AND symbol=$2",
            [ctx.from.id, symbol],
          )
        ).rows[0];
  if (!h || Number(h.qty) < 1) {
    await say(
      ctx,
      "برای عرضه، ابتدا باید این سهم یا کالا را در پشتوانه‌ی خود داشته باشید.",
      K([
        [{ text: "💼 پشتوانه بورسی من", callback_data: "assetportfolio" }],
        [{ text: "📈 بورس", callback_data: "n:stocks" }],
      ]),
    );
    return;
  }
  pendingTradeInput.set(ctx.from.id, {
    step: "quantity",
    marketAsset: true,
    assetType: type,
    symbol,
  });
  await ctx.reply(
    "<b>مرحله ۱ از ۲ — مقدار سفارش فروش</b>\nموجودی شما: " +
      fmt(h.qty) +
      "\nچند واحد را برای فروش به کشورهای دیگر عرضه می‌کنید؟",
    { parse_mode: "HTML", reply_markup: { force_reply: true, selective: true } },
  );
});
bot.callbackQuery(/^exbuy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const o = (
      await client.query(
        "SELECT * FROM game_exchange_orders WHERE id=$1 AND status='open' FOR UPDATE",
        [Number(ctx.match[1])],
      )
    ).rows[0];
    if (!o || Number(o.seller_id) === Number(ctx.from.id)) {
      await client.query("ROLLBACK");
      await say(ctx, "این سفارش دیگر در دسترس نیست.", nation());
      return;
    }
    const buyer = (
      await client.query(
        "SELECT treasury,country_id FROM game_players WHERE telegram_id=$1 FOR UPDATE",
        [ctx.from.id],
      )
    ).rows[0];
    const total = Number(o.quantity) * Number(o.unit_price);
    if (!buyer || Number(buyer.treasury) < total) {
      await client.query("ROLLBACK");
      await say(ctx, "خزانه‌ی کشور برای خرید این سفارش کافی نیست.", nation());
      return;
    }
    const seller = (
      await client.query("SELECT country_id FROM game_players WHERE telegram_id=$1 FOR UPDATE", [
        o.seller_id,
      ])
    ).rows[0];
    await client.query("UPDATE game_players SET treasury=treasury-$2 WHERE telegram_id=$1", [
      ctx.from.id,
      total,
    ]);
    await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1", [
      o.seller_id,
      total,
    ]);
    if (o.asset_type === "stock")
      await client.query(
        "INSERT INTO game_stock_holdings(telegram_id,symbol,shares) VALUES($1,$2,$3) ON CONFLICT(telegram_id,symbol) DO UPDATE SET shares=game_stock_holdings.shares+EXCLUDED.shares",
        [ctx.from.id, o.symbol, o.quantity],
      );
    else
      await client.query(
        "INSERT INTO game_commodity_holdings(telegram_id,symbol,units) VALUES($1,$2,$3) ON CONFLICT(telegram_id,symbol) DO UPDATE SET units=game_commodity_holdings.units+EXCLUDED.units",
        [ctx.from.id, o.symbol, o.quantity],
      );
    await client.query("UPDATE game_exchange_orders SET status='sold' WHERE id=$1", [o.id]);
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [
        ctx.from.id,
        "خرید " + o.symbol + " از " + (country(seller?.country_id)?.[1] || "کشور دیگر"),
        -total,
        Number(buyer.treasury) - total,
      ],
    );
    const sellerBal = (
      await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1", [o.seller_id])
    ).rows[0];
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [
        o.seller_id,
        "فروش " + o.symbol + " به " + (country(buyer.country_id)?.[1] || "کشور دیگر"),
        total,
        sellerBal.treasury,
      ],
    );
    await client.query("COMMIT");
    await say(
      ctx,
      "🤝 معامله‌ی بورسی بین کشورها انجام شد.\n\nخریدار: " +
        (country(buyer.country_id)?.[1] || "کشور شما") +
        "\nفروشنده: " +
        (country(seller?.country_id)?.[1] || "کشور دیگر") +
        "\nنماد: " +
        o.symbol +
        " ×" +
        fmt(o.quantity) +
        "\nمبلغ: " +
        money(total),
      K([
        [{ text: "📈 ادامه‌ی بورس", callback_data: "n:stocks" }],
        [{ text: "🏛 دربار", callback_data: "m:n" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^excancel:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const o = (
      await client.query(
        "SELECT * FROM game_exchange_orders WHERE id=$1 AND seller_id=$2 AND status='open' FOR UPDATE",
        [Number(ctx.match[1]), ctx.from.id],
      )
    ).rows[0];
    if (!o) {
      await client.query("ROLLBACK");
      await say(ctx, "سفارش دیگر فعال نیست.", nation());
      return;
    }
    if (o.asset_type === "stock")
      await client.query(
        "INSERT INTO game_stock_holdings(telegram_id,symbol,shares) VALUES($1,$2,$3) ON CONFLICT(telegram_id,symbol) DO UPDATE SET shares=game_stock_holdings.shares+EXCLUDED.shares",
        [ctx.from.id, o.symbol, o.quantity],
      );
    else
      await client.query(
        "INSERT INTO game_commodity_holdings(telegram_id,symbol,units) VALUES($1,$2,$3) ON CONFLICT(telegram_id,symbol) DO UPDATE SET units=game_commodity_holdings.units+EXCLUDED.units",
        [ctx.from.id, o.symbol, o.quantity],
      );
    await client.query("UPDATE game_exchange_orders SET status='cancelled' WHERE id=$1", [o.id]);
    await client.query("COMMIT");
    await say(
      ctx,
      "سفارش لغو شد و دارایی به پشتوانه‌ی شما برگشت.",
      K([
        [{ text: "📈 بورس و کالا", callback_data: "n:stocks" }],
        [{ text: "💼 پشتوانه بورسی", callback_data: "assetportfolio" }],
      ]),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^assetportfolio$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const a = await pool.query(
    "SELECT s.name,s.symbol,h.shares AS qty,s.price,h.shares*s.price AS value,'سهام' AS kind FROM game_stock_holdings h JOIN game_stocks s ON s.symbol=h.symbol WHERE h.telegram_id=$1 AND h.shares>0",
    [ctx.from.id],
  );
  const b = await pool.query(
    "SELECT c.name,c.symbol,h.units AS qty,c.price,h.units*c.price AS value,'کالا' AS kind FROM game_commodity_holdings h JOIN game_commodities c ON c.symbol=h.symbol WHERE h.telegram_id=$1 AND h.units>0",
    [ctx.from.id],
  );
  const all = [...a.rows, ...b.rows].sort((x, y) => Number(y.value) - Number(x.value));
  const total = all.reduce((n, x) => n + Number(x.value), 0);
  await edit(
    ctx,
    all.length
      ? "<b>💼 پشتوانه بورسی من</b>\\nارزش کل: " +
          money(total) +
          "\\n\\n" +
          all
            .map(
              (x) =>
                x.kind +
                " — " +
                x.name +
                " (" +
                x.symbol +
                ")\\nمقدار: " +
                fmt(x.qty) +
                " | ارزش: " +
                money(x.value),
            )
            .join("\\n\\n")
      : "<b>💼 پشتوانه بورسی من</b>\\nهنوز سهام یا کالایی در سبد شما نیست.",
    K([
      [{ text: "📈 بازگشت به بورس و کالا", callback_data: "n:stocks" }],
      [{ text: "🏛️ بازگشت به دربار", callback_data: "m:n" }],
    ]),
  );
});
bot.callbackQuery(/^portfolio$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  return edit(
    ctx,
    "سبد سهام و کالا در بخش پشتوانه بورسی من یکپارچه شده است.",
    K([
      [{ text: "💼 پشتوانه بورسی من", callback_data: "assetportfolio" }],
      [{ text: "📈 بورس و کالا", callback_data: "n:stocks" }],
      [{ text: "🏛️ بازگشت به دربار", callback_data: "m:n" }],
    ]),
  );
});
bot.callbackQuery(/^adj:(tax|tariff|wage|service_budget):(-?\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const f = ctx.match[1],
    delta = Number(ctx.match[2]),
    lim = { tax: [0, 60], tariff: [0, 50], wage: [10, 10000], service_budget: [0, 10000000] }[f],
    v = Math.max(lim[0], Math.min(lim[1], Number(p[f]) + delta));
  const q =
    f === "tax" && delta > 0
      ? "UPDATE game_players SET tax_rate=$2,stability=GREATEST(0,stability-1),legitimacy=GREATEST(0,legitimacy-1) WHERE telegram_id=$1"
      : `UPDATE game_players SET ${f}=$2 WHERE telegram_id=$1`;
  await pool.query(q, [ctx.from.id, v]);
  await say(ctx, "تغییر سیاست ثبت شد.\n\n" + (await status(await get(ctx.from.id))), nation());
});
bot.callbackQuery(/^build:(industry|agriculture|infrastructure)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await ready(ctx);
  if (!p) return;
  const f = ctx.match[1],
    need = developmentResourceCosts[f],
    shortage = resourceShortages(p, need);
  if (shortage.length) {
    await say(
      ctx,
      "مواد اولیه برای توسعه کافی نیست: " +
        resourceCostDescription(Object.fromEntries(shortage)) +
        ".",
      nation(),
    );
    return;
  }
  const changes = [
    f + "=" + f + "+1",
    ...Object.entries(need).map(([r, q]) => r + "=GREATEST(0," + r + "-" + q + ")"),
  ];
  await pool.query("UPDATE game_players SET " + changes.join(",") + " WHERE telegram_id=$1", [
    ctx.from.id,
  ]);
  await pool.query(
    "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
    [ctx.from.id, "پروژه‌ی توسعه‌ی " + f + " (هزینه منابع)", 0, p.treasury],
  );
  await say(
    ctx,
    "پروژه تکمیل شد؛ منابع مصرف‌شده: " + resourceCostDescription(need) + ". خزانه تغییر نکرد.",
    nation(),
  );
});
bot.callbackQuery(/^ledger$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await pool.query(
    "SELECT description,amount,balance FROM game_ledger WHERE telegram_id=$1 ORDER BY id DESC LIMIT 15",
    [ctx.from.id],
  );
  await edit(
    ctx,
    r.rows.length
      ? "<b>📒 دفتر حساب</b>\n\n" +
          r.rows
            .map((x) => x.description + "\n" + money(x.amount) + " | مانده " + money(x.balance))
            .join("\n\n")
      : "دفتر حساب خالی است.",
    back(),
  );
});

}
