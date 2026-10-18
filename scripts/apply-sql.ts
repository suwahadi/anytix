import { readFileSync } from "node:fs";
import { createSql, transaction } from "@/lib/db";
import { assertDbWriteAllowed } from "@/lib/db-guard";

assertDbWriteAllowed(process.env, "apply-sql");

const sql = createSql(1);
transaction((tx) => tx.unsafe(readFileSync(process.argv[2], "utf8")), sql)
  .then(() => console.log(`re-applied ${process.argv[2]}`))
  .finally(() => sql.end({ timeout: 5 }));
