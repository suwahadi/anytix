import { assertDbTestsAllowed } from "@/lib/db-guard";

assertDbTestsAllowed(process.env);
