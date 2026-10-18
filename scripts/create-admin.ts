import { createInterface } from "node:readline";
import { createAdmin, MIN_PASSWORD_LENGTH } from "@/lib/admin-service";
import { sql } from "@/lib/db";
import { assertDbWriteAllowed } from "@/lib/db-guard";

assertDbWriteAllowed(process.env, "create-admin");

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const internal = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = internal._writeToOutput.bind(rl);
    internal._writeToOutput = (s) => {
      if (s.includes(question)) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) throw new Error("Pakai: npm run admin:create -- email@domain.com");
  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    password = await askHidden(`Kata sandi (min. ${MIN_PASSWORD_LENGTH} karakter): `);
    if ((await askHidden("Ulangi kata sandi: ")) !== password) throw new Error("Kata sandi tidak sama.");
  }
  const id = await createAdmin(email, password);
  console.log(`Admin ${email} dibuat (id ${id}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
