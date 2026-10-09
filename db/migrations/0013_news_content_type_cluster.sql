-- 0013_news_content_type_cluster.sql
-- Spec 027 (Market Pulse), Slice 1 — News quality.
--
-- Adds two nullable columns:
--   news_classifications.content_type  'event' | 'opinion' — what the classifier
--     judged the article to be. Nullable: rows written under older prompt
--     versions never carried it.
--   news_items.cluster_id  groups near-duplicate headlines about one event
--     (technical-considerations 5.3). Nullable; the clustering logic that fills
--     it is a later task, so existing and new rows stay NULL until then.
--
-- Idempotent: `add column if not exists`, and the check constraint is added
-- only when absent. No data is rewritten.

alter table public.news_classifications
  add column if not exists content_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_classifications_content_type_check'
      and conrelid = 'public.news_classifications'::regclass
  ) then
    alter table public.news_classifications
      add constraint news_classifications_content_type_check
      check (content_type in ('event', 'opinion'));
  end if;
end
$$;

comment on column public.news_classifications.content_type is
  'Classifier verdict: event or opinion. NULL for rows under older prompt versions.';

alter table public.news_items
  add column if not exists cluster_id bigint;

comment on column public.news_items.cluster_id is
  'Near-duplicate cluster key (an id of the cluster''s first item). NULL until clustered.';
