import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(dir, "dist", "cli.js");
let text = readFileSync(cliPath, "utf8");
if (!text.startsWith("#!")) {
  text = `#!/usr/bin/env bun\n${text}`;
  writeFileSync(cliPath, text);
}
