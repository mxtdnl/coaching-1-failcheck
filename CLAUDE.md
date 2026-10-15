# CLAUDE.md

This is the Coaching Risk Checker: a single-file HTML tool that classifies students from a Canvas gradebook CSV for Coaching 1 (SKL-0110). **`SPEC.md` is the source of truth.** Read it before changing behaviour.

## Repository
```
index.html        # the whole tool: CORE logic block + UI script + styles
tests/test.js     # node test runner; extracts CORE from index.html
tests/sample.csv  # anonymised LON1 export used as the regression fixture
SPEC.md           # rules, input format, thresholds, acceptance tests
BUILD_PLAN.md     # session plan
```

## Rules
- Keep it one self-contained `index.html`, with no build step, framework or backend. The only external dependency is SheetJS, lazy-loaded from cdnjs and used only for `.xlsx`.
- Student data never leaves the browser. Do not add network calls, analytics or storage of grade data.
- Pure logic stays between `// BEGIN CORE` and `// END CORE` and must not touch the DOM. The tests depend on this.
- All weightings and thresholds live in `CONFIG`. Never hard-code them elsewhere.
- Match graded columns by name pattern and require a trailing `(digits)`. Never depend on specific Canvas assignment IDs, because other sections and terms use different IDs.
- Blank means not yet marked (no loss). `0` means lost. `N/A` or other text is a configuration issue, scored as blank and flagged.
- Workshop rules depend on the campus format in `CONFIG.formats`. London: one 10-mark component, lost only when both are 0. Boston: Workshop 1 (0 points) is ignored, and Workshops 2 and 3 count 5 each with no drop rule.
- Thresholds use marks lost: Watch >0, At-risk >12.5, High-risk >20, Failed >27.5. Boundaries are inclusive on the lower status, so exactly 27.5 is High-risk, not Failed.
- British English in all UI text.

## Verify every change
1. Run `node tests/test.js`. It must print `All tests passed`.
2. If classification logic changes, update the expected sample counts in `tests/test.js` **only** after confirming the new numbers with an independent calculation. Do not simply copy the tool's own output.
3. For UI changes, open `index.html` in a browser, load `tests/sample.csv`, and check the tiles, filters, sorting and a narrow viewport.

## Commits
Small, descriptive commits. Do not commit real (non-anonymised) gradebook exports. `*.csv` outside `tests/` is gitignored.
