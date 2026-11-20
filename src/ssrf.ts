/** Block obviously private/internal targets. NOTE: does not defend against DNS rebinding. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":") || h.startsWith("[")) return true; // block IPv6 literals
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const STANDARD_HTTP_PORTS: Record<string, number> = { "http:": 80, "https:": 443 };

export function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (isPrivateHost(u.hostname)) throw new Error("Target host is not allowed");
  // Block non-standard ports: only the protocol's default (or no explicit port) is allowed.
  if (u.port !== "" && Number(u.port) !== STANDARD_HTTP_PORTS[u.protocol]) {
    throw new Error(`Non-standard port ${u.port} is not allowed`);
  }
  return u;
}

/**
 * Validate a gopher:// URL for SSRF safety.
 * - Protocol must be gopher:
 * - Host must not be private
 * - Port must be 70 (default) or 7070 (common alternate); no other ports.
 */
export function assertPublicGopherUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "gopher:") throw new Error("Only gopher:// URLs are allowed here");
  if (isPrivateHost(u.hostname)) throw new Error("Target host is not allowed");
  const port = u.port ? Number(u.port) : 70;
  if (port !== 70 && port !== 7070) throw new Error(`Non-standard Gopher port ${port} is not allowed`);
  return u;
}
