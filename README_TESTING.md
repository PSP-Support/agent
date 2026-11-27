# Isolated Telegram test deployment

Use a separate Railway service for testing. Do not point it at the production bot token or production PostgreSQL database.

## Required isolation

1. Create a second Telegram bot with BotFather and keep its token only in Railway Variables.
2. Create a separate PostgreSQL service/database for the test deployment. It must not share the production database.
3. Deploy this repository to a separate Railway service connected to a test branch.
4. Use a fresh, disposable test database; never import real production user data or credentials into it.
4. Set the following variables on the **test service only**:

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | Set to `test` |
| `TEST_BOT_TOKEN` | Token of the test Telegram bot |
| `TEST_DATABASE_URL` | Connection string for the isolated test PostgreSQL database |
| `TEST_OWNER_TELEGRAM_ID` | Telegram numeric ID of the test administrator |
| `PORT` | Railway provides this automatically |

The application fails to start in test mode if the test token, database URL, or test administrator ID is missing. It also rejects a test database URL that exactly matches the production `DATABASE_URL` variable.

## Production service

Keep production variables on the production service:

- `APP_ENV=production` (or omit it; production is the default)
- `BOT_TOKEN`
- `DATABASE_URL`
- `OWNER_TELEGRAM_ID`

Test mode reads only `TEST_BOT_TOKEN` and `TEST_DATABASE_URL` for the bot and database. It does not fall back to production credentials.

## Local configuration

Copy `.env.example` to `.env` for local development and fill in credentials locally. Never commit `.env`, bot tokens, database passwords, or private connection strings.

## Limitations

The test bot is isolated by its token and database configuration, but it runs the same game code. Test migrations and game actions can modify the test database, so keep that database disposable and back it up if it contains data you need.
