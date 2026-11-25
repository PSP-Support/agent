import { Bot, InlineKeyboard, Keyboard } from "grammy";
import pg from "pg";
import http from "node:http";
import { initRealism, registerRealism, netHourlyForPlayer } from "./realism.js";

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

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id=String(ctx.from.id), text=ctx.message?.text || "";
  if (id===ownerTelegramId || /^\/(start|status|myid)(\s|$)/.test(text)) return next();
  const q=await pool.query("SELECT approval_status FROM players WHERE telegram_id=$1",[id]);
  const status=q.rows[0]?.approval_status;
  if (!status) { if(ctx.message) await ctx.reply("برای ثبت درخواست عضویت /start را بزن."); return; }
  if(status==="banned") { if(ctx.message) await ctx.reply("⛔ دسترسی شما مسدود شده است."); else await ctx.answerCallbackQuery({text:"حساب مسدود است.",show_alert:true}).catch(()=>{}); return; }
  if(status!=="approved") { if(ctx.message) await ctx.reply("🕓 حساب شما هنوز تأیید نشده است."); else await ctx.answerCallbackQuery({text:"حساب در انتظار تأیید مدیر است.",show_alert:true}).catch(()=>{}); return; }
  return next();
});
bot.command("myid", ctx => ctx.reply("Telegram ID شما: "+ctx.from.id+"\nاین عدد را در Railway در متغیر OWNER_TELEGRAM_ID قرار بده."));
bot.hears("🔄 بررسی وضعیت", async ctx => {
  const status=await ensurePlayer(ctx);
  await ctx.reply(status==="approved"?"✅ حساب تأیید شده؛ /start را بزن.":status==="banned"?"⛔ حساب مسدود است.":status==="rejected"?"❌ درخواست رد شده است.":"🕓 هنوز منتظر تأیید مدیر کل هستی.");
});

const COMPANY_TYPES = [
  { id: "cafe", name: "کافه مستقل ☕", price: 25000, income: 900, employees: 2, sector: "خدمات غذایی", description: "راه‌اندازی کافه کوچک" },
  { id: "shop", name: "فروشگاه محلی 🛍️", price: 40000, income: 1400, employees: 3, sector: "خرده‌فروشی", description: "فروش محصولات روزمره" },
  { id: "bakery", name: "نانوایی 🥖", price: 55000, income: 2100, employees: 4, sector: "غذایی", description: "تولید و فروش نان" },
  { id: "restaurant", name: "رستوران 🍽️", price: 90000, income: 3500, employees: 7, sector: "غذایی", description: "رستوران شهری" },
  { id: "salon", name: "سالن زیبایی 💇", price: 35000, income: 1250, employees: 3, sector: "خدمات", description: "خدمات زیبایی" },
  { id: "gym", name: "باشگاه ورزشی 🏋️", price: 85000, income: 3000, employees: 5, sector: "سلامت و ورزش", description: "باشگاه محلی" },
  { id: "farm", name: "مزرعه 🌾", price: 70000, income: 2400, employees: 6, sector: "کشاورزی", description: "تولید محصولات کشاورزی" },
  { id: "logistics", name: "شرکت حمل‌ونقل 🚚", price: 140000, income: 5200, employees: 10, sector: "لجستیک", description: "حمل‌ونقل و توزیع" },
  { id: "construction", name: "پیمانکاری ساختمان 🏗️", price: 180000, income: 6500, employees: 12, sector: "ساخت‌وساز", description: "پروژه‌های ساختمانی" },
  { id: "textile", name: "کارگاه پوشاک 🧵", price: 120000, income: 4300, employees: 9, sector: "تولید", description: "تولید پوشاک" },
  { id: "autoservice", name: "تعمیرگاه خودرو 🔧", price: 65000, income: 2300, employees: 5, sector: "خدمات خودرو", description: "تعمیر و سرویس خودرو" },
  { id: "clinic", name: "کلینیک خصوصی 🩺", price: 220000, income: 7800, employees: 14, sector: "سلامت", description: "خدمات درمانی" },
  { id: "education", name: "آموزشگاه 📚", price: 95000, income: 3300, employees: 6, sector: "آموزش", description: "آموزش مهارت" },
  { id: "software", name: "استودیو نرم‌افزار 💻", price: 160000, income: 6800, employees: 8, sector: "فناوری", description: "توسعه نرم‌افزار" },
  { id: "marketing", name: "آژانس تبلیغات 📣", price: 110000, income: 4200, employees: 7, sector: "خدمات حرفه‌ای", description: "بازاریابی و تبلیغات" },
  { id: "ecommerce", name: "فروشگاه اینترنتی 🛒", price: 130000, income: 5600, employees: 6, sector: "تجارت الکترونیک", description: "فروش آنلاین" },
  { id: "hotel", name: "هتل بوتیک 🏨", price: 350000, income: 11500, employees: 22, sector: "گردشگری", description: "اقامت و میزبانی" },
  { id: "manufacturing", name: "کارخانه تولیدی 🏭", price: 500000, income: 17000, employees: 35, sector: "صنعت", description: "تولید صنعتی" },
  { id: "fintech", name: "فین‌تک 💳", price: 650000, income: 23000, employees: 18, sector: "فناوری مالی", description: "خدمات فناوری مالی" },
  { id: "telecom", name: "شرکت مخابراتی 📡", price: 900000, income: 32000, employees: 30, sector: "ارتباطات", description: "خدمات ارتباطی" }
];

