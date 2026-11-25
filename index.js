import { Bot, InlineKeyboard, Keyboard } from "grammy";
import pg from "pg";
import http from "node:http";

const { Pool } = pg;
const token = process.env.BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

if (!token) throw new Error("Missing BOT_TOKEN environment variable");
if (!databaseUrl) throw new Error("Missing DATABASE_URL environment variable");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

const bot = new Bot(token);

const COMPANY_TYPES = [
  { id: "cafe", name: "کافه کوچک ☕", price: 25000, income: 900, description: "کسب‌وکار کوچک با درآمد پایدار" },
  { id: "shop", name: "فروشگاه 🛍️", price: 80000, income: 3200, description: "فروشگاه شهری" },
  { id: "factory", name: "کارخانه 🏭", price: 250000, income: 11500, description: "تولید صنعتی" },
  { id: "tech", name: "شرکت فناوری 💻", price: 600000, income: 31000, description: "شرکت فناوری با درآمد بالا" }
];

const money = (n) => "$" + Math.floor(Number(n)).toLocaleString("en-US");
const bottomKeyboard = () => new Keyboard()
  .text("📊 وضعیت بازی").text("🏢 شرکت‌های من").row()
  .text("🛒 خرید شرکت").text("💵 دریافت درآمد").row()
  .text("🧭 مأموریت روزانه").text("🏅 دستاوردها").row()
  .text("👤 پروفایل").text("🏆 رتبه‌بندی").row()
  .text("🎁 پاداش روزانه").text("ℹ️ راهنما").resized().persistent();

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      display_name TEXT NOT NULL,
      balance BIGINT NOT NULL DEFAULT 100000,
      last_collect TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_daily DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS player_companies (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      company_type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      bought_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS player_companies_owner_idx ON player_companies(telegram_id);
    ALTER TABLE players ADD COLUMN IF NOT EXISTS last_mission DATE;
  `);
}

async function ensurePlayer(ctx) {
  const from = ctx.from;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || "بازیکن";
  await pool.query(
    `INSERT INTO players (telegram_id, username, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name`,
    [String(from.id), from.username ?? null, name]
  );
}

async function playerData(id) {
  const p = await pool.query("SELECT * FROM players WHERE telegram_id=$1", [String(id)]);
  const c = await pool.query(
    `SELECT company_type, level, COUNT(*)::int AS count
     FROM player_companies WHERE telegram_id=$1 GROUP BY company_type, level`,
    [String(id)]
  );
  const totalIncome = await pool.query(
    `SELECT COALESCE(SUM((ct.income * pc.level)::bigint),0)::bigint AS income
     FROM player_companies pc
     JOIN (VALUES ${COMPANY_TYPES.map((_,i)=>`($${i*3+1}::text,$${i*3+2}::bigint,$${i*3+3}::bigint)`).join(",")})
       AS ct(id, price, income) ON ct.id=pc.company_type
     WHERE pc.telegram_id=$${COMPANY_TYPES.length*3+1}`,
    [...COMPANY_TYPES.flatMap(x=>[x.id,x.price,x.income]), String(id)]
  );
  return { player: p.rows[0], companies: c.rows, income: Number(totalIncome.rows[0].income) };
}

async function dashboardText(id) {
  const d = await playerData(id);
  const p = d.player;
  const companyCount = d.companies.reduce((sum, c) => sum + Number(c.count), 0);
  const assetValue = d.companies.reduce((sum, c) => {
    const type = COMPANY_TYPES.find(x => x.id === c.company_type);
    return sum + (type ? type.price * Number(c.level) * Number(c.count) : 0);
  }, 0);
  const rank = await pool.query(
    "SELECT COUNT(*)::int + 1 AS rank FROM players WHERE balance > $1",
    [p.balance]
  );
  const dailyReady = !p.last_daily || new Date(p.last_daily).toISOString().slice(0,10) !== new Date().toISOString().slice(0,10);
  const rows = d.companies
    .sort((a,b) => Number(b.count) - Number(a.count))
    .map(c => {
      const type = COMPANY_TYPES.find(x => x.id === c.company_type);
      const income = type ? type.income * Number(c.level) * Number(c.count) : 0;
      return `  ${type?.name ?? c.company_type} | سطح ${c.level} × ${c.count} | ${money(income)}/ساعت`;
    });
  const companySection = rows.length ? rows.join("\n") : "  هنوز کسب‌وکاری خریداری نکردی؛ از فروشگاه شروع کن!";
  return `🌆 *OPEN MANY | مرکز فرماندهی*

━━━━━━━━━━━━━━━━
💰 سرمایه نقدی: ${money(p.balance)}
🏢 تعداد کسب‌وکارها: ${companyCount}
📈 درآمد فعال: ${money(d.income)} / ساعت
🏦 ارزش تقریبی دارایی‌ها: ${money(assetValue)}
🏆 رتبه سرمایه: #${rank.rows[0].rank}

━━━━━━━━━━━━━━━━
🏭 *وضعیت شرکت‌ها*
${companySection}

━━━━━━━━━━━━━━━━
📌 *وضعیت اقتصاد*
• درآمد ۲۴ ساعت (حداکثر): ${money(d.income * 24)}
• پاداش روزانه: ${dailyReady ? "آماده دریافت 🎁" : "دریافت شده ✓"}
• مرحله بعد: ${companyCount < 3 ? "خرید ۳ کسب‌وکار" : d.income < 50000 ? "افزایش درآمد به ۵۰ هزار در ساعت" : "ساخت امپراتوری اقتصادی 🚀"}

_برای مشاهده جزئیات یا انجام عملیات از منوی پایین استفاده کن._`;
}

function homeText() {
  return `🏙️ *OPEN MANY*\n\nبه امپراتوری اقتصادی خودت خوش اومدی!\nشرکت بخر، درآمد جمع کن و در رتبه‌بندی بالا برو.`;
}

bot.command("start", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: bottomKeyboard() });
});
bot.command("menu", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply(homeText(), { parse_mode: "Markdown", reply_markup: mainKeyboard() });
});

bot.callbackQuery("profile", async (ctx) => {
  const d = await playerData(ctx.from.id);
  const count = d.companies.reduce((sum,x)=>sum+Number(x.count),0);
  await ctx.editMessageText(
    `👤 *پروفایل شما*\n\n💰 سرمایه: ${money(d.player.balance)}\n🏢 تعداد شرکت‌ها: ${count}\n📈 درآمد هر ساعت: ${money(d.income)}\n🗓️ عضویت: ${new Date(d.player.created_at).toLocaleDateString("fa-IR")}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 بازگشت", "home") }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("my_companies", async (ctx) => {
  const d = await playerData(ctx.from.id);
  if (!d.companies.length) {
    await ctx.editMessageText("هنوز شرکتی نداری. از بخش «خرید شرکت» اولین کسب‌وکارت رو بخر!", {
      reply_markup: new InlineKeyboard().text("🛒 خرید شرکت", "buy_menu").row().text("🔙 بازگشت", "home")
    });
  } else {
    const lines = d.companies.map(c => {
      const t = COMPANY_TYPES.find(x=>x.id===c.company_type);
      return `${t?.name ?? c.company_type} — سطح ${c.level} × ${c.count}`;
    });
    await ctx.editMessageText(`🏢 *شرکت‌های شما*\n\n${lines.join("\n")}\n\n📈 درآمد ساعتی: ${money(d.income)}`, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔧 ارتقای شرکت", "upgrade_menu").row().text("🔙 بازگشت", "home")
    });
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("buy_menu", async (ctx) => {
  const kb = new InlineKeyboard();
  for (const c of COMPANY_TYPES) kb.text(`${c.name} | ${money(c.price)}`, `buy:${c.id}`).row();
  kb.text("🔙 بازگشت", "home");
  await ctx.editMessageText("🛒 *فروشگاه شرکت‌ها*\n\nیک کسب‌وکار برای خرید انتخاب کن:", { parse_mode: "Markdown", reply_markup: kb });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^buy:(.+)$/, async (ctx) => {
  const type = COMPANY_TYPES.find(x=>x.id===ctx.match[1]);
  if (!type) return ctx.answerCallbackQuery({ text: "شرکت پیدا نشد", show_alert: true });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query("SELECT balance FROM players WHERE telegram_id=$1 FOR UPDATE", [String(ctx.from.id)]);
    if (!p.rows.length || Number(p.rows[0].balance) < type.price) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "سرمایه کافی نیست!", show_alert: true });
    }
    await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1", [String(ctx.from.id), type.price]);
    await client.query("INSERT INTO player_companies (telegram_id, company_type) VALUES ($1,$2)", [String(ctx.from.id), type.id]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({ text: "شرکت با موفقیت خریداری شد! 🎉" });
    await ctx.editMessageText(`✅ *${type.name} خریداری شد!*\n\n${type.description}\n📈 درآمد پایه: ${money(type.income)} در ساعت`, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏢 شرکت‌های من", "my_companies").row().text("🔙 منوی اصلی", "home")
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    await ctx.answerCallbackQuery({ text: "خطا در خرید. دوباره تلاش کن.", show_alert: true });
  } finally { client.release(); }
});

bot.callbackQuery("collect", async (ctx) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query("SELECT balance,last_collect FROM players WHERE telegram_id=$1 FOR UPDATE", [String(ctx.from.id)]);
    if (!p.rows.length) throw new Error("Player missing");
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(24*60*60, (now - new Date(p.rows[0].last_collect).getTime())/1000));
    const income = await client.query(
      `SELECT COALESCE(SUM((ct.income * pc.level)::bigint),0)::bigint AS income
       FROM player_companies pc JOIN (VALUES ${COMPANY_TYPES.map((_,i)=>`($${i*2+1}::text,$${i*2+2}::bigint)`).join(",")})
       AS ct(id,income) ON ct.id=pc.company_type WHERE pc.telegram_id=$${COMPANY_TYPES.length*2+1}`,
      [...COMPANY_TYPES.flatMap(x=>[x.id,x.income]), String(ctx.from.id)]
    );
    const earned = Math.floor(Number(income.rows[0].income) * elapsed / 3600);
    if (earned <= 0) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "هنوز درآمدی برای دریافت نداری. شرکت بخر یا کمی صبر کن!", show_alert: true });
    }
    await client.query("UPDATE players SET balance=balance+$2,last_collect=NOW() WHERE telegram_id=$1", [String(ctx.from.id), earned]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({ text: `درآمد ${money(earned)} دریافت شد!` });
    await ctx.editMessageText(`💵 *درآمد دریافت شد!*\n\nمبلغ: ${money(earned)}\n💰 درآمد به سرمایه‌ات اضافه شد.`, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("👤 پروفایل", "profile").row().text("🔙 منوی اصلی", "home")
    });
  } catch (e) {
    await client.query("ROLLBACK"); console.error(e);
    await ctx.answerCallbackQuery({ text: "خطا در دریافت درآمد", show_alert: true });
  } finally { client.release(); }
});

