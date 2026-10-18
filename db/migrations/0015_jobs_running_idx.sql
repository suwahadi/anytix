-- claimJobs also reclaims stale running jobs; without this the OR branch scans every finished job.
create index if not exists jobs_running_idx on public.jobs (locked_at) where status = 'running';
