'use strict';

var assert = require('assert');
var Coordinates = require('../js/coordinates.js');

function cubeMap(items) {
  var map = new Map();
  items.forEach(function (item) {
    map.set(item[0] + ',' + item[1] + ',' + item[2], {
      x: item[0], y: item[1], z: item[2], color: item[3]
    });
  });
  return map;
}

var asymmetric = cubeMap([
  [0, 0, 0, 'back-left-bottom'],
  [3, 3, 3, 'front-right-top']
]);
var views = Coordinates.computeViews(asymmetric, 4, 4, 4);

assert.strictEqual(views.front[3], 'front-right-top', 'front view top-right');
assert.strictEqual(views.front[12], 'back-left-bottom', 'front view bottom-left');
assert.strictEqual(views.left[3], 'front-right-top', 'left view front is screen-right');
assert.strictEqual(views.left[12], 'back-left-bottom', 'left view back is screen-left');
assert.strictEqual(views.top[0], 'back-left-bottom', 'top view back-left');
assert.strictEqual(views.top[15], 'front-right-top', 'top view front-right');

var occlusion = cubeMap([
  [1, 1, 0, 'front-near'],
  [1, 1, 3, 'front-far'],
  [0, 2, 2, 'left-near'],
  [3, 2, 2, 'left-far'],
  [2, 0, 1, 'top-low'],
  [2, 3, 1, 'top-high']
]);
views = Coordinates.computeViews(occlusion, 4, 4, 4);

assert.strictEqual(views.front[9], 'front-far', 'front eye sees the greatest Z first');
assert.strictEqual(views.left[6], 'left-near', 'left eye sees the smallest X first');
assert.strictEqual(views.top[6], 'top-high', 'top eye sees the greatest Y first');

assert.deepStrictEqual(Coordinates.gridCenter(0, 0, 0), { x: 0.5, y: 0.5, z: 0.5 });
assert.deepStrictEqual(
  Coordinates.adjacent({ x: 1, y: 2, z: 1 }, { x: -1, y: 0, z: 0 }),
  { x: 0, y: 2, z: 1 }
);
assert.strictEqual(Coordinates.inBounds(3, 3, 3, 4, 4, 4), true);
assert.strictEqual(Coordinates.inBounds(4, 3, 3, 4, 4, 4), false);

function seededRandom(seed) {
  return function () {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function assertSupportedStructure(size, minCount, maxCount, seed) {
  var structure = Coordinates.generateSupportedStructure(size, size, size, minCount, maxCount, seededRandom(seed));
  var occupied = new Set(structure.map(function (cube) { return cube.join(','); }));
  assert.ok(structure.length >= minCount && structure.length <= maxCount, 'structure count stays in difficulty range');
  assert.strictEqual(occupied.size, structure.length, 'structure has no duplicate cubes');
  structure.forEach(function (cube) {
    assert.ok(Coordinates.inBounds(cube[0], cube[1], cube[2], size, size, size), 'random cube stays in bounds');
    if (cube[1] > 0) assert.ok(occupied.has(cube[0] + ',' + (cube[1] - 1) + ',' + cube[2]), 'generated cube is supported');
  });
}

assertSupportedStructure(3, 2, 4, 17);
assertSupportedStructure(5, 5, 8, 31);
assertSupportedStructure(8, 9, 14, 47);

function assertAdaptiveStructure(size, level, seed) {
  var range = Coordinates.adaptiveCountRange(size, size, size, level);
  var structure = Coordinates.generateAdaptiveStructure(size, size, size, level, seededRandom(seed));
  assert.ok(structure.length >= range[0] && structure.length <= range[1], 'adaptive count follows size and difficulty');
  return range;
}

for (var size = 3; size <= 8; size++) {
  var previousRange = null;
  for (var level = 0; level <= 3; level++) {
    var range = assertAdaptiveStructure(size, level, 100 + size * 10 + level);
    assert.ok(range[0] >= 2 && range[1] <= size * size * size, 'adaptive range stays inside capacity');
    if (previousRange) assert.ok(range[0] >= previousRange[0] && range[1] > previousRange[1], 'higher difficulty increases the count range');
    previousRange = range;
  }
}

var smallEasy = Coordinates.adaptiveCountRange(3, 3, 3, 0);
var mediumEasy = Coordinates.adaptiveCountRange(5, 5, 5, 0);
var largeHard = Coordinates.adaptiveCountRange(8, 8, 8, 3);
assert.ok(mediumEasy[0] > smallEasy[0], 'larger spaces generate richer easy structures');
assert.ok(largeHard[0] > mediumEasy[1], 'large hard structures are denser than medium easy structures');

console.log('coordinate tests passed');
