// Builds a Root package with production dependencies only.
// Root rejects packages over 100 MiB, and the dev tools alone exceed that.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, ".package");
const output = join(root, "rootcast.pkg");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

run(npm, ["run", "build"], root);

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage);
for (const file of ["root-manifest.json", "package.json", "package-lock.json", "dist"]) {
  if (existsSync(join(root, file))) cpSync(join(root, file), join(stage, file), { recursive: true });
}
run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage);

rmSync(output, { force: true });
run(npx, ["rootsdk", "build", "package", "-p", stage, "-o", output], root);
rmSync(stage, { recursive: true, force: true });

const mib = statSync(output).size / 1024 / 1024;
console.log(`\nPackage: ${output} (${mib.toFixed(1)} MiB)`);
if (mib > 100) {
  console.error("Package exceeds Root's 100 MiB limit.");
  process.exit(1);
}
