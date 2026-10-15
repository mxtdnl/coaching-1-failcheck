# Coaching Risk Checker — Specification

## Purpose
A single-file, standalone HTML tool that reads a Canvas gradebook export for **Coaching 1 (SKL-0110)** and classifies every student as Failed, High-risk, At-risk, Watch or Clear, based on marks already lost. It must work for any section or term of the same course, in both the London and Boston gradebook formats.

## Constraints
- One file: `index.html`. No build step, no backend, no framework.
- All processing happens in the browser; no student data leaves the machine.
- Primary input is the Canvas CSV export. `.xlsx` is optional and loads SheetJS from cdnjs on demand; CSV must work fully offline.
- No export function. The output is an on-screen table only.

## Course structure
| Component | Items | Points each | Total |
|---|---|---|---|
| 1:1 meeting attendance | Sessions 1–4 | 15 | 60 |
| Developmental activity | Activities 1–4 | 7.5 | 30 |
| Workshop activity | 2 activities | 5 | 10 (see campus formats) |
| **Total** | | | **100** |

- Every item is complete/incomplete: either full points or 0.
- **Workshops** depend on the campus format below.

## Campus formats
The two campuses run the same course with a different workshop set-up in myCourses. Each format is defined in `CONFIG.formats`.

| Format | Detected by Section containing | Workshop columns scored | Workshop rule |
|---|---|---|---|
| London | `LON` + digits (e.g. `LON1`) | Exactly two (currently 2 and 3), 5 each | One 10-point component. Completing either secures all 10. Lost (10 points) only when **both** are 0. |
| Boston | `BOS` + digits (e.g. `BOS1`) | Exactly two besides Workshop 1 (currently 2 and 3), 5 each | No drop rule: each workshop counts separately, so each 0 loses 5. Workshop 1 is worth 0 points and is ignored entirely. |

- The format is detected from the Section column. If no row matches a campus code, or rows match both, show an error and ask the user to choose the format manually.
- The user can override the format with a dropdown. If the chosen format contradicts the Section column, show a warning.
- Both formats use a total of 100 and a pass mark of 72.5%, so all thresholds are the same.
- **Pass mark:** 72.5%. A student has failed once marks lost are **greater than 27.5**. Losing exactly 27.5 still passes.

## Input format (Canvas CSV)
- **Row 1:** header.
- **Metadata rows:** a "Manual Posting" row (blank Student and Section) and a "Points Possible" row (first cell is `Points Possible`, possibly padded with spaces). Both are skipped. The Points Possible row is used only to warn if weightings differ from expected.
- **Identity columns** are matched by exact header (case-insensitive, trimmed): `Student`, `SIS User ID`, `SIS Login ID`, `Section`.
- **Graded columns** are matched by name pattern and must end in `(digits)`, which is the Canvas assignment ID. The ID varies by section and term and must be ignored.
  - Attendance: `^Coaching Session\s*(\d+)\s*:\s*Attendance`
  - Activity: `^Develop\w*\s+Activity\s*(\d+)`. Note that Canvas uses both "Developmental Activity" and "Development Activity".
  - Workshop: `^Workshop\s*(\d+)\s+Activity`. Columns whose number is in the format's ignore list (Boston: 1) are skipped. Exactly two of the rest are expected, numbered as in Canvas (currently 2 and 3).
- Canvas-computed columns (`… Current Score`, `… Final Score`, grades) are ignored because they do not end in `(digits)`.
- If any of Sessions 1–4, Activities 1–4, or the two workshops cannot be found, show an error naming the missing columns and do not render results.

## Cell interpretation
| Cell value | State | Marks lost |
|---|---|---|
| blank | pending (not yet marked) | 0 |
| `0` | lost | full item value |
| equals points possible | earned | 0 |
| `N/A` or any other non-numeric value | **configuration issue**, scored as blank | 0 |
| any other number (should not occur) | unexpected value | points − value |

