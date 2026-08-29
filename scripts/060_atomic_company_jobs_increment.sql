-- Migration: atomic company job counter increment
-- Fixes the read-modify-write race condition in /api/jobs POST where two
-- concurrent inserts both read total_jobs=N and both write N+1 instead of N+2.
--
-- Usage: supabase.rpc('increment_company_jobs', { company_id_arg: companyId })

create or replace function increment_company_jobs(company_id_arg uuid)
returns void
language sql
security definer
as $$
  update companies
  set total_jobs = coalesce(total_jobs, 0) + 1
  where id = company_id_arg;
$$;
