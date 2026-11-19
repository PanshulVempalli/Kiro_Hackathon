# Tech
- TypeScript, ESM, Node 20+. Zero framework on the frontend (single public/index.html).
- Core logic lives in src/gopher.ts and must stay pure (no I/O) so it is property-testable.
- Tests: vitest + fast-check. Any pure function that parses, serializes or transforms data gets a property-based test.
- Security: all outbound fetches go through assertPublicUrl (src/ssrf.ts), re-validated on every redirect. Render untrusted text with textContent, never innerHTML.
