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
    CREATE TABLE IF NOT EXISTS telecom_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      provider_company_id BIGINT NOT NULL REFERENCES player_companies(id) ON DELETE CASCADE,
      buyer_company_id BIGINT NOT NULL REFERENCES player_companies(id) ON DELETE CASCADE,
      service_key TEXT NOT NULL,
      price_per_period BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_billed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(buyer_company_id,service_key),
      CHECK(provider_company_id<>buyer_company_id),
      CHECK(price_per_period>0)
    );
    CREATE INDEX IF NOT EXISTS telecom_due_idx ON telecom_subscriptions(status,last_billed_at);
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

const TELECOM_SERVICES = {
  mobile: {name:'📱 بسته اینترنت موبایل',price:1800,description:'اینترنت موبایل و خط ارتباطی'},
  fiber: {name:'🌐 اینترنت پرسرعت فیبر',price:4200,description:'اینترنت ثابت پرسرعت'},
  cloud: {name:'☁️ سرور و فضای ابری',price:6500,description:'فضای ابری و سرور برای کسب‌وکار'},
  enterprise: {name:'🏢 ارتباطات سازمانی',price:9000,description:'شبکه اختصاصی و ارتباط شعب'},
  security: {name:'🛡️ امنیت شبکه',price:5200,description:'فایروال و محافظت از شبکه'}
};

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

function costs(gross,m,payrollBase=0) {
  const revenue=Math.max(0,Number(gross));
  const payroll=(Number(payrollBase)>0?Number(payrollBase):revenue*.16)*Number(m.wage_index);
  const materials=revenue*.14*Number(m.materials_price);
  const utilities=revenue*.07*Number(m.energy_price);
  const maintenance=revenue*.09;
  const taxes=Math.max(0,revenue-payroll-materials-utilities-maintenance)*.12;
  return {revenue,payroll,materials,utilities,maintenance,taxes,total:payroll+materials+utilities+maintenance+taxes,net:Math.max(0,revenue-payroll-materials-utilities-maintenance-taxes)};
}

async function companyOperations(pool,id,m) {
  const q=await pool.query("SELECT company_type,level,employee_count,morale,equipment_condition,inventory_units FROM player_companies WHERE telegram_id=$1",[String(id)]);
  const base={cafe:900,shop:1400,bakery:2100,restaurant:3500,salon:1250,gym:3000,farm:2400,logistics:5200,construction:6500,textile:4300,autoservice:2300,clinic:7800,education:3300,software:6800,marketing:4200,ecommerce:5600,hotel:11500,manufacturing:17000,fintech:23000,telecom:32000,apple_brand:450000,samsung_brand:410000,toyota_brand:520000,microsoft_brand:600000,amazon_brand:720000,google_brand:750000,tesla_brand:480000,sony_brand:430000};
  const required={cafe:2,shop:3,bakery:4,restaurant:7,salon:3,gym:5,farm:6,logistics:10,construction:12,textile:9,autoservice:5,clinic:14,education:6,software:8,marketing:7,ecommerce:6,hotel:22,manufacturing:35,fintech:18,telecom:30,apple_brand:800,samsung_brand:950,toyota_brand:1200,microsoft_brand:900,amazon_brand:1600,google_brand:1000,tesla_brand:850,sony_brand:700};
  const hourlyWage={cafe:120,shop:140,bakery:150,restaurant:180,salon:130,gym:150,farm:110,logistics:200,construction:240,textile:170,autoservice:180,clinic:300,education:180,software:600,marketing:350,ecommerce:260,hotel:220,manufacturing:250,fintech:650,telecom:500,apple_brand:100,samsung_brand:100,toyota_brand:100,microsoft_brand:100,amazon_brand:100,google_brand:100,tesla_brand:100,sony_brand:100};
  let gross=0,employees=0,payrollBase=0,morale=0,condition=0,stock=0;
  for(const row of q.rows){
    const target=required[row.company_type]||2;
    const staffing=Math.max(.45,Math.min(1.2,Number(row.employee_count)/target));
    const moraleFactor=.65+Number(row.morale)/200;
    const equipmentFactor=.55+Number(row.equipment_condition)/220;
    gross+=(base[row.company_type]||0)*Number(row.level)*staffing*moraleFactor*equipmentFactor;
    employees+=Number(row.employee_count);
    payrollBase+=Number(row.employee_count)*(hourlyWage[row.company_type]||150);
    morale+=Number(row.morale);
    condition+=Number(row.equipment_condition);
    stock+=Number(row.inventory_units);
  }
  const count=q.rows.length||1;
  return {gross:gross,employees,payrollBase,morale:morale/count,condition:condition/count,stock,companies:q.rows.length};
}

