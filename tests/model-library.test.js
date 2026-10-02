'use strict';
var assert = require('assert');
var library = require('../js/model-library');
var learning = require('../js/learning-state');
var coordinates = require('../js/coordinates');

library.list().forEach(function (example) {
  for (var size = 3; size <= 8; size++) {
    var model = learning.normalizeBuild(library.create(example.id, size));
    assert.ok(model.cubes.length > 0);
  }
});
var stairs = library.create('stairs', 3);
var cubes = new Map(stairs.cubes.map(function (cube) { return [cube.join(','), { color: 1 }]; }));
var views = coordinates.computeViews(cubes, 3, 3, 3);
assert.deepStrictEqual(views.front, [null, null, 1, null, 1, 1, 1, 1, 1], 'stairs teach the stepped front outline');
assert.strictEqual(views.left.filter(function (value) { return value !== null; }).length, 3, 'side projection overlaps three columns');
assert.strictEqual(views.top.filter(function (value) { return value !== null; }).length, 3, 'top projection measures footprint');
assert.throws(function () { library.create('unknown', 4); });
assert.throws(function () { library.create('stairs', 2); });
console.log('model library tests passed');
