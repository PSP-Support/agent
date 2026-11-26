import { Bot, InlineKeyboard, Keyboard } from "grammy";
import pg from "pg";
import http from "node:http";
import { initRealism, registerRealism, netHourlyForPlayer, getEconomyReport } from "./realism.js";

const { Pool } = pg;
const token = process.env.BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const ownerTelegramId = String(process.env.OWNER_TELEGRAM_ID || '').trim();

if (!token) throw new Error("Missing BOT_TOKEN environment variable");
if (!databaseUrl) throw new Error("Missing DATABASE_URL environment variable");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

const bot = new Bot(token);

// Idempotency guard: process each Telegram update only once.
bot.use(async (ctx, next) => {
  const updateId = ctx.update?.update_id;
  if (updateId == null) return next();
  const inserted = await pool.query(
    "INSERT INTO processed_telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id",
    [String(updateId)]
  );
  if (!inserted.rowCount) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  return next();
});

// Cross-replica duplicate-action guard: repeated taps can arrive with different update IDs.
bot.use(async (ctx, next) => {
  if (!ctx.from || !ctx.chat) return next();
  const action = ctx.message?.text || (ctx.callbackQuery ? "callback:" + (ctx.callbackQuery.data || "") : "");
  if (!action) return next();
  const key = String(ctx.chat.id) + ":" + String(ctx.from.id) + ":" + action;
  const accepted = await pool.query(
    `INSERT INTO recent_bot_actions(action_key, seen_at) VALUES($1,NOW())
     ON CONFLICT(action_key) DO UPDATE SET seen_at=NOW()
     WHERE recent_bot_actions.seen_at < NOW() - INTERVAL '2 seconds'
     RETURNING action_key`,
    [key]
  );
  if (!accepted.rowCount) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({text:"در حال پردازش؛ کمی صبر کن."}).catch(()=>{});
    console.log("[DUPLICATE_ACTION_IGNORED]", JSON.stringify({userId:ctx.from.id, action, updateId:ctx.update?.update_id}));
    return;
  }
  return next();
});

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id=String(ctx.from.id), text=ctx.message?.text || "";
  const callbackData=ctx.callbackQuery?.data || "";
  if (id===ownerTelegramId || /^\/(start|status|myid)(\s|$)/.test(text) || text==="🔄 بررسی وضعیت") return next();
  if (callbackData.startsWith("reg:") || companyNamePending.has(id)) return next();
  const q=await pool.query("SELECT approval_status FROM players WHERE telegram_id=$1",[id]);
  const status=q.rows[0]?.approval_status;
  if (!status) { if(ctx.message) await ctx.reply("برای ثبت درخواست عضویت /start را بزن."); return; }
  if(status==="banned") { if(ctx.message) await ctx.reply("⛔ دسترسی شما مسدود شده است."); else await ctx.answerCallbackQuery({text:"حساب مسدود است.",show_alert:true}).catch(()=>{}); return; }
  if(status!=="approved") { if(ctx.message) await ctx.reply("🕓 حساب شما هنوز تأیید نشده است. برای تکمیل ثبت‌نام /start را بزن."); else await ctx.answerCallbackQuery({text:"حساب در انتظار تأیید مدیر است.",show_alert:true}).catch(()=>{}); return; }
  return next();
});
bot.command("myid", ctx => ctx.reply("Telegram ID شما: "+ctx.from.id+"\nاین عدد را در Railway در متغیر OWNER_TELEGRAM_ID قرار بده."));
bot.hears("🔄 بررسی وضعیت", async ctx => {
  const status=await ensurePlayer(ctx);
  await ctx.reply(status==="approved"?"✅ حساب تأیید شده؛ /start را بزن.":status==="banned"?"⛔ حساب مسدود است.":status==="rejected"?"❌ درخواست رد شده است.":"🕓 هنوز منتظر تأیید مدیر کل هستی.");
});

const COMPANY_TYPES = [
  { id: "cafe", name: "کافه مستقل ☕", price: 50000, income: 1500, employees: 3, sector: "خدمات غذایی", description: "راه‌اندازی کافه کوچک" },
  { id: "shop", name: "فروشگاه محلی 🛍️", price: 50000, income: 1510, employees: 3, sector: "خرده‌فروشی", description: "فروش محصولات روزمره" },
  { id: "bakery", name: "نانوایی 🥖", price: 50000, income: 1520, employees: 3, sector: "غذایی", description: "تولید و فروش نان" },
  { id: "restaurant", name: "رستوران 🍽️", price: 50000, income: 1530, employees: 3, sector: "غذایی", description: "رستوران شهری" },
  { id: "salon", name: "سالن زیبایی 💇", price: 50000, income: 1540, employees: 3, sector: "خدمات", description: "خدمات زیبایی" },
  { id: "gym", name: "باشگاه ورزشی 🏋️", price: 50000, income: 1550, employees: 3, sector: "سلامت و ورزش", description: "باشگاه محلی" },
  { id: "farm", name: "مزرعه 🌾", price: 50000, income: 1560, employees: 3, sector: "کشاورزی", description: "تولید محصولات کشاورزی" },
  { id: "logistics", name: "شرکت حمل‌ونقل 🚚", price: 50000, income: 1570, employees: 3, sector: "لجستیک", description: "حمل‌ونقل و توزیع" },
  { id: "construction", name: "پیمانکاری ساختمان 🏗️", price: 50000, income: 1580, employees: 3, sector: "ساخت‌وساز", description: "پروژه‌های ساختمانی" },
  { id: "textile", name: "کارگاه پوشاک 🧵", price: 50000, income: 1590, employees: 3, sector: "تولید", description: "تولید پوشاک" },
  { id: "autoservice", name: "تعمیرگاه خودرو 🔧", price: 50000, income: 1600, employees: 3, sector: "خدمات خودرو", description: "تعمیر و سرویس خودرو" },
  { id: "clinic", name: "کلینیک خصوصی 🩺", price: 50000, income: 1610, employees: 3, sector: "سلامت", description: "خدمات درمانی" },
  { id: "education", name: "آموزشگاه 📚", price: 50000, income: 1620, employees: 3, sector: "آموزش", description: "آموزش مهارت" },
  { id: "software", name: "استودیو نرم‌افزار 💻", price: 50000, income: 1630, employees: 3, sector: "فناوری", description: "توسعه نرم‌افزار" },
  { id: "marketing", name: "آژانس تبلیغات 📣", price: 50000, income: 1640, employees: 3, sector: "خدمات حرفه‌ای", description: "بازاریابی و تبلیغات" },
  { id: "ecommerce", name: "فروشگاه اینترنتی 🛒", price: 50000, income: 1650, employees: 3, sector: "تجارت الکترونیک", description: "فروش آنلاین" },
  { id: "hotel", name: "هتل بوتیک 🏨", price: 50000, income: 1660, employees: 3, sector: "گردشگری", description: "اقامت و میزبانی" },
  { id: "manufacturing", name: "کارخانه تولیدی 🏭", price: 50000, income: 1670, employees: 3, sector: "صنعت", description: "تولید صنعتی" },
  { id: "fintech", name: "فین‌تک 💳", price: 50000, income: 1680, employees: 3, sector: "فناوری مالی", description: "خدمات فناوری مالی" },
  { id: "telecom", name: "شرکت مخابراتی 📡", price: 50000, income: 1690, employees: 3, sector: "ارتباطات", description: "خدمات ارتباطی" },
  { id: "apple_brand", name: "Apple | برند ممتاز 🍎", price: 25000000, income: 450000, employees: 800, sector: "فناوری ممتاز", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 10, maxRank: 10 },
  { id: "samsung_brand", name: "Samsung | برند ممتاز 📱", price: 22000000, income: 410000, employees: 950, sector: "فناوری و تولید", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 10, maxRank: 10 },
  { id: "toyota_brand", name: "Toyota | برند ممتاز 🚘", price: 30000000, income: 520000, employees: 1200, sector: "خودروسازی", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 12, maxRank: 5 },
  { id: "microsoft_brand", name: "Microsoft | برند ممتاز 🪟", price: 35000000, income: 600000, employees: 900, sector: "نرم‌افزار", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 12, maxRank: 5 },
  { id: "amazon_brand", name: "Amazon | برند ممتاز 📦", price: 40000000, income: 720000, employees: 1600, sector: "تجارت و لجستیک", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 15, maxRank: 3 },
  { id: "google_brand", name: "Google | برند ممتاز 🔎", price: 42000000, income: 750000, employees: 1000, sector: "فناوری و تبلیغات", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 15, maxRank: 3 },
  { id: "tesla_brand", name: "Tesla | برند ممتاز ⚡", price: 28000000, income: 480000, employees: 850, sector: "خودروسازی و انرژی", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 12, maxRank: 5 },
  { id: "sony_brand", name: "Sony | برند ممتاز 🎮", price: 24000000, income: 430000, employees: 700, sector: "الکترونیک و سرگرمی", description: "مالکیت دارایی تجاری ممتاز", special: true, minLevel: 10, maxRank: 10 }
];

const money = (n) => "$" + Math.floor(Number(n)).toLocaleString("en-US");
// Compact main menu with expandable Telegram reply-keyboard sections.
const menuSection = new Map();
const mainKeyboard = () => new Keyboard()
  .text("📊 مرکز بازی").text("🏢 کسب‌وکارها").row()
  .text("💰 امور مالی").text("🌐 بازار و اقتصاد").row()
  .text("🏆 رقابت و پیشرفت").text("⚙️ بیشتر").resized().persistent(true);
