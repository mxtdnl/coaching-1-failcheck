// Run: node tests/test.js   — extracts the CORE block from index.html and checks it.
const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const core = html.split('// BEGIN CORE')[1].split('// END CORE')[0].replace(/^[^\n]*\n/, '');
const { parseCSV, analyse, statusFor } = new Function(core + '; return { parseCSV, analyse, statusFor };')();

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
const res = analyse(parseCSV(csv));
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

// Missing column → error
assert.ok(analyse(parseCSV('Student,Section\nA,B')).errors.length > 0);

// Real sample, if present: expected counts from independent Python check
if (fs.existsSync(__dirname + '/sample.csv')) {
  const r = analyse(parseCSV(fs.readFileSync(__dirname + '/sample.csv', 'utf8')));
  const c = {}; r.students.forEach(s => c[s.status] = (c[s.status] || 0) + 1);
  assert.deepStrictEqual(c, { Failed: 2, 'High-risk': 9, 'At-risk': 8, Watch: 5, Clear: 59 });
  assert.strictEqual(r.students.filter(s => s.config).length, 1);
  assert.strictEqual(r.students.filter(s => s.safetyNetUsed).length, 29);
  console.log('sample:', c, r.warnings);
}
console.log('All tests passed');
