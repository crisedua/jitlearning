-- Pain signals: what people are complaining about in public forums, kept as
-- rows the coach can search mid-conversation.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The corpus already carries a *distilled* radar document (a narrative of the
-- clusters, written by hand). This table is the other half: the individual
-- observations behind it, queryable by trade or country so the coach can answer
-- "¿de qué se queja la gente en mi rubro?" with something specific.
--
-- Why a table rather than more corpus documents: retrieval over a corpus is
-- semantic and slow to refresh — every new sweep would mean re-ingesting and
-- re-indexing. A row is cheap to add, cheap to expire, and can be filtered by
-- country, which is exactly the axis a learner asks along.
--
-- Scraping never happens in a request. `npm run scrape:pains` fills this table
-- ahead of time; the agent only ever reads it. That is what keeps the tool call
-- under a second instead of the ~40 seconds an Apify run takes.
create table if not exists public.pain_signals (
  id          uuid primary key default gen_random_uuid(),
  -- Where it came from. `url` is the natural key: the same thread must not
  -- accumulate a row per sweep.
  source      text not null default 'reddit',
  community   text,
  url         text not null unique,
  lang        text not null default 'es',
  -- Inferred from the community, and null when it cannot be. Never guessed
  -- from the text: a wrong country on a pain is worse than no country, because
  -- the learner would act on it as if it were local.
  country     text,
  title       text not null,
  excerpt     text not null,
  score       integer,
  comments    integer,
  -- Which sweep query surfaced it, so a bad query can be traced and its rows
  -- removed as a batch.
  query       text,
  -- Curation. `theme` groups rows into the clusters the radar document names
  -- (cobro, seguimiento, cumplimiento, conversion…). `verdict` is the
  -- painkiller/vitamin call from the method.
  theme       text,
  verdict     text not null default 'sin_revisar'
                check (verdict in ('painkiller', 'vitamin', 'ruido', 'sin_revisar')),
  -- Only published rows are readable. A raw sweep lands unpublished, so noise
  -- can never reach a learner just because a scraper ran.
  published   boolean not null default false,
  captured_at timestamptz not null default now()
);

-- Full-text search over title + excerpt, in Spanish. Generated rather than
-- maintained by a trigger so it cannot drift from the columns it summarises.
alter table public.pain_signals
  add column if not exists search tsvector
  generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
  ) stored;

create index if not exists pain_signals_search_idx on public.pain_signals using gin (search);
create index if not exists pain_signals_country_idx on public.pain_signals (country) where published;
create index if not exists pain_signals_captured_idx on public.pain_signals (captured_at desc);

-- Readable by anyone, but only the published rows.
--
-- Deliberately open: every row is an excerpt of a public forum post that
-- already has a public URL, so there is nothing here to protect, and a secret
-- shared with a third-party tool config would be a worse trade than the thing
-- it guards. Writes stay with the service role — the scraper — so a reader can
-- never add a row.
alter table public.pain_signals enable row level security;

drop policy if exists "published pain signals are readable by anyone" on public.pain_signals;
create policy "published pain signals are readable by anyone"
  on public.pain_signals for select
  to anon, authenticated
  using (published);
