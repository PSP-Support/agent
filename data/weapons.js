const countryWeaponsBase = {
  germany: [
    ["mauser98", "تفنگ ماوزر ۹۸", 180],
    ["mg08", "مسلسل ام‌گه ۰۸", 2200],
    ["fieldgun77", "توپ ۷۷ میلی‌متری", 12500],
    ["uboot", "زیردریایی کلاس U", 180000],
    ["albatros_bii", "هواپیمای آلباتروس B.II", 85000],
    ["taube", "هواپیمای رومپلر تائوبه", 72000],
    ["aviatik_b1", "هواپیمای آویاتیک B.I (۱۹۱۴)", 79000],
    ["helgoland", "ناو جنگی کلاس هِلگولاند", 2300000],
    ["moltke", "رزم‌ناو کلاس مولتکه", 2450000],
    ["nassau", "ناو جنگی کلاس ناسائو", 1850000],
    ["kaiser", "ناو جنگی کلاس کایزر", 2600000],
  ],
  britain: [
    ["lee_enfield", "تفنگ لی-انفیلد", 190],
    ["vickers", "مسلسل ویکرز", 2400],
    ["qf18", "توپ ۱۸ پوندی", 13000],
    ["dreadnought", "ناو جنگی درِدنوت", 2100000],
    ["avro504", "هواپیمای آورو ۵۰۴", 78000],
    ["be2", "هواپیمای RAF B.E.2", 85000],
    ["bristol_scout", "هواپیمای بریستول اسکات (۱۹۱۴)", 90000],
    ["sopwith_tab", "هواپیمای سوپ‌ویت تابلوید", 92000],
    ["iron_duke", "ناو جنگی کلاس آیرون دوک", 2800000],
  ],
  france: [
    ["lebel", "تفنگ لبل", 175],
    ["hotchkiss14", "مسلسل هوتچکیس مدل ۱۹۱۴", 2800],
    ["canon75", "توپ ۷۵ میلی‌متری", 14000],
    ["corbet", "ناو جنگی کلاس کوربه", 2400000],
    ["mf7", "هواپیمای فارمن MF.7", 76000],
    ["caudron_g3", "هواپیمای کودرون G.3 (۱۹۱۴)", 82000],
    ["nieuport1", "هواپیمای نیوپور ۱", 83000],
    ["danton", "ناو جنگی کلاس دانتون", 1950000],
  ],
  russia: [
    ["mosin", "تفنگ موسین-ناگان", 160],
    ["maxim", "مسلسل ماکسیم", 2300],
    ["fieldgun76", "توپ ۷۶ میلی‌متری", 12000],
    ["gangut", "ناو جنگی کلاس گانگوت", 2450000],
    ["novik_destroyer", "ناوشکن نوویک", 520000],
    ["ilya_muromets", "هواپیمای ایلیا مورومتس", 155000],
    ["sikorsky_s10", "هواپیمای سیکورسکی S-10", 95000],
  ],
  ottoman: [],
  austria: [
    ["mannlicher", "تفنگ مانلیشر", 170],
    ["schwarzlose", "مسلسل شوارتسلوزه", 2200],
    ["skoda75", "توپ اشکودا", 13500],
    ["lohner_e", "هواپیمای لونه‌ِر E", 85000],
    ["hansa_b1", "هواپیمای هانزا-براندنبورگ B.I", 88000],
    ["tegetthoff", "ناو جنگی کلاس تگت‌هوف", 2500000],
    ["viribus", "ناو جنگی SMS Viribus Unitis", 2350000],
  ],
  italy: [
    ["carcano", "تفنگ کارکانو", 165],
    ["fiat14", "مسلسل فیات-رِوِلی", 2300],
    ["italy75", "توپ ۷۵ میلی‌متری", 13000],
    ["caproni_ca1", "هواپیمای کاپرونی Ca.1", 92000],
    ["dante_alighieri", "ناو جنگی دانته آلیگیری", 2300000],
  ],
  usa: [
    ["springfield03", "تفنگ اسپرینگفیلد ۱۹۰۳", 200],
    ["browning", "مسلسل براونینگ", 2500],
    ["us3inch", "توپ صحرایی ۳ اینچی", 13500],
    ["curtiss_f", "هواپیمای دریایی کرتیس مدل F (۱۹۱۴)", 68000],
    ["curtiss_ab3", "هواپیمای دریایی کرتیس AB-3 (۱۹۱۴)", 74000],
    ["wright_b", "هواپیمای رایت مدل B (آموزشی)", 52000],
    ["burgess_h", "هواپیمای بورگس مدل H", 64000],
    ["wyoming_us", "ناو جنگی کلاس وایومینگ (۱۹۱۲)", 2700000],
    ["florida_us", "ناو جنگی کلاس فلوریدا (۱۹۱۱)", 2450000],
    ["delaware_us", "ناو جنگی کلاس دلاور (۱۹۱۰)", 2350000],
    ["newyork_us", "ناو جنگی کلاس نیویورک (۱۹۱۴)", 2850000],
    ["us_sub_h", "زیردریایی کلاس H آمریکا (تکمیل عمدتاً پس از ۱۹۱۴)", 480000],
    ["us_l_sub", "زیردریایی کلاس L آمریکا", 360000],
    ["us_destroyer", "ناوشکن‌های آمریکایی (کلاس Cassin؛ نمونه نماینده)", 470000],
  ],
  japan: [
    ["arisaka", "تفنگ آریساکا", 170],
    ["type3", "مسلسل تایپ ۳", 2400],
    ["japan75", "توپ ۷۵ میلی‌متری", 13000],
    ["kaishiki1", "هواپیمای کایشیکی ۱", 65000],
    ["satsuma", "ناو جنگی ساتسوما", 1900000],
    ["kongo_jp", "رزم‌ناو کلاس کنگو (ساخت بریتانیا)", 2900000],
    ["kawachi", "ناو جنگی کاواچی", 2350000],
  ],
  persia: [
    ["lari_matchlock", "تفنگ محلی لاری (ساخت کارگاه‌های لار)", 95],
    ["qajar_local_rifle", "تفنگ سرپرست محلی قاجاری", 110],
    ["qajar_sword", "شمشیر و سلاح سرد ساخت استادکاران ایرانی", 75],
    ["qajar_spear", "نیزه و سلاح پیاده‌نظام محلی", 45],
    ["qajar_zamburak", "زنبورک قاجاری (توپ سبک قدیمی)", 2200],
  ],
  belgium: [
    ["mauser_be", "تفنگ ماوزر بلژیکی", 180],
    ["maxim_be", "مسلسل ماکسیم", 2400],
    ["canon_be", "توپ صحرایی", 13500],
  ],
  serbia: [],
  romania: [],
  greece: [
    ["mannlicher_greece", "تفنگ مانلیشر یونانی", 170],
    ["schneider_greece", "توپ اشنایدر ۷۵ میلی‌متری", 13500],
    ["averof_ship", "رزم‌ناو زرهی جورجیوس آوروُف", 2100000],
    ["hydra_ship", "ناو جنگی کلاس هیدرا", 1850000],
  ],
  netherlands: [
    ["mannlicher_nl", "تفنگ مانلیشر هلندی", 170],
    ["hembrug_rifle", "تفنگ هلندی Hembrug", 180],
    ["o1_sub", "زیردریایی کلاس O 1", 300000],
  ],
  china: [
    ["hanyang88", "تفنگ هانیانگ ۸۸", 150],
    ["qing_gun", "توپ صحرایی چین", 10000],
    ["haiqi_ship", "رزم‌ناو Hai Chi (ساخت خارجی؛ در اختیار چین)", 1600000],
  ],
  brazil: [
    ["mauser_brazil", "تفنگ ماوزر برزیلی", 180],
    ["brazil75", "توپ صحرایی ۷۵ میلی‌متری", 13000],
    ["minas_gerais", "ناو جنگی کلاس میناس ژرایس", 2400000],
  ],
  argentina: [
    ["mauser_arg", "تفنگ ماوزر آرژانتینی", 180],
    ["argentina75", "توپ صحرایی", 13000],
    ["rivadavia", "ناو جنگی کلاس ریواداویا", 2500000],
  ],
  chile: [
    ["mauser_chile", "تفنگ ماوزر شیلیایی", 180],
    ["chile75", "توپ صحرایی", 13000],
    ["alminte_latorre", "ناو جنگی آلْمیرانته لاتوره (ساخت بریتانیا)", 2500000],
  ],
  australia: [
    ["lee_australia", "تفنگ لی-انفیلد استرالیایی", 190],
    ["australia_cruiser", "رزم‌ناو HMAS Australia (ساخت بریتانیا)", 2200000],
  ],
  canada: [["ross_rifle", "تفنگ راس کانادایی", 185]],
  bulgaria: [
    ["mannlicher_bg", "تفنگ مانلیشر بلغاری", 170],
    ["schneider_bg", "توپ اشنایدر", 13000],
  ],
  portugal: [
    ["mauser_pt", "تفنگ ماوزر پرتغالی", 180],
    ["portugal75", "توپ صحرایی", 13000],
  ],
  mexico: [
    ["mauser_mx", "تفنگ ماوزر مکزیکی", 180],
    ["mexico75", "توپ صحرایی", 13000],
  ],
};

e;
export const countryWeapons = Object.fromEntries(
  Object.entries(countryWeaponsBase).map(([countryId, items]) => [
    countryId,
    items.map(([key, name, referencePrice]) => [key, name, referencePrice * 1000]),
  ]),
);
export function weaponResourceCosts(weapon) {
  const name = String(weapon?.[1] || "");
  const referenceValue = Math.max(0, Number(weapon?.[2] || 0));
  if (/ناو|زیردریایی|کشتی|دریایی/.test(name)) {
    return {
      iron: Math.ceil(referenceValue / 1000000),
      coal: Math.ceil(referenceValue / 2000000),
      fuel_stock: Math.ceil(referenceValue / 10000000),
    };
  }
  if (/هواپیما|جنگنده|بالون|هوایی|هواگرد/.test(name)) {
    return {
      iron: Math.ceil(referenceValue / 1000000),
      cloth: Math.ceil(referenceValue / 2000000),
      fuel_stock: Math.ceil(referenceValue / 10000000),
    };
  }
  return {
    iron: Math.max(1, Math.ceil(referenceValue / 200000)),
    coal: Math.max(1, Math.ceil(referenceValue / 1000000)),
  };
}