const money = (n) => "$" + Math.floor(Number(n)).toLocaleString("en-US");
// Compact main menu with expandable Telegram reply-keyboard sections.
const menuSection = new Map();
const mainKeyboard = () => new Keyboard()
  .text("📊 مرکز بازی").text("🏢 کسب‌وکارها").row()
  .text("💰 امور مالی").text("🌐 بازار و اقتصاد").row()
  .text("🏆 رقابت و پیشرفت").text("⚙️ بیشتر").resized().persistent(false);
const sectionKeyboard = (section) => {
  const k = new Keyboard();
  if (section === "business") k.text("🏢 شرکت‌های من").text("🛒 خرید شرکت").row().text("👨‍💼 مدیریت شرکت‌ها").row();
  else if (section === "finance") k.text("💵 دریافت درآمد").text("🏦 بانک و وام").row().text("📒 دفتر مالی").row();
  else if (section === "market") k.text("🌐 اقتصاد واقعی").row();
  else if (section === "progress") k.text("🧭 مأموریت روزانه").text("🏅 دستاوردها").row().text("🏆 رتبه‌بندی").text("🎁 پاداش روزانه").row();
  else if (section === "more") k.text("👤 پروفایل").text("ℹ️ راهنما").row().text("🧰 دسترسی آسان").row();
  return k.text("🔙 منوی اصلی").resized().persistent(false);
};
const bottomKeyboard = (userId) => {
  const section = menuSection.get(String(userId));
  return section ? sectionKeyboard(section) : mainKeyboard();
};

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT
    );
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
  const status = await ensurePlayer(ctx);
  if (status !== "approved" && String(ctx.from.id) !== ownerTelegramId) {
    const msg = status === "banned" ? "⛔ دسترسی حساب شما مسدود شده است." : status === "rejected" ? "❌ درخواست عضویت شما رد شده است." : "🕓 درخواست عضویت شما ثبت شد و منتظر تأیید مدیر کل است.";
    return ctx.reply(msg, { reply_markup: new Keyboard().text("🔄 بررسی وضعیت").resized().persistent() });
  }
  await ctx.reply(await dashboardText(ctx.from.id), { parse_mode: "Markdown", reply_markup: bottomKeyboard(ctx.from.id) });
});