const quickKeyboard = (userId) => {
  const kb=new InlineKeyboard()
    .text("🏢 کسب‌وکارها","quick:business").text("💰 امور مالی","quick:finance").row()
    .text("🏆 پیشرفت و جوایز","quick:progress").text("👤 پروفایل","profile").row()
    .text("📊 داشبورد","quick:home").text("📘 راهنمای مرحله‌ای","guide:1");
  if(String(userId)===ownerTelegramId)kb.row().text("🛡️ پنل مدیریت","quick:admin");
  return kb;
};
const sectionKeyboard = (section) => {
  const k = new Keyboard();
  if (section === "business") k.text("🏢 شرکت‌های من").text("🛒 خرید شرکت").row().text("👨‍💼 مدیریت شرکت‌ها").row();
  else if (section === "finance") k.text("💵 دریافت درآمد").text("🏦 بانک و وام").row().text("📒 دفتر مالی").row();
  else if (section === "market") k.text("🌐 اقتصاد واقعی").row().text("📡 خدمات مخابرات").row().text("📨 پیام اقتصادی").row();
  else if (section === "progress") k.text("🧭 مأموریت روزانه").text("🏅 دستاوردها").row().text("🏆 رتبه‌بندی").text("🎁 پاداش روزانه").row();
  else if (section === "more") k.text("👤 پروفایل").text("ℹ️ راهنما").row().text("📘 راهنمای مرحله‌ای").text("🧰 دسترسی آسان").row();
  return k.text("🔙 منوی اصلی").resized().persistent(true);
};
const bottomKeyboard = (userId) => {
  const section = menuSection.get(String(userId));
  return section ? sectionKeyboard(section) : mainKeyboard();
};

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_telegram_updates (
      update_id BIGINT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    DELETE FROM processed_telegram_updates WHERE processed_at < NOW() - INTERVAL '3 days';
    CREATE TABLE IF NOT EXISTS recent_bot_actions (action_key TEXT PRIMARY KEY, seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    DELETE FROM recent_bot_actions WHERE seen_at < NOW() - INTERVAL '1 day';
    CREATE TABLE IF NOT EXISTS players (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      display_name TEXT NOT NULL,
      balance BIGINT NOT NULL DEFAULT 100000,
      last_collect TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_daily DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS economic_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      recipient_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      company_id BIGINT,
      company_name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'پیام اقتصادی',
      body TEXT NOT NULL,
      reply_to BIGINT REFERENCES economic_messages(id) ON DELETE SET NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS economic_messages_recipient_idx ON economic_messages(recipient_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS economic_messages_sender_idx ON economic_messages(sender_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS player_companies (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      company_type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      bought_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS player_companies_owner_idx ON player_companies(telegram_id);
    ALTER TABLE players ADD COLUMN IF NOT EXISTS last_mission DATE;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS approved_by BIGINT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS admin_note TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS startup_name TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS startup_tagline TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS startup_city TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS player_level INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS season_points INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS last_season_rank INTEGER;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS registration_source TEXT;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS brand_name TEXT;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS approved_by BIGINT;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    CREATE TABLE IF NOT EXISTS company_requests (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      company_type TEXT NOT NULL,
      company_name TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      request_status TEXT NOT NULL DEFAULT 'pending',
      season_rank INTEGER,
      player_level INTEGER NOT NULL DEFAULT 1,
      reputation INTEGER NOT NULL DEFAULT 0,
      is_registration BOOLEAN NOT NULL DEFAULT false,
      source_tag TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT
    );
    ALTER TABLE company_requests ADD COLUMN IF NOT EXISTS is_registration BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE company_requests ADD COLUMN IF NOT EXISTS source_tag TEXT;
  `);
}

async function ensurePlayer(ctx) {
  const from = ctx.from;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || "بازیکن";
  await pool.query(
    `INSERT INTO players (telegram_id, username, display_name, approval_status, approved_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4='approved' THEN NOW() ELSE NULL END)
     ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name,
       approval_status = CASE WHEN EXCLUDED.telegram_id=$5 THEN 'approved' ELSE players.approval_status END,
       approved_at = CASE WHEN EXCLUDED.telegram_id=$5 THEN COALESCE(players.approved_at,NOW()) ELSE players.approved_at END`,
    [String(from.id), from.username ?? null, name, String(from.id) === ownerTelegramId ? 'approved' : 'pending', ownerTelegramId || '0']
  );
  const result = await pool.query('SELECT approval_status FROM players WHERE telegram_id=$1', [String(from.id)]);
  return result.rows[0]?.approval_status || 'pending';
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
  return { player: p.rows[0], companies: c.rows, income: await netHourlyForPlayer(pool,id), grossIncome: Number(totalIncome.rows[0].income) };
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
  const identity = p.startup_name ? `\n🚀 *${p.startup_name}*\n_${p.startup_tagline || "استارتاپ در مسیر رشد"}_ | 📍 ${p.startup_city || "شهر ثبت نشده"}\n` : "\n🚀 استارتاپ جدید | آماده شروع مسیر اقتصادی\n";
  return `🌆 *OPEN MANY | مرکز فرماندهی*${identity}
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

async function detailedStatusText(id) {
  const r=await getEconomyReport(pool,id),m=r.market,o=r.operations,f=r.finance;
  const pct=(v)=>((Number(v)-1)*100);
  const marketWord=(v,up,down)=>Number(v)>1.03?up:Number(v)<0.97?down:"در حد معمول";
  const lines=[
    "📊 *گزارش کسب‌وکارهای شما*",
    "━━━━━━━━━━━━━━━━",
    "💰 *۱. دخل‌وخرج هر ساعت*",
    "🟢 درآمد از فروش و خدمات: "+money(f.revenue),
    "🔻 حقوق کارکنان: "+money(f.payroll),
    "🔻 خرید مواد اولیه: "+money(f.materials),
    "🔻 برق، انرژی و خدمات: "+money(f.utilities),
    "🔻 تعمیر و نگهداری: "+money(f.maintenance),
    "🔻 مالیات: "+money(f.taxes),
    "━━━━━━━━━━━━━━━━",
    "💵 *سود باقی‌مانده: "+money(f.net)+" در هر ساعت*",
    "📅 سود یک روز کامل (اگر همین شرایط ادامه یابد): "+money(f.net*24),
    "🏦 بدهی بانکی: "+money(r.debt),
    "",
    "👥 *۲. وضعیت کلی کسب‌وکارها*",
    "🏢 تعداد شرکت‌ها: "+o.companies,
    "👷 مجموع کارکنان: "+o.employees+" نفر",
    "🙂 رضایت کارکنان: "+o.morale.toFixed(0)+" از 100",
    "🔧 سلامت تجهیزات: "+o.condition.toFixed(0)+" از 100",
    "📦 کالاهای موجود در انبار: "+o.stock+" واحد",
    "",
    "🌍 *۳. وضعیت بازار*",
    "🛍️ میزان خرید مردم: "+marketWord(m.demand_index,"بیشتر از معمول","کمتر از معمول")+" ("+(pct(m.demand_index)>=0?"+":"")+pct(m.demand_index).toFixed(1)+"٪)",
    "🧾 هزینه‌های عمومی: "+marketWord(m.inflation_index,"در حال افزایش","در حال کاهش")+" ("+(pct(m.inflation_index)>=0?"+":"")+pct(m.inflation_index).toFixed(1)+"٪ نسبت به حالت عادی)",
    "⚡ قیمت انرژی: "+(Number(m.energy_price)>1?"گران‌تر از معمول":Number(m.energy_price)<1?"ارزان‌تر از معمول":"معمول")+" ("+(pct(m.energy_price)>=0?"+":"")+pct(m.energy_price).toFixed(1)+"٪)",
    "🧱 قیمت مواد اولیه: "+(Number(m.materials_price)>1?"گران‌تر از معمول":Number(m.materials_price)<1?"ارزان‌تر از معمول":"معمول")+" ("+(pct(m.materials_price)>=0?"+":"")+pct(m.materials_price).toFixed(1)+"٪)",
    "👷 هزینه حقوق: "+(Number(m.wage_index)>1?"بالاتر از معمول":Number(m.wage_index)<1?"پایین‌تر از معمول":"معمول")+" ("+(pct(m.wage_index)>=0?"+":"")+pct(m.wage_index).toFixed(1)+"٪)",
    "🏦 نرخ سود وام: "+(Number(m.interest_rate)*100).toFixed(1)+"٪ در سال",
    "",
    "🏭 *۴. جزئیات هر شرکت*"
  ];
  for(const c of r.companies){
    const type=COMPANY_TYPES.find(x=>x.id===c.company_type);
    lines.push("");
    lines.push("🔹 *"+(c.company_name||type?.name||"شرکت")+"*");
    lines.push("سطح "+c.level+"  |  کارکنان: "+c.employee_count+" نفر");
    lines.push("رضایت کارکنان: "+Number(c.morale).toFixed(0)+"/100  |  سلامت تجهیزات: "+Number(c.equipment_condition).toFixed(0)+"/100");
    lines.push("📦 موجودی: "+c.inventory_units+" واحد");
    lines.push("💵 درآمد در ساعت: "+money(c.gross));
    lines.push("👷 حقوق: "+money(c.payroll)+"  |  🧱 مواد اولیه: "+money(c.materials));
    lines.push("⚡ انرژی: "+money(c.utilities)+"  |  🔧 تعمیرات: "+money(c.maintenance));
    lines.push("💰 *سود تقریبی این شرکت: "+money(c.net)+" در ساعت*");
    if(c.sale_price) lines.push("🏷️ قیمت فروش تعیین‌شده: "+money(c.sale_price));
  }
  lines.push("","📡 *خدمات مخابراتی بین بازیکنان*");
  if(r.telecom.length){
    const serviceNames={mobile:"اینترنت موبایل",fiber:"اینترنت فیبر",cloud:"سرور و فضای ابری",enterprise:"ارتباطات سازمانی",security:"امنیت شبکه"};
    for(const x of r.telecom){
      const active=x.status==="active"?"فعال":"متوقف";
      if(String(x.buyer_owner)===String(id))lines.push("🔻 "+(serviceNames[x.service_key]||x.service_key)+" | خرید برای "+(x.buyer_name||"شرکت شما")+" | "+money(x.price_per_period)+" هر ۳ ساعت | "+active);
      else lines.push("🟢 "+(serviceNames[x.service_key]||x.service_key)+" | فروش به "+(x.buyer_name||"شرکت خریدار")+" | "+money(x.price_per_period)+" هر ۳ ساعت | "+active);
    }
  }else lines.push("هنوز خرید یا فروش خدمات مخابراتی ندارید.");
    lines.push("","ℹ️ *توضیح:* اعداد درآمد و سود، محاسبه‌ای بر اساس شرایط فعلی بازار هستند و ممکن است با تغییر تقاضا و هزینه‌ها تغییر کنند.");
  const chunks=[];let current="";
  for(const line of lines){
    const candidate=current?current+"\n"+line:line;
    if(candidate.length>3800){if(current)chunks.push(current);current=line;}else current=candidate;
  }
  if(current)chunks.push(current);
  return chunks;
}

function homeText() {
  return `🏙️ *OPEN MANY*\n\nبه امپراتوری اقتصادی خودت خوش اومدی!\nشرکت بخر، درآمد جمع کن و در رتبه‌بندی بالا برو.`;
}

bot.command("start", async (ctx) => {
  const status = await ensurePlayer(ctx);
  const uid=String(ctx.from.id);
  const source=String(ctx.match||"").trim().slice(0,120) || "direct";
  await pool.query("UPDATE players SET registration_source=COALESCE(registration_source,$2) WHERE telegram_id=$1",[uid,source]);
  if(uid===ownerTelegramId || status==="approved")return ctx.reply(await dashboardText(ctx.from.id),{parse_mode:"Markdown",reply_markup:bottomKeyboard(ctx.from.id)});
  if(status==="banned")return ctx.reply("⛔ دسترسی حساب شما مسدود شده است.");
  if(status==="rejected")return ctx.reply("❌ درخواست قبلی شما رد شده است. برای بررسی دوباره با مدیر کل تماس بگیر.");
  const pending=await pool.query("SELECT id,company_name FROM company_requests WHERE telegram_id=$1 AND request_status='pending' ORDER BY id DESC LIMIT 1",[uid]);
  if(pending.rows.length)return ctx.reply("🕓 درخواست شما برای شرکت «"+pending.rows[0].company_name+"» ثبت شده و منتظر بررسی مدیر کل است. پس از تأیید، پیام دریافت می‌کنی.");
  return ctx.reply("🏙️ به Open Many خوش آمدی!\n\nبرای ثبت‌نام، ابتدا نوع شرکت شروع خودت را انتخاب کن. بعد نام شرکت را می‌گذاری و درخواست را تأیید می‌کنی. تا زمان تأیید مدیر، وارد بازی نمی‌شوی.",{reply_markup:registrationKeyboard()});
});
bot.hears("🧰 دسترسی آسان", async ctx => {
  const userCommands = "برای بازی نیازی به تایپ دستور نیست.\n\n۱. از منوی پایین بخش را انتخاب کن.\n۲. عملیات را با دکمه‌ها انجام بده.\n۳. راهنمای مرحله‌ای قدم‌به‌قدم راهنمایی می‌کند.\n\n🌐 بازار و اقتصاد — گزارش بازار\n🏦 امور مالی — درآمد، بانک و دفتر مالی\n🏢 کسب‌وکارها — خرید و مدیریت شرکت\n🏆 رقابت و پیشرفت — مأموریت، جایزه و رتبه‌بندی";
  const adminCommands = "\n\n🛡️ دستورات مدیر کل:\n/admin یا /panel — پنل مدیریت مرحله‌ای\n/pending — درخواست‌های عضویت\n/approve ID — تأیید بازیکن\n/reject ID — رد درخواست\n/ban ID — مسدود کردن\n/unban ID — رفع مسدودی\n/players — فهرست بازیکنان\n/balance ID — مشاهده موجودی\n/setbalance ID AMOUNT — تنظیم موجودی\n/give ID AMOUNT — هدیه پول\n/broadcast متن — پیام همگانی";
  await ctx.reply("🧰 دسترسی آسان\n\n"+userCommands+(String(ctx.from.id)===ownerTelegramId?adminCommands:""), {reply_markup:bottomKeyboard(ctx.from.id)});
});
bot.hears("📘 راهنمای مرحله‌ای",async ctx=>{const kb=new InlineKeyboard().text("۱. شروع بازی","guide:1").row().text("۲. ساخت شرکت","guide:2").row().text("۳. درآمد و امور مالی","guide:3").row().text("۴. پیشرفت و پاداش","guide:4");await ctx.reply("📘 راهنمای مرحله‌ای\n\nیک مرحله را انتخاب کن:",{reply_markup:kb});});
bot.command("guide",async ctx=>{
 const kb=new InlineKeyboard().text("۱. شروع بازی","guide:1").row().text("۲. ساخت شرکت","guide:2").row().text("۳. درآمد و امور مالی","guide:3").row().text("۴. پیشرفت و پاداش","guide:4").row().text("🏠 منوی بازی","guide:menu");
 await ctx.reply("📘 راهنمای مرحله‌ای Open Many\n\nمرحله موردنظر را انتخاب کن تا راهنمای کوتاه و دکمه اقدام را ببینی.",{reply_markup:kb});
});
bot.callbackQuery(/^guide:(1|2|3|4|menu)$/,async ctx=>{
  await ctx.answerCallbackQuery();const s=ctx.match[1];
  if(s==="menu")return ctx.editMessageText("🏙️ منوی بازی",{reply_markup:quickKeyboard(ctx.from.id)});
  const pages={1:["🚀 مرحله ۱ — شروع","همین صفحه داشبورد سرمایه، شرکت‌ها، درآمد و هدف بعدی را نشان می‌دهد. از دکمه‌های پایین برای رفتن به هر بخش استفاده کن.","📊 داشبورد","quick:home"],2:["🏢 مرحله ۲ — ساخت شرکت","کسب‌وکارها را باز کن، یک شرکت را انتخاب کن و دکمه تأسیس را بزن. نام به‌صورت خودکار ثبت می‌شود؛ هیچ چیزی تایپ نمی‌کنی. پس از تأیید مدیر فعال می‌شود.","🛒 خرید شرکت","buy_menu"],3:["💰 مرحله ۳ — درآمد","در بخش امور مالی فقط «دریافت درآمد» را بزن. برای دریافت پاداش هم دکمه پاداش روزانه را انتخاب کن.","💵 دریافت درآمد","collect"],4:["🏆 مرحله ۴ — پیشرفت","از بخش رقابت و پیشرفت، مأموریت روزانه، دستاوردها و رتبه‌بندی را با دکمه‌ها دنبال کن.","🎁 پاداش روزانه","daily"]};
  const p=pages[s];return ctx.editMessageText(p[0]+"\n\n"+p[1],{reply_markup:new InlineKeyboard().text(p[2],p[3]).row().text("➡️ مرحله بعد","guide:"+Math.min(4,Number(s)+1)).row().text("📘 فهرست","guide:list").text("🏠 منو","guide:menu")});
});
bot.callbackQuery("guide:list",async ctx=>{await ctx.answerCallbackQuery();return ctx.editMessageText("📘 راهنمای مرحله‌ای — یک مرحله را انتخاب کن:",{reply_markup:new InlineKeyboard().text("۱. شروع","guide:1").text("۲. شرکت","guide:2").row().text("۳. مالی","guide:3").text("۴. پیشرفت","guide:4").row().text("🏠 منو","guide:menu")});});

bot.callbackQuery(/^quick:(home|business|finance|progress|mission|admin)$/,async ctx=>{
  const s=ctx.match[1];await ctx.answerCallbackQuery();
  if(s==="admin"){if(String(ctx.from.id)!==ownerTelegramId)return ctx.reply("⛔ فقط مدیر کل دسترسی دارد.");return ctx.reply("🛡️ پنل مدیریت",{reply_markup:adminKeyboard()});}
  if(s==="home")return ctx.editMessageText(await dashboardText(ctx.from.id),{parse_mode:"Markdown",reply_markup:quickKeyboard(ctx.from.id)});
  if(s==="business")return ctx.editMessageText("🏢 مدیریت کسب‌وکار\n\nمرحله ۱: شرکت‌های خودت را ببین یا شرکت جدید انتخاب کن.\nمرحله ۲: برای ارتقا، شرکت را انتخاب کن.",{reply_markup:new InlineKeyboard().text("🏢 شرکت‌های من","my_companies").text("🛒 تأسیس شرکت","buy_menu").row().text("🔧 ارتقای شرکت","upgrade_menu").row().text("⬅️ منوی بازی","quick:home")});
  if(s==="finance")return ctx.editMessageText("💰 امور مالی\n\nیک عملیات را انتخاب کن؛ نیازی به دستور یا تایپ نیست.",{reply_markup:new InlineKeyboard().text("💵 دریافت درآمد","collect").text("🎁 پاداش روزانه","daily").row().text("👤 مشاهده سرمایه","profile").row().text("⬅️ منوی بازی","quick:home")});
  if(s==="progress")return ctx.editMessageText("🏆 پیشرفت و رقابت\n\nپاداش بگیر، مأموریتت را پیگیری کن و رتبه‌ات را ببین.",{reply_markup:new InlineKeyboard().text("🎁 پاداش روزانه","daily").text("🧭 مأموریت","quick:mission").row().text("🏆 رتبه‌بندی","leaderboard").row().text("⬅️ منوی بازی","quick:home")});
  const q=await pool.query("SELECT COUNT(*)::int count FROM player_companies WHERE telegram_id=$1 AND approval_status='approved'",[String(ctx.from.id)]);const count=Number(q.rows[0]?.count||0);const kb=new InlineKeyboard();if(count<1)kb.text("🏢 خرید اولین شرکت","buy_menu").row();else kb.text("🎁 دریافت جایزه مأموریت","mission_claim").row();kb.text("🎁 پاداش روزانه","daily").row().text("⬅️ منوی بازی","quick:home");return ctx.reply("🧭 مأموریت روزانه\n\nهدف: داشتن حداقل یک شرکت فعال.\nپیشرفت: "+Math.min(count,1)+"/1\n"+(count?"✅ مأموریت تکمیل شده؛ جایزه را دریافت کن.":"🔒 ابتدا یک شرکت تأسیس کن."),{reply_markup:kb});
});
bot.command("menu", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply(homeText(), { parse_mode: "Markdown", reply_markup: bottomKeyboard(ctx.from.id) });
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

bot.callbackQuery("buy_menu", async ctx => {
  const kb=new InlineKeyboard();
  const p=await pool.query("SELECT player_level,last_season_rank,reputation FROM players WHERE telegram_id=$1",[String(ctx.from.id)]);
  const perf=p.rows[0]||{player_level:1,last_season_rank:null,reputation:0};
  const unlocked=COMPANY_TYPES.filter(t=>!t.special||(Number(perf.player_level)>=t.minLevel&&Number(perf.reputation)>=20&&Number(perf.last_season_rank)>0&&Number(perf.last_season_rank)<=t.maxRank));
  for(const t of unlocked) kb.text(t.name,"buy:"+t.id).row();
  kb.text("🔙 بازگشت","home");
  await ctx.editMessageText("🏗️ *فرصت‌های تأسیس شرکت*\n\nنوع شرکت را انتخاب کن؛ نام اختصاصی می‌گذاری و پیش از ارسال، درخواست را تأیید می‌کنی.",{parse_mode:"Markdown",reply_markup:kb});
  await ctx.answerCallbackQuery();
});
bot.callbackQuery(/^reg:company:([a-z_]+)$/,async ctx=>{
  const type=COMPANY_TYPES.find(x=>x.id===ctx.match[1]&&!x.special);
  if(!type)return ctx.answerCallbackQuery({text:"نوع شرکت برای ثبت‌نام معتبر نیست.",show_alert:true});
  const uid=String(ctx.from.id);
  const status=await pool.query("SELECT approval_status,registration_source FROM players WHERE telegram_id=$1",[uid]);
  if(!status.rows.length)return ctx.answerCallbackQuery({text:"ابتدا /start را بزن.",show_alert:true});
  const existing=await pool.query("SELECT id FROM company_requests WHERE telegram_id=$1 AND request_status='pending' LIMIT 1",[uid]);
  if(existing.rows.length)return ctx.answerCallbackQuery({text:"درخواست قبلی هنوز در انتظار بررسی است.",show_alert:true});
  companyNamePending.set(uid,{typeId:type.id,registration:true,sourceTag:status.rows[0].registration_source||"direct"});
  await ctx.answerCallbackQuery();
  return ctx.reply("🏷️ نام دلخواه شرکت «"+type.name+"» را بنویس.\n\nنام ۲ تا ۴۰ حرف باشد. برای لغو /cancel را بزن.");
});
bot.callbackQuery("reg:cancel",async ctx=>{
  const uid=String(ctx.from.id);companyNamePending.delete(uid);companyConfirmPending.delete(uid);
  await ctx.answerCallbackQuery({text:"ثبت‌نام لغو شد."});
  return ctx.reply("هر زمان آماده بودی، /start را بزن و ثبت‌نام را ادامه بده.");
});
bot.callbackQuery(/^buy:([a-z_]+)$/,async ctx=>{
  const type=COMPANY_TYPES.find(x=>x.id===ctx.match[1]);
  if(!type)return ctx.answerCallbackQuery({text:"نوع شرکت نامعتبر است.",show_alert:true});
  if(type.special){const p=await pool.query("SELECT player_level,last_season_rank,reputation FROM players WHERE telegram_id=$1",[String(ctx.from.id)]);const x=p.rows[0]||{};if(Number(x.player_level)<type.minLevel||Number(x.reputation)<20||!Number(x.last_season_rank)||Number(x.last_season_rank)>type.maxRank)return ctx.answerCallbackQuery({text:"این برند ممتاز با Level، اعتبار و رتبه فصل گذشته باز می‌شود.",show_alert:true});}
  const uid=String(ctx.from.id);
  const existing=await pool.query("SELECT id FROM company_requests WHERE telegram_id=$1 AND request_status='pending' LIMIT 1",[uid]);
  if(existing.rows.length)return ctx.answerCallbackQuery({text:"درخواست قبلی هنوز در انتظار بررسی است.",show_alert:true});
  const p=await pool.query("SELECT player_level,reputation,season_points,last_season_rank,registration_source FROM players WHERE telegram_id=$1",[uid]);
  const perf=p.rows[0]||{};
  companyNamePending.set(uid,{typeId:type.id,registration:false,rank:perf.last_season_rank,playerLevel:perf.player_level||1,reputation:perf.reputation||0,seasonPoints:perf.season_points||0,sourceTag:perf.registration_source||"in-game"});
  await ctx.answerCallbackQuery();
  return ctx.reply("🏷️ برای شرکت «"+type.name+"» یک نام اختصاصی انتخاب کن.\n\nنام ۲ تا ۴۰ حرف باشد. برای لغو /cancel را بزن.");
});
bot.callbackQuery(/^corp:(approve|reject):(\d+)$/,async ctx=>{
  if(String(ctx.from.id)!==ownerTelegramId)return ctx.answerCallbackQuery({text:"فقط مدیر کل دسترسی دارد.",show_alert:true});
  const action=ctx.match[1],id=Number(ctx.match[2]),client=await pool.connect();
  try{
    await client.query("BEGIN");
    const q=await client.query("SELECT * FROM company_requests WHERE id=$1 AND request_status='pending' FOR UPDATE",[id]);
    if(!q.rows.length){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"درخواست قبلاً بررسی شده.",show_alert:true});}
    const req=q.rows[0],type=COMPANY_TYPES.find(x=>x.id===req.company_type);
    if(action==="approve"){
      const p=await client.query("SELECT balance FROM players WHERE telegram_id=$1 FOR UPDATE",[String(req.telegram_id)]);
      if(!p.rows.length||Number(p.rows[0].balance)<type.price){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"سرمایه بازیکن برای تأسیس کافی نیست.",show_alert:true});}
      await client.query("UPDATE players SET balance=balance-$2,player_level=GREATEST(player_level,1),reputation=LEAST(100,reputation+2),approval_status=CASE WHEN $3 THEN 'approved' ELSE approval_status END,approved_at=CASE WHEN $3 THEN NOW() ELSE approved_at END,approved_by=CASE WHEN $3 THEN $4 ELSE approved_by END WHERE telegram_id=$1",[String(req.telegram_id),type.price,!!req.is_registration,ownerTelegramId]);
      await client.query("INSERT INTO player_companies(telegram_id,company_type,company_name,brand_name,employee_count,approved_by,approval_status) VALUES($1,$2,$3,$4,$5,$6,'approved')",[String(req.telegram_id),req.company_type,req.company_name,req.brand_name,type.employees,ownerTelegramId]);
      await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'company_foundation',$2,$3)",[String(req.telegram_id),-type.price,"هزینه تأسیس "+req.company_name]);
      await client.query("UPDATE company_requests SET request_status='approved',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1",[id,ownerTelegramId]);
    }else { await client.query("UPDATE company_requests SET request_status='rejected',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1",[id,ownerTelegramId]); if(req.is_registration)await client.query("UPDATE players SET approval_status='rejected' WHERE telegram_id=$1",[String(req.telegram_id)]); }
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({text:action==="approve"?"شرکت تأیید و تأسیس شد.":"درخواست رد شد."});
    if(action==="approve"){
      await bot.api.sendMessage(String(req.telegram_id),"🎉 درخواست شرکت «"+req.company_name+"» تأیید شد و کسب‌وکار شما فعال شد!\n\nاکنون دسترسی بازی فعال است. برای ورود /start را بزن.",{reply_markup:mainKeyboard()}).catch(()=>{});
    }else{
      await bot.api.sendMessage(String(req.telegram_id),"❌ درخواست شرکت «"+req.company_name+"» رد شد.").catch(()=>{});
    }
    await ctx.editMessageText((action==="approve"?"✅ تأیید شد: ":"❌ رد شد: ")+req.company_name);
  }catch(e){await client.query("ROLLBACK");console.error(e);await ctx.answerCallbackQuery({text:"خطا در بررسی درخواست.",show_alert:true});}
  finally{client.release();}
});
bot.callbackQuery("collect", async (ctx) => {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const p=await client.query("SELECT balance,last_collect FROM players WHERE telegram_id=$1 FOR UPDATE",[String(ctx.from.id)]);
    if(!p.rows.length)throw new Error("Player missing");
    const anchor=new Date(p.rows[0].last_collect).getTime(),now=Date.now();
    const intervals=Math.min(8,Math.floor(Math.max(0,now-anchor)/(3*3600000)));
    if(intervals<1){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"پرداخت خودکار هر ۳ ساعت انجام می‌شود؛ هنوز نوبت بعدی نرسیده.",show_alert:true});}
    const netHourly=await netHourlyForPlayer(pool,ctx.from.id),earned=Math.floor(netHourly*3*intervals);
    const newAnchor=new Date(anchor+intervals*3*3600000);
    await client.query("UPDATE players SET balance=balance+$2,last_collect=$3 WHERE telegram_id=$1",[String(ctx.from.id),earned,newAnchor]);
    await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'operating_income',$2,$3)",[String(ctx.from.id),earned,"پرداخت سود؛ "+intervals+" دوره سه‌ساعته"]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({text:"پرداخت سود انجام شد: "+money(earned)});
    return ctx.editMessageText("💵 *پرداخت سود انجام شد*\\n\\nدوره‌ها: "+intervals+" × ۳ ساعت\\nواریزی: "+money(earned)+"\\n\\nپرداخت خودکار هر ۳ ساعت انجام می‌شود.",{parse_mode:"Markdown",reply_markup:new InlineKeyboard().text("📒 دفتر مالی","quick:finance").row().text("🏠 منوی اصلی","home")});
  }catch(e){await client.query("ROLLBACK");console.error(e);return ctx.answerCallbackQuery({text:"خطا در پرداخت سود.",show_alert:true});}
  finally{client.release();}
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




