# Contributing to PARO Studio

Thanks for wanting to help. This is a small project and contributions are
genuinely welcome: bug fixes, features, docs, tests, all of it.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

For anything beyond a small fix, **open an issue first** and say what you plan
to do. It's much better to agree on an approach up front than to have a
finished PR turned down over a design decision.

If you would rather just ask, we are on
[Discord](https://discord.gg/zNZ3TAwy73). Good for "is anyone already doing
this?" and for getting unstuck on setup.

Browse the [open issues][issues] to find something to pick up. Anything tagged
`good first issue` is a deliberately self-contained place to start.

[issues]: https://github.com/paro-studio/web/issues

### Picking up an issue

Review is done by one person in their spare time, so these rules keep the queue
moving for everyone:

- **Wait to be assigned.** Comment on the issue with your plan, then wait until
  a maintainer assigns it to you before you start. Pull requests for issues that
  are not assigned to you may be closed without review.
- **Two open pull requests at most.** Don't claim another issue until one of
  yours is merged or closed.
- **Agree the approach for big changes.** Anything labelled `P0` or `P1`, or
  that touches more than a handful of files, needs the approach agreed in the
  issue before any code is written. A large PR that arrives before that
  conversation will be sent back.

Small, focused pull requests get merged much faster than large ones.

## Setup

Use the Node version in [`.nvmrc`](.nvmrc), which is what CI runs. With nvm,
`nvm use` picks it up.

```bash
git clone https://github.com/paro-studio/web.git
cd web
npm install
cp .env.example .env.local   # fill in your own Supabase credentials
npm run dev                  # http://localhost:8080
```

You need your own Supabase project. Create a free one, open the SQL Editor, and
run [`supabase/schema.sql`](supabase/schema.sql). That builds every table,
policy, function, and storage bucket in one go. Then configure Google OAuth
and the allowed return URL, and copy your Project URL and anon key into
`.env.local`. Full steps are in **Backend setup** in the [README](README.md).

Once you have signed up in the app, run [`supabase/seed.sql`](supabase/seed.sql)
too. It adds six sample prompts to your account so the feed and profile pages
have something in them. Without it you are looking at an empty site, which makes
most UI work impossible.

You never need access to the production database, and nobody will give you any.
Both SQL files are structure and fake sample data only. Your database starts
empty and everything in it is yours.

Never commit `.env.local`, and never put a service-role key anywhere in this
repo.

## Changing the database schema

`supabase/migrations/` is the source of truth. `supabase/schema.sql` is
**generated** from it, so never edit that file by hand, your change will be
overwritten and CI will fail.

To change anything about the database:

```bash
npx supabase migration new add_something     # creates a timestamped file
# write your SQL in the new supabase/migrations/*.sql
npm run db:schema                            # regenerate schema.sql
```

Commit both the migration and the regenerated `schema.sql`. Then apply the
migration to your own Supabase project by pasting it into the SQL Editor, and
check the app still works.

Two rules that are easy to get wrong:

- **Migrations are append-only.** Once a migration is committed, never edit it.
  It has already run against real databases. Fix it with a new migration.
- **If you add a column to `profiles` or `prompts`, add it to the grant list**
  in the column privileges section, or the app will not be able to write it.
  The failure is a Postgres `42501` at runtime, which no test will catch.
  Privileged columns are left out of those lists deliberately.

CI applies every migration to an empty Postgres on each PR, so a migration that
does not run gets caught before merge. If that job fails, the log names the file
and the line. The stubs it needs live in `supabase/ci/`, which is CI-only and is
not part of the schema.

You do not need Docker, and you do not need the local Supabase stack.

### Checking a live database

[`supabase/checks/verify_production.sql`](supabase/checks/verify_production.sql)
is a read-only report. Paste it into the SQL Editor and every row should say
PASS. It checks that RLS is on, that privileged columns are not client writable,
that the app's own columns still are, and that the storage limits are set.

Worth running against your own project after a schema change. Maintainers run it
against production after a `db push`. CI cannot run it, because CI has no
database to run it against, and giving CI production credentials is not worth
the risk on a public repo.

## Before you open a PR

Run all five. CI runs the same ones and will block the PR if any fail.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:schema:check
```

`npm run build` does **not** typecheck. That is why `typecheck` is separate.
Don't skip it.

## Conventions

- **Data flow is one-way and the boundary matters.** `services/supabase/*`
  returns raw `snake_case` rows → hooks and pages normalize to `camelCase` →
  components only ever see `camelCase`. Mixing the two is the single most
  common bug in this codebase. Keep the boundary sharp.
- Match the style of the file you're editing. There's no separate formatter
  step; ESLint is the source of truth.
- Keep PRs focused. One concern per PR is much easier to review than five.
- Write a commit message that explains *why*, not just *what*.

## A note on file paths

Anything referenced by a root-relative URL (`/favicon.png`, `/logo.png`) must
live in `public/`. Files in `src/assets/` are only reachable if something
`import`s them. Otherwise they are never bundled and the URL silently falls
through to the SPA rewrite, returning HTML instead of an image.

## Contributor License Agreement

By opening a pull request against this repository, you agree that:

1. You wrote the contribution yourself, or otherwise have the right to submit
   it under the terms below.
2. You grant Paro Studio a perpetual, worldwide, irrevocable, royalty-free
   license to use, reproduce, modify, sublicense, and distribute your
   contribution as part of this project, including under a different license
   should the project be relicensed in future.
3. You retain copyright to your contribution. This grant is non-exclusive, so
   you are free to do whatever else you like with your own work.

This keeps the project's licensing clean and means we're never in a position
where we have to track down past contributors to make a change. If you're not
able to agree to this, please say so in the PR and we'll work something out.

## Licensing and branding

Code in this repository is licensed under the [MIT License](LICENSE). Note that
the Paro Studio **name and logo are not covered by that license**. See
[NOTICE](NOTICE). If you fork the project and deploy it publicly, give it its
own name and branding.

## Reporting security issues

Please don't open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).
