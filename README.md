# Throughline — internal audit platform

A working internal audit platform: an engagement is created, scoped, evidenced, tested and reported in one file,
with the ordering rules of the discipline enforced by the software rather than by a reviewer noticing.

## Run it

Open `dist/index.html` in a browser. No server or install is needed; data is kept in the browser's local storage.

To work on the source, open `src/index.html` directly, and rebuild the single-file bundles with:

    python3 build.py

## How it works: the agent is the engine

Every page sits beside an agent panel. Each stage of the engagement can be produced four ways, and they can be mixed:

1. **From the document library.** Click *Build the scope from it*, *Build this walkthrough* or *Build the whole matrix*; the agent finds the engagement letter or the meeting notes among the documents already received and builds from them.
2. **By dropping the document on the page.** Each page has a bar that accepts the file it needs and builds straight from it.
3. **By talking to the agent.** Describe the scope or the process in the chat, or give an instruction.
4. **By hand.** Every field the agent fills can be typed, edited or removed.

Everything the agent writes is marked *Agent draft* until the auditor accepts it, every action is reported in the thread with
what was done, what is for the auditor to settle and what data is still needed, and the last actions can be undone.
The two checkpoints, the sample sizes, the ordering rules and the test conclusions stay with the code and the auditor: the agent
cannot confirm the scope, approve the plan or conclude a test, and the plan cannot be approved while drafts are open.

The agent runs on Claude when the page is opened as a claude.ai artifact. Anywhere else it runs on a built-in rules
engine that reads the same documents (structured letters and notes work best) and cannot follow free-form instructions.

## What it does

| Stage | What the platform does |
| --- | --- |
| Scope (Checkpoint 1) | Drafted from the engagement letter: client, period, type, sub-processes, exclusions, addressee. Nothing is derived until the auditor confirms it |
| Information request list | A living, versioned list. Rebuilt from the scope, the evidence named in the walkthroughs and the key controls, and re-checked whenever a document arrives: received, wrong form, missing fields, wrong or partial period, source not recorded. The auditor can override a status with a reason, remove an item for good, or restore it; every version is kept in the history |
| Document library | Everything dumped in is read (CSV, Excel, PDF text, Word, plain text), classified and given an item card with its main points. Each file links itself to the request it satisfies or waits as pending; the allocation queue is where links are approved, changed, or marked reference only. The set is drawn as a hierarchy by process and request, type, period or source |
| Process understanding | Built from the meeting notes: tasks, automated steps and decisions with their branches, who reviews and approves, the system used and the evidence kept. Drawn as a swimlane with loops, a systems band with hand-offs, and the risks and controls pinned to their steps. Steps with no independent check are flagged |
| Risks & controls | Built from the recorded steps and the library: each risk with the control as the steps show it operating, or an absence where they show none (raised as a gap). One role performing and approving is raised as a risk. The agent lists what extra data it needs |
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
    src/js/library.js   file readers, item cards, main points, document hierarchy
    src/js/flow.js      swimlane flow: decisions, loops, systems, risks and controls, drawn from the recorded steps
    src/js/agent.js     the agent: builders, prompts, rules fallback, chat, undo, and the panel
    src/vendor/         SheetJS, pdf.js and JSZip, shipped with the app so no CDN is needed
    src/js/views-*.js   screens
    build.py            bundles src/ into dist/
    tests/              browser tests (Playwright): `node tests/<file>.js "$PWD/dist/index.html" <screenshot dir> [tests/files]`

## Not built yet

A server, database, sign-in and multi-user access; a backend that calls the Claude API so the agent runs on the model outside claude.ai; reading scanned PDFs and images without the assistant (text PDFs, Word and Excel are read); engines for the
non-assurance engagement types (policies and procedures, physical verification, expenditure verification and others).
