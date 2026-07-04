# Dev Database Safety

This project must not use production, Supabase pooler, or Vercel database hosts during local feature testing.

## Daily Local Work

Use:

```sh
npm run dev
```

Before Next.js starts, the database preflight checks `DATABASE_URL`, `DIRECT_URL`, and `SHADOW_DATABASE_URL`.

If the database host is safe for local development, you will see:

```text
DB preflight passed
```

Only run OTP/login tests after this message appears.

## Safe Local Hosts

These hosts are accepted for local development:

- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `postgres`
- `db`
- `host.docker.internal`

## Blocked Hosts

These hosts are not allowed for local development tests:

- Supabase hosts
- Supabase pooler hosts
- production/prod hosts
- Vercel hosts
- unknown remote database hosts

If preflight fails, stop. Do not run OTP/login tests until the database URL points to a local development database.

## Production Commands

`npm run start` is for production smoke checks. It is not for mock OTP local testing.

Production migration and deployment require separate approval. Do not run production migrations or deploys as part of local OTP/login testing.
