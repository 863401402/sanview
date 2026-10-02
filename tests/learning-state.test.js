'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Learning = require('../js/learning-state.js');

function result(questionId, mode, solved, assisted) {
  return { questionId: questionId, mode: mode, solved: solved, assisted: assisted };
}

var empty = Learning.createProgress();
assert.deepStrictEqual(Learning.summarizeProgress(empty), {
  attempted: 0, solved: 0, independent: 0,
  byMode: {
    draw: { attempted: 0, solved: 0, independent: 0 },
    challenge: { attempted: 0, solved: 0, independent: 0 }
  }
});
var first = Learning.recordResult(empty, result('a', 'draw', false, false));
var repeated = Learning.recordResult(first, result('a', 'draw', false, false));
assert.strictEqual(Learning.summarizeProgress(repeated).attempted, 1, 'repeated attempts count one question');
assert.deepStrictEqual(empty, { version: 1, records: [] }, 'recording must not mutate the source progress');
var solved = Learning.recordResult(repeated, result('a', 'draw', true, false));
assert.strictEqual(Learning.summarizeProgress(solved).independent, 1, 'later success upgrades a failed question');
assert.strictEqual(first.records[0].solved, false, 'upgrading a question must not mutate old records');
var solvedAgain = Learning.recordResult(solved, result('a', 'draw', true, false));
assert.strictEqual(Learning.summarizeProgress(solvedAgain).solved, 1, 'repeated success is not counted twice');
var failedAgain = Learning.recordResult(solvedAgain, result('a', 'draw', false, false));
assert.strictEqual(Learning.summarizeProgress(failedAgain).solved, 1, 'an earlier success is retained');

var assisted = Learning.recordResult(Learning.createProgress(), result('a', 'draw', false, true));
assisted = Learning.recordResult(assisted, result('a', 'draw', true, false));
assisted = Learning.recordResult(assisted, result('a', 'challenge', true, false));
assisted = Learning.recordResult(assisted, result('b', 'challenge', true, true));
assert.deepStrictEqual(Learning.summarizeProgress(assisted), {
  attempted: 3, solved: 3, independent: 1,
  byMode: {
    draw: { attempted: 1, solved: 1, independent: 0 },
    challenge: { attempted: 2, solved: 2, independent: 1 }
  }
}, 'answer reveals stay assisted, and each practice mode has separate questions');
var revealAfterSuccess = Learning.recordResult(solved, result('a', 'draw', true, true));
assert.strictEqual(Learning.summarizeProgress(revealAfterSuccess).independent, 0, 'a revealed answer is always labelled assisted');

var bounded = Learning.createProgress();
for (var i = 0; i < Learning.MAX_PROGRESS_RECORDS; i++) {
  bounded = Learning.recordResult(bounded, result(i, 'draw', false, false));
}
bounded = Learning.recordResult(bounded, result(0, 'draw', true, false));
bounded = Learning.recordResult(bounded, result('newest', 'challenge', true, false));
assert.strictEqual(bounded.records.length, Learning.MAX_PROGRESS_RECORDS, 'history is bounded');
assert.ok(bounded.records.some(function (record) { return record.questionId === '0'; }), 'recently updated questions stay in history');
assert.ok(!bounded.records.some(function (record) { return record.questionId === '1'; }), 'oldest untouched question is evicted');
assert.strictEqual(Learning.summarizeProgress(bounded).attempted, 200, 'statistics describe the retained history');
assert.strictEqual(Learning.summarizeProgress(bounded).solved, 2);
assert.throws(function () { Learning.recordResult(empty, result('', 'draw', true, false)); }, /编号/);
assert.throws(function () { Learning.recordResult(empty, result('a', 'invalid', true, false)); }, /模式/);
assert.throws(function () { Learning.recordResult(empty, result('a', 'draw', 'true', false)); }, /状态/);

