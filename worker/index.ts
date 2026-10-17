import { sql } from "@/lib/db";
import { runOnce, type JobHandlers } from "./run-once";

const handlers: JobHandlers = {};

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main() {
  console.log("worker started");
  while (!stopping) {
    try {
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
