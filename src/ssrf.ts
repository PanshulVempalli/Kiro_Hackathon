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

export function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (isPrivateHost(u.hostname)) throw new Error("Target host is not allowed");
  return u;
}
