// Run: node tests/test.js   — extracts the CORE block from index.html and checks it.
const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const core = html.split('// BEGIN CORE')[1].split('// END CORE')[0].replace(/^[^\n]*\n/, '');
const { CONFIG, parseCSV, findColumns, analyse, statusFor } = new Function(core + '; return { CONFIG, parseCSV, findColumns, analyse, statusFor };')();
const LON = CONFIG.formats.london;

// Thresholds
const cases = [[0, 'Clear'], [7.5, 'Watch'], [10, 'Watch'], [12.5, 'Watch'], [15, 'At-risk'], [17.5, 'At-risk'],
  [20, 'At-risk'], [22.5, 'High-risk'], [25, 'High-risk'], [27.5, 'High-risk'], [30, 'Failed']];
for (const [lost, s] of cases) assert.strictEqual(statusFor(lost), s, `lost ${lost}`);

// Synthetic export: header, points row, students
const H = 'Student,ID,SIS User ID,SIS Login ID,Section,' +
  [1, 2, 3, 4].map(n => `Coaching Session ${n}: Attendance & Engagement (9${n}0),${n === 4 ? 'Development' : 'Developmental'} Activity ${n} (9${n}1)`).join(',') +
  ',Workshop 2 Activity (995),Workshop 3 Activity (996),Workshop Activity Current Score,Current Score';
const P = '    Points Possible,,,,,15,7.5,15,7.5,15,7.5,15,7.5,5,5,(read only),(read only)';
const row = (name, cells, section = 'Coaching 1 - X and Ann B. Cohort') => `${name},1,${name},x,${section},${cells},,`;
const csv = [H, P,
  row('clear', ',,,,,,,,,'),
  row('netUsed', '15,7.5,,,,,,,0,'),
  row('bothWs', '15,7.5,,,,,,,0,0'),           // 10 lost → Watch
  row('miss2att', '0,,0,,,,,,5,'),              // 30 → Failed
  row('high', '0,7.5,15,,,,,,0,0'),             // 25 → High-risk
  row('config', '15,N/A,,,,,,,5,'),
  row('Test Student', ',,,,,,,,,'),
  row('multi', ',,,,,,,,,', '"C1, A Cohort, B Cohort"'),
].join('\n');
const res = analyse(parseCSV(csv), 'london');
assert.deepStrictEqual(res.errors, []);
const by = Object.fromEntries(res.students.map(s => [s.name, s]));
assert.strictEqual(res.students.length, 6, 'test students excluded');
assert.strictEqual(by.clear.status, 'Clear');
assert.strictEqual(by.netUsed.lost, 0); assert.ok(by.netUsed.safetyNetUsed);
assert.strictEqual(by.bothWs.lost, 10); assert.strictEqual(by.bothWs.status, 'Watch');
assert.strictEqual(by.miss2att.status, 'Failed');
assert.strictEqual(by.high.lost, 25); assert.strictEqual(by.high.status, 'High-risk');
assert.ok(by.config.config); assert.strictEqual(by.config.lost, 0);
assert.strictEqual(by.clear.coach, 'Ann B.');

// Header variants: Canvas uses both "Development Activity" and "Developmental Activity"
const hdr = d4 => ['Student', 'Section',
  ...[1, 2, 3, 4].map(n => `Coaching Session ${n}: Attendance & Engagement (8${n}0)`),
  ...[1, 2, 3].map(n => `Developmental Activity ${n} (8${n}1)`), d4,
  'Workshop 2 Activity (895)', 'Workshop 3 Activity (896)'];
for (const d4 of ['Development Activity 4 (841)', 'Developmental Activity 4 (841)']) {
  const fc = findColumns(hdr(d4), LON);
  assert.deepStrictEqual(fc.errors, [], d4);
  assert.strictEqual(fc.cols.activity[4], 9, d4);
}
assert.ok(findColumns(hdr('Developmental Activity 4'), LON).errors.some(e => /Activity 4/.test(e)), 'no (digits) → not matched');

// Quoted fields containing commas and escaped quotes
assert.deepStrictEqual(parseCSV('a,"b, c","d ""q""",e'), [['a', 'b, c', 'd "q"', 'e']]);
const quoted = analyse(parseCSV([H, P, row('"Smith, Jane"', '0,,,,,,,,,')].join('\n')), 'london');
assert.strictEqual(quoted.students[0].name, 'Smith, Jane');
assert.strictEqual(quoted.students[0].lost, 15, 'cells stay aligned after a quoted comma');

// CRLF line endings with a UTF-8 BOM give the same result as plain LF
const crlfRows = parseCSV('\uFEFF' + csv.split('\n').join('\r\n'));
assert.strictEqual(crlfRows[0][0], 'Student', 'BOM stripped from first header cell');
assert.ok(crlfRows.every(r => r.every(c => !c.includes('\r'))), 'no stray CR');
const crlf = analyse(crlfRows, 'london');
assert.deepStrictEqual(crlf.errors, []);
assert.deepStrictEqual(crlf.students.map(s => [s.name, s.lost, s.status, s.coach]),
  res.students.map(s => [s.name, s.lost, s.status, s.coach]));

// "EX" (excused) is a configuration issue: scored as blank and flagged
const ex = analyse(parseCSV([H, P, row('ex', 'EX,7.5,,,,,,,0,EX')].join('\n')), 'london').students[0];
assert.ok(ex.config); assert.strictEqual(ex.lost, 0); assert.strictEqual(ex.status, 'Clear');
assert.strictEqual(ex.items.find(i => i.key === 'S1').state, 'config');
assert.ok(ex.safetyNetUsed, 'workshop 0 + EX counts as net used');