export async function getEconomyReport(pool,id) {
  const m=await market(pool),ops=await companyOperations(pool,id,m);
  const f=costs(ops.gross*Number(m.demand_index),m,ops.payrollBase);
  const debt=await pool.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(id)]);
  const companies=await pool.query("SELECT id,company_name,company_type,level,employee_count,morale,equipment_condition,inventory_units,sale_price FROM player_companies WHERE telegram_id=$1 ORDER BY id",[String(id)]);
  const hourlyWage={cafe:120,shop:140,bakery:150,restaurant:180,salon:130,gym:150,farm:110,logistics:200,construction:240,textile:170,autoservice:180,clinic:300,education:180,software:600,marketing:350,ecommerce:260,hotel:220,manufacturing:250,fintech:650,telecom:500,apple_brand:100,samsung_brand:100,toyota_brand:100,microsoft_brand:100,amazon_brand:100,google_brand:100,tesla_brand:100,sony_brand:100};
  const companyDetails=companies.rows.map(c=>{
    const target={cafe:2,shop:3,bakery:4,restaurant:7,salon:3,gym:5,farm:6,logistics:10,construction:12,textile:9,autoservice:5,clinic:14,education:6,software:8,marketing:7,ecommerce:6,hotel:22,manufacturing:35,fintech:18,telecom:30}[c.company_type]||2;
    const base={cafe:900,shop:1400,bakery:2100,restaurant:3500,salon:1250,gym:3000,farm:2400,logistics:5200,construction:6500,textile:4300,autoservice:2300,clinic:7800,education:3300,software:6800,marketing:4200,ecommerce:5600,hotel:11500,manufacturing:17000,fintech:23000,telecom:32000}[c.company_type]||0;
    const staffing=Math.max(.45,Math.min(1.2,Number(c.employee_count)/target));
    const gross=base*Number(c.level)*staffing*(.65+Number(c.morale)/200)*(.55+Number(c.equipment_condition)/220)*Number(m.demand_index);
    const payroll=Number(c.employee_count)*(hourlyWage[c.company_type]||150)*Number(m.wage_index);
    const materials=gross*.14*Number(m.materials_price),utilities=gross*.07*Number(m.energy_price),maintenance=gross*.09;
    return {...c,gross,payroll,materials,utilities,maintenance,net:Math.max(0,gross-payroll-materials-utilities-maintenance-Math.max(0,gross-payroll-materials-utilities-maintenance)*.12)};
  });
  const telecom=await pool.query("SELECT ts.service_key,ts.price_per_period,ts.status,pc.company_name provider_name,bc.company_name buyer_name,pc.telegram_id provider_owner,bc.telegram_id buyer_owner FROM telecom_subscriptions ts JOIN player_companies pc ON pc.id=ts.provider_company_id JOIN player_companies bc ON bc.id=ts.buyer_company_id WHERE pc.telegram_id=$1 OR bc.telegram_id=$1 ORDER BY ts.id",[String(id)]);
  return {market:m,operations:ops,finance:f,debt:Number(debt.rows[0].debt),companies:companyDetails,telecom:telecom.rows};
}

