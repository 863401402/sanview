(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SanviewModelLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var examples = [
    { id: 'stairs', name: '三层台阶', tip: '从前面看是台阶，从左面看会重叠；俯视图只记录占地。', heights: [[1, 2, 3]] },
    { id: 'corner', name: '转角积木', tip: '比较正视图与左视图：相同的轮廓，不代表相同的观察方向。', heights: [[1, 1, 2], [1, 0, 0], [2, 0, 0]] },
    { id: 'towers', name: '两座小塔', tip: '从左侧看，两座塔会重叠。用俯视图确认它们之间的空位。', heights: [[2, 0, 2], [1, 0, 1]] }
  ];
  function list() {
    return examples.map(function (item) { return { id: item.id, name: item.name, tip: item.tip }; });
  }
  function create(id, size) {
    var example = examples.find(function (item) { return item.id === id; });
    if (!example || !Number.isInteger(size) || size < 3 || size > 8) throw new Error('无法加载这个观察范例。');
    var offsetX = Math.floor((size - example.heights[0].length) / 2);
    var offsetZ = Math.floor((size - example.heights.length) / 2);
    var cubes = [];
    example.heights.forEach(function (row, z) {
      row.forEach(function (height, x) {
        for (var y = 0; y < height; y++) cubes.push([x + offsetX, y, z + offsetZ]);
      });
    });
    return { version: 1, size: size, cubes: cubes };
  }
  return { list: list, create: create };
});