// Non-standard weighting in Points Possible: warning only, expected weightings still used
const P20 = P.replace('    Points Possible,,,,,15,', '    Points Possible,,,,,20,');
const odd = analyse(parseCSV([H, P20, row('w', '0,,,,,,,,,')].join('\n')), 'london');
assert.deepStrictEqual(odd.errors, []);
assert.ok(odd.warnings.some(w => /Session 1 attendance is worth 20 points.*expected 15/.test(w)), 'weighting warning');
assert.strictEqual(odd.students[0].lost, 15);

// Missing column → error
assert.ok(analyse(parseCSV('Student,Section\nA,B')).errors.length > 0);

// Format detection from the campus code in Section
const sec = code => `Coaching 1 - SKL-0110 - ${code} and Ann B. Cohort`;
assert.strictEqual(analyse(parseCSV([H, P, row('a', ',,,,,,,,,', sec('LON1'))].join('\n'))).format, 'london');
assert.ok(/Could not detect/.test(analyse(parseCSV(csv)).errors[0]), 'no campus code → choose manually');
assert.ok(/both London and Boston/.test(analyse(parseCSV([H, P, row('a', ',,,,,,,,,', sec('LON1')),
  row('b', ',,,,,,,,,', sec('BOS1'))].join('\n'))).errors[0]), 'mixed campuses → choose manually');

const forced = analyse(parseCSV([H, P, row('a', ',,,,,,,,,', sec('LON1'))].join('\n')), 'boston');
assert.ok(forced.warnings.some(w => /indicates London, but the Boston format was chosen/.test(w)), 'manual mismatch warned');

// Boston: Workshop 1 is worth 0 and ignored; Workshops 2 and 3 are 5 each with no drop rule
const HB = H.replace('Workshop 2 Activity (995),Workshop 3 Activity (996)',
  'Workshop 1 Activity (994),Workshop 2 Activity: Share Together (995),Workshop 3 Activity (996)');
const PB = P.replace(',5,5,', ',0,5,5,');
const rowB = (name, cells) => row(name, cells, sec('BOS1'));
const bos = analyse(parseCSV([HB, PB,
  rowB('w1w2', ',,,,,,,,0,0,'),           // W2 missed: 5 → Watch, no net flag
  rowB('w2w3', ',,,,,,,,0,0,0'),          // both counted: 10 → Watch
  rowB('w1only', ',,,,,,,,0,5,'),         // W1 zero ignored: 0 → Clear
  rowB('w1na', ',,,,,,,,N/A,,'),          // W1 ignored, so no config flag
  rowB('edge', '0,0,,,,,,,,0,'),          // 15 + 7.5 + 5 = 27.5 → High-risk (passes)
  rowB('fail', '0,0,,,,,,,,0,0'),         // 15 + 7.5 + 5 + 5 = 32.5 → Failed
  rowB('Test Student', ',,,,,,,,,,'),
].join('\n')));
assert.deepStrictEqual(bos.errors, []);
assert.strictEqual(bos.format, 'boston');
assert.deepStrictEqual(bos.warnings, [], 'Workshop 1 at 0 points is expected, not a weighting warning');
assert.ok(bos.info.some(m => /Workshop 1 ignored/.test(m)));
const b = Object.fromEntries(bos.students.map(s => [s.name, s]));
assert.strictEqual(bos.students.length, 6);
assert.deepStrictEqual(b.w1w2.items.map(i => i.key), ['S1', 'D1', 'S2', 'D2', 'S3', 'D3', 'S4', 'D4', 'W2', 'W3']);
assert.deepStrictEqual([b.w1w2.lost, b.w1w2.status, b.w1w2.safetyNetUsed], [5, 'Watch', false]);
assert.deepStrictEqual([b.w2w3.lost, b.w2w3.status], [10, 'Watch']);
assert.deepStrictEqual([b.w1only.lost, b.w1only.status], [0, 'Clear']);
assert.strictEqual(b.w1na.config, false);
assert.deepStrictEqual([b.edge.lost, b.edge.margin, b.edge.status], [27.5, 0, 'High-risk']);
assert.deepStrictEqual([b.fail.lost, b.fail.status], [32.5, 'Failed']);
// A Boston export forced into London format is rejected rather than misread
assert.ok(/Expected 2 .* found 3/.test(analyse(parseCSV([HB, PB, rowB('x', ',,,,,,,,,,')].join('\n')), 'london').errors[0]));

// Real sample, if present: expected counts from independent Python check
if (fs.existsSync(__dirname + '/sample.csv')) {
  const r = analyse(parseCSV(fs.readFileSync(__dirname + '/sample.csv', 'utf8')));
  const c = {}; r.students.forEach(s => c[s.status] = (c[s.status] || 0) + 1);
  assert.strictEqual(r.format, 'london', 'sample detected as London');
  assert.deepStrictEqual(c, { Failed: 2, 'High-risk': 9, 'At-risk': 8, Watch: 5, Clear: 59 });
  assert.strictEqual(r.students.filter(s => s.config).length, 1);
  assert.strictEqual(r.students.filter(s => s.safetyNetUsed).length, 29);
  console.log('sample:', c, r.warnings, r.info);
}
console.log('All tests passed');
