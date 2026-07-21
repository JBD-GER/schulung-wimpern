import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "src/data/access-policy.ts",
  "src/app/impressum/page.tsx",
  "src/app/datenschutz/page.tsx",
  "src/app/agb/page.tsx",
  "src/app/widerruf/page.tsx",
];

const digest = createHash("sha256");
for (const file of files) {
  const normalized = readFileSync(resolve(process.cwd(), file), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  digest.update(file);
  digest.update("\0");
  digest.update(normalized);
  digest.update("\0");
}

process.stdout.write(`sha256-${digest.digest("hex")}\n`);
