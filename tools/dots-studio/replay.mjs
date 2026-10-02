import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { replayPack } from "./core.mjs";
export { replayPack } from "./core.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const pack = JSON.parse(await readFile(process.argv[2], "utf8"));
    console.log(JSON.stringify(replayPack(pack), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
