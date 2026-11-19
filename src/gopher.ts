import * as cheerio from "cheerio";

export type ItemType = "i" | "1" | "h" | "0";
export interface GopherItem {
  type: ItemType;
  display: string;
  selector: string;
  host: string;
  port: number;
}

const clean = (s: string) => s.replace(/[\t\r\n]/g, " ");

/** RFC 1436 menu: TYPE+display TAB selector TAB host TAB port CRLF, ended by ".CRLF". */
export function serializeMenu(items: GopherItem[]): string {
  return (
    items.map((i) => `${i.type}${clean(i.display)}\t${clean(i.selector)}\t${clean(i.host)}\t${i.port}\r\n`).join("") +
    ".\r\n"
  );
}

export function parseMenu(text: string): GopherItem[] {
  const out: GopherItem[] = [];
  for (const line of text.split("\r\n")) {
    if (line === ".") break;
    if (!line) continue;
    const [first, selector = "", host = "", port = "0"] = line.split("\t");
    out.push({ type: first[0] as ItemType, display: first.slice(1), selector, host, port: Number(port) });
  }
  return out;
}

/** Greedy word wrap. Words longer than `width` are hard-split. */
export function wrap(text: string, width = 70): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (w.length > width) {
      if (cur) lines.push(cur);
      cur = "";
      for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width));
      continue;
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const info = (display: string): GopherItem => ({ type: "i", display, selector: "", host: "(null)", port: 0 });

/** Convert an HTML page into a Gopher menu: readable text first, links as "h" items. */
export function htmlToMenu(html: string, base: string): GopherItem[] {
  const $ = cheerio.load(html);
  $("script,style,nav,footer,aside,noscript,svg,iframe,form").remove();
  const items: GopherItem[] = [];
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || base;
  for (const l of wrap(title.toUpperCase())) items.push(info(l));
  items.push(info("=".repeat(70)), info(""));

  $("h1,h2,h3,p,li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    const tag = String($(el).prop("tagName")).toLowerCase();
    if (tag.startsWith("h")) {
      items.push(info(""));
      wrap(text.toUpperCase()).forEach((l) => items.push(info(l)));
    } else if (tag === "li") {
      wrap(text, 66).forEach((l, i) => items.push(info((i === 0 ? "  * " : "    ") + l)));
    } else {
      wrap(text).forEach((l) => items.push(info(l)));
      items.push(info(""));
    }
  });

  const seen = new Set<string>();
  const links: GopherItem[] = [];
  $("a[href]").each((_, el) => {
    if (links.length >= 50) return;
    try {
      const u = new URL($(el).attr("href")!, base);
      if (!/^https?:$/.test(u.protocol) || seen.has(u.href)) return;
      seen.add(u.href);
      const label = $(el).text().replace(/\s+/g, " ").trim() || u.hostname;
      links.push({ type: "h", display: label.slice(0, 66), selector: "URL:" + u.href, host: "gopherghost", port: 70 });
    } catch {
      /* ignore bad hrefs */
    }
  });
  if (links.length) items.push(info("-- LINKS BEYOND THE VEIL --"), info(""), ...links);
  return items;
}
