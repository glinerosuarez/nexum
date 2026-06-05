# Block 2 Subplan: Supply-Agent Input Quality

Date: 2026-06-02

## Summary
This subplan is the active Block 2 bucket after the architecture/runtime foundation was closed on 2026-06-02.

The focus is now upstream supply intelligence: improve the quality of data that drives supply-agent target selection before forecasting and risk computation run.

The key problem is that uploaded contractual documents currently feed coarse or noisy budget supplies, which makes downstream selection less stable, less market-monitorable, and less explainable than it should be. The highest-leverage improvement is to strengthen parsing, qualification, normalization, retrieval, and provenance before selected supplies are handed to the runtime that already exists.

This bucket explicitly does not include a user-facing "why these supplies" panel yet. The goal is to make the underlying input model trustworthy first.

## Goal
1. Improve the quality of supply-agent inputs before forecasting and risk computation.
2. Ensure selected supplies are explainable from upstream parsed source material, not only from aggregated budget rows.
3. Increase the share of selected supplies that are actually market-monitorable critical supplies.

## Current Problem Framing
- Contractual documents are a primary upstream source for project budget construction and supply targeting.
- Today those documents can collapse into coarse or duplicated budget rows before supply-agent selection happens.
- Today they can also promote headings, scopes, bundled work descriptions, and mixed rows into candidate supplies.
- Once that collapse happens, later stages can only explain selection from aggregated budget artifacts, not from the original source material that produced them.
- As a result, deterministic parsing can produce many candidate supplies that cannot be mapped to any market/source signal.
- The architecture/runtime stack is already in place, so the next highest-leverage work is to improve the inputs entering target selection rather than changing downstream execution behavior.

## Implementation Changes
1. **Parsing pipeline**
- Improve extraction of supply-like rows from uploaded contractual documents.
- Distinguish likely purchasable supplies from headings, scopes, and activity bundles before candidate generation.
- Preserve source-document references for each extracted row.
- Capture extraction confidence or parsing notes where available.
- Make degradation explicit for malformed or partial documents instead of silently collapsing rows into ambiguous budget inputs.

2. **Qualification and normalization pipeline**
- Add explicit supply qualification so only monitorable candidates flow into the critical-supply path.
- Deduplicate materially equivalent supplies before they become selection inputs.
- Normalize names, units, and categories before rows become budget inputs.
- Define deterministic grouping rules so downstream target selection is stable for the same upstream material.
- Persist normalization decisions so later debugging can explain why multiple parsed rows became one normalized candidate.

3. **Retrieval-assisted improvement track**
- Evaluate a retrieval-assisted or agentic retrieval pipeline as the next main evolution beyond deterministic parsing.
- Allow that shadow pipeline to run end-to-end from the same contractual documents, not only from deterministic extracted rows.
- Use retrieval to:
  - enrich ambiguous line items,
  - recover supply candidates that deterministic extraction may have missed,
  - resolve likely commodity/material intent,
  - separate true purchasable supplies from contractual descriptions that should never be monitored as supplies.
- Compare this pipeline directly against the stored deterministic baseline before making it the default path.
- Route this comparison through the Arize workstream so quality improvements are traceable and reviewable.
- Track the implementation details of this shadow path in:
  - [block2-subplan-agentic-retrieval-shadow-pipeline.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-agentic-retrieval-shadow-pipeline.md)

4. **Selection-input persistence**
- Persist provenance fields linking:
  - source document,
  - extracted row,
  - normalized supply candidate,
  - final selected supply,
  - market/source mapping outcome.
- Treat normalized selection-input artifacts as first-class persisted records or metadata structures, not transient in-memory joins only.
- Ensure persisted provenance survives later readback and can support future explanation UI without reconstructing history from raw tables.

5. **Backend/read-model support**
- Expose normalized selection-input artifacts through backend read paths for debugging and later UI use.
- Keep current `run-supply-cost` route behavior unchanged unless extra read-only fields are strictly needed for later inspection.
- Prefer additive read-model fields over behavioral changes to existing trigger APIs.
- Preserve compatibility with current dashboard/run lifecycle status behavior.
- Expose coverage gaps explicitly so the product can distinguish:
  - mapped and monitored supplies,
  - unmapped/unresolved supplies,
  - true active supply alerts.

## Public Interfaces / Contract Changes
- Internal/backend contracts may expand to store and read:
  - extracted supply rows,
  - normalization decisions,
  - provenance references,
  - selected-input artifacts.
- Avoid changing the existing web-trigger route contract unless strictly required.
- Prefer additive backend/read-model fields over behavioral changes to the run trigger API.

## Non-Goals
- No new user-facing explanation panel.
- No redesign of forecasting or risk algorithms.
- No broader UI copy or experience work.
- No reopening of the completed architecture/runtime bucket except for bug fixes.
- No blind replacement of the deterministic pipeline without measured comparison against baseline.

## Test Plan
1. **Parsing tests**
- The same contractual document yields stable extracted supply rows.
- Malformed or partial documents degrade explicitly rather than silently collapsing rows.

2. **Normalization tests**
- Duplicate or materially similar rows collapse deterministically.
- Unit and name normalization is reproducible.
- Category mapping remains stable for the same parsed inputs.
- Qualification filters reject headings/scopes/activity bundles more reliably than the deterministic baseline.

3. **Retrieval comparison tests**
- Compare deterministic vs retrieval-assisted pipeline on the same contractual input set.
- Track:
  - mapping coverage,
  - false-positive candidate supplies,
  - unresolved subtotal budget,
  - provenance completeness.

4. **Provenance tests**
- Each selected supply can be traced back to upstream parsed rows.
- Persisted provenance survives round-trip readback.
- Normalization decisions remain inspectable after persistence.

5. **End-to-end tests**
- Create project -> upload/analyze docs -> run supply agent.
- Verify selected-input artifacts are richer and explainable from source material.
- Confirm downstream counters still work and no regression is introduced in run lifecycle/status.
- Compare end-to-end monitorable-supply coverage against the stored deterministic baseline.

## Assumptions and Defaults
- The architecture/runtime bucket remains closed and should only receive bug fixes, not new scope.
- The next bucket is upstream supply intelligence: parsing, qualification, normalization, retrieval, and provenance quality take precedence over downstream UI explainability.
- User-facing explanation UI is deferred until after the input model is trustworthy.
- Existing forecasting and risk computation stay functionally the same unless better inputs naturally improve outputs.
