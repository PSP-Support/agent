# Database migrations

Migration files are applied in lexicographic order using the three-digit prefix, for example `001_initial_schema.sql`.

The runner creates `schema_migrations` and records each applied version inside the same PostgreSQL transaction as the migration SQL. A version already recorded is skipped, so deployments do not rerun schema changes on every startup.

## Production safety

- Take a Railway PostgreSQL backup before adding a data-changing migration.
- Verify the migration against a separate test database first.
- Never edit an already-applied migration. Add a new numbered migration instead.
- Rollback of data migrations should use a reviewed down migration or restore from a verified backup; the runner does not execute down migrations automatically.
