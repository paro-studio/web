# Supabase Services

This directory contains the Supabase client configuration and related services for the PARO application.

## Setup

### 1. Environment Variables

Create a `.env.local` file in the project root with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

> **Note:** The anon key is safe to expose in the frontend. Security is enforced through Row Level Security (RLS) policies in your Supabase database.

### 2. Usage

Import the Supabase client anywhere in your application:

```typescript
import { supabase } from '@/services/supabase';

// Example: Query data
const { data, error } = await supabase
  .from('prompts')
  .select('id, title, image_url')
  .limit(10);
```

Do not `select('*')` on `prompts`, and do not add `prompt` to list or detail
queries. The prompt text is only loaded by `getPromptText` in `prompts.ts`, when
a signed in user taps Copy or edits their own prompt. The database refuses
`prompts.prompt` to signed out users, so a `*` query fails outright for them.

## File Structure

```
src/services/supabase/
├── client.ts           # Supabase client initialization
├── database.types.ts   # Schema types — STILL A PLACEHOLDER, see below
├── auth.ts             # Sign in/up/out, Google OAuth, ensureProfile
├── profiles.ts         # Profile read/create/update
├── prompts.ts          # Prompt CRUD, listing, copy counts
├── likes.ts            # Like toggle, counts, user's liked prompts
├── saves.ts            # Save toggle, user's saved prompts
├── follows.ts          # Follow toggle, follower/following counts
├── storage.ts          # Avatar, banner, and prompt image uploads
├── index.ts            # Re-exports for convenient importing
└── README.md           # This file
```

## Current Status

✅ **Implemented:** client, auth (email + Google OAuth), profiles, prompts,
likes, saves, follows, storage. Session persistence and auto-refresh are on.

⏳ **Outstanding:**
- `database.types.ts` is still a placeholder — it declares no tables, so
  `supabase.from(...)` results widen to `any` and nothing downstream is
  type-checked. Generate the real types and parameterize `createClient<Database>`.
- No Edge Functions yet.

## Conventions

These modules return **raw `snake_case` rows** exactly as Supabase stores them,
with two exceptions: `getUserLikes` and `getUserSaves` normalize to `camelCase`
and are typed as `NormalizedPrompt`.

Because the client is currently untyped, this boundary is not enforced by the
compiler — mixing the two casings silently yields `undefined` at runtime rather
than a type error. Generating the database types is what closes that gap.

## Security

- ✅ Only uses the public anon key (safe for the frontend)
- ✅ No service-role keys anywhere in client code
- ⚠️ All real access control depends on **Row Level Security** being enabled
  and correct on every table. A table without RLS is publicly readable and
  writable by anyone holding the anon key — which is everyone.
