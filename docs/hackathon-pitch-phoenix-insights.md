# Hackathon Pitch: Phoenix Iteration Insights

Date: 2026-06-09

## Core Insight
Phoenix is not only helping us debug traces. It is showing where retrieval quality and business usefulness diverge.

The key lesson from the latest `agentic_shadow` iterations is:

1. retrieval recall can improve
2. semantic supply identification can improve
3. downstream forecast usefulness can still remain weak if the mapping layer is too coarse

This is an important part of the Nexum story because it proves we are not hiding weak insight behind generic labels.

## What Phoenix Exposed
Across the benchmark reruns we saw three distinct stages of maturity:

1. low coverage baseline
  - `mapped_shadow_supply_count = 5`
  - `unmapped_shadow_supply_count = 46`
2. inflated coverage with bad fallback behavior
  - false positives like plumbing/network rows mapping to `lumber`
  - example failure mode: `compuerta -> lumber`
3. improved retrieval with safer semantic separation
  - bad `lumber` false positives removed
  - plumbing fixture rows can still map to a coarse family when justified
  - plumbing network rows remain unresolved instead of being forced into a misleading forecast family

## Product Meaning
This matters for the pitch because it shows that Nexum is learning the right thing:

1. finding a `valve`, `siphon`, or `rejilla` in project scope is valuable retrieval intelligence
2. forcing that item into `steel` just to make a forecast chart look populated is not valuable insight
3. the system should preserve semantic truth first, and only map to forecast families when the mapping is actually useful

In short:

`better retrieval is not the same as better forecasting`

Phoenix made that gap visible and measurable.

## Current Design Direction
The current iteration direction is:

1. keep `series_key` as a secondary, downstream-oriented field
2. preserve `supply_class` on shadow outputs as the primary semantic label
3. measure both:
  - retrieval/classification success
  - forecast-family usability

Examples of `supply_class` candidates now supported in the shadow mapping logic:

- `valve`
- `siphon`
- `grate`
- `sanitary_point`
- `hydraulic_point`
- `pipe_network`
- `window`
- `door`
- `countertop`
- `wall_finish`
- `tile_finish`
- `data_labeling`

Latest Phoenix-guided refinement:

1. bathroom accessory rows that were previously surfacing as `series_key = steel` with `supply_class = null`
2. are now being explicitly classified as semantic supply types such as:
  - `grab_bar`
  - `paper_holder`
  - `soap_dish`
  - `towel_bar`

This matters because it sharpens the retrieval story without pretending those items suddenly have a richer forecast model behind them.

Current follow-up from the latest Phoenix replay:

1. one of the remaining `supply_class = null` samples was an electrical control row with `sensor 360`, `sensor de techo`, and `control de iluminación`
2. instead of letting that keep hiding under a generic `steel` family, it is now classified as `lighting_control`

That keeps the same product principle intact: semantic truth first, coarse downstream family second.

## Why This Strengthens The Hackathon Story
This creates a better demo narrative than pretending every recognized supply already has a useful market forecast:

1. Nexum can surface more of the critical supply scope hidden inside contractual documents.
2. Nexum can explain what kind of supply each item is.
3. Nexum can show where the current market-intelligence layer is still too coarse.
4. Phoenix gives us the iteration loop to prove that the system is getting more truthful, not only more populated.

Recent concrete example:

1. Phoenix exposed bathroom/metal accessories like `Barra de seguridad...` and `Portarollo metálico...` as still semantically under-classified.
2. after those were fixed, Phoenix exposed the next residual gap: `ganchos metálicos...` still looked like generic `steel` instead of a recognizable bathroom accessory type.
3. the follow-up improvement was to preserve that row as `supply_class = hook`, which is the kind of iteration story we want in the pitch.
4. the next Phoenix replay then surfaced a different class of gap: structural wall rows like `muro en mampostería...` were still only visible as `cement` without a semantic wall label.
5. the follow-up improvement was to preserve those as `supply_class = masonry_wall`, which keeps structure distinct from finish work in the demo story.
2. We used that trace evidence to add explicit semantic classes instead of broadening a coarse fallback bucket.
3. The result is a more judge-friendly demonstration of progress: the system is learning finer-grained supply meaning, not only pushing more rows into a generic market family.

## Judge-Friendly Framing
If asked why some items remain unresolved, the right answer is:

`We intentionally stopped forcing weak market mappings once Phoenix showed they produced misleading insight.`

That is a strength, not a weakness:

1. better retrieval quality
2. better semantic precision
3. more honest downstream decision support
