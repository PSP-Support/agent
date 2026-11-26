import {Bot,InlineKeyboard} from "grammy";
import pg from "pg";
import http from "node:http";
const {Pool}=pg, token=process.env.BOT_TOKEN, PORT=Number(process.env.PORT||3000);
if(!token) throw new Error("BOT_TOKEN is required");
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("railway")?{rejectUnauthorized:false}:undefined});
const bot=new Bot(token), period=10800000, ownerTelegramId=String(process.env.OWNER_TELEGRAM_ID||"8873717047");
const countries=[
["ottoman","امپراتوری عثمانی","محمد پنجم","استانبول",28500000,1200000],
["germany","امپراتوری آلمان","ویلهلم دوم","برلین",65000000,1800000],
["russia","امپراتوری روسیه","نیکلای دوم","سن‌پترزبورگ",166000000,2100000],
["austria","اتریش-مجارستان","فرانتس یوزف یکم","وین",52000000,1500000],
["britain","امپراتوری بریتانیا","جورج پنجم","لندن",460000000,2400000],
["france","جمهوری فرانسه","ریموند پوانکاره","پاریس",39000000,1400000],
["italy","پادشاهی ایتالیا","ویکتور امانوئل سوم","رم",35000000,900000],
["persia","ایران قاجاری","احمدشاه قاجار","تهران",10000000,350000],
["japan","امپراتوری ژاپن","امپراتور تای‌شو","توکیو",51000000,1000000],
["serbia","پادشاهی صربستان","پتر یکم","بلگراد",4500000,180000],
["bulgaria","پادشاهی بلغارستان","فردیناند یکم","صوفیه",4700000,170000],
["romania","پادشاهی رومانی","کارول یکم","بخارست",7000000,250000],
["belgium","پادشاهی بلژیک","آلبرت یکم","بروکسل",7500000,420000],
["netherlands","پادشاهی هلند","ویلهلمینا","آمستردام",6000000,400000],
["portugal","جمهوری پرتغال","مانوئل دوم","لیسبون",6000000,300000],
["greece","پادشاهی یونان","کنستانتین یکم","آتن",4800000,260000],
["montenegro","پادشاهی مونته‌نگرو","نیکولا یکم","ستینیه",500000,50000],
["albania","شاهزاده‌نشین آلبانی","ویلهلم وید","دورِس",800000,60000],
["denmark","پادشاهی دانمارک","کریستیان دهم","کپنهاگ",2800000,250000],
["sweden","پادشاهی سوئد","گوستاو پنجم","استکهلم",5600000,420000],
["norway","پادشاهی نروژ","هاکون هفتم","کریستیانیا",2400000,230000],
["switzerland","کنفدراسیون سوئیس","آرتور هوفمان","برن",3800000,350000],
["luxembourg","دوک‌نشین لوکزامبورگ","آدولف","لوکزامبورگ",260000,40000],
["usa","ایالات متحده‌ی آمریکا","وودرو ویلسون","واشینگتن",99000000,2500000],
["china","جمهوری چین","یوان شیکای","پکن",430000000,1500000],
["siam","پادشاهی سیام","رامای ششم","بانکوک",8500000,250000],
["afghanistan","امارت افغانستان","حبیب‌الله خان","کابل",6000000,180000],
["ethiopia","امپراتوری اتیوپی","لیج ایاسو","آدیس‌آبابا",10000000,220000],
["liberia","جمهوری لیبریا","دانیل هاوارد","مونروویا",1200000,60000],
["egypt","سلطنت مصر تحت‌الحمایه‌ی بریتانیا","عباس حلمی دوم","قاهره",12000000,300000],
["morocco","سلطنت مراکش","مولای یوسف","فاس",5000000,180000],
["south_africa","اتحاد آفریقای جنوبی","لوئیس بوتا","پرتوریا",6000000,450000],
["canada","دومینیون کانادا","جورج پنجم","اتاوا",8000000,650000],
["australia","دومینیون استرالیا","جورج پنجم","ملبورن",4900000,500000],
["new_zealand","دومینیون نیوزیلند","جورج پنجم","ولینگتون",1100000,180000],
["brazil","جمهوری برزیل","هرمس دا فونseca","ریو دو ژانیرو",24000000,650000],
["argentina","جمهوری آرژانتین","روکه ساِنز پنیا","بوئنوس‌آیرس",7800000,550000],
["chile","جمهوری شیلی","رامون باروس لوکو","سانتیاگو",3500000,300000],
["mexico","جمهوری مکزیک","ویکتوریانو اوئرتا","مکزیکوسیتی",15000000,250000],
["cuba","جمهوری کوبا","ماریو گارسیا منوکال","هاوانا",2400000,160000],
["bolivia","جمهوری بولیوی","ایسماعیل مونتس","لاپاز",2200000,120000],
["uruguay","جمهوری اروگوئه","خوزه باتیه ای اوردونیس","مونته‌ویدئو",1100000,140000],
["venezuela","جمهوری ونزوئلا","خوان ویسنته گومز","کاراکاس",2700000,130000],
["korea","امپراتوری کره (تحت سلطه‌ی ژاپن)","سو جونگ","هان‌سونگ",16000000,100000],
["vietnam","هندوچین فرانسه","فرماندار فرانسوی","هانوی",16000000,150000],
["philippines","جزایر فیلیپین (تحت اداره‌ی آمریکا)","فرانسیس برتون هریسون","مانیل",8000000,120000],
["indonesia","هند شرقی هلند","فرماندار هلندی","باتاویا",40000000,250000],
["india","هند بریتانیا","جورج پنجم","دهلی","315000000",1800000],
["ireland","ایرلند تحت اداره‌ی بریتانیا","جورج پنجم","دوبلین",4500000,180000],
["finland","دوک‌نشین بزرگ فنلاند","نیکلای دوم","هلسینکی",3200000,200000],
["poland","سرزمین‌های لهستانی تقسیم‌شده","فرمانروایان سه امپراتوری","ورشو",12000000,100000],
["ukraine","سرزمین‌های اوکراینی","نیکلای دوم","کی‌یف",30000000,250000],
["croatia","کرواسی-اسلاونیا","فرانتس یوزف یکم","زاگرب",2500000,120000],
["czech","سرزمین‌های چک در اتریش-مجارستان","فرانتس یوزف یکم","پراگ",6500000,200000],
["slovakia","سرزمین‌های اسلواک در مجارستان","فرانتس یوزف یکم","پوزونی",3000000,100000],
["hungary","پادشاهی مجارستان","فرانتس یوزف یکم","بوداپست",21000000,450000],
["ireland_home","جنبش خودمختاری ایرلند","جورج پنجم","دوبلین",4500000,100000],
["peru","جمهوری پرو","گیلرمو بیلینگهرست","لیما",5000000,180000],
["paraguay","جمهوری پاراگوئه","ادواردو شرر","آسونسیون",700000,90000],
["ecuador","جمهوری اکوادور","لئونیداس پلازا","کیتو",1500000,100000],
["colombia","جمهوری کلمبیا","کارلوس اوخینیو","بوگوتا",5000000,180000],
["panama","جمهوری پاناما","بلساریو پوراس","پاناما",400000,80000],
["haiti","جمهوری هائیتی","میشل اورسته","پورتو پرنس",2000000,90000],
["dominican","جمهوری دومینیکن","رامون کاسرس","سانتو دومینگو",700000,70000],
["guatemala","جمهوری گواتمالا","مانوئل استرادا کابرا","گواتمالاسیتی",2000000,100000],
["honduras","جمهوری هندوراس","فرانسیسکو برتراند","تگوسیگالپا",600000,50000],
["el_salvador","جمهوری السالوادور","کارلوس ملندز","سان سالوادور",1200000,70000],
["nicaragua","جمهوری نیکاراگوئه","آدولفو دیاز","ماناگوا",600000,50000],
["costa_rica","جمهوری کاستاریکا","ریکاردو خیمنس","سن‌خوزه",400000,60000],
["nigeria","نیجریه‌ی بریتانیا","فرماندار بریتانیایی","لاگوس",17000000,180000],
["ghana","ساحل طلایی بریتانیا","فرماندار بریتانیایی","آکرا",1500000,80000],
["kenya","آفریقای شرقی بریتانیا","فرماندار بریتانیایی","نایروبی",4000000,70000],
["uganda","اوگاندا تحت‌الحمایه‌ی بریتانیا","فرماندار بریتانیایی","انتبه",3000000,60000],
["algeria","الجزایر فرانسه","فرماندار فرانسوی","الجزیره",5000000,180000],
["tunisia","تونس تحت‌الحمایه‌ی فرانسه","محمد الناصر","تونس",2000000,100000],
["madagascar","ماداگاسکار فرانسه","فرماندار فرانسوی","آنتاناناریوو",3000000,80000],
["angola","آنگولای پرتغال","فرماندار پرتغالی","لوآندا",4000000,70000],
["mozambique","موزامبیک پرتغال","فرماندار پرتغالی","لورنسو مارکز",4000000,70000],
["congo","کنگوی بلژیک","فرماندار بلژیکی","لئوپولدویل",15000000,120000],
["nepal","پادشاهی نپال","تریبووان","کاتماندو",5000000,100000],
["bhutan","پادشاهی بوتان","اوگین وانگچوک","پارو",300000,30000],
["oman","سلطنت عمان","فیصل بن ترکی","مسقط",500000,60000],
["yemen","امام‌نشین یمن","یحیی حمیدالدین","صنعا",3000000,70000],
["qatar","شیخ‌نشین قطر","عبدالله بن جاسم","دوحه",25000,20000],
["kuwait","شیخ‌نشین کویت","مبارک الصباح","کویت",50000,30000],
["bahrain","شیخ‌نشین بحرین","عیسی بن علی","منامه",100000,30000],
["saudi","امارت نجد و حسا","عبدالعزیز آل سعود","ریاض",1000000,70000],
["mongolia","مغولستان","بوگد خان","اورگا",600000,50000],
["manchuria","منچوری","چانگ تسولین","موکدن",15000000,100000],
["taiwan","تایوان ژاپن","فرماندار ژاپنی","تایپه",3500000,70000],
["burma","برمه‌ی بریتانیا","فرماندار بریتانیایی","رانگون",12000000,100000],
["malaya","مالایای بریتانیا","فرماندار بریتانیایی","کوالالامپور",2500000,100000],
["cambodia","کامبوج تحت‌الحمایه‌ی فرانسه","سیسووات","پنوم‌پن",1500000,50000],
["laos","لائوس تحت‌الحمایه‌ی فرانسه","فرماندار فرانسوی","وینتیان",600000,30000],
["azerbaijan","آذربایجان در امپراتوری روسیه","نیکلای دوم","باکو",2500000,150000],
["georgia","گرجستان در امپراتوری روسیه","نیکلای دوم","تفلیس",2500000,100000],
["armenia","ارمنستان","فرمانروایان عثمانی و روسیه","ایروان",2000000,80000],
["iceland","ایسلند تحت تاج دانمارک","کریستیان دهم","ریکیاویک",85000,30000],
["malta","مالت بریتانیا","فرماندار بریتانیایی","والتا",200000,40000],
["cyprus","قبرس بریتانیا","فرماندار بریتانیایی","نیکوزیا",250000,40000],
["monaco","شاهزاده‌نشین موناکو","آلبرت یکم","موناکو",20000,20000],
["liechtenstein","شاهزاده‌نشین لیختن‌اشتاین","یوهان دوم","فادوتس",10000,10000],
["san_marino","جمهوری سان‌مارینو","کاپیتان‌های نایب","سان‌مارینو",12000,10000],
["vatican","دولت پاپی","پاپ پیوس دهم","واتیکان",1000,10000],
["tanzania","آفریقای شرقی آلمان","فرماندار آلمانی","دارالسلام",7500000,120000],
["namibia","آفریقای جنوب غربی آلمان","فرماندار آلمانی","ویندهوک",800000,50000],
["cameroon","کامِرون آلمان","فرماندار آلمانی","دوالا",2500000,70000],
["togo","توگولند آلمان","فرماندار آلمانی","لومه",1000000,40000],
["sudan","سودان انگلیس و مصر","فرماندار مشترک","خارطوم",3000000,80000],
["senegal","سنگال فرانسه","فرماندار فرانسوی","سن‌لوئی",1000000,50000],
["libya","طرابلس و برقه‌ی عثمانی","فرماندار عثمانی","طرابلس",1500000,80000],
["iraq","ولایت‌های عثمانی در عراق","فرمانروای عثمانی","بغداد",5000000,150000],
["syria","ولایت‌های عثمانی در شام","فرمانروای عثمانی","دمشق",4000000,130000],
["lebanon","متصرفات لبنان عثمانی","متصرف عثمانی","بیروت",400000,50000],
["palestine","ولایت فلسطین عثمانی","فرمانروای عثمانی","قدس",600000,70000],
["kurdistan","سرزمین‌های کردنشین عثمانی و ایران","حاکمان محلی","موصل",3000000,80000]];
const country=id=>countries.find(c=>c[0]===id), money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Math.round(Number(n)||0)), fmt=n=>Math.round(Number(n)||0).toLocaleString("fa-IR");
const K=rows=>new InlineKeyboard(rows), main=()=>K([[{text:"🏛️ دربار و کشور",callback_data:"m:n"}],[{text:"📜 تسویه‌ی نوبت",callback_data:"turn"}],[{text:"📚 راهنما",callback_data:"help"}]]);
const nation=()=>K([[{text:"📊 وضعیت کشور",callback_data:"n:status"},{text:"💰 خزانه و دفتر حساب",callback_data:"n:money"}],[{text:"🧾 مالیات و تعرفه",callback_data:"n:tax"},{text:"🏭 تولید و منابع",callback_data:"n:industry"}],[{text:"👥 جمعیت و خدمات",callback_data:"n:people"},{text:"🛡️ ارتش و ناوگان",callback_data:"n:army"}],[{text:"🤝 دیپلماسی",callback_data:"n:diplomacy"},{text:"🛒 تجارت",callback_data:"n:trade"},{text:"📈 بازار بورس",callback_data:"n:stocks"},{text:"🛢️ نفت، طلا و غلات",callback_data:"n:commodities"}],[{text:"⚙️ تنظیمات اداره",callback_data:"n:settings"}],[{text:"↩️ منوی اصلی",callback_data:"m:main"}]]);
const back=()=>K([[{text:"↩️ بازگشت به دربار",callback_data:"m:n"}],[{text:"🏠 منوی اصلی",callback_data:"m:main"}]]);
async function db(){await pool.query(`
CREATE TABLE IF NOT EXISTS game_players(telegram_id BIGINT PRIMARY KEY,username TEXT,display_name TEXT NOT NULL,country_id TEXT,ruler TEXT,government TEXT,approved BOOLEAN DEFAULT FALSE,selected_country_id TEXT,treasury BIGINT DEFAULT 100000,population BIGINT DEFAULT 0,stability INT DEFAULT 60,legitimacy INT DEFAULT 55,tax_rate INT DEFAULT 10,tariff INT DEFAULT 5,industry INT DEFAULT 20,agriculture INT DEFAULT 30,grain BIGINT DEFAULT 10000,coal BIGINT DEFAULT 5000,iron BIGINT DEFAULT 3000,cloth BIGINT DEFAULT 2500,army INT DEFAULT 20,navy INT DEFAULT 5,morale INT DEFAULT 60,technology INT DEFAULT 10,infrastructure INT DEFAULT 20,education INT DEFAULT 15,health INT DEFAULT 15,wage BIGINT DEFAULT 100,service_budget BIGINT DEFAULT 1000,last_settlement TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS game_ledger(id BIGSERIAL PRIMARY KEY,telegram_id BIGINT,description TEXT,amount BIGINT,balance BIGINT,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS game_relations(player_id BIGINT,other_id BIGINT,relation TEXT DEFAULT 'neutral',trust INT DEFAULT 0,PRIMARY KEY(player_id,other_id));
CREATE TABLE IF NOT EXISTS game_trade(id BIGSERIAL PRIMARY KEY,seller_id BIGINT,buyer_id BIGINT,resource TEXT,quantity BIGINT,unit_price BIGINT,status TEXT DEFAULT 'open',created_at TIMESTAMPTZ DEFAULT NOW());
 ALTER TABLE game_players ADD COLUMN IF NOT EXISTS selected_country_id TEXT;
 CREATE TABLE IF NOT EXISTS game_country_requests(id BIGSERIAL PRIMARY KEY,telegram_id BIGINT NOT NULL,country_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT NOW(),processed_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS game_country_requests_pending_idx ON game_country_requests(telegram_id,status);
 CREATE TABLE IF NOT EXISTS game_stocks(symbol TEXT PRIMARY KEY,name TEXT NOT NULL,price BIGINT NOT NULL,change_pct NUMERIC(8,2) DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS game_stock_holdings(telegram_id BIGINT NOT NULL,symbol TEXT NOT NULL REFERENCES game_stocks(symbol),shares BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(telegram_id,symbol));
 CREATE TABLE IF NOT EXISTS game_commodities(symbol TEXT PRIMARY KEY,name TEXT NOT NULL,price BIGINT NOT NULL,change_pct NUMERIC(8,2) DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS game_commodity_holdings(telegram_id BIGINT NOT NULL,symbol TEXT NOT NULL REFERENCES game_commodities(symbol),units BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(telegram_id,symbol));
 INSERT INTO game_commodities(symbol,name,price) VALUES('OIL','نفت خام (هر بشکه)',75),('GOLD','طلا (هر اونس)',1800),('GRAIN','غلات (هر واحد)',40) ON CONFLICT(symbol) DO NOTHING;
 INSERT INTO game_stocks(symbol,name,price) VALUES('IND','صنایع و فولاد',120),('RAIL','راه‌آهن و زیرساخت',85),('OIL','نفت و انرژی',150),('BANK','بانکداری و مالی',100),('FOOD','کشاورزی و غلات',65),('SHIP','کشتیرانی و تجارت',95) ON CONFLICT(symbol) DO NOTHING;`);}
