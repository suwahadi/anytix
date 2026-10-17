import { readFileSync } from "node:fs";
import { createSql, transaction } from "@/lib/db";

const sql = createSql(1);
transaction((tx) => tx.unsafe(readFileSync(process.argv[2], "utf8")), sql)
  .then(() => console.log(`re-applied ${process.argv[2]}`))
  .finally(() => sql.end({ timeout: 5 }));
