import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToMenu, serializeMenu } from "./gopher.js";
import { assertPublicUrl } from "./ssrf.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const MAX_BYTES = 500_000;

async function fetchPage(raw: string): Promise<{ html: string; url: string }> {
  let url = assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "GopherGhost/0.1" } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = assertPublicUrl(new URL(loc, url).href); // re-validate each redirect
      continue;
    }
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("Not an HTML page");
    return { html: (await res.text()).slice(0, MAX_BYTES), url: url.href };
  }
  throw new Error("Too many redirects");
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    if (u.pathname === "/api/browse") {
      try {
        const { html, url } = await fetchPage(u.searchParams.get("url") ?? "");
        const items = htmlToMenu(html, url);
        const raw = u.searchParams.get("raw") === "1";
        res.writeHead(200, { "content-type": raw ? "text/plain; charset=utf-8" : "application/json" });
        res.end(raw ? serializeMenu(items) : JSON.stringify({ url, items }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(path.join(root, "index.html")));
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(Number(process.env.PORT) || 3000, () => console.log("GopherGhost haunting http://localhost:" + (process.env.PORT || 3000)));
