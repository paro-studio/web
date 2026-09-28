<div align="center">

<img src="public/og-image.png" alt="Paro Studio" width="640">

<br>

**A gallery for sharing AI image prompts.**

[**parostudios.in**](https://www.parostudios.in) &nbsp;·&nbsp;
[Discord](https://discord.gg/zNZ3TAwy73) &nbsp;·&nbsp;
[Contributing](CONTRIBUTING.md) &nbsp;·&nbsp;
[Report a bug](https://github.com/paro-studio/web/issues/new?template=bug_report.yml)

[![Mintlify OSS Program 2026](https://img.shields.io/badge/Mintlify-OSS%20Program%202026-0D9373.svg)](https://mintlify.com/customers)
[![CI](https://github.com/paro-studio/web/actions/workflows/ci.yml/badge.svg)](https://github.com/paro-studio/web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)](https://discord.gg/zNZ3TAwy73)

</div>

---

## What it does

Most places show you the AI image. Paro Studio shows you the prompt that made
it. Every post includes the full prompt text and the tool it was written for,
so you can copy it and try it yourself.

- Browse a feed of prompts and filter by tag
- Copy any prompt in one click. Copy counts are public
- Like and save prompts to find them later
- Follow creators and see what they post
- Upload your own image, prompt, tags, and the AI tool you used
- Profiles with an avatar, banner, bio, and everything you have posted

Built with React, TypeScript, and Vite. Styled with Tailwind and shadcn/ui.
Supabase handles auth, the database, and file storage.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase credentials
npm run dev                  # http://localhost:8080
```

You need your own Supabase project. See [Backend setup](#backend-setup) below.

## Environment

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The anon key is meant to be public. It ships inside the client bundle by
design. Access control comes from **Row Level Security policies in Supabase**,
not from keeping the key secret. If RLS is off for a table, anyone can read and
write that table straight from the browser console.

`.env.local` is gitignored. Never commit a service role key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |

`npm run build` does not typecheck. That is why `typecheck` is a separate
script. CI runs `lint`, `typecheck`, `test`, and `build` on every pull request.

## Backend setup

You need your own Supabase project. It is free and takes a few minutes.

1. Create a project at [supabase.com](https://supabase.com)
2. Open the SQL Editor, paste in [`supabase/schema.sql`](supabase/schema.sql),
   and run it. That creates every table, policy, function, and storage bucket
3. Enable Google under Authentication, Providers, following the
   [Supabase Google OAuth setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
   Configure your Google OAuth client with the Supabase callback URL and save its
   client ID and secret in the Supabase Google provider settings.
   Under Authentication, URL Configuration, allow the app's return URL
   (`http://localhost:8080/` for the default dev server, or your deployed origin
   with a trailing slash). See [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Go to Settings, API, and copy the Project URL and anon key into `.env.local`

`npm run dev` should now work end to end. The file contains structure only, so
your database starts empty and you create your own test account.

### Sample data

A fresh database gives you an empty feed, which makes most of the UI hard to
work on. To fill it:

1. Sign up in the app and pick a username
2. Run [`supabase/seed.sql`](supabase/seed.sql) in the SQL Editor

That adds six sample prompts to the account you just made, fills in a name and
bio, and marks it verified so the badge shows. Prompt images come from a free
placeholder service. Your avatar comes from Google, and you can upload a banner
from Settings. Safe to run more than once, and it only ever touches its own
rows.

Development only. Never run it against production.

### What it sets up

**Tables**

| Table | Key columns |
| --- | --- |
| `profiles` | `id` (matches `auth.users.id`), `username`, `full_name`, `avatar_url`, `cover_url`, `bio` |
| `prompts` | `id`, `user_id`, `title`, `prompt`, `image_url`, `ai_tool`, `tags`, `view_count`, `copy_count`, `created_at` |
| `likes` | `id`, `user_id`, `prompt_id`, `created_at` |
| `saves` | `id`, `user_id`, `prompt_id`, `created_at` |
| `follows` | `follower_id`, `following_id` |
| `feedback` | `id`, `user_id`, `subject`, `message`, `created_at` |

**Storage buckets:** `avatars`, `banners`, `prompt-images`. All are public read.
Files are stored as `{user_id}/{file}`, and the policies use that first path
segment to decide who owns a file.

**Auth:** Google sign in only. Email/password authentication is not supported.
New users are sent to `/complete-profile` until they pick a username.

Row Level Security is on for every table, and privileged columns are restricted
with column level grants on top of that. The anon key is public, so those two
things are all that protect the data: RLS decides which rows a user can touch,
the grants decide which columns. If you change the schema, keep both.

### Changing the schema

`supabase/migrations/` is the source of truth. `supabase/schema.sql` is
generated from it by `npm run db:schema` and must not be edited by hand. CI
checks that the two agree.

```bash
npx supabase migration new add_something
# write the SQL, then
npm run db:schema
```

Contributors apply migrations by pasting them into their own SQL Editor.
Maintainers push to production with `npx supabase db push`. Neither needs
Docker. Full workflow in [CONTRIBUTING.md](CONTRIBUTING.md).

### Regenerating database types

`src/services/supabase/database.types.ts` is generated from the live schema,
and the Supabase client is typed with it. Query results are fully typed, so an
unknown table or a wrong column type fails to compile.

Regenerate it whenever you change the schema, or the types drift out of sync:

```bash
npx supabase login
npx supabase gen types typescript --project-id YOUR_PROJECT_ID \
  > src/services/supabase/database.types.ts
npm run typecheck
```

Your project ID is in the Supabase dashboard under Settings, General,
Reference ID. The redirect overwrites the file even when the command fails, so
always run `typecheck` afterwards.

## Project structure

```
src/
├── components/
│   ├── auth/       AuthModal
│   ├── feed/       FeedCard, ImageCard, AdCard (ad slots are stubbed)
│   ├── layout/     Navbar, Footer
│   ├── prompts/    PromptCard, EditPromptModal, CreatorCard, TagFilter
│   ├── routing/    ProtectedRoute
│   └── ui/         shadcn/ui primitives
├── hooks/          useAuth (Supabase session and profile), usePrompts
├── lib/            shared types, error helpers, utils
├── pages/          one file per route
└── services/
    └── supabase/   client, auth, profiles, prompts, likes, saves, follows, storage
```

Data flows one way. `services/supabase/*` returns raw `snake_case` rows. Hooks
and pages convert them to `camelCase`. Components only ever see `camelCase`.
Keep that boundary clean, because mixing the two is the most common bug in this
codebase.

## Known follow-ups

- One JS chunk of roughly 820 kB. There is no route level code splitting yet
- Tests cover only the pure helpers in `src/lib/`. The service layer, hooks,
  and components have none, and those need Supabase mocking

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
conventions, and the CLA.

Come say hello on [Discord](https://discord.gg/zNZ3TAwy73) if you want to ask
something before opening an issue, or just want to know what is being worked
on.

Found a security problem? See [SECURITY.md](SECURITY.md). Please do not open a
public issue for those.

## Backed by

Paro Studio is part of the [Mintlify Open Source Program 2026](https://mintlify.com/customers).
Our docs are powered by [Mintlify](https://mintlify.com).

## License

Licensed under the [MIT License](LICENSE).

You can use, change, and share this code, including in commercial work. Just
keep the copyright notice.

The Paro Studio name and logo are **not** covered by that license. You are free
to fork the code, but a public fork needs its own name and branding. See
[NOTICE](NOTICE) for details.
