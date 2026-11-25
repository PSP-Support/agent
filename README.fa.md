# Open Many — نسخه اولیه ربات بازی تلگرام

نسخه MVP بازی اقتصادی/تایcoon تلگرام. این نسخه شامل:
- ساخت پروفایل بازیکن با سرمایه اولیه
- خرید کافه، فروشگاه، کارخانه و شرکت فناوری
- درآمد خودکار بر اساس زمان گذشته (با سقف 24 ساعت)
- دریافت درآمد
- ارتقای شرکت
- پاداش روزانه
- رتبه‌بندی سرمایه‌داران
- ذخیره اطلاعات در PostgreSQL
- Health endpoint برای Railway

## نیازمندی‌ها
- Telegram bot token از `@BotFather`
- Railway project با سرویس Node.js و PostgreSQL

## راه‌اندازی روی Railway
1. این پروژه را در یک repository جدید GitHub قرار دهید.
2. در Railway یک Project بسازید و Deploy from GitHub Repo را انتخاب کنید.
3. به همان Railway Project یک PostgreSQL service اضافه کنید.
4. در Variables سرویس ربات این متغیرها را تنظیم کنید:
   - `BOT_TOKEN` = توکن ربات تلگرام
   - `DATABASE_URL` = متغیر اتصال PostgreSQL از سرویس دیتابیس (Reference Variable)
5. Railway به‌صورت خودکار `npm start` را اجرا می‌کند.
6. پس از Deploy، در تلگرام به ربات `/start` بفرستید.

## اجرای محلی
```bash
npm install
cp .env.example .env
# مقادیر BOT_TOKEN و DATABASE_URL را در .env قرار دهید
npm start
```

## نکته‌ها
- این یک MVP قابل توسعه است، نه نسخه نهایی کامل.
- در این نسخه، درآمد هنگام فشردن «دریافت درآمد» محاسبه می‌شود؛ لازم نیست cron جداگانه اجرا شود.
- پاداش روزانه بر اساس تاریخ UTC محاسبه می‌شود.
- برای امنیت، توکن ربات را در GitHub commit نکنید؛ فقط در Railway Variables وارد کنید.
- قبل از انتشار عمومی، تست خرید/ارتقا و تنظیمات دیتابیس را انجام دهید.
