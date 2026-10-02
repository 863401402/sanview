'use strict';

var assert = require('assert');
var SectionGeometry = require('../js/section-geometry.js');

var corners = [
  [-1,-1,-1], [1,-1,-1], [-1,1,-1], [1,1,-1],
  [-1,-1,1], [1,-1,1], [-1,1,1], [1,1,1]
];

var axis = SectionGeometry.boxPlanePolygon(corners, [1, 0, 0], 0);
assert.strictEqual(axis.points.length, 4, 'axis-aligned cut produces a quadrilateral');
axis.points.forEach(function (point) { assert.ok(Math.abs(point[0]) < 0.00001); });
assert.deepStrictEqual(axis.center, [0, 0, 0]);

var diagonalNormal = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
var diagonal = SectionGeometry.boxPlanePolygon(corners, diagonalNormal, 0);
assert.strictEqual(diagonal.points.length, 6, 'diagonal cut through a cube produces a hexagon');
diagonal.points.forEach(function (point) {
  assert.ok(Math.abs(point[0] + point[1] + point[2]) < 0.00001, 'diagonal point lies on the plane');
});

var outside = SectionGeometry.boxPlanePolygon(corners, [1, 0, 0], -3);
assert.strictEqual(outside.points.length, 0, 'plane outside the cube produces no section');
assert.strictEqual(outside.center, null);

console.log('section geometry tests passed');
