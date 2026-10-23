# Validation and scope

Tested locally on Windows with Node.js 24.19.0, pnpm 11.25.0 and headless Microsoft Edge.

## Automated checks

```sh
pnpm test
pnpm build
node --experimental-strip-types scripts/reproduce.mjs path/to/exported-report.json
```

The tests cover static inspection, immutable profile revisions, fixture byte hashes, actual PDF extraction, quotas/network API restrictions, evidence integrity, comparison compatibility, SQLite persistence/restart, queue cancellation, automatic regression jobs, publication redaction/provenance, feedback throttling, submission acceptance and share revocation.

Five PDF cases are synthetic and intentionally narrow: single-page text, multiple pages, a blank page, punctuation and an invalid file. Every valid case was extracted in browser and Node workers; the invalid case was rejected. A browser-generated full report was reproduced in Node with all five output hashes and grading outcomes matching. Timing is not expected to match.

## Browser workflows checked

- Inspect -> save profile -> reload -> create revision -> view prior immutable source.
- Register PDF adapter -> choose revision -> execute all five fixtures -> save/export actual evidence.
- Abort and timeout workers; reject oversized input; recover with a subsequent valid run. Cancellation does not create a completed execution record.
- Queue in local API -> completion -> recover results into browser; persistence across service restart.
- Run two revisions -> automatic same-condition comparison; reject comparison against a different environment label.
- Publish summary/full evidence -> open in another browser context -> submit inert-text feedback -> revoke -> old link unavailable.
- Submit a skill -> inspect pending source -> accept as a declaration profile; no automatic execution/publication.
- Mobile source/result/share layouts and horizontally scrollable navigation.
- Profile library: case-insensitive multi-keyword search over the latest name/description, clear/no-match states, and version-specific evidence counts. After a real five-case PDF run, a new revision shows no current evidence while the prior revision retains its 5/5 result. Checked at 390px mobile width without horizontal page overflow.

## Explicit boundaries

- No language model is called; this is a registered deterministic PDF adapter, not unrestricted execution of arbitrary Markdown instructions.
- Browser workers are restricted trusted-code execution boundaries, not OS sandboxes. Browser heap has no independent hard limit. Node workers have a V8 heap limit, not a hard native/process memory quota.
- The API is loopback-only and single-user. There is no multi-user authentication or internet deployment. Read-only share UI does not isolate private management APIs for public hosting.
- Names are self-declared, not verified identities. Hashes establish content consistency, not independent certification.
- A valid summary is not a reproducible report; source, expected text, outputs and environment are only included when full evidence is explicitly published.
- Browser workspace backup covers demo favorites/runs. Profiles/executions have separate export/sync paths; the local API export additionally contains jobs, shares, submissions and feedback. The SQLite file is excluded from Git.
