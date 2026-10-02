(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SanviewCoordinates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SPACE = Object.freeze({
    axes: Object.freeze({
      x: '从左向右',
      y: '从下向上',
      z: '从后向前'
    }),
    views: Object.freeze({
      front: Object.freeze({ eye: '前', sight: '-Z', screenRight: '+X', screenUp: '+Y' }),
      left: Object.freeze({ eye: '左', sight: '+X', screenRight: '+Z', screenUp: '+Y' }),
      top: Object.freeze({ eye: '上', sight: '-Y', screenRight: '+X', screenUp: '-Z' })
    })
  });

  function getCube(cubes, x, y, z) {
    return cubes.get(x + ',' + y + ',' + z) || null;
  }

  // Arrays are emitted in DOM order: top row to bottom row, left to right.
  function computeViews(cubes, width, depth, height) {
    var front = [], left = [], top = [];
    var x, y, z, cube, color;

    // Front eye is at +Z. Screen right follows +X and the nearest cube wins.
    for (y = height - 1; y >= 0; y--) {
      for (x = 0; x < width; x++) {
        color = null;
        for (z = depth - 1; z >= 0; z--) {
          cube = getCube(cubes, x, y, z);
          if (cube) { color = cube.color; break; }
        }
        front.push(color);
      }
    }

    // Left eye is at -X. Screen right follows +Z: back is left, front is right.
    for (y = height - 1; y >= 0; y--) {
      for (z = 0; z < depth; z++) {
        color = null;
        for (x = 0; x < width; x++) {
          cube = getCube(cubes, x, y, z);
          if (cube) { color = cube.color; break; }
        }
        left.push(color);
      }
    }

    // Top eye is at +Y. Screen up follows -Z: back is top, front is bottom.
    for (z = 0; z < depth; z++) {
      for (x = 0; x < width; x++) {
        color = null;
        for (y = height - 1; y >= 0; y--) {
          cube = getCube(cubes, x, y, z);
          if (cube) { color = cube.color; break; }
        }
        top.push(color);
      }
    }

    return { front: front, left: left, top: top };
  }

  function inBounds(x, y, z, width, depth, height) {
    return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < depth;
  }

  function gridCenter(x, y, z) {
    return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
  }

  function adjacent(cell, normal) {
    return { x: cell.x + normal.x, y: cell.y + normal.y, z: cell.z + normal.z };
  }

  function generateSupportedStructure(width, depth, height, minCount, maxCount, random) {
    random = random || Math.random;
    var capacity = width * depth * height;
    var lower = Math.max(1, Math.min(capacity, minCount));
    var upper = Math.max(lower, Math.min(capacity, maxCount));
    var target = lower + Math.floor(random() * (upper - lower + 1));
    var placed = [], occupied = new Set();
    var cx = Math.floor(width / 2), cz = Math.floor(depth / 2);
    var startKey = cx + ',0,' + cz;
    var directions = [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]];
    placed.push([cx, 0, cz]);
    occupied.add(startKey);

    var attempts = 0;
    while (placed.length < target && attempts < 600) {
      attempts++;
      var pick = placed[Math.floor(random() * placed.length)];
      var direction = directions[Math.floor(random() * directions.length)];
      var x = pick[0] + direction[0];
      var y = pick[1] + direction[1];
      var z = pick[2] + direction[2];
      if (!inBounds(x, y, z, width, depth, height)) continue;
      var key = x + ',' + y + ',' + z;
      if (occupied.has(key)) continue;
      if (y > 0 && !occupied.has(x + ',' + (y - 1) + ',' + z)) continue;
      occupied.add(key);
      placed.push([x, y, z]);
    }
    return placed;
  }

  function adaptiveCountRange(width, depth, height, level) {
    level = Math.max(0, Math.min(3, parseInt(level, 10) || 0));
    var capacity = width * depth * height;
    var span = (width + depth + height) / 3;
    var minimumFactor = [0.9, 1.6, 2.4, 3.3][level];
    var maximumFactor = [2.0, 3.1, 4.5, 6.0][level];
    var minimum = Math.max(2, Math.round(span * minimumFactor));
    var maximum = Math.max(minimum + 1, Math.round(span * maximumFactor));
    return [Math.min(capacity, minimum), Math.min(capacity, maximum)];
  }

  function generateAdaptiveStructure(width, depth, height, level, random) {
    var range = adaptiveCountRange(width, depth, height, level);
    return generateSupportedStructure(width, depth, height, range[0], range[1], random);
  }

  return {
    SPACE: SPACE,
    computeViews: computeViews,
    inBounds: inBounds,
    gridCenter: gridCenter,
    adjacent: adjacent,
    generateSupportedStructure: generateSupportedStructure,
    adaptiveCountRange: adaptiveCountRange,
    generateAdaptiveStructure: generateAdaptiveStructure
  };
});
