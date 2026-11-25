import { InlineKeyboard, Keyboard } from "grammy";

const fmt = n => "$" + Math.floor(Number(n) || 0).toLocaleString("en-US");

export async function initRealism(pool) {
  await pool.query(`
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS employee_count INTEGER NOT NULL DEFAULT 2;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS morale NUMERIC(5,2) NOT NULL DEFAULT 75;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS equipment_condition NUMERIC(5,2) NOT NULL DEFAULT 100;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS inventory_units INTEGER NOT NULL DEFAULT 100;
    ALTER TABLE player_companies ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
    CREATE TABLE IF NOT EXISTS market_conditions (
      id INTEGER PRIMARY KEY CHECK (id=1),
      demand_index NUMERIC(6,3) NOT NULL DEFAULT 1,
      inflation_index NUMERIC(6,3) NOT NULL DEFAULT 1,
      energy_price NUMERIC(6,3) NOT NULL DEFAULT 1,
      materials_price NUMERIC(6,3) NOT NULL DEFAULT 1,
      wage_index NUMERIC(6,3) NOT NULL DEFAULT 1,
      interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0.08,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO market_conditions(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      company_id BIGINT,
      transaction_type TEXT NOT NULL,
      amount BIGINT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS finance_transactions_player_idx ON finance_transactions(telegram_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS player_loans (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE CASCADE,
      principal BIGINT NOT NULL,
      remaining BIGINT NOT NULL,
      interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0.08,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function market(pool) {
  const q = await pool.query("SELECT * FROM market_conditions WHERE id=1");
  const m=q.rows[0];
  if(Date.now()-new Date(m.updated_at).getTime()<6*3600000) return m;
  const drift=(v,p,min,max)=>Math.max(min,Math.min(max,Number(v)*(1+(Math.random()-0.48)*p)));
  const values=[
    drift(m.demand_index,.08,.72,1.35),
    drift(m.inflation_index,.025,.94,1.18),
    drift(m.energy_price,.14,.65,1.8),
    drift(m.materials_price,.11,.7,1.65),
    drift(m.wage_index,.025,.9,1.25),
    Math.max(.04,Math.min(.18,Number(m.interest_rate)+(Math.random()-.5)*.005))
  ];
  return (await pool.query("UPDATE market_conditions SET demand_index=$1,inflation_index=$2,energy_price=$3,materials_price=$4,wage_index=$5,interest_rate=$6,updated_at=NOW() WHERE id=1 RETURNING *",values)).rows[0];
}

function costs(gross,m) {
  const revenue=Math.max(0,Number(gross));
  const payroll=revenue*.16*Number(m.wage_index);
  const materials=revenue*.14*Number(m.materials_price);
  const utilities=revenue*.07*Number(m.energy_price);
  const maintenance=revenue*.09;
  const taxes=Math.max(0,revenue-payroll-materials-utilities-maintenance)*.12;
  return {revenue,payroll,materials,utilities,maintenance,taxes,total:payroll+materials+utilities+maintenance+taxes,net:Math.max(0,revenue-payroll-materials-utilities-maintenance-taxes)};
}

export async function netHourlyForPlayer(pool,id) {
  const q=await pool.query(`SELECT COALESCE(SUM(ct.income*pc.level),0)::bigint gross
    FROM player_companies pc JOIN (VALUES ('cafe',900::bigint),('shop',3200::bigint),('factory',11500::bigint),('tech',31000::bigint)) ct(id,income)
    ON ct.id=pc.company_type WHERE pc.telegram_id=$1`,[String(id)]);
  const m=await market(pool);
  return Math.floor(costs(Number(q.rows[0].gross)*Number(m.demand_index),m).net);
}

export async function registerRealism(bot,pool) {
  bot.hears("🌐 اقتصاد واقعی",async ctx=>{
    const m=await market(pool);
    const grossQ=await pool.query(`SELECT COALESCE(SUM(ct.income*pc.level),0)::bigint gross
      FROM player_companies pc JOIN (VALUES ('cafe',900::bigint),('shop',3200::bigint),('factory',11500::bigint),('tech',31000::bigint)) ct(id,income)
      ON ct.id=pc.company_type WHERE pc.telegram_id=$1`,[String(ctx.from.id)]);
    const f=costs(Number(grossQ.rows[0].gross)*Number(m.demand_index),m);
    const debt=await pool.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
    await ctx.reply(`🌐 *گزارش اقتصاد واقعی*

📊 تقاضای بازار: ${(Number(m.demand_index)*100).toFixed(1)}٪
📈 تورم: ${(Number(m.inflation_index)*100).toFixed(1)}٪
⚡ قیمت انرژی: ${(Number(m.energy_price)*100).toFixed(0)}٪ شاخص پایه
🧱 مواد اولیه: ${(Number(m.materials_price)*100).toFixed(0)}٪ شاخص پایه
👷 دستمزد: ${(Number(m.wage_index)*100).toFixed(0)}٪ شاخص پایه
🏦 نرخ بهره سالانه: ${(Number(m.interest_rate)*100).toFixed(1)}٪

*صورت سود و زیان هر ساعت*
💵 درآمد ناخالص: ${fmt(f.revenue)}
👷 حقوق کارکنان: -${fmt(f.payroll)}
🧱 خرید مواد: -${fmt(f.materials)}
⚡ انرژی و خدمات: -${fmt(f.utilities)}
🔧 نگهداری و استهلاک: -${fmt(f.maintenance)}
🏛 مالیات بر سود: -${fmt(f.taxes)}
━━━━━━━━━━━━
💰 سود خالص: ${fmt(f.net)} / ساعت
💳 بدهی فعال: ${fmt(debt.rows[0].debt)}

_بازار هر ۶ ساعت نوسان می‌کند. سود پس از هزینه‌های جاری محاسبه می‌شود._`,{parse_mode:"Markdown",reply_markup:new Keyboard().text("📊 وضعیت بازی").text("🏦 بانک و وام").row().text("🧰 دسترسی آسان").resized().persistent()});
  });

  bot.hears("🏦 بانک و وام",async ctx=>{
    const m=await market(pool);
    const p=await pool.query("SELECT balance FROM players WHERE telegram_id=$1",[String(ctx.from.id)]);
    const d=await pool.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
    const cap=Math.max(0,Math.floor(Number(p.rows[0].balance)*1.5)-Number(d.rows[0].debt));
    await ctx.reply(`🏦 *بانک و اعتبار*

💰 نقدینگی: ${fmt(p.rows[0].balance)}
💳 بدهی: ${fmt(d.rows[0].debt)}
📉 نرخ بهره سالانه: ${(Number(m.interest_rate)*100).toFixed(1)}٪
🧾 سقف اعتبار: ${fmt(cap)}

وام یک‌ساله؛ مبلغ اصل و بهره در سررسید ثبت می‌شود.`,{parse_mode:"Markdown",reply_markup:new InlineKeyboard().text("وام ۵۰,۰۰۰","loan:50000").text("وام ۱۰۰,۰۰۰","loan:100000").row().text("💳 تسویه کامل بدهی","loan:repay").row().text("بازگشت","home")});
  });

  bot.callbackQuery("loan:repay",async ctx=>{
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const p=await client.query("SELECT balance FROM players WHERE telegram_id=$1 FOR UPDATE",[String(ctx.from.id)]);
      const debt=await client.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
      const amount=Number(debt.rows[0].debt);
      if(amount<=0){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"بدهی فعالی نداری."});}
      if(Number(p.rows[0].balance)<amount){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"موجودی برای تسویه کافی نیست.",show_alert:true});}
      await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1",[String(ctx.from.id),amount]);
      await client.query("UPDATE player_loans SET remaining=0,status='paid' WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
      await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'loan_repayment',$2,'تسویه کامل وام‌های فعال')",[String(ctx.from.id),-amount]);
      await client.query("COMMIT");
      await ctx.answerCallbackQuery({text:"تمام بدهی‌ها تسویه شد."});
      await ctx.reply("✅ بدهی به مبلغ "+fmt(amount)+" تسویه شد.");
    } catch(e){await client.query("ROLLBACK");console.error(e);await ctx.answerCallbackQuery({text:"خطا در تسویه.",show_alert:true});}
    finally{client.release();}
  });

  bot.callbackQuery(/^loan:(50000|100000)$/,async ctx=>{
    const amount=Number(ctx.match[1]),client=await pool.connect();
    try {
      await client.query("BEGIN");
      const p=await client.query("SELECT balance FROM players WHERE telegram_id=$1 FOR UPDATE",[String(ctx.from.id)]);
      const d=await client.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
      const m=await client.query("SELECT interest_rate FROM market_conditions WHERE id=1");
      const cap=Math.max(0,Math.floor(Number(p.rows[0].balance)*1.5)-Number(d.rows[0].debt));
      if(amount>cap){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"سقف اعتبار کافی نیست.",show_alert:true});}
      const rate=Number(m.rows[0].interest_rate),total=Math.ceil(amount*(1+rate));
      await client.query("INSERT INTO player_loans(telegram_id,principal,remaining,interest_rate,due_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '365 days')",[String(ctx.from.id),amount,total,rate]);
      await client.query("UPDATE players SET balance=balance+$2 WHERE telegram_id=$1",[String(ctx.from.id),amount]);
      await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'loan',$2,$3)",[String(ctx.from.id),amount,"وام یک‌ساله؛ مبلغ سررسید "+total]);
      await client.query("COMMIT");
      await ctx.answerCallbackQuery({text:"وام ثبت و واریز شد."});
      await ctx.reply("وام "+fmt(amount)+" واریز شد. مبلغ سررسید: "+fmt(total)+"؛ نرخ "+(rate*100).toFixed(1)+"٪",{reply_markup:new Keyboard().text("📊 وضعیت بازی").text("🏦 بانک و وام").resized().persistent()});
    } catch(e){await client.query("ROLLBACK");console.error(e);await ctx.answerCallbackQuery({text:"خطا در ثبت وام.",show_alert:true});}
    finally{client.release();}
  });
}
