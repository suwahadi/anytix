import { sql } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { adminAlertJob } from "./handlers/admin-alert";
import { emailJob } from "./handlers/email";
import { paymentCheckJob } from "./handlers/payment-check";
import { hourKey, reconcileJob } from "./handlers/reconcile";
import { runOnce, type JobHandlers } from "./run-once";

const handlers: JobHandlers = {
  email: emailJob,
  "payment-check": paymentCheckJob,
  reconcile: reconcileJob,
  "admin-alert": adminAlertJob,
};

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main() {
  console.log("worker started");
  while (!stopping) {
    try {
      // The dedupe key turns this per-loop call into one reconcile job per hour.
      await enqueueJob("reconcile", {}, `reconcile:${hourKey()}`);
      const n = await runOnce(handlers);
      if (n === 0) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error("worker loop error", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await sql.end({ timeout: 5 });
  console.log("worker stopped");
}

main();