## Exclusions
Exclude the Canvas test student, identified by either rule:
- Student is `Test Student`.
- Section contains "Cohort" more than once, meaning it lists every cohort.

Report the number of excluded rows as an info message.

## Classification
Marks lost = sum of item losses + workshop loss (London: component loss; Boston: 5 per workshop at 0).

| Status | Marks lost |
|---|---|
| Clear | 0 |
| Watch | > 0 and ≤ 12.5 |
| At-risk | > 12.5 and ≤ 20 (one more missed meeting would fail) |
| High-risk | > 20 and ≤ 27.5 (any one more missed item would fail) |
| Failed | > 27.5 |

Margin = 27.5 − marks lost. Show "—" when negative.

**Flags,** which are shown alongside status rather than instead of it:
- **N/A config:** at least one cell is N/A or non-numeric.
- **Workshop net used** (London only): one workshop is 0 and the other is blank or N/A. The student's next workshop miss costs 10.
- **Unexpected value:** a numeric value that is neither 0 nor full marks.

**Workshop edge case (London).** A student who has used the workshop safety net and then misses the second workshop loses 10, not 7.5. This cannot change their category. Non-workshop losses come in multiples of 7.5, so the remaining margin is always 27.5, 20, 12.5 or 5. A 10-point loss only causes failure from a margin of 5, which is already High-risk. No special handling is required beyond the flag. In Boston, losses come in multiples of 7.5 and 5. The thresholds are unchanged, so a student can sit exactly on 27.5 (for example a missed session, activity and workshop) and still pass.

**Cohort:** taken from Section with `\band\s+(.+?)\s+Cohort\s*$` (for example "Kiki S."). If there is no match, use the full Section string.

## UI
- A drop zone or file picker for `.csv`, `.xlsx` and `.xls`.
- A message area for errors (red), weighting warnings (amber) and info (neutral).
- Summary tiles showing counts for Failed, High-risk, At-risk, Watch, Clear and Configuration issue. Clicking a tile toggles it as a filter.
- Controls: a cohort dropdown, a search box (name or SIS ID), and a "n of N students" count.
- A table with columns Student, SIS ID, Cohort, Status, Lost, Margin, one cell per item (S1, D1, …, S4, D4, W2, W3), and Flags.
  - Item cells show ✓ earned, ✗ lost, · pending, ! configuration, ? unexpected.
  - Default sort is by marks lost, descending. Column headers are sortable.
- A collapsible "How status is calculated" section.
- Light and dark themes via `prefers-color-scheme`. The layout must be usable at narrow widths, with the table scrolling horizontally.

## Code structure
- All pure logic sits between `// BEGIN CORE` and `// END CORE` in `index.html`: `CONFIG`, `parseCSV`, `findColumns`, `classifyCell`, `statusFor`, `isTestStudent`, `coachFromSection`, `detectFormats`, `analyse`. This block must not reference the DOM.
- The UI script follows in a separate `<script>` block.
- All thresholds and weightings live in `CONFIG`.

## Acceptance tests
`node tests/test.js` must pass. It extracts the CORE block and checks:
1. Status at every boundary value (0, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30).
2. Synthetic rows covering clear, safety net used, both workshops missed (10 → Watch), Failed, High-risk, N/A, and test-student exclusion by name and by section.
3. A missing-column error.
4. Format detection (London, no campus code, mixed campuses, manual override mismatch) and Boston scoring: Workshop 1 ignored, each of Workshops 2 and 3 losing 5, 27.5 as High-risk and 32.5 as Failed.
5. Against `tests/sample.csv` (anonymised LON1 export, 12 Oct 2026), the expected counts are **Failed 2, High-risk 9, At-risk 8, Watch 5, Clear 59** (83 students), with 1 configuration issue, 29 workshop-net flags and 1 test student excluded. These counts were derived by an independent Python calculation. The sample must be detected as London.
