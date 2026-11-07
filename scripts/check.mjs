import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const directories = ["src", "scripts", "tests"];
for (const directory of directories)
  for (const file of await readdir(directory)) {
    if (!/\.m?js$/.test(file)) continue;
    const path = `${directory}/${file}`;
    execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
    const source = await readFile(path, "utf8");
    if (/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(source))
      throw new Error(`${path}: unsafe dynamic code`);
  }
console.log("JavaScript syntax and unsafe-code checks passed.");
