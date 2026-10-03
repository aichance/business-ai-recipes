import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const js = await build({ entryPoints: ["ui.mjs"], bundle: true, write: false, format: "esm", target: "es2022", minify: true });
const shell = await readFile("shell.html", "utf8");
const style = await readFile("style.css", "utf8");
await mkdir("dist", { recursive: true });
for (const kind of ["scenario", "evidence", "run", "proof"]) {
  const html = shell.replace("__KIND__", () => kind).replace("__STYLE__", () => style)
    .replace("__SCRIPT__", () => js.outputFiles[0].text.replaceAll("</script", "<\\/script"));
  await writeFile(`dist/${kind}.html`, html);
}
console.log(JSON.stringify({ built: ["scenario", "evidence", "run", "proof"], apiKeys: false, externalAssets: false }));
