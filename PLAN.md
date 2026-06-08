# PLAN

Date: 2026-06-03

## Current Product Direction
The current Block 2 direction is now framed as:

`an agentic supply-intelligence pipeline that converts contractual documents into traceable, market-monitorable critical supplies`

This is a positioning pivot, not a runtime reset. The existing architecture/runtime work remains the delivered foundation, and the active workstream moves upstream toward better extraction, normalization, retrieval, and coverage.

## Monorepo Source Of Truth
`Nexum-IA` is now the intended single-repo deliverable for the hackathon.

- Web code remains at the repo root.
- Backend/runtime code is carried under `mcp-fca-hackaton/`.
- Future implementation work should treat this repository as the canonical home for both surfaces.

## Active Priorities
1. Improve contractual-document supply extraction quality.
2. Improve normalization so chapter headers, scopes, and activity rows do not become candidate supplies.
3. Improve market-mapping coverage so more normalized supplies become truly monitorable.
4. Preserve provenance from source document -> extracted row -> normalized supply -> selected supply -> market mapping.
5. Make coverage gaps visible in the product instead of reporting them as generic supply errors only.
6. Instrument the pipeline with Arize so deterministic and agentic variants can be traced and evaluated.

## Planning Structure
1. Master plan: [docs/block2-supply-agent-master-plan.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-supply-agent-master-plan.md)
2. Architecture closeout: [docs/block2-subplan-supply-agent-architecture.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-supply-agent-architecture.md)
3. Input-quality / retrieval workstream: [docs/block2-subplan-supply-agent-input-quality.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-supply-agent-input-quality.md)
4. Arize tracing/evaluation workstream: [docs/block2-subplan-arize-supply-intelligence-evals.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-arize-supply-intelligence-evals.md)
5. Shadow agentic retrieval workstream: [docs/block2-subplan-agentic-retrieval-shadow-pipeline.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-agentic-retrieval-shadow-pipeline.md)
6. Phoenix iteration-comparison handoff: [docs/block2-subplan-phoenix-iteration-comparison.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-phoenix-iteration-comparison.md)
7. Deterministic baseline for later comparison: [docs/block2-deterministic-baseline-2026-06-03.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-deterministic-baseline-2026-06-03.md)

## Explicit Next-Step Hypothesis
The next major improvement track should evaluate a retrieval-assisted or agentic retrieval pipeline that:
- runs end-to-end from the same contractual documents rather than assuming deterministic extraction is complete,
- distinguishes purchasable supplies from headings/scopes/activities,
- normalizes noisy contractual line items into market-monitorable supply candidates,
- preserves provenance and confidence at each step,
- is traced and evaluated in Arize across extraction, qualification, normalization, and mapping spans,
- is compared directly against the stored deterministic baseline before replacing the current pipeline.
