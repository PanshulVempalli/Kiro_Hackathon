import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToMenu, serializeMenu, type GopherItem } from "./gopher.js";
import { assertPublicUrl, assertPublicGopherUrl, isPrivateHost } from "./ssrf.js";
import { fetchGopherMenu, fetchRaw, parseGopherUrl } from "./gopherClient.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const MAX_BYTES = 500_000;

// ---------------------------------------------------------------------------
// AI Ghostwriter: one-paragraph summary injected at the top of each menu.
// Requires OPENAI_API_KEY in the environment (or .env loaded externally).
// If the key is absent or the call fails the menu is returned without a summary.
// ---------------------------------------------------------------------------
async function ghostSummarize(text: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // Feed the first 3 000 characters of stripped text — enough for a summary,
  // well under the token limit, and faster than sending the whole page.
  const excerpt = text.slice(0, 3000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are GopherGhost, a spectral narrator. Write a single short paragraph (≤ 2 sentences, ≤ 100 words) summarising the page below in a dry, slightly eerie tone. Use plain ASCII — no emoji, no markdown.",
          },
          { role: "user", content: excerpt },
        ],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Prepend an AI summary block (type "i" info lines) to a menu. */
function prependSummary(summary: string, items: GopherItem[]): GopherItem[] {
  const divider = { type: "i" as const, display: "~".repeat(70), selector: "", host: "(null)", port: 0 };
  const mk = (d: string) => ({ type: "i" as const, display: d, selector: "", host: "(null)", port: 0 });
  const words = summary.replace(/\s+/g, " ").trim();
  // Wrap at 68 chars so the leading "  " fits in 70-col terminals.
  const wrapped: GopherItem[] = [];
  let line = "";
  for (const word of words.split(" ")) {
    if (!line) { line = word; continue; }
    if (line.length + 1 + word.length <= 68) { line += " " + word; }
    else { wrapped.push(mk("  " + line)); line = word; }
  }
  if (line) wrapped.push(mk("  " + line));
  return [divider, mk("  GHOST NARRATOR"), mk(""), ...wrapped, mk(""), divider, mk(""), ...items];
}

// ---------------------------------------------------------------------------
// HTTP fetch helper
// ---------------------------------------------------------------------------
async function fetchPage(raw: string): Promise<{ html: string; url: string; originalBytes: number }> {
  let url = assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "GopherGhost/0.1" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = assertPublicUrl(new URL(loc, url).href);
      continue;
    }
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("Not an HTML page");
    // Read as ArrayBuffer first so we can get the true byte length before the cap.
    const buf = await res.arrayBuffer();
    const originalBytes = buf.byteLength;
    const html = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    return { html, url: url.href, originalBytes };
  }
  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
http
  .createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");

    if (u.pathname === "/api/browse") {
      try {
        const { html, url, originalBytes } = await fetchPage(u.searchParams.get("url") ?? "");
        const items = htmlToMenu(html, url);
        const isRaw = u.searchParams.get("raw") === "1";
        res.writeHead(200, { "content-type": isRaw ? "text/plain; charset=utf-8" : "application/json" });
        if (isRaw) {
          res.end(serializeMenu(items));
        } else {
          // Run AI summary in parallel — if it fails we just skip it.
          const plainText = items.map((i) => i.display).join("\n");
          const [summary] = await Promise.all([ghostSummarize(plainText)]);
          const finalItems = summary ? prependSummary(summary, items) : items;
          const ghostBytes = Buffer.byteLength(serializeMenu(finalItems), "utf8");
          res.end(JSON.stringify({ url, items: finalItems, originalBytes, ghostBytes }));
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
        assertPublicGopherUrl(raw);  // SSRF: validates protocol, private hosts, and port
        const { host, port, type, selector } = parseGopherUrl(raw);
        const isRaw = u.searchParams.get("raw") === "1";
        if (isRaw) {
          const text = await fetchRaw(host, port, selector);
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
          res.end(text);
        } else if (type === "0") {
          // Type-0 is a plain text file, not a menu. Wrap each line as an info item
          // so the frontend can render it readably with the standard draw animation.
          const text = await fetchRaw(host, port, selector);
          const rawBytes = Buffer.byteLength(text, "utf8");
          const items: GopherItem[] = text
            .split(/\r?\n/)
            .filter((l) => l !== ".")
            .map((l) => ({ type: "i" as const, display: l, selector: "", host: "(null)", port: 0 }));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ items, rawBytes, protocol: "gopher" }));
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

    // Serve index.html for everything else.
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(path.join(root, "index.html")));
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(Number(process.env.PORT) || 3000, () =>
    console.log("GopherGhost haunting http://localhost:" + (process.env.PORT || 3000)),
  );
