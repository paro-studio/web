-- Full-text search and tag indexes for prompts
--
-- Adds a generated tsvector column over title and prompt text with a GIN index,
-- plus a GIN index on prompts.tags for fast array filtering.
--
-- Both database search and tag filtering currently perform sequential full scans.
-- GIN indexes allow Postgres to use Bitmap Index Scans for text search and tag
-- containment/overlap queries.

-- ---------------------------------------------------------------------------
-- Generated tsvector column and GIN index for full-text search
-- ---------------------------------------------------------------------------
--
-- Stored tsvector generated over title and prompt text using the english config.
-- In Postgres, specifying 'english'::regconfig ensures the expression is
-- immutable and valid for GENERATED ALWAYS AS (...) STORED.
--
-- fts is read-only and maintained automatically by Postgres on inserts and
-- updates. Users cannot insert into or update this column directly.

alter table public.prompts
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(prompt, ''))
  ) stored;

create index if not exists prompts_fts_idx on public.prompts using gin (fts);

-- ---------------------------------------------------------------------------
-- GIN index on tags array
-- ---------------------------------------------------------------------------
--
-- prompts.tags is text[]. The default GIN operator class (array_ops) supports
-- containment (@>) and overlap (&&) operators without requiring any extension.

create index if not exists prompts_tags_idx on public.prompts using gin (tags);
