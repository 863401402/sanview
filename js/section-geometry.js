(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SanviewSectionGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BOX_EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];

  function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  function subtract(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  }

  function cross(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0]
    ];
  }

  function normalize(vector) {
    var length = Math.sqrt(dot(vector, vector));
    return length ? vector.map(function (value) { return value / length; }) : [0, 0, 0];
  }

  function addUnique(points, point) {
    var duplicate = points.some(function (existing) {
      var delta = subtract(existing, point);
      return dot(delta, delta) < 0.0000001;
    });
    if (!duplicate) points.push(point);
  }

  function boxPlanePolygon(corners, normal, constant) {
    var points = [], epsilon = 0.00001;
    BOX_EDGES.forEach(function (edge) {
      var start = corners[edge[0]], end = corners[edge[1]];
      var startDistance = dot(normal, start) + constant;
      var endDistance = dot(normal, end) + constant;
      if (Math.abs(startDistance) <= epsilon) addUnique(points, start.slice());
      if (Math.abs(endDistance) <= epsilon) addUnique(points, end.slice());
      if (startDistance * endDistance < -epsilon * epsilon) {
        var ratio = startDistance / (startDistance - endDistance);
        addUnique(points, [
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
          start[2] + (end[2] - start[2]) * ratio
        ]);
      }
    });
    if (points.length < 3) return { center: null, points: [] };

    var center = points.reduce(function (sum, point) {
      return [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]];
    }, [0, 0, 0]).map(function (value) { return value / points.length; });
    var reference = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var axisU = normalize(cross(reference, normal));
    var axisV = normalize(cross(normal, axisU));
    points.sort(function (left, right) {
      var a = subtract(left, center), b = subtract(right, center);
      return Math.atan2(dot(a, axisV), dot(a, axisU)) - Math.atan2(dot(b, axisV), dot(b, axisU));
    });
    return { center: center, points: points };
  }

  return { boxPlanePolygon: boxPlanePolygon };
});