var sourceBuild = { version: 1, size: 3, cubes: [[2, 1, 1], [0, 0, 0], [2, 0, 1]], ignored: 'not exported' };
var originalBuildText = JSON.stringify(sourceBuild);
var normalized = Learning.normalizeBuild(sourceBuild);
assert.deepStrictEqual(normalized, { version: 1, size: 3, cubes: [[0, 0, 0], [2, 0, 1], [2, 1, 1]] });
assert.strictEqual(JSON.stringify(sourceBuild), originalBuildText, 'normalization leaves input data untouched');
normalized.cubes[0][0] = 1;
assert.strictEqual(sourceBuild.cubes[1][0], 0, 'normalized coordinates do not share input arrays');
assert.deepStrictEqual(Learning.parseBuild(Learning.serializeBuild(sourceBuild)), Learning.normalizeBuild(sourceBuild), 'export and import round trip');
assert.deepStrictEqual(Learning.parseBuild('\uFEFF' + Learning.serializeBuild(sourceBuild)), Learning.normalizeBuild(sourceBuild), 'BOM-prefixed files import');
assert.deepStrictEqual(Learning.normalizeBuild({ version: 1, size: 8, cubes: [] }), { version: 1, size: 8, cubes: [] }, 'empty workspaces can be saved');

[
  [null, /版本/],
  [{ version: 2, size: 3, cubes: [] }, /版本/],
  [{ version: 1, size: '3', cubes: [] }, /尺寸/],
  [{ version: 1, size: 3.5, cubes: [] }, /尺寸/],
  [{ version: 1, size: 2, cubes: [] }, /尺寸/],
  [{ version: 1, size: 9, cubes: [] }, /尺寸/],
  [{ version: 1, size: 3, cubes: {} }, /数组/],
  [{ version: 1, size: 3, cubes: new Array(1) }, /三个整数/],
  [{ version: 1, size: 3, cubes: [new Array(3)] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, 0]] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, 0, 0, 0]] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, 0, '0']] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, 0.5, 0]] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, NaN, 0]] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[0, Infinity, 0]] }, /三个整数/],
  [{ version: 1, size: 3, cubes: [[-1, 0, 0]] }, /超出/],
  [{ version: 1, size: 3, cubes: [[3, 0, 0]] }, /超出/],
  [{ version: 1, size: 3, cubes: [[0, 3, 0]] }, /超出/],
  [{ version: 1, size: 3, cubes: [[0, 0, 3]] }, /超出/],
  [{ version: 1, size: 3, cubes: [[0, 0, 0], [0, 0, 0]] }, /重复/],
  [{ version: 1, size: 3, cubes: [[0, 1, 0]] }, /正下方/],
  [{ version: 1, size: 3, cubes: [[0, 0, 0], [0, 2, 0]] }, /正下方/],
  [{ version: 1, size: 3, cubes: [[1, 0, 0], [0, 1, 0]] }, /正下方/],
  [{ version: 1, size: 8, cubes: new Array(513).fill([0, 0, 0]) }, /512/]
].forEach(function (entry) {
  assert.throws(function () { Learning.normalizeBuild(entry[0]); }, entry[1]);
});
assert.throws(function () { Learning.parseBuild('{oops'); }, /JSON/);
assert.throws(function () { Learning.parseBuild(null); }, /JSON/);
assert.throws(function () { Learning.parseBuild(' '.repeat(Learning.MAX_BUILD_TEXT_LENGTH + 1)); }, /过大/);

var full = [];
for (var x = 0; x < 8; x++) {
  for (var y = 0; y < 8; y++) {
    for (var z = 0; z < 8; z++) full.push([x, y, z]);
  }
}
assert.strictEqual(Learning.parseBuild(Learning.serializeBuild({ version: 1, size: 8, cubes: full })).cubes.length, 512, 'maximum supported build round trips within input size limit');

