# Source and snapshot contract

## Research

Use internet access during authoring. Prefer official documentation, specifications, source code, papers, standards, and the original PR/document over summaries. Search for current material, then freeze the material the lesson actually teaches.

Each source record needs a stable local ID, title, canonical URL, capture date, and enough locator/revision data to find the claim again. Add a short excerpt only when it makes the inline preview useful. Stay within quotation and license limits.

## Citations

Attach citations to the claims they support. The shared marker opens on hover or focus, pins on click/tap, closes on Escape or outside interaction, and links to the source. Its popup shows title, excerpt when present, locator/revision, and capture date. Also pass every cited record to the lesson source panel.

## Snapshots

- PR lessons capture the current PR HEAD and base state at authoring, including SHAs. They do not poll or regenerate later.
- Codebase lessons record the inspected commit when Git is available.
- Document lessons record a version, revision, timestamp, or content hash when available.
- Technology lessons record exact tested versions and commands.
- Remote presentation assets may remain remote; teaching meaning must not depend on parsing their latest contents.

When a source cannot be installed or reproduced because it needs hardware, payment, or authentication, do not request login. Use authoritative sources and state the limitation in `VERIFICATION.md`.