async function refreshCommodities(){await pool.query("WITH due AS (SELECT symbol,price FROM game_commodities WHERE updated_at<NOW()-INTERVAL '15 minutes'), changed AS (SELECT symbol,price,GREATEST(1,ROUND(price*(1+(random()*0.06-0.03)))::bigint) AS new_price FROM due) UPDATE game_commodities c SET price=x.new_price,change_pct=ROUND(((x.new_price-x.price)::numeric/NULLIF(x.price,0))*100,2),updated_at=NOW() FROM changed x WHERE c.symbol=x.symbol");}
async function refreshStocks(){await pool.query("WITH due AS (SELECT symbol,price FROM game_stocks WHERE updated_at<NOW()-INTERVAL '15 minutes'), changed AS (SELECT symbol,price,GREATEST(1,ROUND(price*(1+(random()*0.10-0.05)))::bigint) AS new_price FROM due) UPDATE game_stocks s SET price=c.new_price,change_pct=ROUND(((c.new_price-c.price)::numeric/NULLIF(c.price,0))*100,2),updated_at=NOW() FROM changed c WHERE s.symbol=c.symbol");}
async function get(id){return (await pool.query("SELECT * FROM game_players WHERE telegram_id=$1",[id])).rows[0];}
async function ensure(ctx){await pool.query("INSERT INTO game_players(telegram_id,username,display_name) VALUES($1,$2,$3) ON CONFLICT(telegram_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name",[ctx.from.id,ctx.from.username||null,[ctx.from.first_name,ctx.from.last_name].filter(Boolean).join(" ")||"فرمانروا"]);return get(ctx.from.id);}
async function say(ctx,text,markup=main()){await ctx.reply(text,{reply_markup:markup,parse_mode:"HTML"});}
async function edit(ctx,text,markup=main()){try{await ctx.editMessageText(text,{reply_markup:markup,parse_mode:"HTML"});}catch(e){if(!String(e).includes("message is not modified"))await say(ctx,text,markup);}}
async function ready(ctx){const p=await get(ctx.from.id);if(!p?.approved){await say(ctx,"برای آغاز بازی از /start استفاده کنید.");return null;}return p;}
function calc(p){const taxable=Math.max(10000,Number(p.population)/100),tax=taxable*p.tax_rate/100,production=p.industry*1200+p.agriculture*800,tariff=p.tariff*500,wages=p.population/1000*p.wage,army=p.army*900+p.navy*1400,services=Number(p.service_budget),roads=p.infrastructure*250,upkeep=p.industry*300+p.agriculture*150;return {income:tax+production+tariff,expense:wages+army+services+roads+upkeep,tax,production,tariff,wages,army,services,roads,upkeep};}
async function status(p){const c=country(p.country_id),d=calc(p);return `<b>📊 وضعیت کشور — ${c?.[1]}</b>\n👑 ${p.ruler}\n\n<b>مالی</b>\n💰 خزانه: ${money(p.treasury)}\n📈 درآمد روزانه: ${money(d.income)}\n📉 هزینه‌ی روزانه: ${money(d.expense)}\n🧮 خالص روزانه: ${money(d.income-d.expense)}\n\n<b>کشور</b>\n👥 جمعیت: ${fmt(p.population)}\n🏛 ثبات: ${p.stability}٪ | مشروعیت: ${p.legitimacy}٪\n🏭 صنعت: ${p.industry} | 🌾 کشاورزی: ${p.agriculture}\n🌾 غله: ${fmt(p.grain)} | 🪨 زغال: ${fmt(p.coal)}\n⛓ آهن: ${fmt(p.iron)} | 🧵 پارچه: ${fmt(p.cloth)}\n🧠 فناوری: ${p.technology} | 🛤 زیرساخت: ${p.infrastructure}\n\n<b>نیروهای مسلح</b>\n🪖 ارتش: ${p.army} | ⚓ ناوگان: ${p.navy} | روحیه: ${p.morale}٪`;}
const continentNames={europe:"🌍 اروپا",asia:"🌏 آسیا",africa:"🌍 آفریقا",north_america:"🌎 آمریکای شمالی",south_america:"🌎 آمریکای جنوبی",oceania:"🌏 اقیانوسیه"};
const continentSets={
europe:"ottoman germany russia austria britain france italy serbia bulgaria romania belgium netherlands portugal greece montenegro albania denmark sweden norway switzerland luxembourg ireland finland poland ukraine croatia czech slovakia hungary ireland_home iceland malta cyprus monaco liechtenstein san_marino vatican",
asia:"persia japan china siam afghanistan korea vietnam philippines indonesia india russia_caucasus azerbaijan georgia armenia nepal bhutan oman yemen qatar kuwait bahrain uae saudi mongolia manchuria taiwan burma malaya cambodia laos persian_gulf libya iraq syria lebanon palestine kurdistan",
africa:"ethiopia liberia egypt morocco south_africa tanzania namibia cameroon togo ghana nigeria kenya uganda sudan senegal algeria tunisia madagascar angola mozambique congo",
north_america:"usa canada mexico cuba haiti dominican guatemala honduras el_salvador nicaragua costa_rica panama",
south_america:"brazil argentina chile bolivia uruguay venezuela peru paraguay ecuador colombia",
oceania:"australia new_zealand"};
const continentOf=id=>Object.keys(continentSets).find(k=>continentSets[k].split(" ").includes(id))||"asia";
const countryMenu=async(ctx,continent="all",page=0,editMode=false)=>{
 const filtered=countries.filter(c=>continent==="all"||continentOf(c[0])===continent).sort((a,b)=>a[1].localeCompare(b[1],"fa"));
 const size=8,total=Math.max(1,Math.ceil(filtered.length/size)),p=Math.max(0,Math.min(page,total-1)),items=filtered.slice(p*size,(p+1)*size);
 const rows=items.map(c=>[{text:c[1],callback_data:"c:"+c[0]}]);
 const nav=[];if(p>0)nav.push({text:"⬅️ قبلی",callback_data:"cp:"+continent+":"+(p-1)});nav.push({text:"صفحه "+(p+1)+"/"+total,callback_data:"noop"});if(p<total-1)nav.push({text:"بعدی ➡️",callback_data:"cp:"+continent+":"+(p+1)});rows.push(nav);
 rows.push([{text:"🔎 جستجوی کشور",callback_data:"cs"}]);
 rows.push([{text:"↩️ قاره‌ها",callback_data:"start"}],[{text:"لغو",callback_data:"m:main"}]);
 const title=continent==="all"?"همه‌ی کشورها":continentNames[continent];
 const text="<b>مرحله ۱ از ۳ — انتخاب کشور</b>\n\nسناریو: سال ۱۹۱۴\nقاره: "+title+"\nکشورها: "+filtered.length+"\n\nکشور مورد نظر را انتخاب کنید:";
 if(editMode)await edit(ctx,text,K(rows));else await say(ctx,text,K(rows));
};
async function chooseCountry(ctx){await say(ctx,"<b>مرحله ۱ از ۳ — انتخاب کشور</b>\n\nسناریوی تاریخی سال ۱۹۱۴. ابتدا قاره را انتخاب کنید یا در میان همه‌ی کشورها جستجو کنید:",K([[{text:continentNames.europe,callback_data:"cc:europe"},{text:continentNames.asia,callback_data:"cc:asia"}],[{text:continentNames.africa,callback_data:"cc:africa"},{text:continentNames.north_america,callback_data:"cc:north_america"}],[{text:continentNames.south_america,callback_data:"cc:south_america"},{text:continentNames.oceania,callback_data:"cc:oceania"}],[{text:"🌐 همه‌ی کشورها",callback_data:"cc:all"}],[{text:"🔎 جستجوی کشور",callback_data:"cs"}],[{text:"لغو",callback_data:"m:main"}]]));}
const pendingCountrySearch=new Set();
bot.command("start",async ctx=>{const p=await ensure(ctx);if(p.approved){await say(ctx,"به شاه شاهان بازگشتید. از دربار کشور را اداره کنید.",nation());return;}await say(ctx,"<b>شاه شاهان</b>\n\nبازی راهبرد و اداره‌ی کشور در جهان تاریخی سال ۱۹۱۴.\n\nبرای آغاز حکومت، کشور خود را انتخاب کنید.",K([[{text:"📜 آغاز بازی",callback_data:"start"}],[{text:"🏛️ منوی بازی",callback_data:"m:main"}]]));});
bot.command("myid",async ctx=>{await ctx.reply("Telegram ID: "+ctx.from.id);});
bot.command("menu",async ctx=>{await ensure(ctx);await say(ctx,"منوی اصلی شاه شاهان",main());});
bot.command("status",async ctx=>{const p=await ready(ctx);if(p)await say(ctx,await status(p),nation());});
bot.command("help",async ctx=>{await say(ctx,"<b>راهنمای بازی</b>\n۱) کشور را انتخاب و تأسیس کنید.\n۲) مالیات، تولید، خدمات و ارتش را از دربار اداره کنید.\n۳) هر سه ساعت یک نوبت مالی تسویه می‌شود.\n۴) با دیگر فرمانروایان تجارت و پیمان برقرار کنید.",main());});
bot.callbackQuery(/^start$/,async ctx=>{await ctx.answerCallbackQuery();await chooseCountry(ctx);});
bot.callbackQuery(/^cc:(all|europe|asia|africa|north_america|south_america|oceania)$/,async ctx=>{await ctx.answerCallbackQuery();await countryMenu(ctx,ctx.match[1],0,true);});
bot.callbackQuery(/^cp:(all|europe|asia|africa|north_america|south_america|oceania):(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();await countryMenu(ctx,ctx.match[1],Number(ctx.match[2]),true);});
bot.callbackQuery(/^cs$/,async ctx=>{await ctx.answerCallbackQuery();pendingCountrySearch.add(ctx.from.id);await ctx.reply("🔎 <b>جستجوی کشور</b>\n\nنام کشور یا بخشی از نام آن را ارسال کنید. برای لغو، /cancel را بفرستید.",{parse_mode:"HTML",reply_markup:{force_reply:true,selective:true}});});
bot.callbackQuery(/^noop$/,async ctx=>{await ctx.answerCallbackQuery();});
bot.command("cancel",async ctx=>{pendingCountrySearch.delete(ctx.from.id);await say(ctx,"جستجو لغو شد.",main());});
bot.on("message:text",async ctx=>{if(!pendingCountrySearch.has(ctx.from.id)||ctx.message.text.startsWith("/"))return;pendingCountrySearch.delete(ctx.from.id);const q=ctx.message.text.trim().toLocaleLowerCase("fa");const matches=countries.filter(c=>(c[1]+" "+c[0]+" "+c[2]).toLocaleLowerCase("fa").includes(q)).sort((a,b)=>a[1].localeCompare(b[1],"fa")).slice(0,20);if(!matches.length){await say(ctx,"کشوری با این عبارت پیدا نشد. دوباره جستجو کنید.",K([[{text:"🔎 جستجوی دوباره",callback_data:"cs"}],[{text:"↩️ قاره‌ها",callback_data:"start"}]]));return;}const rows=matches.map(c=>[{text:c[1],callback_data:"c:"+c[0]}]);rows.push([{text:"🔎 جستجوی دوباره",callback_data:"cs"}],[{text:"↩️ قاره‌ها",callback_data:"start"}]);await say(ctx,"<b>نتایج جستجو</b>\n\nنتایج: "+matches.length,K(rows));});
bot.callbackQuery(/^c:(.+)$/,async ctx=>{await ctx.answerCallbackQuery();const c=country(ctx.match[1]);if(!c)return;await pool.query("UPDATE game_players SET selected_country_id=$2 WHERE telegram_id=$1 AND approved=FALSE",[ctx.from.id,c[0]]);await say(ctx,"<b>تأیید انتخاب کشور</b>\n\nآیا می‌خواهید درخواست تصاحب این کشور را برای مدیر بازی ارسال کنید؟\n\nنام و مشخصات کشور تا زمان تأیید نمایش داده نمی‌شود.",K([[{text:"✅ تأیید و ارسال درخواست",callback_data:"request_country"}],[{text:"🔄 انتخاب دوباره",callback_data:"start"}]]));});
bot.callbackQuery(/^request_country$/,async ctx=>{await ctx.answerCallbackQuery();const p=await get(ctx.from.id);if(!p||p.approved||!p.selected_country_id){await say(ctx,"ابتدا یک کشور انتخاب کنید.",K([[{text:"انتخاب کشور",callback_data:"start"}]]));return;}const pending=(await pool.query("SELECT id FROM game_country_requests WHERE telegram_id=$1 AND status='pending' ORDER BY id DESC LIMIT 1",[ctx.from.id])).rows[0];if(pending){await say(ctx,"درخواست شما قبلاً ارسال شده و در انتظار بررسی مدیر است.");return;}const c=country(p.selected_country_id);if(!c)return;const req=(await pool.query("INSERT INTO game_country_requests(telegram_id,country_id) VALUES($1,$2) RETURNING id",[ctx.from.id,c[0]])).rows[0];const playerName=[ctx.from.first_name,ctx.from.last_name].filter(Boolean).join(" ")||"Player";try{await bot.api.sendMessage(ownerTelegramId,"🏛 درخواست تصاحب کشور — شاه شاهان\n\n👤 بازیکن: "+playerName+"\n🆔 شناسه: "+ctx.from.id+"\n🌐 کشور: "+c[1]+"\n👑 فرمانروا: "+c[2]+"\n🏙 پایتخت: "+c[3]+"\n👥 جمعیت: "+fmt(c[4])+"\n💵 خزانه‌ی آغازین: "+money(c[5]),{reply_markup:K([[{text:"✅ تأیید و واگذاری",callback_data:"approve_country:"+req.id}],[{text:"❌ رد درخواست",callback_data:"reject_country:"+req.id}]])});}catch(e){await pool.query("UPDATE game_country_requests SET status='delivery_failed',processed_at=NOW() WHERE id=$1",[req.id]);await say(ctx,"ارسال درخواست به مدیر بازی انجام نشد. لطفاً بعداً تلاش کنید.");return;}await say(ctx,"📨 درخواست شما برای مدیر بازی ارسال شد. پس از بررسی، نتیجه اعلام می‌شود.");});
bot.callbackQuery(/^approve_country:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();if(String(ctx.from.id)!==ownerTelegramId){await say(ctx,"این عملیات فقط برای مدیر بازی مجاز است.");return;}const id=Number(ctx.match[1]),client=await pool.connect();try{await client.query("BEGIN");const req=(await client.query("SELECT * FROM game_country_requests WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!req||req.status!=="pending"){await client.query("ROLLBACK");await say(ctx,"این درخواست قبلاً بررسی شده یا وجود ندارد.");return;}const c=country(req.country_id);if(!c){await client.query("ROLLBACK");await say(ctx,"کشور پیدا نشد.");return;}const taken=(await client.query("SELECT telegram_id FROM game_players WHERE country_id=$1 AND approved=TRUE AND telegram_id<>$2 LIMIT 1",[c[0],req.telegram_id])).rows[0];if(taken){await client.query("UPDATE game_country_requests SET status='rejected',processed_at=NOW() WHERE id=$1",[id]);await client.query("COMMIT");try{await bot.api.sendMessage(req.telegram_id,"❌ این کشور قبلاً واگذار شده است؛ درخواست رد شد.");}catch{}await say(ctx,"کشور قبلاً واگذار شده بود؛ درخواست رد شد.");return;}await client.query("UPDATE game_players SET country_id=$2,ruler=$3,government=$4,population=$5,treasury=$6,approved=TRUE,last_settlement=NOW() WHERE telegram_id=$1",[req.telegram_id,c[0],c[2],c[1],c[4],c[5]]);await client.query("UPDATE game_country_requests SET status='approved',processed_at=NOW() WHERE id=$1",[id]);await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,'خزانه‌ی آغاز حکومت',$2,$2)",[req.telegram_id,c[5]]);await client.query("COMMIT");try{await bot.api.sendMessage(req.telegram_id,"✅ درخواست کشور شما تأیید شد.\n\nحکومت شما در "+c[1]+" آغاز شد.",{reply_markup:nation()});}catch{}await edit(ctx,"✅ درخواست تأیید شد و کشور واگذار شد.");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^reject_country:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();if(String(ctx.from.id)!==ownerTelegramId){await say(ctx,"این عملیات فقط برای مدیر بازی مجاز است.");return;}const id=Number(ctx.match[1]);const req=(await pool.query("UPDATE game_country_requests SET status='rejected',processed_at=NOW() WHERE id=$1 AND status='pending' RETURNING telegram_id",[id])).rows[0];if(!req){await say(ctx,"این درخواست قبلاً بررسی شده یا وجود ندارد.");return;}try{await bot.api.sendMessage(req.telegram_id,"❌ درخواست تصاحب کشور شما رد شد. می‌توانید کشور دیگری انتخاب کنید.",{reply_markup:K([[{text:"🌍 انتخاب کشور دیگر",callback_data:"start"}]])});}catch{}await edit(ctx,"❌ درخواست رد شد. بازیکن مطلع شد.");});bot.callbackQuery(/^m:(main|n)$/,async ctx=>{await ctx.answerCallbackQuery();await edit(ctx,ctx.match[1]==="n"?"<b>🏛️ دربار و کشور</b>\nبخش مورد نظر را انتخاب کنید.":"منوی اصلی شاه شاهان",ctx.match[1]==="n"?nation():main());});
bot.callbackQuery(/^help$/,async ctx=>{await ctx.answerCallbackQuery();await edit(ctx,"<b>راهنمای شاه شاهان</b>\nکشور تاریخی انتخاب کنید، خزانه را مدیریت کنید و با تصمیم‌های مرحله‌ای بر آینده‌ی حکومت اثر بگذارید.",main());});
bot.callbackQuery(/^n:(status|money|tax|industry|people|army|diplomacy|trade|settings|stocks|commodities)$/,async ctx=>{
await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const s=ctx.match[1],d=calc(p);
if(s==="status")return edit(ctx,await status(p),nation());
if(s==="money")return edit(ctx,`<b>💰 خزانه و دفتر حساب</b>\nمانده: ${money(p.treasury)}\nدرآمد روزانه: ${money(d.income)}\nهزینه‌ی روزانه: ${money(d.expense)}\n\nهر سه ساعت یک‌هشتم خالص روزانه تسویه می‌شود.`,K([[{text:"📒 دفتر حساب",callback_data:"ledger"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="tax")return edit(ctx,`<b>🧾 مالیات و تعرفه</b>\nمالیات: ${p.tax_rate}٪ | تعرفه: ${p.tariff}٪\n\nمالیات بیشتر درآمد را افزایش می‌دهد اما ثبات و مشروعیت را کاهش می‌دهد.`,K([[{text:"➖ مالیات",callback_data:"adj:tax:-1"},{text:"➕ مالیات",callback_data:"adj:tax:1"}],[{text:"➖ تعرفه",callback_data:"adj:tariff:-1"},{text:"➕ تعرفه",callback_data:"adj:tariff:1"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="industry")return edit(ctx,`<b>🏭 تولید و منابع</b>\nصنعت: ${p.industry} | کشاورزی: ${p.agriculture}\nغله: ${p.grain} | زغال: ${p.coal} | آهن: ${p.iron} | پارچه: ${p.cloth}\n\nتوسعه‌ی هر واحد نیازمند خزانه و مواد اولیه است.`,K([[{text:"🏭 توسعه‌ی صنعت",callback_data:"build:industry"}],[{text:"🌾 توسعه‌ی کشاورزی",callback_data:"build:agriculture"}],[{text:"🛤 بهبود زیرساخت",callback_data:"build:infrastructure"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="people")return edit(ctx,`<b>👥 جمعیت و خدمات</b>\nجمعیت: ${fmt(p.population)}\nآموزش: ${p.education} | سلامت: ${p.health}\nحقوق متوسط: ${money(p.wage)}\nبودجه‌ی خدمات روزانه: ${money(p.service_budget)}`,K([[{text:"➖ حقوق",callback_data:"adj:wage:-10"},{text:"➕ حقوق",callback_data:"adj:wage:10"}],[{text:"➖ خدمات",callback_data:"adj:service_budget:-100"},{text:"➕ خدمات",callback_data:"adj:service_budget:100"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="army")return edit(ctx,`<b>🛡️ ارتش و ناوگان</b>\nارتش: ${p.army} | ناوگان: ${p.navy}\nروحیه: ${p.morale}٪\nهزینه‌ی نگهداری روزانه: ${money(p.army*900+p.navy*1400)}`,K([[{text:"🪖 جذب ارتش",callback_data:"mil:army"}],[{text:"⚓ ساخت ناوگان",callback_data:"mil:navy"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="settings")return edit(ctx,"<b>⚙️ تنظیمات اداره</b>\nمقادیر مالیات، تعرفه، حقوق و بودجه‌ی خدمات را با دکمه‌های + و − تغییر دهید.",K([[{text:"➖ مالیات",callback_data:"adj:tax:-1"},{text:"➕ مالیات",callback_data:"adj:tax:1"}],[{text:"➖ تعرفه",callback_data:"adj:tariff:-1"},{text:"➕ تعرفه",callback_data:"adj:tariff:1"}],[{text:"➖ حقوق",callback_data:"adj:wage:-10"},{text:"➕ حقوق",callback_data:"adj:wage:10"}],[{text:"➖ خدمات",callback_data:"adj:service_budget:-100"},{text:"➕ خدمات",callback_data:"adj:service_budget:100"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]]));
if(s==="diplomacy"){const r=await pool.query("SELECT telegram_id,display_name,country_id FROM game_players WHERE approved=TRUE AND telegram_id<>$1 LIMIT 15",[ctx.from.id]);const rows=r.rows.map(x=>[{text:x.display_name+" — "+(country(x.country_id)?.[1]||"کشور"),callback_data:"dip:"+x.telegram_id}]);rows.push([{text:"↩️ بازگشت",callback_data:"m:n"}]);return edit(ctx,"<b>🤝 دیپلماسی</b>\nفرمانروا را برای پیشنهاد پیمان انتخاب کنید:",K(rows));}
if(s==="commodities"){await refreshCommodities();const r=await pool.query("SELECT c.*,COALESCE(h.units,0) AS units FROM game_commodities c LEFT JOIN game_commodity_holdings h ON h.symbol=c.symbol AND h.telegram_id=$1 ORDER BY c.symbol",[ctx.from.id]);const rows=r.rows.map(x=>[{text:x.name+" — "+money(x.price)+" | "+(Number(x.change_pct)>=0?"+":"")+x.change_pct+"% | موجودی: "+fmt(x.units),callback_data:"commodity:"+x.symbol}]);rows.push([{text:"📦 سبد کالاهای من",callback_data:"commodityportfolio"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]);return edit(ctx,"<b>🛢️ بازار کالاها</b>\\nنفت، طلا و غلات با قیمت دلاری؛ قیمت‌ها هر ۱۵ دقیقه نوسان می‌کنند.",K(rows));}if(s==="stocks"){await refreshStocks();const r=await pool.query("SELECT * FROM game_stocks ORDER BY symbol");const rows=r.rows.map(x=>[{text:x.name+" ("+x.symbol+") — "+money(x.price)+" | "+(Number(x.change_pct)>=0?"+":"")+x.change_pct+"%",callback_data:"stock:"+x.symbol}]);rows.push([{text:"💼 سبد سهام من",callback_data:"portfolio"}],[{text:"↩️ بازگشت",callback_data:"m:n"}]);return edit(ctx,"<b>📈 بورس شاه شاهان</b>\nقیمت‌ها به دلار هستند و هر ۱۵ دقیقه تغییر می‌کنند.",K(rows));}if(s==="trade"){const r=await pool.query("SELECT t.*,p.display_name FROM game_trade t JOIN game_players p ON p.telegram_id=t.seller_id WHERE t.status='open' AND t.seller_id<>$1 ORDER BY t.id DESC LIMIT 8",[ctx.from.id]);const rows=r.rows.map(t=>[{text:`${t.display_name}: ${t.resource} ×${t.quantity} / ${money(t.unit_price)}`,callback_data:"buy:"+t.id}]);for(const res of ["grain","coal","iron","cloth"])rows.push([{text:"📦 عرضه‌ی "+res+" (۱۰۰)",callback_data:"sell:"+res}]);rows.push([{text:"↩️ بازگشت",callback_data:"m:n"}]);return edit(ctx,"<b>🛒 تجارت میان کشورها</b>\nپیشنهادها را بخرید یا منابع خود را عرضه کنید.",K(rows));}
});
bot.callbackQuery(/^commodity:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;await refreshCommodities();const r=await pool.query("SELECT c.*,COALESCE(h.units,0) AS units FROM game_commodities c LEFT JOIN game_commodity_holdings h ON h.symbol=c.symbol AND h.telegram_id=$1 WHERE c.symbol=$2",[ctx.from.id,ctx.match[1]]);const x=r.rows[0];if(!x){await say(ctx,"کالا پیدا نشد.",nation());return;}await edit(ctx,"<b>"+x.name+"</b>\\nقیمت هر واحد: "+money(x.price)+"\\nتغییر: "+x.change_pct+"٪\\nموجودی شما: "+fmt(x.units),K([[{text:"🟢 خرید ۱ واحد",callback_data:"commoditybuy:"+x.symbol}],[{text:"🔴 فروش ۱ واحد",callback_data:"commoditysell:"+x.symbol}],[{text:"↩️ بازگشت به بازار کالا",callback_data:"n:commodities"}]]));});
bot.callbackQuery(/^commoditybuy:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const client=await pool.connect();try{await client.query("BEGIN");const c=(await client.query("SELECT * FROM game_commodities WHERE symbol=$1 FOR UPDATE",[ctx.match[1]])).rows[0];const pl=(await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE",[ctx.from.id])).rows[0];if(!c||!pl||Number(pl.treasury)<Number(c.price)){await client.query("ROLLBACK");await say(ctx,"کالا موجود نیست یا خزانه برای خرید کافی نیست.",nation());return;}const bal=Number(pl.treasury)-Number(c.price);await client.query("UPDATE game_players SET treasury=$2 WHERE telegram_id=$1",[ctx.from.id,bal]);await client.query("INSERT INTO game_commodity_holdings(telegram_id,symbol,units) VALUES($1,$2,1) ON CONFLICT(telegram_id,symbol) DO UPDATE SET units=game_commodity_holdings.units+1",[ctx.from.id,c.symbol]);await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[ctx.from.id,"خرید کالای "+c.symbol,-Number(c.price),bal]);await client.query("COMMIT");await say(ctx,"خرید انجام شد؛ "+money(c.price)+" از خزانه کسر شد.",K([[{text:"🛢️ ادامه در بازار کالا",callback_data:"n:commodities"}],[{text:"🏛️ بازگشت به دربار",callback_data:"m:n"}]]));}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^commoditysell:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const client=await pool.connect();try{await client.query("BEGIN");const c=(await client.query("SELECT * FROM game_commodities WHERE symbol=$1 FOR UPDATE",[ctx.match[1]])).rows[0];const h=(await client.query("SELECT units FROM game_commodity_holdings WHERE telegram_id=$1 AND symbol=$2 FOR UPDATE",[ctx.from.id,ctx.match[1]])).rows[0];const pl=(await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE",[ctx.from.id])).rows[0];if(!c||!h||Number(h.units)<1||!pl){await client.query("ROLLBACK");await say(ctx,"برای فروش، موجودی کافی ندارید.",nation());return;}const bal=Number(pl.treasury)+Number(c.price);await client.query("UPDATE game_commodity_holdings SET units=units-1 WHERE telegram_id=$1 AND symbol=$2",[ctx.from.id,c.symbol]);await client.query("UPDATE game_players SET treasury=$2 WHERE telegram_id=$1",[ctx.from.id,bal]);await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[ctx.from.id,"فروش کالای "+c.symbol,Number(c.price),bal]);await client.query("COMMIT");await say(ctx,"فروش انجام شد؛ "+money(c.price)+" به خزانه افزوده شد.",K([[{text:"🛢️ ادامه در بازار کالا",callback_data:"n:commodities"}],[{text:"🏛️ بازگشت به دربار",callback_data:"m:n"}]]));}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^commodityportfolio$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;await refreshCommodities();const r=await pool.query("SELECT h.symbol,h.units,c.name,c.price,h.units*c.price AS value FROM game_commodity_holdings h JOIN game_commodities c ON c.symbol=h.symbol WHERE h.telegram_id=$1 AND h.units>0 ORDER BY value DESC",[ctx.from.id]);await edit(ctx,r.rows.length?"<b>📦 سبد کالاهای شما</b>\\n\\n"+r.rows.map(x=>x.name+"\\nتعداد: "+fmt(x.units)+" | ارزش فعلی: "+money(x.value)).join("\\n\\n"):"سبد کالاهای شما خالی است.",K([[{text:"🛢️ بازگشت به بازار کالا",callback_data:"n:commodities"}],[{text:"↩️ بازگشت به دربار",callback_data:"m:n"}]]));});
bot.callbackQuery(/^stock:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;await refreshStocks();const r=await pool.query("SELECT s.*,COALESCE(h.shares,0) AS shares FROM game_stocks s LEFT JOIN game_stock_holdings h ON h.symbol=s.symbol AND h.telegram_id=$1 WHERE s.symbol=$2",[ctx.from.id,ctx.match[1]]);const x=r.rows[0];if(!x){await say(ctx,"نماد پیدا نشد.",nation());return;}await edit(ctx,"<b>"+x.name+" ("+x.symbol+")</b>\\nقیمت هر سهم: "+money(x.price)+"\\nتغییر: "+x.change_pct+"٪\\nسهام شما: "+fmt(x.shares),K([[{text:"🟢 خرید ۱ سهم",callback_data:"stockbuy:"+x.symbol}],[{text:"🔴 فروش ۱ سهم",callback_data:"stocksell:"+x.symbol}],[{text:"↩️ بازگشت به بورس",callback_data:"n:stocks"}]]));});
bot.callbackQuery(/^stockbuy:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const client=await pool.connect();try{await client.query("BEGIN");const st=(await client.query("SELECT * FROM game_stocks WHERE symbol=$1 FOR UPDATE",[ctx.match[1]])).rows[0];const pl=(await client.query("SELECT treasury FROM game_players WHERE telegram_id=$1 FOR UPDATE",[ctx.from.id])).rows[0];if(!st||!pl||Number(pl.treasury)<Number(st.price)){await client.query("ROLLBACK");await say(ctx,"نماد در دسترس نیست یا خزانه برای خرید سهم کافی نیست.",nation());return;}await client.query("UPDATE game_players SET treasury=treasury-$2 WHERE telegram_id=$1",[ctx.from.id,st.price]);await client.query("INSERT INTO game_stock_holdings(telegram_id,symbol,shares) VALUES($1,$2,1) ON CONFLICT(telegram_id,symbol) DO UPDATE SET shares=game_stock_holdings.shares+1",[ctx.from.id,st.symbol]);await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[ctx.from.id,"خرید سهم "+st.symbol,-Number(st.price),Number(pl.treasury)-Number(st.price)]);await client.query("COMMIT");await say(ctx,"✅ یک سهم "+st.symbol+" خریداری شد؛ مبلغ "+money(st.price)+" از خزانه کسر شد.",K([[{text:"📈 ادامه در بورس",callback_data:"n:stocks"}],[{text:"🏛 بازگشت به دربار",callback_data:"m:n"}]]));}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^stocksell:([A-Z]+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const client=await pool.connect();try{await client.query("BEGIN");const st=(await client.query("SELECT * FROM game_stocks WHERE symbol=$1 FOR UPDATE",[ctx.match[1]])).rows[0];const h=(await client.query("SELECT shares FROM game_stock_holdings WHERE telegram_id=$1 AND symbol=$2 FOR UPDATE",[ctx.from.id,ctx.match[1]])).rows[0];if(!st||!h||Number(h.shares)<1){await client.query("ROLLBACK");await say(ctx,"برای فروش، سهمی از این نماد در سبد شما نیست.",nation());return;}await client.query("UPDATE game_stock_holdings SET shares=shares-1 WHERE telegram_id=$1 AND symbol=$2",[ctx.from.id,st.symbol]);await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1",[ctx.from.id,st.price]);const balance=Number(p.treasury)+Number(st.price);await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[ctx.from.id,"فروش سهم "+st.symbol,Number(st.price),balance]);await client.query("COMMIT");await say(ctx,"✅ یک سهم "+st.symbol+" فروخته شد؛ "+money(st.price)+" به خزانه افزوده شد.",K([[{text:"📈 ادامه در بورس",callback_data:"n:stocks"}],[{text:"🏛 بازگشت به دربار",callback_data:"m:n"}]]));}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^portfolio$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const r=await pool.query("SELECT h.symbol,h.shares,s.name,s.price,h.shares*s.price AS value FROM game_stock_holdings h JOIN game_stocks s ON s.symbol=h.symbol WHERE h.telegram_id=$1 AND h.shares>0 ORDER BY value DESC",[ctx.from.id]);await edit(ctx,r.rows.length?"<b>💼 سبد سهام</b>\\n\\n"+r.rows.map(x=>x.name+" ("+x.symbol+")\\nتعداد: "+fmt(x.shares)+" | ارزش: "+money(x.value)).join("\\n\\n"):"سبد سهام شما خالی است.",K([[{text:"📈 بازگشت به بورس",callback_data:"n:stocks"}],[{text:"↩️ بازگشت به دربار",callback_data:"m:n"}]]));});
bot.callbackQuery(/^adj:(tax|tariff|wage|service_budget):(-?\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const f=ctx.match[1],delta=Number(ctx.match[2]),lim={tax:[0,60],tariff:[0,50],wage:[10,10000],service_budget:[0,10000000]}[f],v=Math.max(lim[0],Math.min(lim[1],Number(p[f])+delta));const q=f==="tax"&&delta>0?"UPDATE game_players SET tax_rate=$2,stability=GREATEST(0,stability-1),legitimacy=GREATEST(0,legitimacy-1) WHERE telegram_id=$1":`UPDATE game_players SET ${f}=$2 WHERE telegram_id=$1`;await pool.query(q,[ctx.from.id,v]);await say(ctx,"تغییر سیاست ثبت شد.\n\n"+await status(await get(ctx.from.id)),nation());});
bot.callbackQuery(/^build:(industry|agriculture|infrastructure)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const f=ctx.match[1],cost=f==="industry"?5000:f==="agriculture"?3500:6000,need=f==="industry"?{iron:100,coal:150}:f==="agriculture"?{}:{iron:50};if(Number(p.treasury)<cost||Object.entries(need).some(([r,q])=>p[r]<q)){await say(ctx,"خزانه یا مواد اولیه کافی نیست.",nation());return;}const changes=[f+"="+f+"+1","treasury=treasury-"+cost,...Object.entries(need).map(([r,q])=>r+"="+r+"-"+q)];await pool.query("UPDATE game_players SET "+changes.join(",")+" WHERE telegram_id=$1",[ctx.from.id]);await pool.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[ctx.from.id,"پروژه‌ی توسعه‌ی "+f,-cost,p.treasury-cost]);await say(ctx,"پروژه تکمیل و هزینه در دفتر حساب ثبت شد.",nation());});
bot.callbackQuery(/^mil:(army|navy)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const f=ctx.match[1],cost=f==="army"?2500:5000;if(p.treasury<cost){await say(ctx,"خزانه کافی نیست.",nation());return;}await pool.query(`UPDATE game_players SET ${f}=${f}+1,treasury=treasury-$2 WHERE telegram_id=$1`,[ctx.from.id,cost]);await say(ctx,"واحد جدید به نیروهای کشور پیوست.",nation());});
bot.callbackQuery(/^ledger$/,async ctx=>{await ctx.answerCallbackQuery();const r=await pool.query("SELECT description,amount,balance FROM game_ledger WHERE telegram_id=$1 ORDER BY id DESC LIMIT 15",[ctx.from.id]);await edit(ctx,r.rows.length?"<b>📒 دفتر حساب</b>\n\n"+r.rows.map(x=>x.description+"\n"+money(x.amount)+" | مانده "+money(x.balance)).join("\n\n"):"دفتر حساب خالی است.",back());});
bot.callbackQuery(/^sell:(grain|coal|iron|cloth)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const res=ctx.match[1],qty=100,price={grain:25,coal:40,iron:60,cloth:35}[res];if(p[res]<qty){await say(ctx,"موجودی منبع کافی نیست.",nation());return;}await pool.query("UPDATE game_players SET "+res+"="+res+"-$2 WHERE telegram_id=$1",[ctx.from.id,qty]);await pool.query("INSERT INTO game_trade(seller_id,resource,quantity,unit_price) VALUES($1,$2,$3,$4)",[ctx.from.id,res,qty,price]);await say(ctx,"عرضه در بازار ثبت شد.",nation());});
bot.callbackQuery(/^buy:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;const client=await pool.connect();try{await client.query("BEGIN");const t=(await client.query("SELECT * FROM game_trade WHERE id=$1 AND status='open' FOR UPDATE",[Number(ctx.match[1])])).rows[0];if(!t||Number(t.seller_id)===Number(ctx.from.id)){await client.query("ROLLBACK");await say(ctx,"پیشنهاد دیگر موجود نیست.",nation());return;}const total=t.quantity*t.unit_price;if(p.treasury<total){await client.query("ROLLBACK");await say(ctx,"خزانه برای خرید کافی نیست.",nation());return;}await client.query("UPDATE game_players SET treasury=treasury-$2,"+t.resource+"="+t.resource+"+$3 WHERE telegram_id=$1",[ctx.from.id,total,t.quantity]);await client.query("UPDATE game_players SET treasury=treasury+$2 WHERE telegram_id=$1",[t.seller_id,total]);await client.query("UPDATE game_trade SET status='sold',buyer_id=$2 WHERE id=$1",[t.id,ctx.from.id]);await client.query("COMMIT");await say(ctx,"معامله انجام شد.",nation());}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
bot.callbackQuery(/^dip:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const other=Number(ctx.match[1]);await pool.query("INSERT INTO game_relations(player_id,other_id,relation) VALUES($1,$2,'proposal') ON CONFLICT(player_id,other_id) DO UPDATE SET relation='proposal'",[ctx.from.id,other]);try{await bot.api.sendMessage(other,"🤝 پیشنهاد پیمان همکاری دریافت کردید.",{reply_markup:K([[{text:"✅ پذیرش",callback_data:"dipaccept:"+ctx.from.id}],[{text:"❌ رد",callback_data:"dipreject:"+ctx.from.id}]])});}catch{}await say(ctx,"پیشنهاد پیمان ارسال شد.",nation());});
bot.callbackQuery(/^dip(accept|reject):(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const ok=ctx.match[1]==="accept",other=Number(ctx.match[2]),rel=ok?"alliance":"neutral";for(const [a,b] of [[ctx.from.id,other],[other,ctx.from.id]])await pool.query("INSERT INTO game_relations(player_id,other_id,relation,trust) VALUES($1,$2,$3,$4) ON CONFLICT(player_id,other_id) DO UPDATE SET relation=EXCLUDED.relation,trust=EXCLUDED.trust",[a,b,rel,ok?20:0]);try{await bot.api.sendMessage(other,ok?"🤝 پیمان پذیرفته شد.":"پیشنهاد پیمان رد شد.");}catch{}await say(ctx,ok?"پیمان برقرار شد.":"پیشنهاد رد شد.",nation());});
async function settleOne(id){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const row=(await client.query("SELECT * FROM game_players WHERE telegram_id=$1 FOR UPDATE",[id])).rows[0];
  if(!row?.approved){await client.query("COMMIT");return null;}
  const ticks=Math.min(8,Math.floor((Date.now()-new Date(row.last_settlement).getTime())/period));
  if(ticks<1){await client.query("COMMIT");return null;}
  const d=calc(row),net=Math.round((d.income-d.expense)*ticks/8),balance=Number(row.treasury)+net;
  await client.query("UPDATE game_players SET treasury=$2,last_settlement=NOW() WHERE telegram_id=$1",[id,balance]);
  await client.query("INSERT INTO game_ledger(telegram_id,description,amount,balance) VALUES($1,$2,$3,$4)",[id,"تسویه‌ی "+ticks+" نوبت سه‌ساعته",net,balance]);
  await client.query("COMMIT");return {ticks,net,balance};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
bot.callbackQuery(/^turn$/,async ctx=>{
 await ctx.answerCallbackQuery();const p=await ready(ctx);if(!p)return;
 const result=await settleOne(ctx.from.id);
 await edit(ctx,result?`<b>📜 تسویه‌ی دوره‌ای</b>\nتعداد نوبت: ${result.ticks}\nتغییر خزانه: ${money(result.net)}\nمانده: ${money(result.balance)}`:"هنوز زمان تسویه‌ی سه‌ساعته نرسیده است.",nation());
});
setInterval(async()=>{
 try{
  const ids=(await pool.query("SELECT telegram_id FROM game_players WHERE approved=TRUE")).rows;
  for(const row of ids){
   const result=await settleOne(row.telegram_id);
   if(result)try{await bot.api.sendMessage(row.telegram_id,`📜 تسویه‌ی خودکار شاه شاهان\nتعداد نوبت: ${result.ticks}\nتغییر خزانه: ${money(result.net)}\nمانده‌ی خزانه: ${money(result.balance)}`);}catch{}
  }
 }catch(e){console.error("Automatic settlement error:",e);}
},60000).unref();
bot.catch(e=>console.error("Bot error",e));
const server=http.createServer((req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({status:"ok",game:"shah-shahanshah"}));});
await db();server.listen(PORT,()=>console.log("Shah Shahanshah health server on",PORT));await bot.start({onStart:info=>console.log("Bot started:",info.username)});
