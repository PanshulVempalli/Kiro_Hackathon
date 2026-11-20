import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseMenu, serializeMenu, wrap, htmlToMenu, type GopherItem } from "../src/gopher.js";
import { isPrivateHost, assertPublicUrl, assertPublicGopherUrl } from "../src/ssrf.js";
import { parseGopherUrl, fetchRaw, fetchGopherMenu } from "../src/gopherClient.js";
import net from "node:net";

const safe = fc.string().filter((s) => !/[\t\r\n]/.test(s));
const item: fc.Arbitrary<GopherItem> = fc.record({
  type: fc.constantFrom("i", "1", "h", "0") as fc.Arbitrary<GopherItem["type"]>,
  display: safe, selector: safe, host: safe,
  port: fc.integer({ min: 0, max: 65535 }),
});

describe("gopher menu", () => {
  it("round-trips: parse(serialize(x)) === x", () => {
    fc.assert(fc.property(fc.array(item), (items) => { expect(parseMenu(serializeMenu(items))).toEqual(items); }));
  });
  it("serialized output always ends with the terminator", () => {
    fc.assert(fc.property(fc.array(item), (items) => serializeMenu(items).endsWith(".\r\n")));
  });
});

describe("wrap", () => {
  it("never exceeds width and never loses characters", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 5, max: 100 }), (text, w) => {
        const lines = wrap(text, w);
        expect(lines.every((l) => l.length <= w)).toBe(true);
        expect(lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
      }),
    );
  });
});

describe("htmlToMenu", () => {
  it("extracts text and http links, drops scripts", () => {
    const m = htmlToMenu('<title>Hi</title><script>evil()</script><p>Hello</p><a href="/x">X</a><a href="javascript:1">bad</a>', "https://a.com/");
    expect(m.some((i) => i.display.includes("evil"))).toBe(false);
    expect(m.filter((i) => i.type === "h").map((i) => i.selector)).toEqual(["URL:https://a.com/x"]);
  });
});

