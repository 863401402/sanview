'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var library = require('../js/voice-library.js');

var root = path.join(__dirname, '..');
var referenced = new Set();
var required = [
  'view_front', 'view_left', 'view_top', 'observe_new',
  'draw_new', 'draw_success', 'draw_retry_front', 'draw_retry_left', 'draw_retry_top',
  'answer_reveal', 'drawing_reset', 'challenge_new', 'challenge_success', 'challenge_retry',
  'build_cleared', 'tool_add', 'tool_remove', 'sound_on'
];

function hasMp3Frame(audio) {
  for (var index = 0; index < Math.min(audio.length - 1, 16384); index++) {
    if (audio[index] === 0xff && (audio[index + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

required.forEach(function (key) {
  assert.ok(Array.isArray(library[key]), key + ' exists');
  assert.ok(library[key].length >= 2, key + ' has randomized variants');
});

['learn', 'draw', 'challenge', 'build'].forEach(function (mode) {
  for (var step = 1; step <= 3; step++) {
    assert.strictEqual(library['tutorial_' + mode + '_' + step].length, 1, mode + ' tutorial step has narration');
  }
});

Object.keys(library).forEach(function (key) {
  var texts = new Set();
  library[key].forEach(function (entry) {
    assert.ok(entry.text && entry.text.length >= 5, key + ' has useful copy');
    assert.ok(!texts.has(entry.text), key + ' variants are unique');
    texts.add(entry.text);
    assert.ok(!referenced.has(entry.path), entry.path + ' is referenced once');
    referenced.add(entry.path);

    var filename = path.join(root, entry.path);
    assert.ok(fs.existsSync(filename), entry.path + ' exists');
    var audio = fs.readFileSync(filename);
    var hasId3 = audio.subarray(0, 3).toString('ascii') === 'ID3';
    var hasFrameSync = audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
    assert.ok(hasId3 || hasFrameSync, entry.path + ' is MP3');
    assert.ok(hasMp3Frame(audio), entry.path + ' contains an MPEG audio frame');
    assert.ok(audio.length >= 6000 && audio.length <= 250000, entry.path + ' file size is reasonable');
  });
});

var generated = fs.readdirSync(path.join(root, 'assets', 'audio'))
  .filter(function (filename) { return filename.endsWith('.mp3'); })
  .map(function (filename) { return 'assets/audio/' + filename; });
assert.strictEqual(generated.length, referenced.size, 'generated and referenced voice counts match');
generated.forEach(function (filename) { assert.ok(referenced.has(filename), filename + ' is not orphaned'); });
assert.strictEqual(
  fs.readdirSync(path.join(root, 'assets', 'audio')).filter(function (filename) { return filename.endsWith('.wav'); }).length,
  0,
  'uncompressed WAV files are not committed'
);

console.log('voice library tests passed (' + generated.length + ' files)');