bot.hears("🧰 دسترسی آسان", async ctx => {
  const userCommands = "/start — ورود و داشبورد\n/menu — نمایش منوی بازی\n/myid — نمایش شناسه تلگرام\n\n🌐 اقتصاد واقعی — بازار و سود و زیان\n🏦 بانک و وام — اعتبار و تسویه\n👨‍💼 مدیریت شرکت‌ها — استخدام و تعمیر\n📒 دفتر مالی — تاریخچه تراکنش‌هان\nدکمه‌های بازی از کیبورد پایین در دسترس هستند.";
  const adminCommands = "\n\n🛡️ دستورات مدیر کل:\n/admin — پنل مدیریت\n/pending — درخواست‌های عضویت\n/approve ID — تأیید بازیکن\n/reject ID — رد درخواست\n/ban ID — مسدود کردن\n/unban ID — رفع مسدودی\n/players — فهرست بازیکنان\n/balance ID — مشاهده موجودی\n/setbalance ID AMOUNT — تنظیم موجودی\n/give ID AMOUNT — هدیه پول\n/broadcast متن — پیام همگانی";
  await ctx.reply("🧰 دسترسی آسان\n\n"+userCommands+(String(ctx.from.id)===ownerTelegramId?adminCommands:""), {reply_markup:bottomKeyboard(ctx.from.id)});
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

bot.callbackQuery("buy_menu", async ctx => {
  const kb=new InlineKeyboard();
  for(const t of COMPANY_TYPES) kb.text(t.name+" | "+money(t.price),"buy:"+t.id).row();
  kb.text("🔙 بازگشت","home");
  await ctx.editMessageText("🏗️ *فرصت‌های تأسیس شرکت*\n\n۲۰ نوع کسب‌وکار با هزینه، نیروی انسانی و درآمد متفاوت. هر تأسیس جدید برای بررسی مدیر ارسال می‌شود.",{parse_mode:"Markdown",reply_markup:kb});
  await ctx.answerCallbackQuery();
});
const companyNameDraft=new Map();
bot.callbackQuery(/^buy:([a-z]+)$/,async ctx=>{
  const type=COMPANY_TYPES.find(x=>x.id===ctx.match[1]);
  if(!type)return ctx.answerCallbackQuery({text:"نوع شرکت نامعتبر است.",show_alert:true});
  companyNameDraft.set(String(ctx.from.id),type.id);
  await ctx.answerCallbackQuery();
  await ctx.reply("📝 نام شرکتت را وارد کن (۲ تا ۴۰ حرف).\nمثال: «استارتاپ آفتاب»");
});
bot.on("message:text",async (ctx,next)=>{
  const uid=String(ctx.from.id),typeId=companyNameDraft.get(uid);
  if(!typeId)return;
  const raw=ctx.message.text.trim();
  if(raw.startsWith("/"))return;
  if(raw.length<2||raw.length>40)return ctx.reply("نام شرکت باید بین ۲ تا ۴۰ حرف باشد.");
  const type=COMPANY_TYPES.find(x=>x.id===typeId);
  const p=await pool.query("SELECT balance,player_level,reputation,season_points,last_season_rank FROM players WHERE telegram_id=$1",[uid]);
  if(!p.rows.length)return ctx.reply("پروفایل بازیکن پیدا نشد.");
  if(Number(p.rows[0].balance)<type.price){companyNameDraft.delete(uid);return ctx.reply("سرمایه کافی نیست. هزینه شروع: "+money(type.price));}
  const perf=p.rows[0],rank=perf.last_season_rank;
  const q=await pool.query("INSERT INTO company_requests(telegram_id,company_type,company_name,brand_name,season_rank,player_level,reputation) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[uid,typeId,raw,raw,rank,perf.player_level,perf.reputation]);
  companyNameDraft.delete(uid);
  await ctx.reply("📨 درخواست تأسیس ارسال شد\n\n🏢 "+raw+"\n🏭 "+type.name+"\n💵 هزینه: "+money(type.price)+"\n👷 نیروی پایه: "+type.employees+" نفر\n📈 درآمد ناخالص پایه: "+money(type.income)+"/ساعت\n\nمدیر کل درخواست را بر اساس رتبه فصل گذشته، سطح و عملکرد بررسی می‌کند. تا تأیید نهایی هزینه‌ای کسر نمی‌شود.");
  if(ownerTelegramId)await bot.api.sendMessage(ownerTelegramId,"📝 درخواست شرکت #"+q.rows[0].id+"\nبازیکن: "+uid+"\nشرکت: "+raw+" ("+type.name+")\nرتبه فصل قبل: "+(rank??"ثبت نشده")+" | Level "+perf.player_level+" | Reputation "+perf.reputation+" | امتیاز "+perf.season_points+"\nهزینه: "+money(type.price),{reply_markup:new InlineKeyboard().text("✅ تأیید و تأسیس","corp:approve:"+q.rows[0].id).text("❌ رد","corp:reject:"+q.rows[0].id)});
});
bot.callbackQuery(/^corp:(approve|reject):(\\d+)$/,async ctx=>{
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
      await client.query("UPDATE players SET balance=balance-$2,player_level=GREATEST(player_level,1),reputation=LEAST(100,reputation+2) WHERE telegram_id=$1",[String(req.telegram_id),type.price]);
      await client.query("INSERT INTO player_companies(telegram_id,company_type,company_name,brand_name,employee_count,approved_by,approval_status) VALUES($1,$2,$3,$4,$5,$6,'approved')",[String(req.telegram_id),req.company_type,req.company_name,req.brand_name,type.employees,ownerTelegramId]);
      await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'company_foundation',$2,$3)",[String(req.telegram_id),-type.price,"هزینه تأسیس "+req.company_name]);
      await client.query("UPDATE company_requests SET request_status='approved',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1",[id,ownerTelegramId]);
    }else await client.query("UPDATE company_requests SET request_status='rejected',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1",[id,ownerTelegramId]);
    await client.query("COMMIT");
    await ctx.answerCallbackQuery({text:action==="approve"?"شرکت تأیید و تأسیس شد.":"درخواست رد شد."});
    await bot.api.sendMessage(String(req.telegram_id),action==="approve"?"🎉 درخواست شرکت «"+req.company_name+"» تأیید شد و کسب‌وکار شما فعال شد!":"❌ درخواست شرکت «"+req.company_name+"» رد شد.").catch(()=>{});
    await ctx.editMessageText((action==="approve"?"✅ تأیید شد: ":"❌ رد شد: ")+req.company_name);
  }catch(e){await client.query("ROLLBACK");console.error(e);await ctx.answerCallbackQuery({text:"خطا در بررسی درخواست.",show_alert:true});}
  finally{client.release();}
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
    const netHourly = await netHourlyForPlayer(pool,ctx.from.id);
    const earned = Math.floor(netHourly * elapsed / 3600);
    if (earned <= 0) {
      await client.query("ROLLBACK");
      return ctx.answerCallbackQuery({ text: "هنوز درآمدی برای دریافت نداری. شرکت بخر یا کمی صبر کن!", show_alert: true });
    }
    await client.query("UPDATE players SET balance=balance+$2,last_collect=NOW() WHERE telegram_id=$1", [String(ctx.from.id), earned]);
    await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,$2,$3,$4)",[String(ctx.from.id),"operating_income",earned,"سود عملیاتی خالص پس از هزینه‌ها"]);
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
bot.command("take",async ctx=>{if(!await adminOnly(ctx))return;const [id,n]=(ctx.match||"").trim().split(/\\s+/),amount=Number(n);if(!/^\\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<=0)return ctx.reply("استفاده: /take ID AMOUNT");const q=await pool.query("UPDATE players SET balance=GREATEST(0,balance-$2) WHERE telegram_id=$1 RETURNING display_name,balance",[id,amount]);await ctx.reply(q.rowCount?"از "+q.rows[0].display_name+" مبلغ "+money(amount)+" کسر شد. موجودی: "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("fine",async ctx=>{if(!await adminOnly(ctx))return;const [id,n,...reason]=(ctx.match||"").trim().split(/\\s+/),amount=Number(n);if(!/^\\d+$/.test(id||"")||!Number.isSafeInteger(amount)||amount<=0)return ctx.reply("استفاده: /fine ID AMOUNT دلیل");const q=await pool.query("UPDATE players SET balance=GREATEST(0,balance-$2),reputation=GREATEST(-100,reputation-5) WHERE telegram_id=$1 RETURNING display_name,balance",[id,amount]);if(q.rowCount)await pool.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'admin_fine',$2,$3)",[id,-amount,"جریمه مدیر: "+(reason.join(" ")||"بدون توضیح")]);await ctx.reply(q.rowCount?"جریمه اعمال شد: "+money(amount)+" | "+q.rows[0].display_name+" | موجودی "+money(q.rows[0].balance):"بازیکن پیدا نشد.");});
bot.command("seize",async ctx=>{if(!await adminOnly(ctx))return;const [id,companyId,...reason]=(ctx.match||"").trim().split(/\\s+/);if(!/^\\d+$/.test(id||"")||!/^\\d+$/.test(companyId||""))return ctx.reply("استفاده: /seize PLAYER_ID COMPANY_ID دلیل");const q=await pool.query("DELETE FROM player_companies WHERE id=$1 AND telegram_id=$2 RETURNING company_name,company_type",[companyId,id]);await ctx.reply(q.rowCount?"🏛 سلب مالکیت انجام شد: "+(q.rows[0].company_name||q.rows[0].company_type)+"\nدلیل: "+(reason.join(" ")||"ثبت نشده"):"شرکت پیدا نشد یا متعلق به بازیکن نیست.");});
bot.command("grantcompany",async ctx=>{if(!await adminOnly(ctx))return;const [id,typeId,...name]=(ctx.match||"").trim().split(/\\s+/),type=COMPANY_TYPES.find(x=>x.id===typeId);if(!/^\\d+$/.test(id||"")||!type)return ctx.reply("استفاده: /grantcompany PLAYER_ID TYPE_ID نام شرکت\nانواع: "+COMPANY_TYPES.map(x=>x.id).join(", "));const companyName=name.join(" ")||type.name;await pool.query("INSERT INTO player_companies(telegram_id,company_type,company_name,brand_name,employee_count,approved_by,approval_status) VALUES($1,$2,$3,$3,$4,$5,'approved')",[id,typeId,companyName,type.employees,ownerTelegramId]);await ctx.reply("شرکت "+companyName+" به بازیکن "+id+" اضافه شد.");});
bot.command("seasonrank",async ctx=>{if(!await adminOnly(ctx))return;const [id,rank,points]=(ctx.match||"").trim().split(/\\s+/).map(Number);if(!Number.isSafeInteger(id)||!Number.isSafeInteger(rank)||rank<1||!Number.isSafeInteger(points)||points<0)return ctx.reply("استفاده: /seasonrank PLAYER_ID RANK POINTS");const level=Math.max(1,Math.floor(points/100)+1);const q=await pool.query("UPDATE players SET last_season_rank=$2,season_points=$3,player_level=$4,reputation=LEAST(100,GREATEST(-100,reputation+CASE WHEN $2<=3 THEN 10 WHEN $2<=10 THEN 5 ELSE 0 END)) WHERE telegram_id=$1 RETURNING display_name",[id,rank,points,level]);await ctx.reply(q.rowCount?"رتبه فصل قبلی ثبت شد. Level "+level:"بازیکن پیدا نشد.");});
bot.command("startup",async ctx=>{await ensurePlayer(ctx);const raw=(ctx.match||"").trim();if(!raw)return ctx.reply("مشخصات استارتاپ را این‌طور بفرست:\n/startup نام شرکت | شعار | شهر\nمثال: /startup آفتاب تک | فناوری برای زندگی | تهران");const [name,tagline,city]=raw.split("|").map(x=>x.trim());if(!name||name.length>40||!tagline||tagline.length>100||!city||city.length>40)return ctx.reply("هر سه مورد نام، شعار و شهر لازم است؛ نام و شهر حداکثر ۴۰ و شعار ۱۰۰ حرف.");await pool.query("UPDATE players SET startup_name=$2,startup_tagline=$3,startup_city=$4 WHERE telegram_id=$1",[String(ctx.from.id),name,tagline,city]);await ctx.reply("🚀 هویت استارتاپ ثبت شد\n\n🏢 "+name+"\n💬 "+tagline+"\n📍 "+city);});
\nfunction isOwner(ctx){return !!ownerTelegramId&&String(ctx.from?.id)===ownerTelegramId;}
async function adminOnly(ctx){if(isOwner(ctx))return true;if(ctx.callbackQuery)await ctx.answerCallbackQuery({text:"فقط مدیر کل دسترسی دارد.",show_alert:true}).catch(()=>{});else await ctx.reply("⛔ فقط مدیر کل دسترسی دارد.");return false;}
function adminKeyboard(){return new InlineKeyboard().text("🕓 درخواست‌ها","admin:pending").row().text("👥 بازیکنان","admin:players").row().text("📊 آمار","admin:stats");}
bot.command("admin",async ctx=>{if(!await adminOnly(ctx))return;const q=await pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE approval_status='pending')::int pending FROM players");await ctx.reply("🛡️ پنل مدیر کل\nکل بازیکنان: "+q.rows[0].total+"\nدر انتظار تأیید: "+q.rows[0].pending+"\n\n/pending درخواست‌ها\n/players بازیکنان\n/approve ID تأیید\n/reject ID رد\n/ban ID و /unban ID\n/balance ID\n/setbalance ID مبلغ\n/give ID مبلغ\n/broadcast پیام",{reply_markup:adminKeyboard()});});
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
  { command: "menu", description: "نمایش منوی بازی" },
  { command: "myid", description: "نمایش شناسه تلگرام" }
];
await bot.api.setMyCommands(publicCommands, { scope: { type: "default" }, language_code: "fa" }).catch(err => console.error("Set public commands failed:", err));
if (ownerTelegramId && /^\\d+$/.test(ownerTelegramId)) {
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
    { command: "broadcast", description: "پیام همگانی: /broadcast TEXT" }
  ], { scope: { type: "chat", chat_id: Number(ownerTelegramId) }, language_code: "fa" }).catch(err => console.error("Set owner commands failed:", err));
}
await bot.api.setChatMenuButton({ menu_button: { type: "commands" } }).catch(err => console.error("Set command menu button failed:", err));
await bot.start();
console.log("Open Many bot is running.");
