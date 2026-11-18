# Image Studio requirement traceability

This convention was approved under CTAI-REQ-0001 / CTAI-CHG-0001.
It applies to Image Studio development and its directly related integration work.

## Canonical records

The Obsidian requirements workspace is:

`D:\obsidian\aidianshang\AI生图WEB`

Start with `出图AI-近期修改需求汇总.md` and `00-管理\编号与开发约定.md`.
Do not append this project's requirements to the former `需求` directory.
The archived original document is evidence, not the current specification.

## Required workflow

1. Before implementing a requested change, find the existing requirement or
   register a new `CTAI-REQ-NNNN`. Register a `CTAI-CHG-NNNN` linked to at least
   one requirement. Announce both identifiers in the initial work summary.
2. Read the next-number cursors from the canonical overview, check that the
   identifiers are unused, and advance the cursors when registering them.
   Never hard-code a remembered next number, renumber, or reuse canceled IDs.
3. Keep current behavior and acceptance criteria in the requirement card.
   Record scope, reasons, affected files, tests, limitations, deployment and
   commit status in the change record and its register.
4. Update the same change through implementation and verification. Create a
   separate change for an independently requested fix or scope adjustment.
   Do not allocate a new requirement for every file or code line.
5. Before finishing, synchronize the records and report the REQ/CHG IDs.
   Distinguish implementation, isolated tests, real-account verification,
   deployment, Git commits and user acceptance. Never infer acceptance from
   automated checks or carry historic paid-call/restart permissions forward.
6. When a commit is explicitly authorized, include the related REQ/CHG IDs in
   its title or body. Do not rewrite historical commits to add identifiers.
   Number registration does not authorize commits, pushes, restarts, account
   writes, database changes or paid model calls.
7. If the Obsidian workspace is unavailable or a write fails, explicitly report
   the unsynchronized work and resolve the location/number reservation before
   claiming registration. Never invent IDs or silently skip synchronization.

Read-only explanations do not require a change record unless they introduce
or revise a requirement. Never store credentials or sensitive account data.