// Main menu sections open focused submenus instead of showing every action at once.
const menuSections = [
  ["📊 مرکز بازی", null, "📊 مرکز بازی"],
  ["🏢 کسب‌وکارها", "business", "🏢 کسب‌وکارها"],
  ["💰 امور مالی", "finance", "💰 امور مالی"],
  ["🌐 بازار و اقتصاد", "market", "🌐 بازار و اقتصاد"],
  ["🏆 رقابت و پیشرفت", "progress", "🏆 رقابت و پیشرفت"],
  ["⚙️ بیشتر", "more", "⚙️ بیشتر"]
];
for (const [label, section, title] of menuSections) {
  bot.hears(label, async ctx => {
    if (!section) {
      menuSection.delete(String(ctx.from.id));
      await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: mainKeyboard() });
      return;
    }
    menuSection.set(String(ctx.from.id), section);
    await ctx.reply(title + "\n\nاز گزینه‌های این بخش انتخاب کن:", { reply_markup: sectionKeyboard(section) });
  });
}
// Economic message composer: choose another player's company, then send a private in-game business message.
const companyNamePending = new Map();
const companyConfirmPending = new Map();
const economicCompose = new Map();
const registrationKeyboard = () => {
  const kb=new InlineKeyboard();
  for(const t of COMPANY_TYPES.filter(x=>!x.special)) kb.text(t.name,"reg:company:"+t.id).row();
  kb.text("❌ انصراف","reg:cancel");
  return kb;
};
bot.hears("📨 پیام اقتصادی", async ctx => {
  const q = await pool.query(
    `SELECT pc.id,pc.company_name,pc.company_type,p.telegram_id,p.display_name
     FROM player_companies pc JOIN players p ON p.telegram_id=pc.telegram_id
     WHERE pc.telegram_id<>$1 AND p.approval_status='approved' AND pc.approval_status='approved'
     ORDER BY pc.company_name LIMIT 30`,
    [String(ctx.from.id)]
  );
  if (!q.rows.length) return ctx.reply("فعلاً شرکت فعالِ بازیکن دیگری برای ارسال پیام وجود ندارد؛ اما می‌توانی صندوق پیام‌ها را باز کنی.", {reply_markup:new InlineKeyboard().text("📥 صندوق پیام‌ها","econ:inbox").row().text("🔙 منوی اصلی","home")});
  const kb=new InlineKeyboard();
  for(const c of q.rows) kb.text((c.company_name||c.company_type)+" | "+c.display_name.slice(0,16),"econ:to:"+c.id).row();
  kb.text("📥 صندوق پیام‌ها","econ:inbox").row().text("🔙 منوی اصلی","home");
  return ctx.reply("📨 پیام اقتصادی به شرکت\n\nشرکت مقصد را انتخاب کن. پیام خصوصی برای مالک شرکت ارسال می‌شود و می‌توانی درباره خرید، فروش، تأمین کالا، قرارداد یا همکاری مذاکره کنی.",{reply_markup:kb});
});
bot.callbackQuery(/^econ:to:(\d+)$/,async ctx=>{
  const q=await pool.query(`SELECT pc.id,pc.company_name,pc.company_type,pc.telegram_id,p.display_name
    FROM player_companies pc JOIN players p ON p.telegram_id=pc.telegram_id
    WHERE pc.id=$1 AND pc.telegram_id<>$2 AND pc.approval_status='approved' AND p.approval_status='approved'`,[ctx.match[1],String(ctx.from.id)]);
  if(!q.rows.length)return ctx.answerCallbackQuery({text:"شرکت پیدا نشد.",show_alert:true});
  const c=q.rows[0];economicCompose.set(String(ctx.from.id),{recipientId:String(c.telegram_id),companyId:Number(c.id),companyName:c.company_name||c.company_type,replyTo:null});
  await ctx.answerCallbackQuery();
  return ctx.reply("✍️ پیام خود را برای «"+(c.company_name||c.company_type)+"» بنویس.\n\nحداکثر ۱۰۰۰ حرف. برای لغو /cancel را بفرست.");
});
bot.callbackQuery(/^econ:reply:(\d+)$/,async ctx=>{
  const q=await pool.query("SELECT id,sender_id,recipient_id,company_id,company_name,body FROM economic_messages WHERE id=$1 AND recipient_id=$2",[ctx.match[1],String(ctx.from.id)]);
  if(!q.rows.length)return ctx.answerCallbackQuery({text:"پیام پیدا نشد.",show_alert:true});
  const m=q.rows[0];economicCompose.set(String(ctx.from.id),{recipientId:String(m.sender_id),companyId:m.company_id,companyName:m.company_name,replyTo:Number(m.id)});
  await ctx.answerCallbackQuery();
  return ctx.reply("↩️ پاسخ به پیام درباره «"+m.company_name+"» را بنویس.\n\nبرای لغو /cancel را بفرست.");
});
bot.command("cancel",async ctx=>{const uid=String(ctx.from.id);if(companyNamePending.delete(uid)||companyConfirmPending.delete(uid))return ctx.reply("انتخاب نام و درخواست تأسیس لغو شد.");if(economicCompose.delete(uid))return ctx.reply("ارسال پیام لغو شد.");return ctx.reply("در حال حاضر عملیات در انتظار لغو نداری.");});
bot.on("message:text",async (ctx,next)=>{
  const uid=String(ctx.from.id);
  const naming=companyNamePending.get(uid);
  if(naming){
    const raw=(ctx.message.text||"").trim();
    if(raw.startsWith("/"))return next();
    const companyName=raw.replace(/[<>]/g,"").replace(/[\\*_]/g,"").trim();
    if(companyName.length<2||companyName.length>40)return ctx.reply("نام شرکت باید ۲ تا ۴۰ حرف باشد. دوباره بنویس یا /cancel بزن.");
    const type=COMPANY_TYPES.find(x=>x.id===naming.typeId);
    if(!type){companyNamePending.delete(uid);return ctx.reply("نوع شرکت نامعتبر شد؛ دوباره انتخاب کن.");}
    companyNamePending.delete(uid);
    companyConfirmPending.set(uid,{...naming,companyName});
    return ctx.reply("📝 پیش‌نمایش درخواست شرکت\n\n🏢 نوع شرکت: "+type.name+"\n🏷️ نام انتخابی: "+companyName+"\n\nاطلاعات مالی و درآمدی در این مرحله نمایش داده نمی‌شود.\n\nآیا این شرکت را با همین نام درخواست می‌کنی؟",{reply_markup:new InlineKeyboard().text("✅ بله، ارسال درخواست","reg:confirm").text("✏️ تغییر نام","reg:rename").row().text("❌ انصراف","reg:cancel")});
  }
  const pending=economicCompose.get(uid);
  if(!pending)return next();
  const body=(ctx.message.text||"").trim();
  if(body.startsWith("/"))return next();
  if(!body||body.length>1000)return ctx.reply("متن باید بین ۱ تا ۱۰۰۰ حرف باشد. دوباره بنویس یا /cancel بزن.");
  const recipient=await pool.query("SELECT approval_status FROM players WHERE telegram_id=$1",[pending.recipientId]);
  if(!recipient.rows.length||recipient.rows[0].approval_status!=="approved"){economicCompose.delete(uid);return ctx.reply("بازیکن مقصد دیگر فعال نیست؛ ارسال لغو شد.");}
  const ins=await pool.query("INSERT INTO economic_messages(sender_id,recipient_id,company_id,company_name,body,reply_to) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at",[uid,pending.recipientId,pending.companyId,pending.companyName,body,pending.replyTo]);
  economicCompose.delete(uid);
  const sender=await pool.query("SELECT display_name FROM players WHERE telegram_id=$1",[uid]);
  const msgId=ins.rows[0].id;
  try{
    await bot.api.sendMessage(pending.recipientId,"📨 پیام اقتصادی جدید\\n\\nاز: "+(sender.rows[0]?.display_name||"بازیکن")+"\\n🏢 درباره: "+pending.companyName+"\\n\\n"+body,{reply_markup:new InlineKeyboard().text("↩️ پاسخ","econ:reply:"+msgId).text("📥 صندوق پیام‌ها","econ:inbox")});
    await ctx.reply("✅ پیام اقتصادی ارسال شد.",{reply_markup:bottomKeyboard(ctx.from.id)});
  }catch(e){await ctx.reply("پیام در صندوق بازی ذخیره شد، اما تلگرام نتوانست اعلان مستقیم را تحویل دهد. مقصد باید ربات را باز کند.",{reply_markup:bottomKeyboard(ctx.from.id)});}
});
bot.callbackQuery("reg:rename",async ctx=>{
  const uid=String(ctx.from.id),pending=companyConfirmPending.get(uid);
  if(!pending)return ctx.answerCallbackQuery({text:"درخواستی برای ویرایش نام پیدا نشد.",show_alert:true});
  companyConfirmPending.delete(uid);companyNamePending.set(uid,pending);
  await ctx.answerCallbackQuery();
  return ctx.reply("نام جدید شرکت را بنویس. برای لغو /cancel را بزن.");
});
bot.callbackQuery("reg:confirm",async ctx=>{
  const uid=String(ctx.from.id),pending=companyConfirmPending.get(uid);
  if(!pending)return ctx.answerCallbackQuery({text:"درخواست تأیید برای ارسال پیدا نشد.",show_alert:true});
  const type=COMPANY_TYPES.find(x=>x.id===pending.typeId);
  if(!type)return ctx.answerCallbackQuery({text:"نوع شرکت نامعتبر است.",show_alert:true});
  const status=await pool.query("SELECT approval_status,display_name,username,balance,registration_source,created_at FROM players WHERE telegram_id=$1",[uid]);
  if(!status.rows.length)return ctx.answerCallbackQuery({text:"پروفایل پیدا نشد.",show_alert:true});
  const duplicate=await pool.query("SELECT id FROM company_requests WHERE telegram_id=$1 AND request_status='pending' LIMIT 1",[uid]);
  if(duplicate.rows.length){companyConfirmPending.delete(uid);return ctx.answerCallbackQuery({text:"درخواست قبلی هنوز در انتظار بررسی است.",show_alert:true});}
  const p=status.rows[0],isRegistration=p.approval_status!=="approved"||!!pending.registration;
  const q=await pool.query("INSERT INTO company_requests(telegram_id,company_type,company_name,brand_name,season_rank,player_level,reputation,is_registration,source_tag) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8) RETURNING id,created_at",
    [uid,type.id,pending.companyName,pending.rank??null,pending.playerLevel||1,pending.reputation||0,isRegistration,pending.sourceTag||p.registration_source||"direct"]);
  companyConfirmPending.delete(uid);
  await ctx.answerCallbackQuery({text:"درخواست ارسال شد."});
  await ctx.reply("📨 درخواست شما برای شرکت «"+pending.companyName+"» ارسال شد.\n\nدر انتظار بررسی مدیر کل هستی. پس از تأیید، پیام دریافت می‌کنی و دسترسی بازی فعال می‌شود.",{reply_markup:new Keyboard().text("🔄 بررسی وضعیت").resized().persistent()});
  if(ownerTelegramId){
    const details="🆕 درخواست تأسیس شرکت #"+q.rows[0].id+"\n\n👤 نام بازیکن: "+p.display_name+"\n🔖 نام کاربری: "+(p.username?"@"+p.username:"ندارد")+"\n🆔 شناسه تلگرام: "+uid+"\n🏢 شرکت: "+pending.companyName+"\n🏭 نوع: "+type.name+"\n🧾 نوع درخواست: "+(isRegistration?"ثبت‌نام اولیه + شرکت شروع":"شرکت جدید بازیکن فعال")+"\n🔗 منبع ورود / دعوت: "+(p.registration_source||pending.sourceTag||"direct")+"\n📅 زمان ثبت‌نام: "+new Date(p.created_at).toLocaleString("fa-IR")+"\n💰 موجودی فعلی (فقط مدیر): "+money(p.balance)+"\n📌 وضعیت حساب: "+p.approval_status;
    await bot.api.sendMessage(ownerTelegramId,details,{reply_markup:new InlineKeyboard().text("✅ تأیید و فعال‌سازی","corp:approve:"+q.rows[0].id).text("❌ رد درخواست","corp:reject:"+q.rows[0].id)});
  }
});