bot.callbackQuery("upgrade_menu", async (ctx) => {
  const rows = await pool.query(
    `SELECT id,company_type,level FROM player_companies WHERE telegram_id=$1 ORDER BY id`,
    [String(ctx.from.id)]
  );
  if (!rows.rows.length) {
    await ctx.answerCallbackQuery({ text: "اول باید شرکت بخری.", show_alert: true }); return;
  }
  const kb = new InlineKeyboard();
  for (const c of rows.rows) {
    const type = COMPANY_TYPES.find(x=>x.id===c.company_type);
    const cost = Math.floor(type.price * c.level * 0.75);
    kb.text(`${type.name} سطح ${c.level} → ${c.level+1} (${money(cost)})`, `upgrade:${c.id}`).row();
  }
  kb.text("🔙 بازگشت", "my_companies");
  await ctx.editMessageText("🔧 *ارتقای شرکت*\n\nشرکت موردنظر رو انتخاب کن:", { parse_mode: "Markdown", reply_markup: kb });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^upgrade:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query(
      "SELECT pc.*,p.balance FROM player_companies pc JOIN players p ON p.telegram_id=pc.telegram_id WHERE pc.id=$1 AND pc.telegram_id=$2 FOR UPDATE",
      [id, String(ctx.from.id)]
    );
    if (!q.rows.length) { await client.query("ROLLBACK"); return ctx.answerCallbackQuery({ text: "شرکت پیدا نشد.", show_alert: true }); }
    const c = q.rows[0], type = COMPANY_TYPES.find(x=>x.id===c.company_type);
    const cost = Math.floor(type.price * c.level * 0.75);
    if (Number(c.balance) < cost) { await client.query("ROLLBACK"); return ctx.answerCallbackQuery({ text: "سرمایه کافی نیست.", show_alert: true }); }
    await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1", [String(ctx.from.id), cost]);
    await client.query("UPDATE player_companies SET level=level+1 WHERE id=$1", [id]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({ text: "شرکت ارتقا یافت! 🔧" });
    await ctx.editMessageText(`🎉 *ارتقا موفق بود!*\n\n${type.name}\nسطح جدید: ${c.level+1}\nهزینه: ${money(cost)}`, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔧 ارتقای دیگر", "upgrade_menu").row().text("🔙 منوی اصلی", "home")
    });
  } catch (e) { await client.query("ROLLBACK"); console.error(e); await ctx.answerCallbackQuery({ text: "خطا در ارتقا", show_alert: true }); }
  finally { client.release(); }
});

