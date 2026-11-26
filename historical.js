// Shah Shahanshah — initial historical scenario data.
// Scenario: 1914, before the collapse/partition of several empires.
// Keep player onboarding button-led and all rulers tied to a specific date.
export const HISTORICAL_SCENARIO = {
  id: "world-1914",
  year: 1914,
  title: "جهان در آستانهٔ جنگ بزرگ — ۱۹۱۴",
  description: "جهان پیش از فروپاشی چند امپراتوری و دگرگونی مرزهای تاریخی"
};

export const HISTORICAL_COUNTRIES = [
  { id:"ottoman", name:"امپراتوری عثمانی", ruler:"سلطان محمد پنجم رشاد", rulerLatin:"Mehmed V", title:"سلطان", countryTitle:"دولت عالیه عثمانی", type:"empire" },
  { id:"austria_hungary", name:"اتریش-مجارستان", ruler:"فرانتس یوزف یکم", rulerLatin:"Franz Joseph I", title:"امپراتور و پادشاه", countryTitle:"امپراتوری اتریش-مجارستان", type:"empire" },
  { id:"russian_empire", name:"امپراتوری روسیه", ruler:"نیکلای دوم", rulerLatin:"Nicholas II", title:"امپراتور و خودکامهٔ سراسر روسیه", countryTitle:"امپراتوری روسیه", type:"empire" },
  { id:"german_empire", name:"امپراتوری آلمان", ruler:"ویلهلم دوم", rulerLatin:"Wilhelm II", title:"قیصر", countryTitle:"امپراتوری آلمان", type:"empire" },
  { id:"british_empire", name:"امپراتوری بریتانیا", ruler:"جرج پنجم", rulerLatin:"George V", title:"پادشاه", countryTitle:"امپراتوری بریتانیا", type:"empire" },
  { id:"kingdom_italy", name:"پادشاهی ایتالیا", ruler:"ویتوریو امانوئله سوم", rulerLatin:"Victor Emmanuel III", title:"پادشاه", countryTitle:"پادشاهی ایتالیا", type:"kingdom" },
  { id:"kingdom_spain", name:"پادشاهی اسپانیا", ruler:"آلفونسوی سیزدهم", rulerLatin:"Alfonso XIII", title:"پادشاه", countryTitle:"پادشاهی اسپانیا", type:"kingdom" },
  { id:"kingdom_serbia", name:"پادشاهی صربستان", ruler:"پتر یکم", rulerLatin:"Peter I", title:"پادشاه", countryTitle:"پادشاهی صربستان", type:"kingdom" },
  { id:"kingdom_bulgaria", name:"پادشاهی بلغارستان", ruler:"فردیناند یکم", rulerLatin:"Ferdinand I", title:"تزار", countryTitle:"پادشاهی بلغارستان", type:"kingdom" },
  { id:"kingdom_romania", name:"پادشاهی رومانی", ruler:"کارول یکم", rulerLatin:"Carol I", title:"پادشاه", countryTitle:"پادشاهی رومانی", type:"kingdom" },
  { id:"japan_empire", name:"امپراتوری ژاپن", ruler:"امپراتور تای‌شو", rulerLatin:"Emperor Taisho", title:"امپراتور", countryTitle:"امپراتوری ژاپن", type:"empire" },
  { id:"qajar_persia", name:"ایرانِ قاجاری", ruler:"احمدشاه قاجار", rulerLatin:"Ahmad Shah Qajar", title:"شاه", countryTitle:"دولت ایران", type:"kingdom" },
  { id:"kingdom_greece", name:"پادشاهی یونان", ruler:"کنستانتین یکم", rulerLatin:"Constantine I", title:"پادشاه", countryTitle:"پادشاهی یونان", type:"kingdom" },
  { id:"kingdom_portugal", name:"پادشاهی پرتغال", ruler:"مانوئل دوم", rulerLatin:"Manuel II", title:"پادشاه", countryTitle:"پادشاهی پرتغال", type:"kingdom" }
];

export function getHistoricalCountry(id) {
  return HISTORICAL_COUNTRIES.find(country => country.id === id) || null;
}
