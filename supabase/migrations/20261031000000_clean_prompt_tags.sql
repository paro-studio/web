-- Fix spelling and duplicate forms in the tags on existing prompts.
--
-- Tags are free text, so `asthetic` and `aesthetic` counted as different tags:
-- those prompts were missing from the aesthetic filter and from matches under
-- More like this. Only typos, plurals and hyphen variants of the same word are
-- merged. Different words that mean similar things (women and lady, photo and
-- picture) are left alone. This does not stop new typos being entered.
--
-- A prompt's tags changing normally sets off moderation, which costs an OpenAI
-- call and can post to Discord. No new words are being added here, so nothing
-- needs checking and triggers on prompts are off for this update. That also
-- leaves updated_at alone, since nobody edited these prompts.

begin;

alter table public.prompts disable trigger user;

with aliases(typo, tag) as (
  values
    ('asthetic', 'aesthetic'),
    ('desin', 'design'),
    ('phtoshoot', 'photoshoot'),
    ('vontage', 'vintage'),
    ('bollywoood', 'bollywood'),
    ('corousel', 'carousel'),
    ('80s era', '80s-era'),
    ('vangogh', 'van-gogh'),
    ('movies', 'movie'),
    ('photos', 'photo'),
    ('pictures', 'picture'),
    ('car', 'cars'),
    ('effect', 'effects'),
    ('ladies', 'lady')
)
update public.prompts p
   set tags = (
     -- Keeps the original order, and one copy if a prompt had both spellings.
     select array_agg(merged.tag order by merged.position)
       from (
         select coalesce(a.tag, t.tag) as tag, min(t.position) as position
           from unnest(p.tags) with ordinality as t(tag, position)
           left join aliases a on a.typo = t.tag
          group by 1
       ) merged
   )
 where p.tags && (select array_agg(typo) from aliases);

alter table public.prompts enable trigger user;

commit;
