# شاه شاهان | Shah Shahanshah

A historical Telegram strategy and national-governance game set in 1914.

## Run on Railway

Required environment variables:

- `BOT_TOKEN`: Telegram bot token from BotFather
- `DATABASE_URL`: Railway PostgreSQL connection string
- `PORT`: optional; Railway provides this automatically

The service starts with `npm start` and exposes a simple HTTP health response while the Telegram bot runs in long polling mode.

## Gameplay

- Choose a historical country and confirm its 1914 ruler.
- Manage national treasury, taxes, tariffs, industry, agriculture, population services, wages, army and navy.
- The national financial model calculates daily income and expenses.
- Each three-hour settlement pays one eighth of the current daily net balance, up to eight settlements per day.
- Review financial records in the ledger.
- Trade resources between player countries and send diplomatic alliance proposals.

All player actions are performed through Telegram inline buttons.

## Data

The game uses PostgreSQL tables created automatically at startup. Player state, ledger entries, relations and market offers are persisted in the database.

## Note

This is a fresh core rewrite. Legacy company/tycoon modules have been removed from the active source.
