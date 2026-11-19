# Design
Browser -> GET /api/browse?url= -> server validates URL (ssrf.ts) -> fetch HTML -> htmlToMenu (gopher.ts) -> JSON items (or ?raw=1 for true Gopher text).
Data model: GopherItem {type: i|1|h|0, display, selector, host, port}. Link selector = "URL:<absolute-url>".
Correctness properties (PBT): menu round-trip; wrap width and content preservation; terminator always present.
Risks: SSRF (mitigated, DNS rebinding noted), huge pages (size cap).