var items = new Map();
var memoryStorage = {
  getItem: function (key) { return items.has(key) ? items.get(key) : null; },
  setItem: function (key, value) { items.set(key, String(value)); },
  removeItem: function (key) { items.delete(key); }
};
var storage = Learning.createStorage(memoryStorage);
assert.deepStrictEqual(storage.loadProgress(), Learning.createProgress(), 'missing progress starts empty');
assert.strictEqual(storage.loadBuild(), null, 'missing build returns null');
assert.strictEqual(storage.saveProgress(assisted), true);
assert.deepStrictEqual(storage.loadProgress(), assisted);
assert.strictEqual(storage.saveBuild(sourceBuild), true);
assert.deepStrictEqual(storage.loadBuild(), Learning.normalizeBuild(sourceBuild));
assert.strictEqual(storage.saveBuild({ version: 1, size: 3, cubes: [[0, 1, 0]] }), false, 'invalid writes fail without throwing');
assert.deepStrictEqual(storage.loadBuild(), Learning.normalizeBuild(sourceBuild), 'invalid writes preserve the existing saved build');
assert.strictEqual(storage.saveProgress({ version: 2, records: [] }), false);
assert.deepStrictEqual(storage.loadProgress(), assisted, 'invalid writes preserve existing progress');
var oversizedProgress = { version: 1, records: [] };
for (var largeIndex = 0; largeIndex < Learning.MAX_PROGRESS_RECORDS; largeIndex++) {
  oversizedProgress.records.push(result(String(largeIndex) + '\u0000'.repeat(4000), 'draw', false, false));
}
assert.strictEqual(storage.saveProgress(oversizedProgress), false, 'oversized serialized records cannot create an unreadable saved history');
assert.deepStrictEqual(storage.loadProgress(), assisted, 'oversized writes preserve existing progress');
assert.strictEqual(storage.clearProgress(), true);
assert.deepStrictEqual(storage.loadProgress(), Learning.createProgress());
assert.deepStrictEqual(storage.loadBuild(), Learning.normalizeBuild(sourceBuild), 'clearing practice records preserves the saved build');

['bad JSON', 'null', '{"version":2,"records":[]}', '{"version":1,"records":[{}]}', ' '.repeat(1024 * 1024 + 1)].forEach(function (text) {
  items.set('sanview.progress.v1', text);
  assert.deepStrictEqual(storage.loadProgress(), Learning.createProgress(), 'corrupt progress safely resets in memory');
});
items.set('sanview.progress.v1', JSON.stringify({ version: 1, records: [result('a', 'draw', false, true), result('a', 'draw', true, false)] }));
assert.strictEqual(Learning.summarizeProgress(storage.loadProgress()).independent, 0, 'duplicate stored records cannot erase assistance');
assert.strictEqual(Learning.summarizeProgress(storage.loadProgress()).attempted, 1, 'duplicate stored records cannot inflate totals');
['bad JSON', 'null', '{"version":1,"size":3,"cubes":[[0,1,0]]}', ' '.repeat(Learning.MAX_BUILD_TEXT_LENGTH + 1)].forEach(function (text) {
  items.set('sanview.build.v1', text);
  assert.strictEqual(storage.loadBuild(), null, 'corrupt builds do not crash');
});

var forbiddenStorage = {
  getItem: function () { throw new Error('SecurityError'); },
  setItem: function () { throw new Error('QuotaExceededError'); },
  removeItem: function () { throw new Error('SecurityError'); }
};
[forbiddenStorage, null, undefined, {}].forEach(function (underlying) {
  var unavailable = Learning.createStorage(underlying);
  assert.deepStrictEqual(unavailable.loadProgress(), Learning.createProgress());
  assert.strictEqual(unavailable.loadBuild(), null);
  assert.strictEqual(unavailable.saveProgress(assisted), false);
  assert.strictEqual(unavailable.saveBuild(sourceBuild), false);
  assert.strictEqual(unavailable.clearProgress(), false);
});

var browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/learning-state.js'), 'utf8'), browser);
assert.strictEqual(typeof browser.SanviewLearning.recordResult, 'function', 'UMD API is available in a browser without Node globals');
console.log('learning state tests passed');
