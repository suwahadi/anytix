import { readFileSync } from "node:fs";
import { createSql } from "@/lib/db";

const sql = createSql(1);
sql
  .begin((tx) => tx.unsafe(readFileSync(process.argv[2], "utf8")))
  .then(() => console.log(`re-applied ${process.argv[2]}`))
  .finally(() => sql.end({ timeout: 5 }));