bot.callbackQuery("daily", async (ctx) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query("SELECT last_daily FROM players WHERE telegram_id=$1 FOR UPDATE", [String(ctx.from.id)]);
    const today = new Date().toISOString().slice(0,10);
    if (q.rows[0].last_daily && new Date(q.rows[0].last_daily).toISOString().slice(0,10) === today) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "پاداش امروز رو قبلاً گرفتی. فردا برگرد!", show_alert: true });
    }
    const reward = 10000;
    await client.query("UPDATE players SET balance=balance+$2,last_daily=$3 WHERE telegram_id=$1", [String(ctx.from.id), reward, today]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({ text: `پاداش ${money(reward)} دریافت شد! 🎁` });
    await ctx.editMessageText(`🎁 *پاداش روزانه*\n\n${money(reward)} به حسابت اضافه شد!`, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("👤 پروفایل", "profile").row().text("🔙 منوی اصلی", "home")
    });
  } catch (e) { await client.query("ROLLBACK"); console.error(e); await ctx.answerCallbackQuery({ text: "خطا در دریافت پاداش" }); }
  finally { client.release(); }
});

bot.callbackQuery("leaderboard", async (ctx) => {
  const q = await pool.query("SELECT display_name,balance FROM players ORDER BY balance DESC LIMIT 10");
  const text = q.rows.length ? q.rows.map((p,i)=>`${i+1}. ${p.display_name} — ${money(p.balance)}`).join("\n") : "هنوز بازیکنی ثبت نشده.";
  await ctx.editMessageText(`🏆 *رتبه‌بندی سرمایه‌داران*\n\n${text}`, {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 بازگشت", "home")
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("help", async (ctx) => {
  await ctx.editMessageText("ℹ️ *راهنمای Open Many*\n\n1. از فروشگاه شرکت بخر.\n2. شرکت‌ها به مرور درآمد تولید می‌کنند.\n3. درآمدت را دریافت کن.\n4. شرکت‌ها را ارتقا بده.\n5. هر روز پاداش بگیر و در رتبه‌بندی پیشرفت کن.", {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 بازگشت", "home")
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("home", async (ctx) => {
  await ctx.editMessageText(await dashboardText(ctx.from.id), { parse_mode: "Markdown" });
  await ctx.answerCallbackQuery();
});



// Dashboard: full game overview and company status
bot.hears("📊 وضعیت بازی", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply(await dashboardText(ctx.from.id), {
    parse_mode: "Markdown",
    reply_markup: bottomKeyboard()
  });
});

// Daily mission: own at least one business and claim a small bonus once per UTC day.
bot.hears("🧭 مأموریت روزانه", async (ctx) => {
  await ensurePlayer(ctx);
  const d = await playerData(ctx.from.id);
  const count = d.companies.reduce((sum,c)=>sum+Number(c.count),0);
  const q = await pool.query("SELECT last_mission FROM players WHERE telegram_id=$1", [String(ctx.from.id)]);
  const today = new Date().toISOString().slice(0,10);
  const claimed = q.rows[0]?.last_mission && new Date(q.rows[0].last_mission).toISOString().slice(0,10) === today;
  const completed = count >= 1;
  const kb = new InlineKeyboard();
  if (completed && !claimed) kb.text("🎁 دریافت جایزه ۵,۰۰۰", "mission_claim").row();
  kb.text("📊 مشاهده وضعیت بازی", "home");
  await ctx.reply(
    `🧭 *مأموریت روزانه*\n\n🎯 هدف: داشتن حداقل یک کسب‌وکار\n📍 پیشرفت: ${Math.min(count,1)}/1\n${completed ? "✅ مأموریت تکمیل شده!" : "🔒 هنوز کسب‌وکاری نداری"}\n\n🎁 جایزه: ${money(5000)}\n${claimed ? "پاداش امروز دریافت شده ✓" : "هر روز یک بار قابل دریافت"}`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

bot.callbackQuery("mission_claim", async (ctx) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query("SELECT balance,last_mission FROM players WHERE telegram_id=$1 FOR UPDATE", [String(ctx.from.id)]);
    if (!p.rows.length) throw new Error("Player missing");
    const today = new Date().toISOString().slice(0,10);
    if (p.rows[0].last_mission && new Date(p.rows[0].last_mission).toISOString().slice(0,10) === today) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "پاداش مأموریت امروز را قبلاً گرفتی.", show_alert: true });
    }
    const count = await client.query("SELECT COUNT(*)::int AS count FROM player_companies WHERE telegram_id=$1", [String(ctx.from.id)]);
    if (Number(count.rows[0].count) < 1) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "برای تکمیل مأموریت، اول یک شرکت بخر.", show_alert: true });
    }
    await client.query("UPDATE players SET balance=balance+5000,last_mission=$2 WHERE telegram_id=$1", [String(ctx.from.id), today]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({ text: "۵,۰۰۰ دلار جایزه مأموریت دریافت شد! 🎉" });
    await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: bottomKeyboard() });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    await ctx.answerCallbackQuery({ text: "خطا در دریافت جایزه مأموریت.", show_alert: true });
  } finally { client.release(); }
});

// Achievement board is calculated from the player's real game progress.
bot.hears("🏅 دستاوردها", async (ctx) => {
  await ensurePlayer(ctx);
  const d = await playerData(ctx.from.id);
  const count = d.companies.reduce((sum,c)=>sum+Number(c.count),0);
  const typesOwned = new Set(d.companies.map(c=>c.company_type)).size;
  const achievements = [
    [count >= 1, "🏪 اولین کسب‌وکار", "خرید اولین شرکت"],
    [count >= 3, "🏙️ کارآفرین", "مالک ۳ کسب‌وکار"],
    [typesOwned >= 4, "🌐 امپراتوری متنوع", "مالک هر ۴ نوع کسب‌وکار"],
    [d.income >= 10000, "💵 جریان نقدی", "درآمد ۱۰,۰۰۰ دلار در ساعت"],
    [d.income >= 50000, "🚀 سرمایه‌دار بزرگ", "درآمد ۵۰,۰۰۰ دلار در ساعت"],
    [Number(d.player.balance) >= 1000000, "💎 میلیونر", "سرمایه نقدی ۱ میلیون دلار"]
  ];
  const text = achievements.map(([done,title,goal]) => `${done ? "✅" : "🔒"} ${title}\n   ${goal}`).join("\n\n");
  await ctx.reply(`🏅 *تالار دستاوردها*\n\n${text}\n\n${achievements.filter(x=>x[0]).length} از ${achievements.length} دستاورد باز شده`, {
    parse_mode: "Markdown", reply_markup: bottomKeyboard()
  });
});

// Persistent bottom-menu buttons (Telegram Reply Keyboard)
bot.hears("👤 پروفایل", async (ctx) => {
  await ensurePlayer(ctx);
  const d = await playerData(ctx.from.id);
  const count = d.companies.reduce((sum,x)=>sum+Number(x.count),0);
  await ctx.reply(
    `👤 پروفایل شما\n\n💰 سرمایه: ${money(d.player.balance)}\n🏢 تعداد شرکت‌ها: ${count}\n📈 درآمد هر ساعت: ${money(d.income)}\n🗓️ عضویت: ${new Date(d.player.created_at).toLocaleDateString("fa-IR")}`,
    { reply_markup: bottomKeyboard() }
  );
});

bot.hears("🏢 شرکت‌های من", async (ctx) => {
  await ensurePlayer(ctx);
  const d = await playerData(ctx.from.id);
  if (!d.companies.length) {
    await ctx.reply("هنوز شرکتی نداری. از بخش «خرید شرکت» اولین کسب‌وکارت رو بخر!", {
      reply_markup: new InlineKeyboard().text("🛒 خرید شرکت", "buy_menu")
    });
  } else {
    const lines = d.companies.map(c => {
      const t = COMPANY_TYPES.find(x=>x.id===c.company_type);
      return `${t?.name ?? c.company_type} — سطح ${c.level} × ${c.count}`;
    });
    await ctx.reply(`🏢 شرکت‌های شما\n\n${lines.join("\n")}\n\n📈 درآمد ساعتی: ${money(d.income)}`, {
      reply_markup: new InlineKeyboard().text("🔧 ارتقای شرکت", "upgrade_menu")
    });
  }
});

bot.hears("🛒 خرید شرکت", async (ctx) => {
  await ensurePlayer(ctx);
  const kb = new InlineKeyboard();
  for (const c of COMPANY_TYPES) kb.text(`${c.name} | ${money(c.price)}`, `buy:${c.id}`).row();
  await ctx.reply("🛒 فروشگاه شرکت‌ها\n\nیک کسب‌وکار برای خرید انتخاب کن:", { reply_markup: kb });
});

bot.hears("💵 دریافت درآمد", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply("برای دریافت درآمد، دکمه زیر رو بزن:", {
    reply_markup: new InlineKeyboard().text("💵 دریافت درآمد", "collect")
  });
});