bot.callbackQuery("econ:inbox",async ctx=>{
  const q=await pool.query(`SELECT em.id,em.sender_id,em.company_name,em.body,em.created_at,p.display_name
    FROM economic_messages em JOIN players p ON p.telegram_id=em.sender_id
    WHERE em.recipient_id=$1 ORDER BY em.created_at DESC LIMIT 10`,[String(ctx.from.id)]);
  if(!q.rows.length){await ctx.answerCallbackQuery();return ctx.editMessageText("📥 صندوق پیام‌های اقتصادی خالی است.",{reply_markup:new InlineKeyboard().text("⬅️ پیام اقتصادی","econ:back")});}
  const kb=new InlineKeyboard();
  for(const m of q.rows)kb.text("✉️ "+m.display_name.slice(0,14)+" | "+String(m.company_name||"شرکت").slice(0,18),"econ:read:"+m.id).row();
  kb.text("🔄 تازه‌سازی","econ:inbox").row().text("⬅️ پیام اقتصادی","econ:back");
  await ctx.answerCallbackQuery();
  return ctx.editMessageText("📥 صندوق پیام‌های اقتصادی\n\nآخرین ۱۰ پیام دریافتی:",{reply_markup:kb});
});
bot.callbackQuery(/^econ:read:(\d+)$/,async ctx=>{
  const q=await pool.query(`SELECT em.*,p.display_name FROM economic_messages em JOIN players p ON p.telegram_id=em.sender_id WHERE em.id=$1 AND em.recipient_id=$2`,[ctx.match[1],String(ctx.from.id)]);
  if(!q.rows.length)return ctx.answerCallbackQuery({text:"پیام پیدا نشد.",show_alert:true});
  const m=q.rows[0];await pool.query("UPDATE economic_messages SET read_at=COALESCE(read_at,NOW()) WHERE id=$1",[m.id]);
  await ctx.answerCallbackQuery();
  return ctx.editMessageText("📨 پیام اقتصادی\n\nاز: "+m.display_name+"\n🏢 درباره: "+m.company_name+"\n🕒 "+new Date(m.created_at).toLocaleString("fa-IR")+"\n\n"+m.body,{reply_markup:new InlineKeyboard().text("↩️ پاسخ","econ:reply:"+m.id).row().text("📥 صندوق پیام‌ها","econ:inbox")});
});
bot.callbackQuery("econ:back",async ctx=>{await ctx.answerCallbackQuery();return ctx.editMessageText("📨 پیام اقتصادی: می‌توانی به شرکت‌های بازیکنان دیگر پیام بدهی یا صندوق دریافتی را باز کنی.",{reply_markup:new InlineKeyboard().text("🏢 انتخاب شرکت مقصد","econ:companies").text("📥 صندوق پیام‌ها","econ:inbox").row().text("🔙 بازگشت","home")});});
bot.callbackQuery("econ:companies",async ctx=>{await ctx.answerCallbackQuery();return ctx.reply("برای شروع ارسال، دکمه «📨 پیام اقتصادی» را از منوی «🌐 بازار و اقتصاد» بزن.");});

