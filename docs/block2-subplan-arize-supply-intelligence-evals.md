# Block 2 Subplan: Arize Evaluation Loop For Supply Intelligence

Date: 2026-06-03

## Summary
This subplan defines how Arize should be used in the hackathon version of Nexum.

Note: runtime tracing has since been migrated to Phoenix Cloud, but this document remains useful as the conceptual evaluation design. The current operational handoff for trace comparison work is:

[block2-subplan-phoenix-iteration-comparison.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-phoenix-iteration-comparison.md)

Arize is not the product. Arize is the tracing, evaluation, and improvement loop that proves the product is getting better.

The product narrative remains:

`an agentic supply-intelligence pipeline that converts contractual documents into traceable, market-monitorable critical supplies`

Arize supports that narrative by tracing each stage of the pipeline and scoring whether the pipeline is producing better supply candidates, better mappings, and fewer false critical supplies than the deterministic baseline.

## Goal
1. Instrument the supply-intelligence pipeline with traceable spans.
2. Evaluate the quality of extraction, qualification, normalization, and market mapping.
3. Compare deterministic and agentic retrieval variants against the same baseline dataset.
4. Produce hackathon-ready evidence that the pipeline improves in measurable ways, not only by anecdotal examples.

## Why Arize Fits This Product
- The current bottleneck is not pure forecasting math; it is upstream supply qualification and mapping quality.
- The new pipeline will likely be multi-step and partially agentic, which makes trace visibility important.
- The team needs a reliable improvement loop for:
  - row extraction quality,
  - true-supply qualification,
  - mapping coverage,
  - provenance completeness,
  - dashboard precision.
- Arize gives a concrete story for tracing, evaluation, and regression comparison instead of generic “AI observability.”

## Proposed First-Pass Instrumentation Design
Each analyzed project run should emit a trace with spans such as:

1. `document_ingest`
- attributes:
  - `project_id`
  - `input_batch_id`
  - `document_count`
  - `document_types`

2. `row_extraction`
- attributes:
  - `document_id`
  - `parser_source`
  - `parse_status`
  - `extracted_row_count`
  - `degradation_status`

3. `supply_qualification`
- attributes:
  - `candidate_row_count`
  - `qualified_supply_count`
  - `rejected_heading_count`
  - `rejected_scope_count`
  - `rejected_bundle_count`

4. `normalization`
- attributes:
  - `qualified_supply_count`
  - `normalized_supply_count`
  - `dedupe_collapse_count`
  - `normalization_rule_version`

5. `market_mapping`
- attributes:
  - `normalized_supply_count`
  - `mapped_supply_count`
  - `unmapped_supply_count`
  - `mapped_subtotal_budget`
  - `unmapped_subtotal_budget`
  - `series_keys_used`

6. `critical_supply_selection`
- attributes:
  - `selected_supply_count`
  - `market_monitorable_count`
  - `unresolved_count`
  - `top_exposure_supply_names`

7. `forecast_and_risk`
- attributes:
  - `supplies_processed`
  - `forecasts_written`
  - `alerts_created`
  - `error_count`

## Proposed First-Pass Evaluation Design
Arize evals should target the real failure modes of this product, not generic chat quality.

### Span-level evaluations
1. `is_true_supply`
- question:
  - Is this extracted or qualified row a real purchasable supply/material/equipment item?

2. `is_heading_or_scope`
- question:
  - Is this row actually a chapter heading, scope label, or bundled activity that should not enter the critical-supply path?

3. `is_market_monitorable`
- question:
  - Does this normalized supply correspond to something that can reasonably be monitored via an external market/source signal?

4. `mapping_quality`
- question:
  - Is the chosen market/source mapping plausible for this supply?

5. `provenance_completeness`
- question:
  - Can this selected supply be traced back to source document, extracted row, and normalized supply identifiers?

### Trace-level evaluations
1. `critical_supply_precision`
- Did the pipeline produce a credible set of critical supplies for this project?

2. `coverage_quality`
- Is the ratio of mapped vs unmapped supplies improving without introducing obvious false positives?

3. `dashboard_precision`
- Would the executive dashboard show valid critical supplies rather than headings/scopes or misleading “all available” states?

## Deterministic vs Agentic Comparison Loop
The stored deterministic baseline remains the comparison anchor.

The shadow agentic implementation plan is tracked separately in:

[block2-subplan-agentic-retrieval-shadow-pipeline.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-agentic-retrieval-shadow-pipeline.md)

The first comparison report should include:
1. Extracted row count.
2. Qualified supply count.
3. Normalized supply count.
4. Market-monitorable supply count.
5. Mapping coverage percentage.
6. Unmapped subtotal budget.
7. False critical supplies visible in dashboard.
8. Provenance completeness rate.

The agentic retrieval pipeline should not replace the deterministic path until it beats the stored baseline on the most important quality metrics.

## Hackathon Demo Value
Arize can strengthen the pitch in three ways:
1. Show trace visibility into how contractual documents become critical supplies.
2. Show eval scores that explain why the agentic pipeline is better than deterministic parsing.
3. Show a measurable improvement loop instead of a one-off AI demo.

## Non-Goals
- Do not instrument everything in the platform.
- Do not turn Arize into the centerpiece of the product narrative.
- Do not block demo readiness on a perfect eval suite.
- Do not replace deterministic checks with LLM evals where simple deterministic metrics are better.

## Acceptance Criteria
1. At least one end-to-end supply-intelligence trace is visible for a real project flow.
2. The key pipeline stages are separately traceable.
3. At least one deterministic-vs-agentic comparison workflow is defined.
4. Arize evidence can be shown in the hackathon pitch as the improvement loop behind the product.