export async function netHourlyForPlayer(pool,id) {
  const m=await market(pool);
  const ops=await companyOperations(pool,id,m);
  return Math.floor(costs(ops.gross*Number(m.demand_index),m,ops.payrollBase).net);
}

export async function registerRealism(bot,pool) {
  // Automatic operating-profit settlement: one 3-hour installment (1/8 of a full day) each period.
  const settleDueIncome=async()=>{
    const players=await pool.query("SELECT telegram_id FROM players WHERE approval_status='approved'");
    for(const player of players.rows){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const row=await client.query("SELECT last_collect FROM players WHERE telegram_id=$1 FOR UPDATE",[String(player.telegram_id)]);
        if(!row.rows.length){await client.query("ROLLBACK");continue;}
        const anchor=new Date(row.rows[0].last_collect).getTime();
        const intervals=Math.min(8,Math.floor(Math.max(0,Date.now()-anchor)/(3*3600000)));
        if(intervals<1){await client.query("ROLLBACK");continue;}
        const net=await netHourlyForPlayer(pool,player.telegram_id);
        const amount=Math.floor(net*3*intervals);
        const next=new Date(anchor+intervals*3*3600000);
        await client.query("UPDATE players SET balance=balance+$2,last_collect=$3 WHERE telegram_id=$1",[String(player.telegram_id),amount,next]);
        if(amount>0)await client.query("INSERT INTO finance_transactions(telegram_id,transaction_type,amount,description) VALUES($1,'operating_income',$2,$3)",[String(player.telegram_id),amount,"واریز خودکار سود خالص؛ "+intervals+" قسط سه‌ساعته"]);
        await client.query("COMMIT");
        if(amount>0)await bot.api.sendMessage(String(player.telegram_id),"💵 واریز خودکار سود کسب‌وکارها انجام شد.\nمبلغ: "+fmt(amount)+"\nدوره: "+intervals+" × ۳ ساعت").catch(()=>{});
      }catch(e){await client.query("ROLLBACK").catch(()=>{});console.error("[auto-income]",player.telegram_id,e);}
      finally{client.release();}
    }
  };

  const billTelecomServices=async()=>{
    for(let attempt=0;attempt<30;attempt++){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const q=await client.query("SELECT ts.*,pc.telegram_id provider_owner,bc.telegram_id buyer_owner FROM telecom_subscriptions ts JOIN player_companies pc ON pc.id=ts.provider_company_id JOIN player_companies bc ON bc.id=ts.buyer_company_id WHERE ts.status='active' AND ts.last_billed_at<=NOW()-INTERVAL '3 hours' ORDER BY ts.last_billed_at LIMIT 1 FOR UPDATE OF ts SKIP LOCKED");
        if(!q.rows.length){await client.query("COMMIT");break;}
        const sub=q.rows[0],provider=String(sub.provider_owner),buyer=String(sub.buyer_owner),fee=Number(sub.price_per_period);
        if(provider===buyer){await client.query("UPDATE telecom_subscriptions SET status='cancelled' WHERE id=$1",[sub.id]);await client.query("COMMIT");continue;}
        const players=await client.query("SELECT telegram_id,balance FROM players WHERE telegram_id IN ($1,$2) ORDER BY telegram_id FOR UPDATE",[provider,buyer]);
        const buyerRow=players.rows.find(x=>String(x.telegram_id)===buyer);
        if(!buyerRow||Number(buyerRow.balance)<fee){
          await client.query("UPDATE telecom_subscriptions SET status='paused' WHERE id=$1",[sub.id]);
          await client.query("COMMIT");
          await bot.api.sendMessage(buyer,"⏸️ اشتراک مخابراتی به‌دلیل کمبود موجودی متوقف شد. برای فعال‌سازی دوباره، از بخش «خدمات مخابرات» اقدام کن.").catch(()=>{});
          continue;
        }
        await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1",[buyer,fee]);
        await client.query("UPDATE players SET balance=balance+$2 WHERE telegram_id=$1",[provider,fee]);
        await client.query("UPDATE telecom_subscriptions SET last_billed_at=last_billed_at+INTERVAL '3 hours' WHERE id=$1",[sub.id]);
        await client.query("INSERT INTO finance_transactions(telegram_id,company_id,transaction_type,amount,description) VALUES($1,$2,'telecom_service_fee',$3,$4),($5,$6,'telecom_service_income',$7,$8)",[buyer,sub.buyer_company_id,-fee,"پرداخت دوره‌ای خدمات مخابرات: "+(TELECOM_SERVICES[sub.service_key]?.name||sub.service_key),provider,sub.provider_company_id,fee,"دریافت درآمد خدمات مخابرات"]);
        await client.query("COMMIT");
      }catch(e){await client.query("ROLLBACK").catch(()=>{});console.error("[telecom-billing]",e);break;}
      finally{client.release();}
    }
  };

  setInterval(()=>settleDueIncome().catch(e=>console.error("[auto-income loop]",e)),60000);
  setInterval(()=>billTelecomServices().catch(e=>console.error('[telecom billing loop]',e)),60000);
  billTelecomServices().catch(e=>console.error('[telecom billing startup]',e));
  settleDueIncome().catch(e=>console.error("[auto-income startup]",e));


  bot.hears("📡 خدمات مخابرات",async ctx=>{
    const own=await pool.query("SELECT id FROM player_companies WHERE telegram_id=$1 AND approval_status='approved' ORDER BY id",[String(ctx.from.id)]);
    if(!own.rows.length)return ctx.reply("برای خرید خدمات، ابتدا یک شرکت تأسیس کن.");
    const providers=await pool.query("SELECT pc.id,pc.company_name,p.display_name FROM player_companies pc JOIN players p ON p.telegram_id=pc.telegram_id WHERE pc.company_type='telecom' AND pc.approval_status='approved' AND pc.telegram_id<>$1 ORDER BY pc.id",[String(ctx.from.id)]);
    const kb=new InlineKeyboard();
    for(const row of providers.rows)kb.text((row.company_name||"شرکت مخابراتی")+" | "+row.display_name,"tel:provider:"+row.id).row();
    kb.text("📋 اشتراک‌های من","tel:mine");
    await ctx.reply("📡 *بازار خدمات مخابراتی*\n\nخدمات شرکت‌های مخابراتی بازیکنان دیگر را انتخاب کن. هزینه هر بسته برای یک دوره ۳ ساعته است و پس از فعال‌سازی خودکار تمدید می‌شود.\n\n"+(providers.rows.length?"شرکت ارائه‌دهنده را انتخاب کن:":"فعلاً شرکت مخابراتی بازیکن دیگری برای ارائه خدمات وجود ندارد."),{parse_mode:"Markdown",reply_markup:kb});
  });

  bot.callbackQuery(/^tel:provider:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]);
    const q=await pool.query("SELECT id,telegram_id,company_name FROM player_companies WHERE id=$1 AND company_type='telecom' AND approval_status='approved'",[id]);
    if(!q.rows.length||String(q.rows[0].telegram_id)===String(ctx.from.id))return ctx.answerCallbackQuery({text:"این ارائه‌دهنده در دسترس نیست.",show_alert:true});
    const kb=new InlineKeyboard();
    for(const [key,item] of Object.entries(TELECOM_SERVICES))kb.text(item.name+" | "+fmt(item.price)+"/۳ساعت","tel:service:"+id+":"+key).row();
    kb.text("🔙 ارائه‌دهندگان","tel:back");
    await ctx.editMessageText("📡 *"+(q.rows[0].company_name||"شرکت مخابراتی")+"*\n\nیک خدمت انتخاب کن. هزینه هر ۳ ساعت از موجودی شرکت خریدار کم و به ارائه‌دهنده پرداخت می‌شود.",{parse_mode:"Markdown",reply_markup:kb});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^tel:service:(\d+):(mobile|fiber|cloud|enterprise|security)$/,async ctx=>{
    const providerId=Number(ctx.match[1]),key=ctx.match[2],service=TELECOM_SERVICES[key];
    const q=await pool.query("SELECT id,company_name FROM player_companies WHERE telegram_id=$1 AND approval_status='approved' AND company_type<>'telecom' ORDER BY id",[String(ctx.from.id)]);
    if(!q.rows.length)return ctx.answerCallbackQuery({text:"برای خرید خدمت، یک شرکت غیرمخابراتی لازم داری.",show_alert:true});
    const kb=new InlineKeyboard();
    for(const c of q.rows)kb.text((c.company_name||"شرکت")+" #"+c.id,"tel:activate:"+providerId+":"+c.id+":"+key).row();
    kb.text("🔙 خدمات","tel:provider:"+providerId);
    await ctx.editMessageText(service.name+"\n\n"+service.description+"\nهزینه هر ۳ ساعت: "+fmt(service.price)+"\n\nخدمت برای کدام شرکت فعال شود؟",{reply_markup:kb});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^tel:activate:(\d+):(\d+):(mobile|fiber|cloud|enterprise|security)$/,async ctx=>{
    const providerId=Number(ctx.match[1]),buyerCompanyId=Number(ctx.match[2]),key=ctx.match[3],service=TELECOM_SERVICES[key],client=await pool.connect();
    try{
      await client.query("BEGIN");
      const q=await client.query("SELECT pc.id provider_id,pc.telegram_id provider_owner,pc.company_name provider_name,bc.id buyer_id,bc.telegram_id buyer_owner,bc.company_name buyer_name FROM player_companies pc JOIN player_companies bc ON bc.id=$2 WHERE pc.id=$1 AND pc.company_type='telecom' AND pc.approval_status='approved' AND bc.telegram_id=$3 AND bc.company_type<>'telecom' AND bc.approval_status='approved' FOR UPDATE OF pc,bc",[providerId,buyerCompanyId,String(ctx.from.id)]);
      if(!q.rows.length||String(q.rows[0].provider_owner)===String(ctx.from.id)){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"شرکت انتخاب‌شده معتبر نیست.",show_alert:true});}
      const row=q.rows[0],provider=String(row.provider_owner),buyer=String(row.buyer_owner),fee=service.price;
      const existing=await client.query("SELECT id,status FROM telecom_subscriptions WHERE buyer_company_id=$1 AND service_key=$2 FOR UPDATE",[buyerCompanyId,key]);
      if(existing.rows[0]?.status==="active"){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"این خدمت از قبل فعال است.",show_alert:true});}
      const balances=await client.query("SELECT telegram_id,balance FROM players WHERE telegram_id IN ($1,$2) ORDER BY telegram_id FOR UPDATE",[provider,buyer]);
      const b=balances.rows.find(x=>String(x.telegram_id)===buyer);
      if(!b||Number(b.balance)<fee){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"موجودی شرکت برای پرداخت دوره اول کافی نیست.",show_alert:true});}
      await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1",[buyer,fee]);
      await client.query("UPDATE players SET balance=balance+$2 WHERE telegram_id=$1",[provider,fee]);
      await client.query("INSERT INTO telecom_subscriptions(provider_company_id,buyer_company_id,service_key,price_per_period,status,last_billed_at) VALUES($1,$2,$3,$4,'active',NOW()) ON CONFLICT(buyer_company_id,service_key) DO UPDATE SET provider_company_id=EXCLUDED.provider_company_id,price_per_period=EXCLUDED.price_per_period,status='active',last_billed_at=NOW()",[providerId,buyerCompanyId,key,fee]);
      await client.query("INSERT INTO finance_transactions(telegram_id,company_id,transaction_type,amount,description) VALUES($1,$2,'telecom_service_fee',$3,$4),($5,$6,'telecom_service_income',$7,$8)",[buyer,buyerCompanyId,-fee,"فعال‌سازی "+service.name,provider,providerId,fee,"فروش "+service.name]);
      await client.query("COMMIT");
      await ctx.answerCallbackQuery({text:"اشتراک فعال شد و هزینه دوره اول پرداخت شد."});
      await ctx.reply("✅ "+service.name+" برای شرکت "+(row.buyer_name||("#"+buyerCompanyId))+" فعال شد.\n💵 پرداخت اولیه: "+fmt(fee)+"\n🔁 تمدید خودکار هر ۳ ساعت؛ در صورت کمبود موجودی، اشتراک متوقف می‌شود.",{reply_markup:new Keyboard().text("📡 خدمات مخابرات").text("📊 وضعیت بازی").resized().persistent()});
    }catch(e){await client.query("ROLLBACK").catch(()=>{});console.error("[telecom-activate]",e);await ctx.answerCallbackQuery({text:"خطا در فعال‌سازی خدمت.",show_alert:true});}
    finally{client.release();}
  });

  bot.callbackQuery("tel:back",async ctx=>{
    const providers=await pool.query("SELECT id,company_name FROM player_companies WHERE company_type='telecom' AND approval_status='approved' AND telegram_id<>$1 ORDER BY id",[String(ctx.from.id)]);
    const kb=new InlineKeyboard();for(const p of providers.rows)kb.text(p.company_name||"شرکت مخابراتی","tel:provider:"+p.id).row();
    await ctx.editMessageText("📡 شرکت مخابراتی را انتخاب کن:",{reply_markup:kb});await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("tel:mine",async ctx=>{
    const q=await pool.query("SELECT ts.id,ts.service_key,ts.price_per_period,ts.status,bc.company_name buyer_name,pc.company_name provider_name,bc.telegram_id buyer_owner,pc.telegram_id provider_owner FROM telecom_subscriptions ts JOIN player_companies bc ON bc.id=ts.buyer_company_id JOIN player_companies pc ON pc.id=ts.provider_company_id WHERE bc.telegram_id=$1 OR pc.telegram_id=$1 ORDER BY ts.id",[String(ctx.from.id)]);
    const lines=q.rows.map(x=>(TELECOM_SERVICES[x.service_key]?.name||x.service_key)+"\n🏢 خریدار: "+(x.buyer_name||"شرکت خریدار")+"\n📡 فروشنده: "+(x.provider_name||"شرکت مخابراتی")+"\n💵 "+fmt(x.price_per_period)+" هر ۳ ساعت | "+(x.status==="active"?"فعال":"متوقف"));
    const kb=new InlineKeyboard();for(const x of q.rows)if(x.status==="active"&&String(x.buyer_owner)===String(ctx.from.id))kb.text("⏹ لغو "+(TELECOM_SERVICES[x.service_key]?.name||x.service_key),"tel:cancel:"+x.id).row();
    kb.text("🔙 بازار خدمات","tel:back");
    await ctx.editMessageText("📋 *اشتراک‌های مخابراتی شما*\n\n"+(lines.join("\n\n")||"اشتراکی ثبت نشده است."),{parse_mode:"Markdown",reply_markup:kb});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^tel:cancel:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]);
    const q=await pool.query("UPDATE telecom_subscriptions ts SET status='cancelled' FROM player_companies bc WHERE ts.id=$1 AND bc.id=ts.buyer_company_id AND bc.telegram_id=$2 AND ts.status='active' RETURNING ts.id",[id,String(ctx.from.id)]);
    if(!q.rows.length)return ctx.answerCallbackQuery({text:"اشتراک فعال پیدا نشد.",show_alert:true});
    await ctx.answerCallbackQuery({text:"تمدید خودکار این اشتراک لغو شد."});
    await ctx.reply("⏹ اشتراک لغو شد؛ دیگر هزینه دوره‌ای از شما کم نمی‌شود.");
  });

  bot.hears("📒 دفتر مالی",async ctx=>{
    const q=await pool.query("SELECT transaction_type,amount,description,created_at FROM finance_transactions WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 12",[String(ctx.from.id)]);
    if(!q.rows.length)return ctx.reply("هنوز تراکنش مالی ثبت نشده.");
    const lines=q.rows.map(x=>{
      const sign=Number(x.amount)>=0?"+":"−";
      const date=new Date(x.created_at).toLocaleDateString("fa-IR");
      return `${date} | ${sign}${fmt(Math.abs(Number(x.amount)))}\n  ${x.description}`;
    });
    await ctx.reply("📒 *دفتر مالی — ۱۲ تراکنش اخیر*\n\n"+lines.join("\n\n"),{parse_mode:"Markdown"});
  });

  bot.hears("👨‍💼 مدیریت شرکت‌ها",async ctx=>{
    const q=await pool.query("SELECT id,company_type,level,employee_count,morale,equipment_condition FROM player_companies WHERE telegram_id=$1 ORDER BY id",[String(ctx.from.id)]);
    if(!q.rows.length)return ctx.reply("ابتدا یک شرکت خریداری کن.");
    const names={cafe:"کافه",shop:"فروشگاه",factory:"کارخانه",tech:"شرکت فناوری"};
    const kb=new InlineKeyboard();
    for(const row of q.rows)kb.text(`${names[row.company_type]||row.company_type} #${row.id} | ${row.employee_count} کارمند`,"manage:"+row.id).row();
    await ctx.reply("👨‍💼 *مدیریت عملیاتی شرکت‌ها*\n\nبرای استخدام، تعدیل نیرو، تعمیر تجهیزات یا افزایش روحیه شرکت را انتخاب کن.",{parse_mode:"Markdown",reply_markup:kb});
  });

  bot.callbackQuery(/^manage:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]);
    const q=await pool.query("SELECT id,company_type,level,employee_count,morale,equipment_condition FROM player_companies WHERE id=$1 AND telegram_id=$2",[id,String(ctx.from.id)]);
    if(!q.rows.length)return ctx.answerCallbackQuery({text:"شرکت متعلق به شما نیست.",show_alert:true});
    const row=q.rows[0],names={cafe:"کافه",shop:"فروشگاه",factory:"کارخانه",tech:"شرکت فناوری"};
    await ctx.editMessageText(`🏢 *${names[row.company_type]||row.company_type} #${row.id}*

👷 کارکنان: ${row.employee_count}
🙂 روحیه: ${Number(row.morale).toFixed(0)}/100
🔧 سلامت تجهیزات: ${Number(row.equipment_condition).toFixed(0)}٪

استخدام، حقوق رفاهی و تعمیرات روی بهره‌وری و درآمد اثر می‌گذارند.`,{parse_mode:"Markdown",reply_markup:new InlineKeyboard().text("➕ استخدام | 1,200","manageact:hire:"+id).text("➖ تعدیل","manageact:fire:"+id).row().text("🔧 تعمیر | 2,500","manageact:repair:"+id).text("🎉 رفاه | 1,500","manageact:morale:"+id).row().text("🔙 شرکت‌ها","manage:back")});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("manage:back",async ctx=>{
    const q=await pool.query("SELECT id,company_type,employee_count FROM player_companies WHERE telegram_id=$1 ORDER BY id",[String(ctx.from.id)]);
    const names={cafe:"کافه",shop:"فروشگاه",factory:"کارخانه",tech:"شرکت فناوری"},kb=new InlineKeyboard();
    for(const row of q.rows)kb.text(`${names[row.company_type]||row.company_type} #${row.id} | ${row.employee_count} کارمند`,"manage:"+row.id).row();
    await ctx.editMessageText("👨‍💼 شرکت موردنظر را انتخاب کن:",{reply_markup:kb});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^manageact:(hire|fire|repair|morale):(\d+)$/,async ctx=>{
    const action=ctx.match[1],id=Number(ctx.match[2]),client=await pool.connect();
    const price={hire:1200,fire:0,repair:2500,morale:1500}[action];
    try{
      await client.query("BEGIN");
      const q=await client.query("SELECT pc.*,p.balance FROM player_companies pc JOIN players p ON p.telegram_id=pc.telegram_id WHERE pc.id=$1 AND pc.telegram_id=$2 FOR UPDATE",[id,String(ctx.from.id)]);
      if(!q.rows.length){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"شرکت پیدا نشد.",show_alert:true});}
      const row=q.rows[0];
      if(action==="fire"&&Number(row.employee_count)<=1){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"حداقل یک کارمند لازم است.",show_alert:true});}
      if(Number(row.balance)<price){await client.query("ROLLBACK");return ctx.answerCallbackQuery({text:"سرمایه کافی نیست.",show_alert:true});}
      if(action==="hire")await client.query("UPDATE player_companies SET employee_count=employee_count+1 WHERE id=$1",[id]);
      if(action==="fire")await client.query("UPDATE player_companies SET employee_count=employee_count-1 WHERE id=$1",[id]);
      if(action==="repair")await client.query("UPDATE player_companies SET equipment_condition=LEAST(100,equipment_condition+25) WHERE id=$1",[id]);
      if(action==="morale")await client.query("UPDATE player_companies SET morale=LEAST(100,morale+15) WHERE id=$1",[id]);
      if(price>0){
        await client.query("UPDATE players SET balance=balance-$2 WHERE telegram_id=$1",[String(ctx.from.id),price]);
        await client.query("INSERT INTO finance_transactions(telegram_id,company_id,transaction_type,amount,description) VALUES($1,$2,$3,$4,$5)",[String(ctx.from.id),id,action,-price,{hire:"استخدام نیروی جدید",repair:"تعمیر و نگهداری تجهیزات",morale:"هزینه رفاهی کارکنان"}[action]]);
      }
      await client.query("COMMIT");
      await ctx.answerCallbackQuery({text:{hire:"استخدام انجام شد؛ هزینه حقوق در آینده افزایش می‌یابد.",fire:"تعدیل نیرو انجام شد.",repair:"تجهیزات تعمیر شد.",morale:"روحیه کارکنان افزایش یافت."}[action]});
      await ctx.reply("عملیات شرکت انجام شد. سود ساعتی جدید را در «اقتصاد واقعی» بررسی کن.",{reply_markup:new Keyboard().text("🌐 اقتصاد واقعی").text("👨‍💼 مدیریت شرکت‌ها").resized().persistent()});
    }catch(e){await client.query("ROLLBACK");console.error(e);await ctx.answerCallbackQuery({text:"خطا در عملیات شرکت.",show_alert:true});}
    finally{client.release();}
  });

  bot.hears("🌐 اقتصاد واقعی",async ctx=>{
    const m=await market(pool);
    const ops=await companyOperations(pool,ctx.from.id,m);
    const f=costs(ops.gross*Number(m.demand_index),m,ops.payrollBase);
    const debt=await pool.query("SELECT COALESCE(SUM(remaining),0)::bigint debt FROM player_loans WHERE telegram_id=$1 AND status='active'",[String(ctx.from.id)]);
    await ctx.reply(`🌐 *گزارش اقتصاد واقعی*

🏢 شرکت‌های فعال: ${ops.companies}\n👷 کارکنان: ${ops.employees}\n🙂 میانگین روحیه: ${ops.morale.toFixed(0)}/100\n🔧 سلامت تجهیزات: ${ops.condition.toFixed(0)}٪\n📊 تقاضای بازار: ${(Number(m.demand_index)*100).toFixed(1)}٪
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
