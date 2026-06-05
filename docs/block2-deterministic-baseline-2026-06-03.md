# Block 2 Deterministic Baseline

Date: 2026-06-03
Purpose: Store the current deterministic pipeline performance before any retrieval-assisted or agentic retrieval redesign, so future comparisons use a fixed baseline.

## Scenario
- Project: `e468fb66-d8f6-4e91-814a-20b736ad365d`
- Name: `REMODELACIÓN PISO 5 HOTEL HACKATLON CARIBE BEACH`
- Linked intake batch: `fbd7582c-c29a-4ac1-81f6-50710b9ffd4d`
- Compared run: `ea11b2ec-cefc-4399-be01-9e422dd29cfa`
- Pipeline mode: deterministic parsing + deterministic normalization + current keyword/source mapping

## Intake Baseline
- Documents uploaded: `4`
- Documents with extracted supply rows: `1`
- Extracted rows: `143`
- Normalized supplies: `143`
- Row normalizations: `143`

Per-document outcome:
- `1. CTG_P5_Cronograma CONTRACTUAL.xml`: `metadata_only`, `0` rows
- `CUADRO DE CONTROL PRESUPUESTO.pdf`: `parse_failed`, `0` rows
- `PRESUPUESTO CONTRACTUAL.xlsx`: `parsed_supply_rows`, `143` rows
- `C2539_HackatLon_Caribe_Beach_Remodelacion_P5.docx`: `unsupported_for_supply_rows`, `0` rows

## Run Baseline
- Run status: `completed`
- Error summary: `123 supply error(s)`
- Supplies requested: `143`
- Supplies processed: `20`
- Sources attempted: `3`
- Sources succeeded: `3`
- Forecast points written: `0`
- Alerts created: `0`

## Mapping Coverage Baseline
- Total selected supplies: `143`
- Mapped to a market/source series: `20`
- Unmapped: `123`
- Mapping coverage: `13.99%`
- Unmapped rate: `86.01%`

Mapped subtotal distribution:
- `lumber`: `8` supplies, subtotal `45,479,560`
- `cement`: `6` supplies, subtotal `22,597,231.05`
- `steel`: `6` supplies, subtotal `20,776,100`

Unmapped subtotal distribution:
- `unmapped`: `123` supplies, subtotal `1,899,623,956.335`

## Representative Valid Mapped Supplies
- `S/I Cielo raso en lamina fibrocemento e=6 mm...` -> `cement`
- `S/I Tablero eléctrico bifásico con capacidad para 12 circuitos...` -> `lumber`
- `S/I División para baño en Vidrio templado E:8mm...` -> `steel`
- `S/I parcial desde tableros de distribución de piso 5...` -> `lumber`

## Representative Failure Pattern
The deterministic pipeline still promotes many non-monitorable or poorly normalized contractual rows into candidate supplies. Current examples include:
- scope/activity rows,
- demolition or installation bundles,
- mixed labor-plus-material lines,
- section-like or overly broad budget descriptions.

Those rows currently end up with:
- `error_code = no_price_source`
- `error_message = No active row in supply_price_sources and no keyword match.`

## What This Baseline Means
- The deterministic path can already extract rows from the contractual XLSX reliably enough to create a traceable intake batch.
- The limiting factor is not row extraction volume; it is supply qualification and mapping quality.
- The current system can produce a cleaned executive dashboard only after filtering unmapped rows out of the executive read model.
- The next retrieval-assisted pipeline must beat this baseline on:
  - true-supply qualification,
  - mapping coverage,
  - reduction of false critical supplies,
  - preservation of provenance.

## Comparison Targets For The Agentic Retrieval Pipeline
1. Extracted rows that remain true purchasable supplies after qualification.
2. Normalized supplies that are market-monitorable.
3. Mapping coverage percentage.
4. Unmapped subtotal reduced from the current baseline.
5. Executive dashboard precision: fewer false critical supplies and fewer misleading availability states.
