(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SanviewLearning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_PROGRESS_RECORDS = 200;
  var MAX_BUILD_TEXT_LENGTH = 64 * 1024;
  var MAX_PROGRESS_TEXT_LENGTH = 1024 * 1024;
  var PROGRESS_KEY = 'sanview.progress.v1';
  var BUILD_KEY = 'sanview.build.v1';

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function createProgress() {
    return { version: 1, records: [] };
  }

  function normalizeResult(result) {
    if (!isObject(result)) throw new Error('练习记录格式不正确。');
    if (result.mode !== 'draw' && result.mode !== 'challenge') {
      throw new Error('练习模式必须是画视图或搭积木挑战。');
    }
    var id = result.questionId;
    if (typeof id === 'number' && Number.isSafeInteger(id)) id = String(id);
    if (typeof id !== 'string' || !id.trim() || id.length > 4096) {
      throw new Error('练习题目编号无效。');
    }
    if (typeof result.solved !== 'boolean' || typeof result.assisted !== 'boolean') {
      throw new Error('练习完成状态和辅助状态必须明确填写。');
    }
    return {
      questionId: id.trim(),
      mode: result.mode,
      solved: result.solved,
      assisted: result.assisted
    };
  }

  // Repeated submissions describe one question. Assistance is sticky so revealing
  // an answer and submitting it later cannot turn into an independent completion.
  function mergeRecord(records, incoming) {
    var next = [];
    records.forEach(function (record) {
      if (record.mode === incoming.mode && record.questionId === incoming.questionId) {
        incoming.solved = incoming.solved || record.solved;
        incoming.assisted = incoming.assisted || record.assisted;
      } else {
        next.push(record);
      }
    });
    next.push(incoming);
    return next.slice(-MAX_PROGRESS_RECORDS);
  }

  function normalizeProgress(progress) {
    if (!isObject(progress) || progress.version !== 1 || !Array.isArray(progress.records)) {
      throw new Error('练习记录版本或格式不正确。');
    }
    if (progress.records.length > MAX_PROGRESS_RECORDS) {
      throw new Error('练习记录最多保留最近 ' + MAX_PROGRESS_RECORDS + ' 道题。');
    }
    var records = [];
    for (var index = 0; index < progress.records.length; index++) {
      records = mergeRecord(records, normalizeResult(progress.records[index]));
    }
    return { version: 1, records: records };
  }

  function recordResult(progress, result) {
    var current = normalizeProgress(progress);
    return { version: 1, records: mergeRecord(current.records, normalizeResult(result)) };
  }

  function summarizeProgress(progress) {
    var current = normalizeProgress(progress);
    var summary = {
      attempted: 0,
      solved: 0,
      independent: 0,
      byMode: {
        draw: { attempted: 0, solved: 0, independent: 0 },
        challenge: { attempted: 0, solved: 0, independent: 0 }
      }
    };
    current.records.forEach(function (record) {
      var mode = summary.byMode[record.mode];
      summary.attempted++;
      mode.attempted++;
      if (record.solved) {
        summary.solved++;
        mode.solved++;
        if (!record.assisted) {
          summary.independent++;
          mode.independent++;
        }
      }
    });
    return summary;
  }

  function normalizeBuild(snapshot) {
    if (!isObject(snapshot) || snapshot.version !== 1) {
      throw new Error('作品版本不支持，请使用本应用导出的第 1 版作品文件。');
    }
    if (!Number.isInteger(snapshot.size) || snapshot.size < 3 || snapshot.size > 8) {
      throw new Error('作品空间尺寸必须是 3 到 8 的整数。');
    }
    if (!Array.isArray(snapshot.cubes)) throw new Error('作品积木数据必须是坐标数组。');
    if (snapshot.cubes.length > 512) throw new Error('作品最多只能包含 512 块积木。');

    var occupied = new Set();
    var cubes = Array.from(snapshot.cubes, function (cube, index) {
      var label = '第 ' + (index + 1) + ' 块积木';
      if (!Array.isArray(cube) || cube.length !== 3 || !Number.isInteger(cube[0]) || !Number.isInteger(cube[1]) || !Number.isInteger(cube[2])) {
        throw new Error(label + '必须包含三个整数坐标 [x, y, z]。');
      }
      if (cube.some(function (value) { return value < 0 || value >= snapshot.size; })) {
        throw new Error(label + '超出空间范围，坐标必须在 0 到 ' + (snapshot.size - 1) + ' 之间。');
      }
      var clean = cube.map(function (value) { return value === 0 ? 0 : value; });
      var key = clean.join(',');
      if (occupied.has(key)) throw new Error(label + '与其他积木重叠，坐标不能重复。');
      occupied.add(key);
      return clean;
    });

    cubes.forEach(function (cube) {
      if (cube[1] > 0 && !occupied.has(cube[0] + ',' + (cube[1] - 1) + ',' + cube[2])) {
        throw new Error('坐标 [' + cube.join(', ') + '] 的积木悬空，正下方必须有积木支撑。');
      }
    });
    cubes.sort(function (a, b) { return a[1] - b[1] || a[2] - b[2] || a[0] - b[0]; });
    return { version: 1, size: snapshot.size, cubes: cubes };
  }

  function parseBuild(text) {
    if (typeof text !== 'string') throw new Error('请读取 JSON 格式的作品文件。');
    if (text.length > MAX_BUILD_TEXT_LENGTH) throw new Error('作品文件过大，请选择不超过 64 KB 的作品文件。');
    var snapshot;
    try {
      // trim also accepts the optional UTF-8 BOM used by some text editors.
      snapshot = JSON.parse(text.trim());
    } catch (error) {
      throw new Error('作品文件不是有效的 JSON，请选择本应用导出的作品文件。');
    }
    return normalizeBuild(snapshot);
  }

  function serializeBuild(snapshot) {
    return JSON.stringify(normalizeBuild(snapshot), null, 2);
  }

  // A null storage is supported for private browsing or a denied storage getter.
  // Every storage operation is guarded, including quota and security failures.
  function createStorage(storage) {
    return {
      loadProgress: function () {
        try {
          var text = storage.getItem(PROGRESS_KEY);
          if (typeof text !== 'string' || text.length > MAX_PROGRESS_TEXT_LENGTH) return createProgress();
          return normalizeProgress(JSON.parse(text));
        } catch (error) {
          return createProgress();
        }
      },
      saveProgress: function (progress) {
        try {
          var text = JSON.stringify(normalizeProgress(progress));
          if (text.length > MAX_PROGRESS_TEXT_LENGTH) return false;
          storage.setItem(PROGRESS_KEY, text);
          return true;
        } catch (error) {
          return false;
        }
      },
      loadBuild: function () {
        try {
          return parseBuild(storage.getItem(BUILD_KEY));
        } catch (error) {
          return null;
        }
      },
      saveBuild: function (snapshot) {
        try {
          storage.setItem(BUILD_KEY, serializeBuild(snapshot));
          return true;
        } catch (error) {
          return false;
        }
      },
      clearProgress: function () {
        try {
          storage.removeItem(PROGRESS_KEY);
          return true;
        } catch (error) {
          return false;
        }
      }
    };
  }

  return {
    MAX_PROGRESS_RECORDS: MAX_PROGRESS_RECORDS,
    MAX_BUILD_TEXT_LENGTH: MAX_BUILD_TEXT_LENGTH,
    createProgress: createProgress,
    recordResult: recordResult,
    summarizeProgress: summarizeProgress,
    normalizeBuild: normalizeBuild,
    parseBuild: parseBuild,
    serializeBuild: serializeBuild,
    createStorage: createStorage
  };
});
