import { claimJobs, completeJob, failJob } from "@/lib/jobs";

export type JobHandlers = Record<string, (payload: any) => Promise<void>>;

export async function runOnce(handlers: JobHandlers, limit = 10): Promise<number> {
  const jobs = await claimJobs(limit);
  for (const job of jobs) {
    const handler = handlers[job.type];
    if (!handler) {
      await failJob(job, "no handler");
      continue;
    }
    try {
      await handler(job.payload);
      await completeJob(job.id);
    } catch (e) {
      await failJob(job, e instanceof Error ? e.message : String(e));
    }
  }
  return jobs.length;
}
