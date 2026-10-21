# SkillProof execution milestones

Each milestone is implemented, checked, and pushed independently, in order.

1. [x] Real skill profiles: source, declarations, immutable version history, hashes, local persistence, export.
2. [x] Versioned digital PDF fixtures with expected outputs and scoring rules (5 actual files, CC0, scoped to English/ASCII digital PDFs).
3. [x] Actual deterministic PDF.js extraction adapter, registered profile binding, pinned profile revision, input/output hashes, measured results distinct from demos.
4. [x] Fixed-adapter browser worker boundary, network API denial, cancellation/termination, 10-second per-file timeout and input/page/output quotas. Not an OS sandbox for arbitrary plugins; browser heap is not independently capped.
5. [x] Full evidence reports: exact source, manifest, input/output hashes, grader and adapter versions, browser environment/quotas, explicit no-model metadata; Node reproduction command.
6. [x] Local single-user SQLite API, immutable profile storage, verified execution storage, serial background queue, cancellation, logs, restart recovery, explicit browser sync and server export.
7. [x] Evidence-verified condition gating, per-case improvements/regressions/output changes, automatic prior-version comparison, and backend regression jobs on registered profile updates with an existing baseline.
8. [ ] Report sharing, skill submissions, publisher/source attribution and feedback.

Uploaded Markdown is a declaration, never executable code. Real extraction results are distinct from demo results and static checks. A deterministic adapter does not represent unrestricted execution of arbitrary skill instructions.