bot.hears("🔙 منوی اصلی", async ctx => {
  menuSection.delete(String(ctx.from.id));
  await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: mainKeyboard() });
});

// Dashboard: full game overview and company status
bot.hears("📊 وضعیت بازی", async (ctx) => {
  await ensurePlayer(ctx);
  await ctx.reply(await dashboardText(ctx.from.id), {
    parse_mode: "Markdown",
    reply_markup: bottomKeyboard(ctx.from.id)
  });
  const reports=await detailedStatusText(ctx.from.id);
  for(let i=0;i<reports.length;i++)await ctx.reply(reports[i],{parse_mode:"Markdown",reply_markup:i===reports.length-1?bottomKeyboard(ctx.from.id):undefined});
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
    await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: bottomKeyboard(ctx.from.id) });
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
    parse_mode: "Markdown", reply_markup: bottomKeyboard(ctx.from.id)
  });
});

// Persistent bottom-menu buttons (Telegram Reply Keyboard)
bot.hears("👤 پروفایل", async (ctx) => {
  await ensurePlayer(ctx);
  const d = await playerData(ctx.from.id);
  const count = d.companies.reduce((sum,x)=>sum+Number(x.count),0);
  await ctx.reply(
    `👤 پروفایل شما\n\n💰 سرمایه: ${money(d.player.balance)}\n🏢 تعداد شرکت‌ها: ${count}\n📈 درآمد هر ساعت: ${money(d.income)}\n🗓️ عضویت: ${new Date(d.player.created_at).toLocaleDateString("fa-IR")}`,
    { reply_markup: bottomKeyboard(ctx.from.id) }
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
  await ctx.reply(`🏆 رتبه‌بندی سرمایه‌داران\n\n${leaderboardText}`, { reply_markup: bottomKeyboard(ctx.from.id) });
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
    reply_markup: bottomKeyboard(ctx.from.id)
  });
});



