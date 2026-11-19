import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseMenu, serializeMenu, wrap, htmlToMenu, type GopherItem } from "../src/gopher.js";
import { isPrivateHost } from "../src/ssrf.js";

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
