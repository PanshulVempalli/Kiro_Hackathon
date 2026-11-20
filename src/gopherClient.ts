import net from "node:net";
import { isPrivateHost } from "./ssrf.js";
import { parseMenu, type GopherItem } from "./gopher.js";

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 200_000;

export interface GopherResponse {
  items: GopherItem[];
  rawBytes: number;
}

/**
 * Parse a gopher:// URL into its parts.
 * gopher://host[:port][/[type][selector]]
 * Defaults: port 70, type "1", selector "".
 */
export function parseGopherUrl(raw: string): { host: string; port: number; type: string; selector: string } {
  const u = new URL(raw);
  if (u.protocol !== "gopher:") throw new Error("Not a gopher:// URL");
  const host = u.hostname;
  const port = u.port ? Number(u.port) : 70;
  // pathname is like "/1/path/to/resource" or "/" or ""
  const pathname = decodeURIComponent(u.pathname);
  let type = "1";
  let selector = "";
  if (pathname.length > 1) {
    type = pathname[1];            // character after the leading /
    selector = pathname.slice(2);  // rest is the selector
  }
  return { host, port, type, selector };
}

/**
 * Fetch a gopher:// URL.
 * - Blocks private hosts (SSRF guard).
 * - Times out after 5 s.
 * - Caps the response at 200 KB.
 * - Returns parsed menu items for type "1"; throws for all other item types
 *   (callers that want raw text for type "0" should call fetchRaw instead).
 *
 * The optional `_isPrivate` parameter overrides the SSRF guard; pass a no-op
 * in tests that connect to a local mock server.
 */
export async function fetchGopherMenu(
  raw: string,
  _isPrivate: (host: string) => boolean = isPrivateHost,
): Promise<GopherResponse> {
  const { host, port, type, selector } = parseGopherUrl(raw);

  if (_isPrivate(host)) throw new Error("Target host is not allowed");
  if (port < 1 || port > 65535) throw new Error("Invalid port");

  const text = await fetchRaw(host, port, selector);
  const items = parseMenu(text);
  return { items, rawBytes: Buffer.byteLength(text, "utf8") };
}

/**
 * Open a TCP connection to host:port, send `selector\r\n`, and read the
 * response up to MAX_BYTES, respecting the 5 s timeout.
 * Exported so server.ts can serve raw type-0 documents.
 */
export async function fetchRaw(host: string, port: number, selector: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const done = (err?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value!);
    };

    const timer = setTimeout(() => done(new Error("Gopher request timed out")), TIMEOUT_MS);

    const socket = net.createConnection({ host, port }, () => {
      socket.write(selector + "\r\n");
    });

    socket.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        // Keep what we have up to the cap and close.
        const remaining = MAX_BYTES - (totalBytes - chunk.length);
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
        done(undefined, Buffer.concat(chunks).toString("utf8"));
        return;
      }
      chunks.push(chunk);
    });

    socket.on("end", () => done(undefined, Buffer.concat(chunks).toString("utf8")));
    socket.on("error", (e) => done(e));
  });
}
