-- ============================================================================
--  요양등급·돌봄비용 계산기 — Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
--  제출 테이블
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.care_submissions (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- 기본 정보 ---------------------------------------------------------------
  age          smallint    check (age between 40 and 120),
  has_dementia boolean     not null default false,
  benefit_tier text        not null default 'general'
                           check (benefit_tier in ('general','r40','r60','basic')),

  -- 문진 응답 (52항목) ------------------------------------------------------
  -- { physical:[12], cognitive:[7], behavior:[14], nursing:[9],
  --   rehabMotor:[4], rehabJoint:[6] }
  answers      jsonb       not null,

  -- 계산 결과 ---------------------------------------------------------------
  score            numeric(4,1) not null check (score between 0 and 100),
  score_parts      jsonb        not null,   -- 영역별 기여 점수
  grade_probs      jsonb        not null,   -- { "0":0.0, "1":0.0, ... }
  predicted_grade  smallint     not null check (predicted_grade between 0 and 6),

  -- 비용 시나리오 -----------------------------------------------------------
  care_scenario  text    check (care_scenario in ('home','day','fac','hosp')),
  scenario_input jsonb,
  monthly_cost   integer check (monthly_cost >= 0),
  rate_year      smallint not null default 2026,

  -- 상담 신청 (선택) --------------------------------------------------------
  wants_consult     boolean     not null default false,
  name              text,
  phone             text,
  email             text,
  consent_sensitive boolean     not null default false,
  consent_at        timestamptz,

  -- 유입 경로 ---------------------------------------------------------------
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,

  -- ── 개인정보 보호 장치 ──────────────────────────────────────────────────
  -- 건강정보(문진 응답)와 식별정보(연락처)가 결합되면 개인정보보호법상
  -- '민감정보'가 됩니다. 아래 두 제약이 DB 레벨에서 이를 강제합니다.

  -- 1) 상담을 신청하려면 반드시 민감정보 동의 + 연락 수단이 있어야 한다
  constraint consult_requires_consent check (
    not wants_consult
    or (consent_sensitive is true
        and consent_at is not null
        and coalesce(nullif(phone,''), nullif(email,'')) is not null)
  ),

  -- 2) 상담을 신청하지 않으면 식별정보는 아예 저장될 수 없다
  constraint no_identity_without_consult check (
    wants_consult
    or (name is null and phone is null and email is null)
  )
);

comment on table public.care_submissions is
  '요양등급 자가문진 제출 기록. 건강정보를 포함하므로 민감정보로 취급할 것.';
comment on column public.care_submissions.answers is
  '장기요양인정조사표 52항목 응답. 신체기능/재활은 0~2, 나머지는 0|1.';
comment on constraint no_identity_without_consult on public.care_submissions is
  '동의 없이는 식별정보가 저장되지 않도록 DB가 직접 막는다.';

create index if not exists care_submissions_created_at_idx
  on public.care_submissions (created_at desc);
create index if not exists care_submissions_grade_idx
  on public.care_submissions (predicted_grade);
create index if not exists care_submissions_consult_idx
  on public.care_submissions (wants_consult) where wants_consult is true;

-- ────────────────────────────────────────────────────────────────────────────
--  RLS — 익명 사용자는 '쓰기만' 가능하고 '읽기는 불가'
-- ────────────────────────────────────────────────────────────────────────────
alter table public.care_submissions enable row level security;

drop policy if exists "anon can submit" on public.care_submissions;
create policy "anon can submit"
  on public.care_submissions
  for insert
  to anon, authenticated
  with check (true);

-- SELECT / UPDATE / DELETE 정책을 만들지 않았으므로 anon key로는 조회·수정·삭제가
-- 전부 거부됩니다. 관리자 조회는 service_role 키(서버 전용)로만 하세요.
-- service_role 은 RLS를 우회하므로 절대 프런트엔드에 넣으면 안 됩니다.

-- ────────────────────────────────────────────────────────────────────────────
--  보관기간 — 개인정보처리방침에 고지한 기간과 반드시 일치시킬 것
-- ────────────────────────────────────────────────────────────────────────────
-- 상담 신청 건의 식별정보는 1년 뒤 자동 파기하고, 통계용 익명 데이터만 남깁니다.
create or replace function public.purge_expired_identities()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.care_submissions
     set name = null, phone = null, email = null, wants_consult = false
   where wants_consult is true
     and created_at < now() - interval '1 year';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.purge_expired_identities is
  '보관기간(1년)이 지난 상담 신청의 식별정보를 파기한다. pg_cron으로 매일 돌릴 것.';

-- 자동 실행하려면 대시보드에서 pg_cron 확장을 켜고 아래를 실행하세요.
--   select cron.schedule('purge-care-identities', '0 4 * * *',
--                        $$select public.purge_expired_identities()$$);

-- ────────────────────────────────────────────────────────────────────────────
--  관리자용 통계 뷰 (service_role 로만 조회 — 식별정보 제외)
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.care_stats as
select
  date_trunc('day', created_at)::date as day,
  predicted_grade,
  care_scenario,
  count(*)                       as submissions,
  round(avg(score), 1)           as avg_score,
  round(avg(monthly_cost))       as avg_monthly_cost,
  count(*) filter (where wants_consult) as consult_requests
from public.care_submissions
group by 1, 2, 3
order by 1 desc;

revoke all on public.care_stats from anon, authenticated;
