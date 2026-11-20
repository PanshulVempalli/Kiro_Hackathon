# Requirements: GopherGhost

## 1. Convert pages to Gopher menus
**User story:** As a reader, I want any web page shown as a clean Gopher menu so I can read it without clutter.
1. WHEN a user submits an http(s) URL THEN the system SHALL return a menu of info lines and link items.
2. WHEN a page contains scripts, styles, nav or footers THEN the system SHALL omit them.
3. THE system SHALL wrap text at 70 columns.
4. THE system SHALL list at most 50 unique http(s) links as type "h" items.

## 2. Gopher fidelity
1. THE system SHALL serialize menus per RFC 1436 (TAB-separated fields, CRLF lines, "." terminator).
2. FOR ALL valid menus, parse(serialize(menu)) SHALL equal menu.

## 3. Browsing
1. WHEN the user activates a link item THEN the system SHALL load that page.
2. THE UI SHALL be fully keyboard-operable and use aria-live for results.

## 4. Safety
1. THE system SHALL reject non-http(s) URLs and private/internal hosts, including via redirects.
2. THE system SHALL time out fetches after 8 seconds and cap bodies at 500 KB.

## 5. Haunted UI (Resurrection theme)
1. THE UI SHALL present a green phosphor CRT look with scanlines and flicker.
2. WHERE prefers-reduced-motion is set THEN flicker SHALL be disabled.

## 6. Bloat meter
1. WHEN a page loads THEN the system SHALL return the original HTML size in bytes and the GopherGhost output size in bytes in the JSON response.
2. WHEN the UI renders a page THEN it SHALL display the original size in KB, the ghost size in KB, and the percent saved above the menu, e.g. "Original 2.4 MB → Ghost 6 KB (99.7% banished)".
3. THE percent saved SHALL always be between 0 and 100 inclusive.
