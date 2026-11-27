export function registerAdminHandlers({
  bot,
  pool,
  ownerTelegramId,
  internationalAllowed,
  showAdminPanel,
  country,
  edit,
  K,
  say,
  get,
  money,
  fmt,
}) {
bot.command("admin", async (ctx) => showAdminPanel(ctx));
bot.callbackQuery(/^intlrequests$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT id,telegram_id,country_id FROM game_country_requests WHERE status='pending' ORDER BY id LIMIT 20",
  );
  const rows = r.rows.map((x) => [
    {
      text: (country(x.country_id)?.[1] || x.country_id) + " · " + x.telegram_id,
      callback_data: "intlrequest:" + x.id,
    },
  ]);
  if (!rows.length) rows.push([{ text: "درخواست معوقی نیست", callback_data: "noop" }]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(
    ctx,
    "<b>🪪 درخواست‌های در انتظار</b>\nدرخواست را باز کنید تا تأیید یا رد شود.",
    K(rows),
  );
});
bot.callbackQuery(/^intlrequest:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = Number(ctx.match[1]),
    req = (
      await pool.query("SELECT * FROM game_country_requests WHERE id=$1 AND status='pending'", [id])
    ).rows[0];
  if (!req) {
    await say(ctx, "این درخواست قبلاً بررسی شده است.");
    return;
  }
  const c = country(req.country_id);
  await edit(
    ctx,
    "<b>🪪 بررسی درخواست کشور</b>\n🆔 بازیکن: " +
      req.telegram_id +
      "\n🌍 کشور: " +
      (c?.[1] || req.country_id) +
      "\n\nدر صورت تأیید، کشور به بازیکن واگذار می‌شود.",
    K([
      [{ text: "✅ تأیید و واگذاری", callback_data: "approve_country:" + id }],
      [{ text: "❌ رد درخواست", callback_data: "reject_country:" + id }],
      [{ text: "↩️ درخواست‌ها", callback_data: "intlrequests" }],
    ]),
  );
});
bot.callbackQuery(/^intlhome$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  await edit(
    ctx,
    "<b>🌐 سازمان بین‌الملل</b>",
    K([
      [{ text: "🪪 درخواست‌ها", callback_data: "intlrequests" }],
      [{ text: "🔍 بازرسی", callback_data: "intlplayers" }],
      [{ text: "💳 وام", callback_data: "intlloans" }],
      [{ text: "📦 منابع", callback_data: "intlresources" }],
      [{ text: "🚫 سلب کشور", callback_data: "intlremove" }],
      [{ text: "⛔ مسدودسازی ربات", callback_data: "intlblock" }],
    ]),
  );
});
bot.callbackQuery(/^intlplayers$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT telegram_id,display_name,country_id,approved FROM game_players ORDER BY approved DESC,display_name LIMIT 25",
  );
  const rows = r.rows.map((x) => [
    {
      text:
        (x.approved ? country(x.country_id)?.[1] || "کشور" : "بدون کشور") +
        " · " +
        x.display_name +
        " · " +
        x.telegram_id,
      callback_data: "intlplayer:" + x.telegram_id,
    },
  ]);
  if (!rows.length) rows.push([{ text: "بازیکنی ثبت نشده", callback_data: "noop" }]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(ctx, "<b>🔍 فهرست بازیکنان برای بازرسی</b>", K(rows));
});
bot.callbackQuery(/^intlplayer:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = ctx.match[1],
    p = await get(id);
  if (!p) {
    await say(ctx, "بازیکن یافت نشد.");
    return;
  }
  const c = country(p.country_id);
  await edit(
    ctx,
    "<b>🔍 گزارش بازرسی</b>\n👤 " +
      p.display_name +
      "\n🆔 " +
      id +
      "\n🌍 " +
      (c?.[1] || "بدون کشور") +
      "\n💰 خزانه: " +
      money(p.treasury) +
      "\n👥 جمعیت: " +
      fmt(p.population) +
      "\n📦 منابع: غله " +
      fmt(p.grain) +
      " | زغال " +
      fmt(p.coal) +
      " | آهن " +
      fmt(p.iron) +
      " | پارچه " +
      fmt(p.cloth) +
      "\n⛔ مسدود: " +
      (p.bot_blocked ? "بله" : "خیر") +
      "\n\nعملیات مدیریتی مستقل:",
    K([
      [
        { text: "💳 وام $100,000", callback_data: "intlloan:" + id + ":100000" },
        { text: "💳 وام $500,000", callback_data: "intlloan:" + id + ":500000" },
      ],
      [{ text: "📦 بسته منابع", callback_data: "intlgrant:" + id }],
      [{ text: "🚫 سلب کشور", callback_data: "intlremove:" + id }],
      [
        {
          text: p.bot_blocked ? "🔓 رفع مسدودی" : "⛔ مسدودسازی ربات",
          callback_data: "intlblock:" + id,
        },
      ],
      [{ text: "↩️ فهرست", callback_data: "intlplayers" }],
    ]),
  );
});
bot.callbackQuery(/^intlloans$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT p.telegram_id,p.display_name,COALESCE(SUM(l.amount),0) AS total FROM game_players p LEFT JOIN game_international_loans l ON l.player_id=p.telegram_id GROUP BY p.telegram_id,p.display_name ORDER BY p.display_name LIMIT 20",
  );
  const rows = r.rows.map((x) => [
    {
      text: x.display_name + " · وام ثبت‌شده " + money(x.total),
      callback_data: "intlplayer:" + x.telegram_id,
    },
  ]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(
    ctx,
    "<b>💳 دفتر وام‌های سازمان بین‌الملل</b>\nانتخاب بازیکن برای ثبت وام جدید:",
    K(rows),
  );
});
bot.callbackQuery(/^intlloan:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = ctx.match[1],
    amount = Number(ctx.match[2]),
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = (
      await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!p) {
      await client.query("ROLLBACK");
      await say(ctx, "بازیکن پیدا نشد.");
      return;
    }
    await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1", [
      id,
      amount,
    ]);
    await client.query(
      "INSERT INTO game_international_loans(player_id,admin_id,amount,reason) VALUES($1,$2,$3,'وام سازمان بین‌الملل')",
      [id, ctx.from.id, amount],
    );
    await client.query(
      "INSERT INTO game_international_audit(admin_id,target_id,action,details) VALUES($1,$2,'loan',$3)",
      [ctx.from.id, id, String(amount)],
    );
    await client.query(
      "INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",
      [id, "وام سازمان بین‌الملل", amount, Number(p.treasury) + amount],
    );
    await client.query("COMMIT");
    await say(ctx, "✅ وام " + money(amount) + " ثبت و به خزانه‌ی بازیکن افزوده شد.");
    try {
      await bot.api.sendMessage(
        id,
        "🌐 سازمان بین‌الملل وام " + money(amount) + " به خزانه‌ی کشور شما افزود.",
      );
    } catch {}
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
bot.callbackQuery(/^intlresources$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT telegram_id,display_name FROM game_players ORDER BY display_name LIMIT 25",
  );
  const rows = r.rows.map((x) => [
    { text: x.display_name + " · " + x.telegram_id, callback_data: "intlgrant:" + x.telegram_id },
  ]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(ctx, "<b>📦 افزودن منابع به کشور</b>\nبازیکن را انتخاب کنید:", K(rows));
});
bot.callbackQuery(/^intlgrant:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = ctx.match[1];
  await edit(
    ctx,
    "<b>📦 بسته‌ی منابع</b>\nبازیکن: " + id + "\nمقدار بسته‌ی حمایتی را انتخاب کنید.",
    K([
      [
        { text: "🌾 غله +10,000", callback_data: "intlresource:" + id + ":grain:10000" },
        { text: "🪨 زغال +5,000", callback_data: "intlresource:" + id + ":coal:5000" },
      ],
      [
        { text: "⛓ آهن +3,000", callback_data: "intlresource:" + id + ":iron:3000" },
        { text: "🧵 پارچه +2,000", callback_data: "intlresource:" + id + ":cloth:2000" },
      ],
      [
        { text: "🛢 نفت +5,000", callback_data: "intlresource:" + id + ":oil_stock:5000" },
        { text: "⚡ برق +5,000", callback_data: "intlresource:" + id + ":electricity_stock:5000" },
      ],
      [{ text: "↩️ بازگشت", callback_data: "intlplayer:" + id }],
    ]),
  );
});
bot.callbackQuery(
  /^intlresource:(\d+):(grain|coal|iron|cloth|oil_stock|electricity_stock):(\d+)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await internationalAllowed(ctx))) return;
    const id = ctx.match[1],
      col = ctx.match[2],
      amount = Number(ctx.match[3]);
    if (!["grain", "coal", "iron", "cloth", "oil_stock", "electricity_stock"].includes(col)) return;
    await pool.query(
      "UPDATE game_players SET " + col + "=COALESCE(" + col + ",0)+$2 WHERE telegram_id=$1",
      [id, amount],
    );
    await pool.query(
      "INSERT INTO game_international_audit(admin_id,target_id,action,details) VALUES($1,$2,'resource_grant',$3)",
      [ctx.from.id, id, col + " +" + amount],
    );
    await say(ctx, "✅ " + amount + " واحد " + col + " به ذخایر بازیکن افزوده شد.");
    try {
      await bot.api.sendMessage(
        id,
        "🌐 سازمان بین‌الملل " + amount + " واحد " + col + " به ذخایر کشور شما افزود.",
      );
    } catch {}
  },
);
bot.callbackQuery(/^intlremove$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT telegram_id,display_name,country_id FROM game_players WHERE approved=TRUE ORDER BY display_name LIMIT 25",
  );
  const rows = r.rows.map((x) => [
    {
      text: (country(x.country_id)?.[1] || "کشور") + " · " + x.display_name,
      callback_data: "intlremove:" + x.telegram_id,
    },
  ]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(
    ctx,
    "<b>🚫 سلب کشور</b>\nاین عملیات فقط کشور را آزاد می‌کند و دسترسی بازیکن به ربات را مسدود نمی‌کند.",
    K(rows),
  );
});
bot.callbackQuery(/^intlremove:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = ctx.match[1];
  if (id === ownerTelegramId) {
    await say(ctx, "حساب سازمان بین‌الملل را نمی‌توان از کشور سلب کرد.");
    return;
  }
  await pool.query(
    "UPDATE game_players SET approved=FALSE,country_id=NULL,ruler=NULL,government=NULL,selected_country_id=NULL,last_settlement=NOW() WHERE telegram_id=$1",
    [id],
  );
  await pool.query(
    "INSERT INTO game_international_audit(admin_id,target_id,action,details) VALUES($1,$2,'country_revoke','کشور از بازیکن سلب شد')",
    [ctx.from.id, id],
  );
  await say(
    ctx,
    "✅ کشور از بازیکن سلب شد. دسترسی او به ربات همچنان فعال است و می‌تواند درخواست کشور دیگری بدهد.",
  );
  try {
    await bot.api.sendMessage(
      id,
      "🌐 سازمان بین‌الملل کشور را از حساب شما سلب کرد. دسترسی ربات مسدود نشده؛ برای انتخاب کشور جدید /start را بفرستید.",
    );
  } catch {}
});
bot.callbackQuery(/^intlblock$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const r = await pool.query(
    "SELECT telegram_id,display_name,bot_blocked FROM game_players ORDER BY display_name LIMIT 25",
  );
  const rows = r.rows.map((x) => [
    {
      text: (x.bot_blocked ? "🔓 رفع مسدودی · " : "⛔ مسدودسازی · ") + x.display_name,
      callback_data: "intlblock:" + x.telegram_id,
    },
  ]);
  rows.push([{ text: "↩️ سازمان بین‌الملل", callback_data: "intlhome" }]);
  await edit(ctx, "<b>⛔ مسدودسازی کامل از ربات</b>\nاین کنترل جدا از سلب کشور است.", K(rows));
});
bot.callbackQuery(/^intlblock:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await internationalAllowed(ctx))) return;
  const id = ctx.match[1];
  if (id === ownerTelegramId) {
    await say(ctx, "حساب سازمان بین‌الملل قابل مسدودسازی نیست.");
    return;
  }
  const p = await get(id);
  if (!p) {
    await say(ctx, "بازیکن یافت نشد.");
    return;
  }
  const blocked = !p.bot_blocked;
  await pool.query("UPDATE game_players SET bot_blocked=$2 WHERE telegram_id=$1", [id, blocked]);
  await pool.query(
    "INSERT INTO game_international_audit(admin_id,target_id,action,details) VALUES($1,$2,'bot_block',$3)",
    [ctx.from.id, id, blocked ? "blocked" : "unblocked"],
  );
  await say(
    ctx,
    blocked ? "⛔ دسترسی این بازیکن به ربات مسدود شد." : "🔓 دسترسی بازیکن به ربات آزاد شد.",
  );
});

}
