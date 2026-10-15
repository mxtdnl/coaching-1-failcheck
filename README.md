# Coaching Risk Checker

A single-file browser tool for Coaching 1 (SKL-0110). It reads a Canvas gradebook export and classifies each student as **Failed**, **High-risk**, **At-risk**, **Watch** or **Clear**, based on the marks already lost on 1:1 attendance, developmental activities and workshops. It also flags configuration issues such as `N/A` or `EX` cells, use of the workshop safety net and unexpected values. [`SPEC.md`](SPEC.md) gives the full rules.

## Usage
1. In Canvas, open the course gradebook and choose **Export → Export entire gradebook** (CSV).
2. Open `index.html` in a browser. It needs no installation or server.
3. Drop the CSV onto the page, or click to choose it. `.xlsx` is also accepted.
4. Review the summary tiles (click one to filter), filter by cohort, search by name or SIS ID, and sort by any column heading.

The tool works for any section or term, because it matches columns by name rather than by Canvas assignment ID. It supports the London and Boston gradebook formats, which differ in how workshops are scored. The format is detected from the campus code in the Section column (`LON1`, `BOS1`), and can be chosen manually from the **Gradebook format** dropdown.

## Data privacy
All processing happens locally in your browser. The gradebook is not uploaded, stored or sent anywhere, and CSV files work fully offline. The only network request is the SheetJS library from cdnjs, which loads only when you open an `.xlsx` file. Do not commit real gradebook exports. `*.csv` is gitignored outside `tests/`.

## Tests
```
node tests/test.js
```
