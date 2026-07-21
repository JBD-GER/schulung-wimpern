import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/legal-text-files.json"), "utf8"),
);
const environmentNames = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "scripts/legal-text-environment.json"),
    "utf8",
  ),
);

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
for (const name of environmentNames) {
  digest.update(name);
  digest.update("\0");
  digest.update(process.env[name]?.trim() ?? "");
  digest.update("\0");
}

process.stdout.write(`sha256-${digest.digest("hex")}\n`);