bot.hears("🏆 رتبه‌بندی", async (ctx) => {
  await ensurePlayer(ctx);
  const q = await pool.query("SELECT display_name,balance FROM players ORDER BY balance DESC LIMIT 10");
  const leaderboardText = q.rows.length ? q.rows.map((p,i)=>`${i+1}. ${p.display_name} — ${money(p.balance)}`).join("\n") : "هنوز بازیکنی ثبت نشده.";
  await ctx.reply(`🏆 رتبه‌بندی سرمایه‌داران\n\n${leaderboardText}`, { reply_markup: bottomKeyboard() });
});

bot.hears("🎁 پاداش روزانه", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply("برای دریافت پاداش روزانه، دکمه زیر رو بزن:", {
    reply_markup: new InlineKeyboard().text("🎁 دریافت پاداش", "daily")
  });
});

bot.hears("ℹ️ راهنما", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply("ℹ️ راهنمای Open Many\n\n1. از فروشگاه شرکت بخر.\n2. شرکت‌ها به مرور درآمد تولید می‌کنند.\n3. درآمدت را دریافت کن.\n4. شرکت‌ها را ارتقا بده.\n5. هر روز پاداش بگیر و در رتبه‌بندی پیشرفت کن.", {
    reply_markup: bottomKeyboard()
  });
});

bot.catch((err) => console.error("Bot error:", err));

const server = http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", game: "Open Many" }));
  } else {
    res.writeHead(404); res.end("Not found");
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Open Many health server listening on ${port}`));

await initDb();
await bot.start();
console.log("Open Many bot is running.");
