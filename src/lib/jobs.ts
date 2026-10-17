import { sql } from "@/lib/db";

export type Job = { id: number; type: string; payload: Record<string, unknown>; attempts: number };

const MAX_ATTEMPTS = 5;

export async function enqueueJob(type: string, payload: object, dedupeKey: string, runAt?: Date): Promise<boolean> {
  const rows = await sql`
    insert into jobs (type, payload, dedupe_key, run_at)
    values (${type}, ${sql.json(payload as never)}, ${dedupeKey}, ${runAt ?? sql`now()`})
    on conflict (dedupe_key) do nothing
    returning id`;
  return rows.length > 0;
}

/** Also reclaims jobs left `running` for 5 minutes by a worker that died mid-job. */
export async function claimJobs(limit: number): Promise<Job[]> {
  return sql<Job[]>`
    update jobs set status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
    where id in (
      select id from jobs
      where (status = 'queued' and run_at <= now())
         or (status = 'running' and locked_at < now() - interval '5 minutes')
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning id, type, payload, attempts`;
}

export async function completeJob(id: number): Promise<void> {
  await sql`update jobs set status = 'done', locked_at = null, updated_at = now() where id = ${id}`;
}

export async function failJob(job: Job, error: string): Promise<void> {
  if (job.attempts >= MAX_ATTEMPTS) {
    await sql`
      update jobs set status = 'failed', last_error = ${error}, locked_at = null, updated_at = now()
      where id = ${job.id}`;
    return;
  }
  const delaySeconds = 30 * 2 ** (job.attempts - 1);
  await sql`
    update jobs set status = 'queued', last_error = ${error}, locked_at = null, updated_at = now(),
      run_at = now() + make_interval(secs => ${delaySeconds})
    where id = ${job.id}`;
}
