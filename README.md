# Throughline — internal audit platform

A working internal audit platform: an engagement is created, scoped, evidenced, tested and reported in one file,
with the ordering rules of the discipline enforced by the software rather than by a reviewer noticing.

## Run it

Open `dist/index.html` in a browser. No server or install is needed; data is kept in the browser's local storage.

To work on the source, open `src/index.html` directly, and rebuild the single-file bundles with:

    python3 build.py

## What it does

| Stage | What the platform does |
| --- | --- |
| Scope (Checkpoint 1) | Refuses to derive anything until client, type, period, sub-processes and exclusions are recorded |
| Requests & documents | Derives the request list from the sub-processes in scope, each with its required form and fields. Uploaded files are hashed, classified, tied to the request they satisfy, and CSV headers are checked against the required fields |
| Process understanding | Step-by-step capture per sub-process; flags steps with no reviewer, no evidence, or one role performing and approving |
| Risks & controls | Proposes library risks per sub-process (accept, rewrite or set aside with a reason); scores likelihood × impact; documents the control as-is or records an absence, which raises a gap directly |
| Procedure plan (Checkpoint 2) | Sizes every effectiveness test from the control's frequency using the methodology table; overrides require a reason |
| Testing | Design first (walkthrough + five factors). Effectiveness only if design passes: population, completeness basis, seeded sample selection, attribute grid. One failed attribute makes the control ineffective — there is no override |
| Data analysis | Two- and three-way reconciliation across the whole population, duplicate detection, near-threshold test |
| Gaps | Raised automatically from failed tests, absences and analyses; cannot be reported without cause, rating, named owner, date and clearance |
| Report & outputs | Report, risk and control matrix and risk register rendered from the working papers; issue is blocked until every guard is met |
| Follow-up | An action closes only with linked evidence |

Every change is written to an append-only audit trail, and the file is scored continuously against explicit quality rules.

## Layout

    src/js/kb.js        knowledge base: frameworks and the risk & control library
    src/js/engine.js    sample sizing, scoring, guards, intake, reconciliation, quality rules
    src/js/store.js     state, persistence, and every operation that changes an engagement
    src/js/seed.js      sample data, loaded through the same intake path as a real upload
    src/js/ui.js        render loop, data binding, dialogs, uploads, shell
    src/js/views-*.js   screens
    build.py            bundles src/ into dist/

## Not built yet

A server, database, sign-in and multi-user access; text extraction from scanned PDFs and images; engines for the
non-assurance engagement types (policies and procedures, physical verification, expenditure verification and others).