// Owner-only full economy and company administration tools.
bot.command("take",async ctx=>{if(!await adminOnly(ctx))return;const [id,n]=(ctx.match||"").trim().split(/\s+/),amount=Number(n);if(!/^\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<=0)return ctx.reply("استفاده: /take ID AMOUNT");const q=await pool.query("UPDATE players SET balance=GREATEST(0,balance-$2) WHERE telegram_id=$1 RETURNING display_name,balance",[id,amount]);await ctx.reply(q.rowCount?"از "+q.rows[0].display_name+" مبلغ "+money(amount)+" کسر شد. موجودی: "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("fine",async ctx=>{if(!await adminOnly(ctx))return;const [id,n,...reason]=(ctx.match||"").trim().split(/\s+/),amount=Number(n);if(!/^\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<=0)return ctx.reply("استفاده: /fine ID AMOUNT دلیل");const q=await pool.query("UPDATE players SET balance=GREATEST(0,balance-$2),reputation=GREATEST(-100,reputation-5) WHERE telegram_id=$1 RETURNING display_name,balance",[id,amount]);if(q.rowCount)await pool.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'admin_fine',$2,$3)",[id,-amount,"جریمه مدیر: "+(reason.join(" ")||"بدون توضیح")]);await ctx.reply(q.rowCount?"جریمه اعمال شد: "+money(amount)+" | "+q.rows[0].display_name+" | موجودی "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("seize",async ctx=>{if(!await adminOnly(ctx))return;const [id,companyId,...reason]=(ctx.match||"").trim().split(/\s+/);if(!/^\d+$/.test(id||"")||!/^\d+$/.test(companyId||""))return ctx.reply("استفاده: /seize PLAYER_ID COMPANY_ID دلیل");const q=await pool.query("DELETE FROM player_companies WHERE id=$1 AND telegram_id=$2 RETURNING company_name,company_type",[companyId,id]);await ctx.reply(q.rowCount?"🏛 سلب مالکیت انجام شد: "+(q.rows[0].company_name||q.rows[0].company_type)+"\nدلیل: "+(reason.join(" ")||"ثبت نشده"):"شرکت پیدا نشد یا متعلق به بازیکن نیست.");});
bot.command("grantcompany",async ctx=>{if(!await adminOnly(ctx))return;const [id,typeId,...name]=(ctx.match||"").trim().split(/\s+/),type=COMPANY_TYPES.find(x=>x.id===typeId);if(!/^\d+$/.test(id||"")||!type)return ctx.reply("استفاده: /grantcompany PLAYER_ID TYPE_ID نام شرکت\nانواع: "+COMPANY_TYPES.map(x=>x.id).join(", "));const companyName=name.join(" ")||type.name;await pool.query("INSERT INTO player_companies(telegram_id,company_type,company_name,brand_name,employee_count,approved_by,approval_status) VALUES($1,$2,$3,$3,$4,$5,'approved')",[id,typeId,companyName,type.employees,ownerTelegramId]);await ctx.reply("شرکت "+companyName+" به بازیکن "+id+" اضافه شد.");});
bot.command("seasonrank",async ctx=>{if(!await adminOnly(ctx))return;const [id,rank,points]=(ctx.match||"").trim().split(/\s+/).map(Number);if(!Number.isSafeInteger(id)||!Number.isSafeInteger(rank)||rank<1||!Number.isSafeInteger(points)||points<0)return ctx.reply("استفاده: /seasonrank PLAYER_ID RANK POINTS");const level=Math.max(1,Math.floor(points/100)+1);const q=await pool.query("UPDATE players SET last_season_rank=$2,season_points=$3,player_level=$4,reputation=LEAST(100,GREATEST(-100,reputation+CASE WHEN $2<=3 THEN 10 WHEN $2<=10 THEN 5 ELSE 0 END)) WHERE telegram_id=$1 RETURNING display_name",[id,rank,points,level]);await ctx.reply(q.rowCount?"رتبه فصل قبلی ثبت شد. Level "+level:"بازیکن پیدا نشد.");});
bot.command("startup",async ctx=>{await ensurePlayer(ctx);const raw=(ctx.match||"").trim();if(!raw)return ctx.reply("مشخصات استارتاپ را این‌طور بفرست:\n/startup نام شرکت | شعار | شهر\nمثال: /startup آفتاب تک | فناوری برای زندگی | تهران");const [name,tagline,city]=raw.split("|").map(x=>x.trim());if(!name||name.length>40||!tagline||tagline.length>100||!city||city.length>40)return ctx.reply("هر سه مورد نام، شعار و شهر لازم است؛ نام و شهر حداکثر ۴۰ و شعار ۱۰۰ حرف.");await pool.query("UPDATE players SET startup_name=$2,startup_tagline=$3,startup_city=$4 WHERE telegram_id=$1",[String(ctx.from.id),name,tagline,city]);await ctx.reply("🚀 هویت استارتاپ ثبت شد\n\n🏢 "+name+"\n💬 "+tagline+"\n📍 "+city);});
bot.command("companies",async ctx=>{
  await ensurePlayer(ctx);
  const q=await pool.query("SELECT id,company_type,company_name,level,employee_count FROM player_companies WHERE telegram_id=$1 AND approval_status='approved' ORDER BY id",[String(ctx.from.id)]);
  if(!q.rows.length)return ctx.reply("هنوز شرکت فعالی نداری. /buycompany را برای ارسال درخواست بزن.");
  const lines=q.rows.map(x=>{const t=COMPANY_TYPES.find(z=>z.id===x.company_type);return "#"+x.id+" "+(x.company_name||t?.name||x.company_type)+" | Level "+x.level+" | "+x.employee_count+" کارمند";});
  return ctx.reply("🏢 شرکت‌های شما\n\n"+lines.join("\n"));
});
bot.command("buycompany",async ctx=>{
  await ensurePlayer(ctx);
  const kb=new InlineKeyboard();
  const p=await pool.query("SELECT player_level,last_season_rank,reputation FROM players WHERE telegram_id=$1",[String(ctx.from.id)]);
  const perf=p.rows[0]||{player_level:1,last_season_rank:null,reputation:0};
  const unlocked=COMPANY_TYPES.filter(t=>!t.special||(Number(perf.player_level)>=t.minLevel&&Number(perf.reputation)>=20&&Number(perf.last_season_rank)>0&&Number(perf.last_season_rank)<=t.maxRank));
  for(const t of unlocked)kb.text(t.name+" | "+money(t.price),"buy:"+t.id).row();
  kb.text("🔙 بازگشت","home");
  return ctx.reply("🏗️ فرصت‌های تأسیس\n\nنوع کسب‌وکار را انتخاب کن؛ درخواست برای بررسی مدیر ارسال می‌شود.",{reply_markup:kb});
});
bot.command("economy",ctx=>ctx.reply("🌐 گزارش اقتصاد و سود و زیان را از بخش «بازار و اقتصاد» در منوی پایین باز کن.",{reply_markup:new Keyboard().text("🌐 بازار و اقتصاد").resized().persistent(false)}));
bot.command("bank",ctx=>ctx.reply("🏦 بانک، اعتبار و تسویه از بخش «امور مالی» در منوی پایین در دسترس است.",{reply_markup:new Keyboard().text("💰 امور مالی").resized().persistent(false)}));
bot.command("progress",ctx=>ctx.reply("🏆 مأموریت‌ها، دستاوردها و رتبه‌بندی از بخش «رقابت و پیشرفت» در منوی پایین در دسترس است.",{reply_markup:new Keyboard().text("🏆 رقابت و پیشرفت").resized().persistent(false)}));

function isOwner(ctx){return !!ownerTelegramId&&String(ctx.from?.id)===ownerTelegramId;}
async function adminOnly(ctx){if(isOwner(ctx))return true;if(ctx.callbackQuery)await ctx.answerCallbackQuery({text:"فقط مدیر کل دسترسی دارد.",show_alert:true}).catch(()=>{});else await ctx.reply("⛔ فقط مدیر کل دسترسی دارد.");return false;}
function adminKeyboard(){return new InlineKeyboard()
  .text("🕓 درخواست‌ها","adminpanel:requests").row()
  .text("👥 بازیکنان","adminpanel:players").row()
  .text("📊 آمار بازی","adminpanel:stats").row()
  .text("💸 عملیات مالی","adminpanel:finance").row()
  .text("📣 پیام همگانی","adminpanel:broadcast").row()
  .text("📖 راهنمای مدیر","adminpanel:guide");}
bot.command("admin",async ctx=>{if(!await adminOnly(ctx))return;const q=await pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE approval_status='pending')::int pending FROM players");await ctx.reply("🛡️ *پنل مدیریت Open Many*\n\nمرحله ۱: بخش موردنظر را انتخاب کن.\n👥 بازیکنان: "+q.rows[0].total+"\n🕓 در انتظار تأیید: "+q.rows[0].pending+"\n\nبرای عملیات حساس، راهنمای مرحله‌ای را دنبال کن.",{parse_mode:"Markdown",reply_markup:adminKeyboard()});});
bot.command("panel",async ctx=>{if(!await adminOnly(ctx))return;return ctx.reply("🛡️ پنل مدیر کل — یک بخش انتخاب کن:",{reply_markup:adminKeyboard()});});
bot.callbackQuery(/^adminpanel:(requests|players|stats|finance|broadcast|guide)$/,async ctx=>{
  if(!await adminOnly(ctx))return;const section=ctx.match[1];await ctx.answerCallbackQuery();
  if(section==="requests"){const q=await pool.query("SELECT telegram_id,display_name FROM players WHERE approval_status='pending' ORDER BY created_at LIMIT 8");if(!q.rows.length)return ctx.editMessageText("✅ درخواست در انتظار وجود ندارد.",{reply_markup:adminKeyboard()});const kb=new InlineKeyboard();for(const p of q.rows)kb.text("✅ "+p.display_name.slice(0,18),"admin:approve:"+p.telegram_id).text("❌ رد","admin:reject:"+p.telegram_id).row();kb.text("🔄 تازه‌سازی","adminpanel:requests").row().text("⬅️ پنل","adminpanel:back");return ctx.editMessageText("🕓 درخواست‌های عضویت\nبرای هر نفر تأیید یا رد را بزن:",{reply_markup:kb});}
  if(section==="players"){
    const q=await pool.query("SELECT telegram_id,display_name,balance,approval_status FROM players ORDER BY created_at DESC LIMIT 10");
    const kb=new InlineKeyboard();const txt=q.rows.map((p,i)=>{
      kb.text((p.approval_status==="banned"?"♻️ رفع مسدودی ":"🔒 مسدودسازی ")+p.display_name.slice(0,16),"adminplayer:"+(p.approval_status==="banned"?"unban":"ban")+":"+p.telegram_id).row();
      return (i+1)+") "+p.display_name+"\n🆔 "+p.telegram_id+"\n💰 "+money(p.balance)+" | "+p.approval_status;
    }).join("\n\n")||"بازیکنی ثبت نشده.";
    kb.text("🔄 تازه‌سازی","adminpanel:players").row().text("⬅️ پنل","adminpanel:back");
    return ctx.editMessageText("👥 بازیکنان اخیر\n\n"+txt+"\n\nبرای هدیه یا کسر سرمایه، از بخش «عملیات مالی» استفاده کن. برای مسدودسازی و رفع مسدودی، دکمه کنار هر بازیکن را بزن.",{reply_markup:kb});
  }
  if(section==="stats"){const q=await pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE approval_status='approved')::int approved,COUNT(*) FILTER(WHERE approval_status='pending')::int pending,COUNT(*) FILTER(WHERE approval_status='banned')::int banned,COALESCE(SUM(balance),0)::bigint cash FROM players");const x=q.rows[0];return ctx.editMessageText("📊 آمار بازی\nکل: "+x.total+"\nتأیید: "+x.approved+"\nدر انتظار: "+x.pending+"\nمسدود: "+x.banned+"\nسرمایه کل: "+money(x.cash),{reply_markup:new InlineKeyboard().text("🔄 تازه‌سازی","adminpanel:stats").row().text("⬅️ پنل","adminpanel:back")});}
  if(section==="finance"){const q=await pool.query("SELECT telegram_id,display_name,balance FROM players WHERE approval_status='approved' ORDER BY created_at DESC LIMIT 10");const kb=new InlineKeyboard();for(const p of q.rows)kb.text(p.display_name.slice(0,18)+" | "+money(p.balance),"adminfin:player:"+p.telegram_id).row();kb.text("⬅️ پنل","adminpanel:back");return ctx.editMessageText("💸 عملیات مالی\n\nمرحله ۱: بازیکن را انتخاب کن.\nمرحله ۲: مبلغ و افزایش یا کاهش را با دکمه مشخص کن.",{reply_markup:kb});}
  if(section==="broadcast")return ctx.editMessageText("📣 پیام همگانی\n\nیکی از پیام‌های آماده را انتخاب کن؛ نیازی به تایپ نیست.",{reply_markup:new InlineKeyboard().text("🎮 شروع فصل و خوشامد","adminbroadcast:1").row().text("🏗️ رویداد توسعه کسب‌وکار","adminbroadcast:2").row().text("🎁 یادآوری پاداش روزانه","adminbroadcast:3").row().text("⬅️ پنل","adminpanel:back")});
  return ctx.editMessageText("📖 راهنمای مدیر — همه عملیات از همین پنل و با دکمه انجام می‌شود.\n\n۱. درخواست‌ها: تأیید یا رد عضویت\n۲. بازیکنان: مسدودسازی یا رفع مسدودی با تأیید دومرحله‌ای\n۳. آمار: مشاهده وضعیت بازی\n۴. عملیات مالی: انتخاب بازیکن، سپس مبلغ و افزایش یا کاهش\n۵. پیام همگانی: انتخاب یکی از پیام‌های آماده\n\nنیازی به تایپ شناسه یا دستور نیست.",{reply_markup:new InlineKeyboard().text("⬅️ پنل","adminpanel:back")});
});
bot.callbackQuery(/^adminplayer:(ban|unban):(\d+)$/,async ctx=>{
  if(!await adminOnly(ctx))return;const action=ctx.match[1],id=ctx.match[2];
  if(id===ownerTelegramId)return ctx.answerCallbackQuery({text:"مدیر کل قابل مسدودسازی نیست.",show_alert:true});
  await ctx.answerCallbackQuery();
  const verb=action==="ban"?"مسدودسازی":"رفع مسدودی";
  return ctx.editMessageText("⚠️ تأیید "+verb+"\n\nشناسه بازیکن: "+id+"\nآیا ادامه می‌دهی؟",{reply_markup:new InlineKeyboard().text("✅ تأیید","adminplayer:confirm:"+action+":"+id).text("❌ انصراف","adminpanel:players").row().text("⬅️ پنل","adminpanel:back")});
});
bot.callbackQuery(/^adminplayer:confirm:(ban|unban):(\d+)$/,async ctx=>{
  if(!await adminOnly(ctx))return;const action=ctx.match[1],id=ctx.match[2];
  if(id===ownerTelegramId)return ctx.answerCallbackQuery({text:"مدیر کل قابل مسدودسازی نیست.",show_alert:true});
  const status=action==="ban"?"banned":"approved";
  const q=await pool.query("UPDATE players SET approval_status=$2 WHERE telegram_id=$1 AND approval_status<>$2 RETURNING display_name",[id,status]);
  await ctx.answerCallbackQuery({text:q.rowCount?"عملیات انجام شد":"وضعیت تغییری نکرد"});
  return ctx.editMessageText(q.rowCount?"✅ "+q.rows[0].display_name+" — "+(action==="ban"?"مسدود شد":"رفع مسدودی شد"):"بازیکن پیدا نشد یا وضعیت از قبل همین بود.",{reply_markup:new InlineKeyboard().text("👥 بازیکنان","adminpanel:players").row().text("⬅️ پنل","adminpanel:back")});
});
bot.callbackQuery(/^adminfin:player:(\d+)$/,async ctx=>{if(!await adminOnly(ctx))return;const id=ctx.match[1];await ctx.answerCallbackQuery();const kb=new InlineKeyboard();for(const amount of [5000,10000,25000,50000])kb.text(money(amount),"adminfin:give:"+id+":"+amount).text("−"+money(amount),"adminfin:take:"+id+":"+amount).row();kb.text("✍️ مبلغ دلخواه","adminfin:custom:"+id).row().text("⬅️ انتخاب بازیکن","adminpanel:finance").row().text("⬅️ پنل","adminpanel:back");return ctx.editMessageText("👤 بازیکن: "+id+"\n\nمبلغ را انتخاب کن؛ یا مبلغ دلخواه را وارد کن.",{reply_markup:kb});});
const adminCustomAmount = new Map();
bot.callbackQuery(/^adminfin:custom:(\d+)$/,async ctx=>{
  if(!await adminOnly(ctx))return;
  adminCustomAmount.set(String(ctx.from.id),{playerId:ctx.match[1],expires:Date.now()+120000});
  await ctx.answerCallbackQuery();
  return ctx.reply("✍️ مبلغ دلخواه را به عدد وارد کن (مثلاً 250000).\nتا ۲ دقیقه فرصت داری.");
});
bot.on("message:text",async (ctx,next)=>{
  const pending=adminCustomAmount.get(String(ctx.from.id));
  if(!pending)return next();
  if(Date.now()>pending.expires){adminCustomAmount.delete(String(ctx.from.id));return ctx.reply("زمان ورود مبلغ تمام شد؛ از پنل دوباره شروع کن.");}
  if(!await adminOnly(ctx))return;
  const raw=ctx.message.text.replace(/[٬,\s]/g,""),amount=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(amount)||amount<=0||amount>9000000000000)return ctx.reply("مبلغ نامعتبر است. یک عدد مثبت وارد کن.");
  adminCustomAmount.delete(String(ctx.from.id));
  const q=await pool.query("UPDATE players SET balance=balance+$2 WHERE telegram_id=$1 RETURNING display_name,balance",[pending.playerId,amount]);
  if(!q.rowCount)return ctx.reply("بازیکن پیدا نشد.");
  await pool.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'admin_gift',$2,'هدیه با مبلغ دلخواه مدیر')",[pending.playerId,amount]);
  return ctx.reply("✅ واریز انجام شد\nبازیکن: "+q.rows[0].display_name+"\nمبلغ: "+money(amount)+"\nموجودی جدید: "+money(q.rows[0].balance));
});
bot.callbackQuery(/^adminfin:(give|take):(\d+):(\d+)$/,async ctx=>{if(!await adminOnly(ctx))return;const action=ctx.match[1],id=ctx.match[2],amount=Number(ctx.match[3]);if(!Number.isSafeInteger(amount)||amount<=0)return ctx.answerCallbackQuery({text:"مبلغ نامعتبر است.",show_alert:true});const sql=action==="give"?"UPDATE players SET balance=balance+$2 WHERE telegram_id=$1 RETURNING display_name,balance":"UPDATE players SET balance=balance-$2 WHERE telegram_id=$1 AND balance>=$2 RETURNING display_name,balance";const q=await pool.query(sql,[id,amount]);if(!q.rowCount)return ctx.answerCallbackQuery({text:action==="take"?"موجودی کافی نیست یا بازیکن پیدا نشد.":"بازیکن پیدا نشد.",show_alert:true});await pool.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,$2,$3,$4)",[id,action==="give"?"admin_gift":"admin_deduction",action==="give"?amount:-amount,action==="give"?"هدیه مدیر کل":"کسر توسط مدیر کل"]);await ctx.answerCallbackQuery({text:"انجام شد: "+q.rows[0].display_name});return ctx.editMessageText("✅ عملیات مالی انجام شد\n\nبازیکن: "+q.rows[0].display_name+"\nمبلغ: "+money(amount)+"\nموجودی جدید: "+money(q.rows[0].balance),{reply_markup:new InlineKeyboard().text("💸 عملیات دیگر","adminpanel:finance").row().text("⬅️ پنل","adminpanel:back")});});
bot.callbackQuery(/^adminbroadcast:(1|2|3)$/,async ctx=>{if(!await adminOnly(ctx))return;const messages={"1":"🎮 به Open Many خوش آمدید! شرکت بسازید، درآمد کسب کنید و در رقابت اقتصادی پیشرفت کنید. از منوی دکمه‌ای بازی استفاده کنید.","2":"🏗️ رویداد توسعه کسب‌وکار فعال است! برای رشد درآمد، شرکت جدید تأسیس کنید و کسب‌وکارهای خود را ارتقا دهید.","3":"🎁 پاداش روزانه‌تان را از بخش امور مالی دریافت کنید و مأموریت روزانه را تکمیل کنید."};const msg=messages[ctx.match[1]];await ctx.answerCallbackQuery({text:"ارسال پیام آغاز شد."});const q=await pool.query("SELECT telegram_id FROM players WHERE approval_status='approved'");let ok=0,fail=0;for(const p of q.rows){try{await bot.api.sendMessage(String(p.telegram_id),msg,{reply_markup:quickKeyboard(p.telegram_id)});ok++;}catch{fail++;}}return ctx.editMessageText("📣 ارسال تمام شد\nموفق: "+ok+" | ناموفق: "+fail,{reply_markup:new InlineKeyboard().text("📣 پیام دیگر","adminpanel:broadcast").row().text("⬅️ پنل","adminpanel:back")});});
bot.callbackQuery("adminpanel:back",async ctx=>{if(!await adminOnly(ctx))return;await ctx.answerCallbackQuery();return ctx.editMessageText("🛡️ پنل مدیر کل — یک بخش انتخاب کن:",{reply_markup:adminKeyboard()});});
bot.command("pending",async ctx=>{if(!await adminOnly(ctx))return;const q=await pool.query("SELECT telegram_id,display_name,username FROM players WHERE approval_status='pending' ORDER BY created_at LIMIT 30");if(!q.rows.length)return ctx.reply("درخواست تأیید جدیدی وجود ندارد.");for(const p of q.rows)await ctx.reply(p.display_name+(p.username?" (@"+p.username+")":"")+"\nID: "+p.telegram_id,{reply_markup:new InlineKeyboard().text("✅ تأیید","admin:approve:"+p.telegram_id).text("❌ رد","admin:reject:"+p.telegram_id)});});
bot.command("approve",async ctx=>{if(!await adminOnly(ctx))return;const id=(ctx.match||"").trim().split(/\s+/)[0];if(!/^\d+$/.test(id))return ctx.reply("استفاده: /approve TELEGRAM_ID");const q=await pool.query("UPDATE players SET approval_status='approved',approved_at=NOW(),approved_by=$2 WHERE telegram_id=$1 AND approval_status IN ('pending','rejected') RETURNING display_name",[id,ownerTelegramId]);if(q.rowCount)await bot.api.sendMessage(id,"✅ عضویت شما تأیید شد. برای ورود /start را بزن.").catch(()=>{});await ctx.reply(q.rowCount?"تأیید شد: "+q.rows[0].display_name:"بازیکن پیدا نشد یا قبلاً تأیید شده است.");});
bot.command("reject",async ctx=>{if(!await adminOnly(ctx))return;const id=(ctx.match||"").trim().split(/\s+/)[0];if(!/^\d+$/.test(id))return ctx.reply("استفاده: /reject TELEGRAM_ID");const q=await pool.query("UPDATE players SET approval_status='rejected',admin_note='Rejected by owner' WHERE telegram_id=$1 AND approval_status='pending' RETURNING display_name",[id]);await ctx.reply(q.rowCount?"رد شد: "+q.rows[0].display_name:"درخواست pending پیدا نشد.");});
bot.command("ban",async ctx=>{if(!await adminOnly(ctx))return;const id=(ctx.match||"").trim().split(/\s+/)[0];if(!/^\d+$/.test(id)||id===ownerTelegramId)return ctx.reply("استفاده: /ban TELEGRAM_ID (مدیر کل قابل مسدودسازی نیست)");const q=await pool.query("UPDATE players SET approval_status='banned' WHERE telegram_id=$1 RETURNING display_name",[id]);await ctx.reply(q.rowCount?"مسدود شد: "+q.rows[0].display_name:"بازیکن پیدا نشد.");});
bot.command("unban",async ctx=>{if(!await adminOnly(ctx))return;const id=(ctx.match||"").trim().split(/\s+/)[0];if(!/^\d+$/.test(id))return ctx.reply("استفاده: /unban TELEGRAM_ID");const q=await pool.query("UPDATE players SET approval_status='approved',approved_at=COALESCE(approved_at,NOW()) WHERE telegram_id=$1 AND approval_status='banned' RETURNING display_name",[id]);await ctx.reply(q.rowCount?"رفع مسدودی شد: "+q.rows[0].display_name:"بازیکن مسدودشده پیدا نشد.");});
bot.command("players",async ctx=>{if(!await adminOnly(ctx))return;const q=await pool.query("SELECT telegram_id,display_name,balance,approval_status FROM players ORDER BY created_at DESC LIMIT 30");await ctx.reply("👥 بازیکنان اخیر\n\n"+q.rows.map(p=>p.display_name+" | "+p.telegram_id+" | "+money(p.balance)+" | "+p.approval_status).join("\n"));});
bot.command("balance",async ctx=>{if(!await adminOnly(ctx))return;const id=(ctx.match||"").trim().split(/\s+/)[0];if(!/^\d+$/.test(id))return ctx.reply("استفاده: /balance TELEGRAM_ID");const q=await pool.query("SELECT display_name,balance FROM players WHERE telegram_id=$1",[id]);await ctx.reply(q.rowCount?q.rows[0].display_name+"\nID: "+id+"\nسرمایه: "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("setbalance",async ctx=>{if(!await adminOnly(ctx))return;const [id,n]=(ctx.match||"").trim().split(/\s+/),amount=Number(n);if(!/^\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<0)return ctx.reply("استفاده: /setbalance ID AMOUNT");const q=await pool.query("UPDATE players SET balance=$2 WHERE telegram_id=$1 RETURNING display_name",[id,amount]);await ctx.reply(q.rowCount?"سرمایه "+q.rows[0].display_name+" تنظیم شد: "+money(amount):"بازیکن پیدا نشد.");});
bot.command("give",async ctx=>{if(!await adminOnly(ctx))return;const [id,n]=(ctx.match||"").trim().split(/\s+/),amount=Number(n);if(!/^\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<=0)return ctx.reply("استفاده: /give ID AMOUNT");const q=await pool.query("UPDATE players SET balance=balance+$2 WHERE telegram_id=$1 RETURNING display_name,balance",[id,amount]);await ctx.reply(q.rowCount?"به "+q.rows[0].display_name+" "+money(amount)+" داده شد. موجودی: "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("broadcast",async ctx=>{if(!await adminOnly(ctx))return;const msg=(ctx.match||"").trim();if(!msg)return ctx.reply("استفاده: /broadcast متن");const q=await pool.query("SELECT telegram_id FROM players WHERE approval_status='approved'");let ok=0,fail=0;for(const p of q.rows){try{await bot.api.sendMessage(String(p.telegram_id),"📣 پیام مدیر کل\n\n"+msg);ok++;}catch{fail++;}}await ctx.reply("ارسال پایان یافت. موفق: "+ok+" | ناموفق: "+fail);});
bot.callbackQuery(/^admin:(pending|players|stats)$/,async ctx=>{if(!await adminOnly(ctx))return;const a=ctx.match[1];await ctx.answerCallbackQuery();if(a==="pending")return ctx.reply("برای درخواست‌ها /pending را بزن.");if(a==="players")return ctx.reply("برای فهرست بازیکنان /players را بزن.");const q=await pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE approval_status='approved')::int approved,COUNT(*) FILTER(WHERE approval_status='pending')::int pending,COUNT(*) FILTER(WHERE approval_status='banned')::int banned,COALESCE(SUM(balance),0)::bigint cash FROM players");const x=q.rows[0];return ctx.reply("📊 آمار بازی\nکل: "+x.total+"\nتأییدشده: "+x.approved+"\nدر انتظار: "+x.pending+"\nمسدود: "+x.banned+"\nسرمایه کل: "+money(x.cash),{reply_markup:adminKeyboard()});});
bot.callbackQuery(/^admin:(approve|reject):(\d+)$/,async ctx=>{if(!await adminOnly(ctx))return;const a=ctx.match[1],id=ctx.match[2],status=a==="approve"?"approved":"rejected";const q=await pool.query("UPDATE players SET approval_status=$2,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE approved_at END,approved_by=$3 WHERE telegram_id=$1 AND approval_status='pending' RETURNING display_name",[id,status,ownerTelegramId]);await ctx.answerCallbackQuery({text:q.rowCount?"انجام شد":"قبلاً بررسی شده یا یافت نشد"});if(q.rowCount&&a==="approve")await bot.api.sendMessage(id,"عضویت شما تأیید شد! /start را بزن.").catch(()=>{});await ctx.reply(q.rowCount?q.rows[0].display_name+" — "+status:"درخواست پیدا نشد.");});

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
await initRealism(pool);
await registerRealism(bot,pool);
// Telegram's command menu (the slash button beside the message field).
const publicCommands = [
  { command: "start", description: "شروع بازی و داشبورد" },
  { command: "guide", description: "راهنمای مرحله‌ای بازی" },
  { command: "menu", description: "نمایش منوی بازی" },
  { command: "startup", description: "ثبت نام و مشخصات استارتاپ" },
  { command: "buycompany", description: "درخواست تأسیس کسب‌وکار" },
  { command: "companies", description: "شرکت‌ها و کارکنان من" },
  { command: "economy", description: "گزارش بازار و اقتصاد" },
  { command: "bank", description: "بانک و امور مالی" },
  { command: "progress", description: "رتبه، مأموریت و دستاوردها" },
  { command: "myid", description: "نمایش شناسه تلگرام" }
];
await bot.api.setMyCommands(publicCommands, { scope: { type: "default" }, language_code: "fa" }).catch(err => console.error("Set public commands failed:", err));
if (ownerTelegramId && /^\d+$/.test(ownerTelegramId)) {
  await bot.api.setMyCommands([
    ...publicCommands,
    { command: "admin", description: "پنل مدیر کل" },
    { command: "pending", description: "درخواست‌های عضویت" },
    { command: "approve", description: "تأیید بازیکن: /approve ID" },
    { command: "reject", description: "رد درخواست: /reject ID" },
    { command: "ban", description: "مسدود کردن: /ban ID" },
    { command: "unban", description: "رفع مسدودی: /unban ID" },
    { command: "players", description: "فهرست بازیکنان" },
    { command: "balance", description: "مشاهده موجودی: /balance ID" },
    { command: "setbalance", description: "تنظیم موجودی: /setbalance ID AMOUNT" },
    { command: "give", description: "هدیه پول: /give ID AMOUNT" },
    { command: "broadcast", description: "پیام همگانی: /broadcast TEXT" },
    { command: "take", description: "کسر پول: /take ID AMOUNT" },
    { command: "fine", description: "جریمه: /fine ID AMOUNT دلیل" },
    { command: "seize", description: "سلب مالکیت: /seize PLAYER_ID COMPANY_ID" },
    { command: "grantcompany", description: "اعطای شرکت: /grantcompany ID TYPE نام" },
    { command: "seasonrank", description: "ثبت رتبه فصل: /seasonrank ID RANK POINTS" }
  ], { scope: { type: "chat", chat_id: Number(ownerTelegramId) }, language_code: "fa" }).catch(err => console.error("Set owner commands failed:", err));
}
await bot.api.setChatMenuButton({ menu_button: { type: "commands" } }).catch(err => console.error("Set command menu button failed:", err));
await bot.start();
console.log("Open Many bot is running.");
