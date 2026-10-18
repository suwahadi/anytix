type Env = Record<string, string | undefined>;

/** The dev machine and production share one Supabase project, so DB tests run only on an explicit opt-in. */
export function assertDbTestsAllowed(env: Env): void {
  if (env.DB_TESTS_ALLOWED !== "true") {
    throw new Error("DB tests are disabled for this database. Set DB_TESTS_ALLOWED=true only for a non-production database.");
  }
}

/** Scripts that write to the database (migrations, admin and reset tools) need DB_WRITE_ALLOWED=true for that run. */
export function assertDbWriteAllowed(env: Env, script: string): void {
  if (env.DB_WRITE_ALLOWED !== "true") {
    throw new Error(`${script} writes to the database. Run it with DB_WRITE_ALLOWED=true when that is intended.`);
  }
}
