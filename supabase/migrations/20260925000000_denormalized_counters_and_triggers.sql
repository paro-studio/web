-- Denormalized counters and triggers for likes, follows, and ratings.
--
-- Replaces client-side reduction / unbounded relational scans with
-- database-maintained counter columns on prompts and profiles.

-- 1. Add counter columns
alter table public.prompts add column if not exists like_count integer not null default 0;
alter table public.prompts add column if not exists rating_count integer not null default 0;
alter table public.prompts add column if not exists rating_average numeric(3, 2) default null;

alter table public.profiles add column if not exists follower_count integer not null default 0;
alter table public.profiles add column if not exists following_count integer not null default 0;

-- Allow anon to read the new denormalized counter columns on prompts
grant select (like_count, rating_count, rating_average) on public.prompts to anon;

-- 2. Keep prompt like_count synchronized with public.likes
create or replace function public.handle_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.prompts
    set like_count = like_count + 1
    where id = NEW.prompt_id;
    return NEW;
  elsif (tg_op = 'DELETE') then
    update public.prompts
    set like_count = greatest(like_count - 1, 0)
    where id = OLD.prompt_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists on_like_count_change on public.likes;
create trigger on_like_count_change
  after insert or delete on public.likes
  for each row execute function public.handle_like_count();

-- 3. Keep profile follower_count and following_count synchronized with public.follows
create or replace function public.handle_follow_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles
    set follower_count = follower_count + 1
    where id = NEW.following_id;

    update public.profiles
    set following_count = following_count + 1
    where id = NEW.follower_id;
    return NEW;
  elsif (tg_op = 'DELETE') then
    update public.profiles
    set follower_count = greatest(follower_count - 1, 0)
    where id = OLD.following_id;

    update public.profiles
    set following_count = greatest(following_count - 1, 0)
    where id = OLD.follower_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists on_follow_count_change on public.follows;
create trigger on_follow_count_change
  after insert or delete on public.follows
  for each row execute function public.handle_follow_count();

-- 4. Keep prompt rating_count and rating_average synchronized with public.prompt_ratings
create or replace function public.handle_prompt_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.prompts
    set
      rating_count = rating_count + 1,
      rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings where prompt_id = NEW.prompt_id)
    where id = NEW.prompt_id;
    return NEW;
  elsif (tg_op = 'UPDATE') then
    update public.prompts
    set
      rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings where prompt_id = NEW.prompt_id)
    where id = NEW.prompt_id;
    return NEW;
  elsif (tg_op = 'DELETE') then
    update public.prompts
    set
      rating_count = greatest(rating_count - 1, 0),
      rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings where prompt_id = OLD.prompt_id)
    where id = OLD.prompt_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists on_prompt_rating_change on public.prompt_ratings;
create trigger on_prompt_rating_change
  after insert or update or delete on public.prompt_ratings
  for each row execute function public.handle_prompt_rating();

-- 5. Backfill existing counts from existing data
update public.prompts p
set like_count = coalesce((select count(*) from public.likes l where l.prompt_id = p.id), 0),
    rating_count = coalesce((select count(*) from public.prompt_ratings pr where pr.prompt_id = p.id), 0),
    rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings pr where pr.prompt_id = p.id);

update public.profiles pr
set follower_count = coalesce((select count(*) from public.follows f where f.following_id = pr.id), 0),
    following_count = coalesce((select count(*) from public.follows f where f.follower_id = pr.id), 0);