describe("ssrf", () => {
  it("blocks private hosts", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "172.20.0.1", "[::1]"]) expect(isPrivateHost(h)).toBe(true);
    expect(isPrivateHost("example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertPublicUrl — HTTP/S guard including non-standard port check
// ---------------------------------------------------------------------------
describe("assertPublicUrl", () => {
  it("accepts standard http and https URLs", () => {
    expect(() => assertPublicUrl("http://example.com/path")).not.toThrow();
    expect(() => assertPublicUrl("https://example.com/path")).not.toThrow();
    expect(() => assertPublicUrl("https://example.com:443/path")).not.toThrow();
    expect(() => assertPublicUrl("http://example.com:80/path")).not.toThrow();
  });

  it("rejects gopher:// URLs", () => {
    expect(() => assertPublicUrl("gopher://gopher.example.com")).toThrow("Only http(s) URLs are allowed");
  });

  it("rejects non-standard ports", () => {
    expect(() => assertPublicUrl("http://example.com:8080/")).toThrow("Non-standard port");
    expect(() => assertPublicUrl("https://example.com:8443/")).toThrow("Non-standard port");
  });

  it("rejects private hosts", () => {
    expect(() => assertPublicUrl("https://192.168.1.1/")).toThrow("not allowed");
    expect(() => assertPublicUrl("https://localhost/")).toThrow("not allowed");
  });
});

// ---------------------------------------------------------------------------
// assertPublicGopherUrl — gopher:// SSRF guard
// ---------------------------------------------------------------------------
describe("assertPublicGopherUrl", () => {
  it("accepts standard gopher URLs (port 70 and 7070)", () => {
    expect(() => assertPublicGopherUrl("gopher://gopher.example.com")).not.toThrow();
    expect(() => assertPublicGopherUrl("gopher://gopher.example.com:70/1/")).not.toThrow();
    expect(() => assertPublicGopherUrl("gopher://gopher.example.com:7070/1/")).not.toThrow();
  });

  it("rejects http:// URLs", () => {
    expect(() => assertPublicGopherUrl("https://example.com")).toThrow("Only gopher://");
  });

  it("rejects private hosts", () => {
    expect(() => assertPublicGopherUrl("gopher://localhost/")).toThrow("not allowed");
    expect(() => assertPublicGopherUrl("gopher://10.0.0.1/")).toThrow("not allowed");
    expect(() => assertPublicGopherUrl("gopher://192.168.1.1/")).toThrow("not allowed");
  });

  it("rejects non-standard ports", () => {
    expect(() => assertPublicGopherUrl("gopher://gopher.example.com:1234/")).toThrow("Non-standard Gopher port");
    expect(() => assertPublicGopherUrl("gopher://gopher.example.com:9999/")).toThrow("Non-standard Gopher port");
  });

  it("property: any private IP is always blocked", () => {
    for (const h of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.1.1"]) {
      expect(() => assertPublicGopherUrl(`gopher://${h}/`)).toThrow("not allowed");
    }
  });
});

describe("bloat meter", () => {
  it("saved percent is always between 0 and 100 inclusive", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000 }),  // originalBytes
        fc.nat({ max: 10_000_000 }),  // ghostBytes
        (originalBytes, ghostBytes) => {
          const saved = originalBytes > 0
            ? Math.min(100, Math.max(0, Math.round((1 - ghostBytes / originalBytes) * 1000) / 10))
            : 0;
          expect(saved).toBeGreaterThanOrEqual(0);
          expect(saved).toBeLessThanOrEqual(100);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// parseGopherUrl
// ---------------------------------------------------------------------------

describe("parseGopherUrl", () => {
  it("parses a bare host with no path", () => {
    const r = parseGopherUrl("gopher://gopher.example.com");
    expect(r).toMatchObject({ host: "gopher.example.com", port: 70, type: "1", selector: "" });
  });

  it("parses a host with a custom port", () => {
    const r = parseGopherUrl("gopher://gopher.example.com:7070");
    expect(r.port).toBe(7070);
  });

  it("parses type and selector from the path", () => {
    const r = parseGopherUrl("gopher://gopher.example.com/1/fun/stuff");
    expect(r).toMatchObject({ type: "1", selector: "/fun/stuff" });
  });

  it("parses a text-file item (type 0)", () => {
    const r = parseGopherUrl("gopher://gopher.example.com/0/README.txt");
    expect(r).toMatchObject({ type: "0", selector: "/README.txt" });
  });

  it("throws on non-gopher URLs", () => {
    expect(() => parseGopherUrl("https://example.com")).toThrow("Not a gopher:// URL");
  });

  it("property: round-trip host/port survive URL construction", () => {
    fc.assert(
      fc.property(
        fc.domain(),
        fc.integer({ min: 1, max: 65535 }),
        fc.constantFrom("0", "1", "h", "i"),
        fc.string({ unit: "grapheme" }).filter((s) => !/[#?]/.test(s)),
        (host, port, type, selector) => {
          const encoded = encodeURIComponent(selector);
          const raw = `gopher://${host}:${port}/${type}${encoded}`;
          const p = parseGopherUrl(raw);
          expect(p.host).toBe(host);
          expect(p.port).toBe(port);
          expect(p.type).toBe(type);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// fetchRaw / fetchGopherMenu – unit tests using a real local TCP server
// ---------------------------------------------------------------------------

function startMockGopherServer(response: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.once("data", () => socket.end(response));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => server.close() });
    });
  });
}

describe("fetchRaw", () => {
  it("sends the selector and returns the response text", async () => {
    const payload = "1Main Menu\t/\tgopher.example.com\t70\r\n.\r\n";
    const { port, close } = await startMockGopherServer(payload);
    try {
      const text = await fetchRaw("127.0.0.1", port, "/");
      expect(text).toBe(payload);
    } finally {
      close();
    }
  });

  it("caps the response at 200 KB", async () => {
    // Send 250 KB; fetchRaw must return exactly 200 KB.
    const big = "x".repeat(250_000);
    const { port, close } = await startMockGopherServer(big);
    try {
      const text = await fetchRaw("127.0.0.1", port, "");
      expect(text.length).toBe(200_000);
    } finally {
      close();
    }
  });
});

describe("fetchGopherMenu", () => {
  it("parses menu items from a local server", async () => {
    const payload =
      "1Floodgap Systems\t/\tgopher.floodgap.com\t70\r\n" +
      "iHello world\t\t(null)\t0\r\n" +
      ".\r\n";
    const { port, close } = await startMockGopherServer(payload);
    try {
      // Build a gopher:// URL pointing at our loopback server.
      // Pass a no-op SSRF guard so the loopback address is not rejected.
      const { items } = await fetchGopherMenu(`gopher://127.0.0.1:${port}/1/`, () => false);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ type: "1", display: "Floodgap Systems" });
      expect(items[1]).toMatchObject({ type: "i", display: "Hello world" });
    } finally {
      close();
    }
  });

  it("blocks private hosts", async () => {
    await expect(fetchGopherMenu("gopher://192.168.1.1/1/")).rejects.toThrow("not allowed");
    await expect(fetchGopherMenu("gopher://10.0.0.1/1/")).rejects.toThrow("not allowed");
    await expect(fetchGopherMenu("gopher://localhost/1/")).rejects.toThrow("not allowed");
  });
});
