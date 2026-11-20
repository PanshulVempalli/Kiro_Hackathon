import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToMenu, serializeMenu } from "./gopher.js";
import { assertPublicUrl, isPrivateHost } from "./ssrf.js";
import { fetchGopherMenu, fetchRaw, parseGopherUrl } from "./gopherClient.js";

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
        if (raw) {
          res.end(serializeMenu(items));
        } else {
          const originalBytes = Buffer.byteLength(html, "utf8");
          const ghostBytes = Buffer.byteLength(serializeMenu(items), "utf8");
          res.end(JSON.stringify({ url, items, originalBytes, ghostBytes }));
        }
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }
    if (u.pathname === "/api/gopher") {
      try {
        const raw = u.searchParams.get("url") ?? "";
        const { host, port, type, selector } = parseGopherUrl(raw);
        if (isPrivateHost(host)) throw new Error("Target host is not allowed");
        const rawParam = u.searchParams.get("raw") === "1";
        if (rawParam) {
          const text = await fetchRaw(host, port, selector);
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
          res.end(text);
        } else {
          const { items, rawBytes } = await fetchGopherMenu(raw);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ items, rawBytes, protocol: "gopher" }));
        }
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
