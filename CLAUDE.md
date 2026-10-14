## Communication
- Always write responses in Korean, even when the prompt is in English.
  Keep code, commands, file paths, and identifiers as-is.

## Conventions
- use `pnpm add` to install libraries.
Don't add packages by writing them directly into a `package.json`
- The Neon Postgres connection string lives in `DATABASE_URL` in `.env` at the repository root.
- We use Node 22+. which can natively run `.ts` files without `tsx`, using `node --env-file=.env <file>.ts`.
