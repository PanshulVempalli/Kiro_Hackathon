# GopherGhost

**The 1991 internet, haunting the modern web.**

GopherGhost brings the Gopher protocol (RFC 1436) back from the dead. Paste any web address and it strips out the scripts, ads and clutter, then returns a clean, fast Gopher menu in a haunted green-phosphor terminal. It also browses real `gopher://` servers.

Built for **Kiroween 2026**, category: **Resurrection**.

- Live demo: https://gopherghost.onrender.com
- Repository: https://github.com/PanshulVempalli/Kiro_Hackathon

> The demo runs on Render's free plan. If it has been idle, the first load can take up to 50 seconds to wake up.

## Why

A single news article can carry megabytes of ads, trackers and scripts just to show a few paragraphs. That is slow on weak connections and hard on screen readers. Gopher was plain text from the start. GopherGhost uses it to make the modern web readable again.

## Features

- **Page to menu.** Any http(s) page becomes a Gopher menu: headings, paragraphs, lists and up to 50 links, with scripts, styles, navigation and footers removed. Text wraps at 70 columns.
- **Bloat meter.** Shows how heavy the original page was against its Gopher form, with a running "banished this session" total.
- **Real Gopher.** Browse live `gopher://` servers such as `gopher://gopher.floodgap.com`. Folders and text files are clickable.
- **Raw view.** Toggle to see the actual tab-separated Gopher menu text.
- **Navigation.** Back and forward history, a Trail panel of visited pages, `/` to focus the address bar, Backspace to go back.
- **Haunted CRT interface.** Boot sequence, scanlines, an ASCII ghost, amber links. Animations switch off when the visitor prefers reduced motion.
- **Accessible.** Keyboard operable, visible focus outlines, screen-reader announcements, and layouts that work on narrow screens.

## Try it

1. Open the live demo.
2. Click "NPR's text-only news" and watch the bloat meter count down.
3. Click "A real Gopher server (Floodgap)", open a folder, then press Backspace to return.
4. Click "raw gopher" to see the real menu format.

## Run locally

Requires Node.js 20 or newer.

```bash
git clone https://github.com/PanshulVempalli/Kiro_Hackathon.git
cd Kiro_Hackathon
npm install
npm test        # unit and property-based tests
npm run dev     # http://localhost:3000
```

`npm start` runs the server without file watching. The server reads the `PORT` environment variable and defaults to 3000.

## How it works

```
Browser ──> /api/browse?url=<http(s) url>   fetch page, convert HTML to a Gopher menu (JSON)
        ──> /api/gopher?url=<gopher url>    speak Gopher over TCP, parse the menu (JSON)
            add &raw=1 to either endpoint for the raw menu text
```

| Path | Purpose |
|---|---|
| `src/gopher.ts` | Pure core: serialize and parse menus, word wrap, HTML to menu conversion |
| `src/gopherClient.ts` | TCP client for `gopher://` URLs |
| `src/ssrf.ts` | Guard that blocks private and internal targets |
| `src/server.ts` | HTTP server and API endpoints |
| `public/index.html` | The CRT-style interface (single file, no framework) |
| `tests/` | Vitest unit tests and fast-check property-based tests |
| `.kiro/` | Specs, steering docs and hooks used to build the project |

## Safety

The server fetches addresses supplied by visitors, so it:

- accepts only http(s) and gopher URLs,
- blocks localhost, private and link-local addresses, and re-checks every redirect,
- limits fetch time and response size,
- renders untrusted page text with `textContent`, never as HTML.

One known limit: the private-address check works on the address as written and does not defend against DNS rebinding.

## Built with Kiro

The project was developed in the Kiro IDE using spec-driven development.

- **Specs** (`.kiro/specs/gopherghost`): requirements, design and a task list. Kiro implemented features task by task, including the history stack, raw view, `gopher://` client and bloat meter.
- **Steering** (`.kiro/steering`): product, tech and structure rules, for example keeping the parsing core pure and testable.
- **Hooks** (`.kiro/hooks`): one runs the tests when code changes, one keeps the task list in sync with the code.
- **Property-based testing** (fast-check): a menu always round-trips through serialize and parse, wrapping never exceeds the width or loses characters, and the bloat percentage stays between 0 and 100.

Only the Kiro IDE was used. No custom agents, MCP servers or powers were used.

## Disclosure

All code was written during the Kiroween 2026 Submission Period. The initial scaffold (first drafts of the spec, steering and hook files, the core parsing code and the first interface) and the final interface design were drafted with Claude, an AI assistant, and then developed further in Kiro. Third-party libraries are used under their own licenses: cheerio, tsx, vitest and fast-check. The VT323 typeface is loaded from Google Fonts. The demo browses the public Floodgap Gopher server.

## License

MIT. See [LICENSE](LICENSE).
