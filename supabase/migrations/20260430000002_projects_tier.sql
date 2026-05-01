-- supabase/migrations/20260430000002_projects_tier.sql
alter table projects
  add column tier text not null default 'economy'
    check (tier in ('economy','premium'));

create index projects_tier_idx on projects(tier) where tier = 'premium';
