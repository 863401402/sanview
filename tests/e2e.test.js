'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');
var playwright = require('playwright');
var startServer = require('../scripts/serve').startServer;

var BASE_URL = process.env.SANVIEW_URL || null;
var ARTIFACTS = path.join(__dirname, '..', 'artifacts');

function requestPath(baseUrl, pathname, method) {
  var address = new URL(baseUrl);
  return new Promise(function (resolve, reject) {
    var request = http.request({ hostname: address.hostname, port: address.port, path: pathname, method: method || 'GET' }, function (response) {
      var chunks = [];
      response.on('data', function (chunk) { chunks.push(chunk); });
      response.on('end', function () { resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }); });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

async function checkServerRoutes(running) {
  assert.strictEqual(running.server.address().address, '127.0.0.1', 'development server only listens on loopback');
  var expectedTypes = {
    '/': 'text/html',
    '/css/style.css': 'text/css',
    '/js/app.js?v=test': 'text/javascript',
    '/favicon.svg': 'image/svg+xml',
    '/assets/audio/tool-add-1.mp3': 'audio/mpeg'
  };
  for (var resource of Object.keys(expectedTypes)) {
    var response = await requestPath(running.url, resource, 'HEAD');
    assert.strictEqual(response.status, 200, resource + ' is served');
    assert.ok(response.headers['content-type'].startsWith(expectedTypes[resource]), resource + ' has the correct MIME type');
    assert.strictEqual(response.body.length, 0, 'HEAD returns no body');
  }
  for (var denied of ['/.git/config', '/package.json', '/README.md', '/server-source-20261002.tar.gz', '/js/../package.json', '/js/%2e%2e/package.json', '/js/%2e%2e%5cpackage.json', '/%2e%2e/index.html']) {
    var result = await requestPath(running.url, denied);
    assert.ok(result.status === 403 || result.status === 404, denied + ' is not exposed');
  }
  assert.strictEqual((await requestPath(running.url, '/js/%E0%A4%A')).status, 400, 'invalid percent encoding returns 400');
  assert.strictEqual((await requestPath(running.url, '/js/missing.js')).status, 404, 'missing runtime file returns 404');
  assert.strictEqual((await requestPath(running.url, '/', 'POST')).status, 405, 'development server does not accept writes');
  assert.strictEqual((await requestPath(running.url, '/')).status, 200, 'bad requests do not stop the server');
}

function cubeAt(state, x, y, z) {
  return state.cubes.find(function (cube) { return cube.x === x && cube.y === y && cube.z === z; });
}

async function waitForCamera(page) {
  await page.waitForTimeout(800);
}

async function debugState(page) {
  return page.evaluate(function () { return window.SanviewDebug.getState(); });
}

async function setSize(page, size) {
  await page.locator('#size-toggle').click();
  await page.locator('.size-options [data-size="' + size + '"]').click();
  await page.waitForTimeout(900);
}

function cubeCoordinates(state) {
  return state.cubes.map(function (cube) { return [cube.x, cube.y, cube.z]; }).sort(function (a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
}

async function progressSummary(page) {
  var state = await debugState(page);
  assert.ok(state.progress && Number.isInteger(state.progress.attempted), 'debug state exposes the persisted learning summary');
  return state.progress;
}

async function drawCurrentAnswer(page) {
  var state = await debugState(page);
  for (var view of ['front', 'left', 'top']) {
    for (var index = 0; index < state.views[view].length; index++) {
      if (state.views[view][index] !== null) await page.locator('#grid-' + view + ' .cell').nth(index).click();
    }
  }
}

async function importModel(page, value) {
  var choosing = page.waitForEvent('filechooser');
  await page.locator('#build-import').click();
  var chooser = await choosing;
  assert.strictEqual(await chooser.element().getAttribute('id'), 'build-file-input', 'import button opens the model file input');
  await chooser.setFiles({ name: 'test-model.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}

async function noHorizontalOverflow(page, description) {
  var overflow = await page.evaluate(function () {
    return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
  });
  assert.ok(overflow.scroll <= overflow.client + 1, description + ' has no document horizontal overflow');
}

async function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  var localServer = null;
  var browser = null, page = null, mobile = null;
  try {
  if (!BASE_URL) {
    localServer = await startServer({ port: 0 });
    await checkServerRoutes(localServer);
    BASE_URL = localServer.url;
  }
  browser = await playwright.chromium.launch({
    headless: process.env.SANVIEW_HEADED !== '1',
    executablePath: process.env.SANVIEW_BROWSER || undefined,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  var context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (error) { errors.push('pageerror: ' + error.message); });
  page.on('console', function (message) {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });

  await page.goto(BASE_URL + '?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.SanviewDebug; });
  assert.strictEqual(await page.locator('#learn-example.template-select').inputValue(), 'stairs', 'observation starts with the three-step teaching model');
  assert.strictEqual(await page.locator('#overlay').isVisible(), false, 'tutorials do not interrupt first use');
  await page.locator('#help-btn').click();
  assert.strictEqual(await page.locator('#overlay.tutorial-overlay').isVisible(), true, 'the help button opens the tutorial on demand');
  await page.locator('#tutorial-next').click();
  await page.locator('#tutorial-prev').click();
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('#overlay').isVisible(), false, 'the on-demand tutorial closes with Escape');
  assert.strictEqual(await page.locator('#help-btn').evaluate(function (button) { return document.activeElement === button; }), true, 'closing the tutorial returns focus to help');
  await waitForCamera(page);

  var state = await debugState(page);
  assert.deepStrictEqual(state.dimensions, [4, 4, 4], 'default space is 4x4x4');
  assert.strictEqual(state.mode, 'learn');
  assert.strictEqual(await page.locator('body').getAttribute('data-mode'), 'learn');
  assert.strictEqual(state.camera.orthographic, true, 'educational views use an orthographic camera');
  assert.strictEqual(await page.locator('#grid-front .cell').count(), 16);
  assert.strictEqual(await page.locator('#grid-left .cell').count(), 16);
  assert.strictEqual(await page.locator('#grid-top .cell').count(), 16);
  var pixels = await page.evaluate(function () { return window.SanviewDebug.canvasPixels(); });
  assert.ok(pixels.visibleSamples > 100, '3D canvas contains rendered pixels');

  var sectionBefore = await debugState(page);
  await page.locator('#section-toggle').click();
  assert.ok(await page.locator('#section-panel').isVisible(), 'section controls open from the stage header');
  await page.locator('#section-position').evaluate(function (input) {
    input.value = '24';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  state = await debugState(page);
  assert.strictEqual(state.section.enabled, true);
  assert.strictEqual(state.section.position, 24);
  assert.ok(state.section.capTriangles >= 4, 'section plane creates a closed polygon through the center cube');
  assert.deepStrictEqual(state.views, sectionBefore.views, 'sectioning does not change three-view answers');
  await page.screenshot({ path: path.join(ARTIFACTS, 'section-desktop.png') });

  await page.locator('[data-section-preset="diagonal"]').click();
  state = await debugState(page);
  assert.strictEqual(state.section.preset, 'diagonal');
  assert.ok(state.section.keepNormal[0] > 0.5 && state.section.keepNormal[1] > 0.4 && state.section.keepNormal[2] > 0.5, 'diagonal preset rotates the plane on two axes');
  var keepNormal = state.section.keepNormal.slice();
  await page.locator('#section-flip').click();
  state = await debugState(page);
  assert.ok(state.section.keepNormal.every(function (value, index) { return Math.abs(value + keepNormal[index]) < 0.001; }), 'reverse control flips the retained side');
  await page.locator('#section-reset').click();
  state = await debugState(page);
  assert.strictEqual(state.section.preset, 'x');
  assert.strictEqual(state.section.position, 0);
  assert.strictEqual(state.section.flipped, false);
  await page.locator('#section-close').click();
  assert.strictEqual((await debugState(page)).section.enabled, false);

  await page.locator('[data-view="front"]').click();
  await waitForCamera(page);
  state = await debugState(page);
  assert.ok(state.camera.position[2] > state.camera.target[2], 'front observer stands on +Z');
  assert.ok(Math.abs(state.camera.position[0] - state.camera.target[0]) < 0.01, 'front camera is centered on X');
  var frontProjection = await page.evaluate(function () {
    return {
      left: window.SanviewDebug.project(0.5, 0.5, 2),
      right: window.SanviewDebug.project(3.5, 0.5, 2),
      bottom: window.SanviewDebug.project(2, 0.5, 2),
      top: window.SanviewDebug.project(2, 3.5, 2)
    };
  });
  assert.ok(frontProjection.left.x < frontProjection.right.x, 'front view is not horizontally mirrored');
  assert.ok(frontProjection.top.y < frontProjection.bottom.y, 'front view keeps Y upward');

  await page.locator('[data-view="left"]').click();
  await waitForCamera(page);
  state = await debugState(page);
  assert.ok(state.camera.position[0] < state.camera.target[0], 'left observer stands on -X');
  await page.locator('[data-view="top"]').click();
  await waitForCamera(page);
  state = await debugState(page);
  assert.ok(state.camera.position[1] > state.camera.target[1]);
  assert.ok(state.camera.up[2] < -0.99, 'top camera places back at screen top');

  await page.locator('#sound-btn').click();
  assert.strictEqual(await page.locator('#sound-btn').getAttribute('title'), '打开声音');
  await page.locator('#sound-btn').click();
  assert.strictEqual(await page.locator('#sound-btn').getAttribute('title'), '关闭声音');

  var observedModel = cubeCoordinates(await debugState(page));
  await page.locator('#learn-practice').click();
  await page.waitForTimeout(900);
  assert.strictEqual((await debugState(page)).mode, 'practice');
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), observedModel, 'practice starts with the exact model shown in observation');
  assert.strictEqual(await page.locator('body').getAttribute('data-mode'), 'practice');
  assert.strictEqual(await page.locator('body').getAttribute('data-practice-mode'), 'draw');
  assert.strictEqual(await page.locator('#practice-difficulty').textContent(), '简单', 'drawing starts at the simplest difficulty');
  assert.strictEqual(await page.locator('[data-difficulty="practice-difficulty"][data-step="-1"]').isDisabled(), true, 'the simplest difficulty cannot wrap backwards');
  assert.strictEqual(await page.locator('#grid-front .cell').count(), 16);
  var summary = await progressSummary(page);
  assert.strictEqual(summary.attempted, 0, 'a new browser starts with no learning record');
  await page.locator('#practice-check').click();
  await page.locator('#practice-check').click();
  summary = await progressSummary(page);
  assert.strictEqual(summary.attempted, 1, 'repeated checks count one attempted question');
  assert.strictEqual(summary.solved, 0, 'an empty drawing is not solved');
  await page.locator('#practice-answer').click();
  assert.ok(await page.locator('.view-grid .cell.filled').count() > 0, 'answer reveals projected cells');
  await page.locator('#practice-check').click();
  await page.waitForSelector('#overlay.show');
  summary = await progressSummary(page);
  assert.strictEqual(summary.attempted, 1);
  assert.strictEqual(summary.solved, 1);
  assert.strictEqual(summary.independent, 0, 'a revealed answer is never counted as independently solved');
  var dialogButtons = page.locator('#overlay [role="dialog"] button');
  await dialogButtons.last().focus();
  await page.keyboard.press('Tab');
  assert.strictEqual(await dialogButtons.first().evaluate(function (button) { return document.activeElement === button; }), true, 'Tab wraps inside the result dialog');
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('#overlay').isVisible(), false, 'Escape closes the result dialog');
  assert.strictEqual(await page.locator('#practice-check').evaluate(function (button) { return document.activeElement === button; }), true, 'closing the dialog restores focus to its trigger');
  await page.locator('#practice-check').click();
  await page.locator('#win-close').click();
  assert.deepStrictEqual(await progressSummary(page), summary, 'checking a completed question does not duplicate the result');
  await page.locator('#practice-clear').click();
  assert.strictEqual(await page.locator('.view-grid .cell.filled').count(), 0, 'clear removes the drawing');
  await page.locator('#practice-new').click();
  await drawCurrentAnswer(page);
  await page.locator('#practice-check').click();
  await page.locator('#win-close').click();
  summary = await progressSummary(page);
  assert.strictEqual(summary.attempted, 2);
  assert.strictEqual(summary.solved, 2);
  assert.strictEqual(summary.independent, 1, 'a new question completed without revealing its answer counts independently');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.SanviewDebug; });
  assert.deepStrictEqual(await progressSummary(page), summary, 'learning records survive a reload');
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('[data-difficulty="practice-difficulty"][data-step="1"]').click();
  assert.strictEqual(await page.locator('#practice-difficulty').textContent(), '中等');
  await page.locator('[data-difficulty="practice-difficulty"][data-step="-1"]').click();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator('#practice-difficulty').textContent(), '简单');
  assert.strictEqual(await page.locator('[data-difficulty="practice-difficulty"][data-step="-1"]').isDisabled(), true, 'difficulty decrease is disabled at its lower boundary');

  await page.locator('button[data-practice-mode="challenge"]').click();
  await page.waitForTimeout(900);
  state = await debugState(page);
  assert.strictEqual(state.practiceMode, 'challenge');
  assert.strictEqual(await page.locator('body').getAttribute('data-practice-mode'), 'challenge');
  assert.strictEqual(state.cubes.length, 0, 'restore-block challenge starts with an empty model');
  assert.ok(await page.locator('.view-grid .cell.filled').count() > 0, 'challenge displays target projections');
  assert.strictEqual(await page.locator('.build-cell').count(), 16, 'challenge reuses the precise build pad');

  await page.locator('button[data-mode="learn"]').click();
  await page.locator('#learn-example').selectOption('corner');
  var cornerToPractice = cubeCoordinates(await debugState(page));
  await page.locator('#learn-practice').click();
  assert.strictEqual((await debugState(page)).practiceMode, 'draw', 'practice this model always opens drawing even after the reconstruction challenge');
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), cornerToPractice, 'practice this model preserves all corner model coordinates');

  await page.locator('button[data-mode="build"]').click();
  await page.waitForTimeout(900);
  state = await debugState(page);
  assert.strictEqual(state.mode, 'build');
  assert.strictEqual(state.cubes.length, 0);
  assert.strictEqual(await page.locator('.build-cell').count(), 16);

  await page.locator('#build-pad-collapse').click();
  assert.ok(await page.locator('#build-pad').evaluate(function (el) { return el.classList.contains('collapsed'); }));
  await page.waitForFunction(function () { return document.getElementById('build-pad').getBoundingClientRect().width < 55; });
  var collapsedWidth = await page.locator('#build-pad').evaluate(function (el) { return el.getBoundingClientRect().width; });
  assert.ok(collapsedWidth < 55, 'collapsed build pad is icon-only: ' + collapsedWidth);
  await page.locator('#build-pad-collapse').click();

  await page.locator('.build-cell').nth(0).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(420);
  assert.strictEqual(await page.locator('.build-cell').nth(0).evaluate(function (button) { return document.activeElement === button; }), true, 'keyboard building keeps the same column focused');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(420);
  state = await debugState(page);
  assert.ok(cubeAt(state, 0, 0, 0));
  assert.ok(cubeAt(state, 0, 1, 0));
  assert.deepStrictEqual(cubeAt(state, 0, 0, 0).world.map(function (v) { return Math.round(v * 10) / 10; }), [0.5, 0.5, 0.5], 'animation ends at the correct world center');

  await page.locator('.build-cell').nth(0).click({ button: 'right' });
  await page.waitForTimeout(280);
  state = await debugState(page);
  assert.ok(cubeAt(state, 0, 0, 0));
  assert.ok(!cubeAt(state, 0, 1, 0), 'pad removes the top cube in its exact column');
  await page.locator('#tool-undo').click();
  state = await debugState(page);
  assert.ok(cubeAt(state, 0, 1, 0), 'undo restores the prior structure');
  await page.locator('#tool-redo').click();
  assert.strictEqual((await debugState(page)).cubes.length, 1, 'redo reapplies the removed top cube');
  await page.locator('#tool-undo').click();
  await page.keyboard.press('Control+Shift+Z');
  assert.strictEqual((await debugState(page)).cubes.length, 1, 'Ctrl+Shift+Z performs redo');
  await page.locator('#tool-undo').click();
  var freeBuild = cubeCoordinates(await debugState(page));
  await page.locator('button[data-mode="build"]').click();
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), freeBuild, 'clicking the active build tab keeps the model');
  await page.locator('button[data-mode="learn"]').click();
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('button[data-mode="build"]').click();
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), freeBuild, 'observation and practice do not overwrite the free build');
  await page.locator('#tool-clear').click();
  assert.strictEqual((await debugState(page)).cubes.length, 0);
  await page.locator('#tool-undo').click();
  assert.strictEqual((await debugState(page)).cubes.length, 2, 'clear is recoverable with undo');

  await page.locator('#tool-clear').click();
  await page.locator('[data-view="iso"]').click();
  await waitForCamera(page);
  var basePoint = await page.evaluate(function () { return window.SanviewDebug.project(2.5, 0.01, 2.5); });
  await page.mouse.click(basePoint.x, basePoint.y);
  await page.waitForTimeout(430);
  state = await debugState(page);
  assert.ok(cubeAt(state, 2, 0, 2), '3D base click maps to its exact logical cell');
  var topFace = await page.evaluate(function () { return window.SanviewDebug.project(2.5, 1, 2.5); });
  await page.mouse.click(topFace.x, topFace.y);
  await page.waitForTimeout(430);
  state = await debugState(page);
  assert.ok(cubeAt(state, 2, 1, 2), 'clicking the top face adds directly above');
  var frontFace = await page.evaluate(function () { return window.SanviewDebug.project(2.5, 0.5, 3); });
  await page.mouse.click(frontFace.x, frontFace.y);
  await page.waitForTimeout(430);
  state = await debugState(page);
  assert.ok(cubeAt(state, 2, 0, 3), 'clicking the front face adds in +Z');

  var modelBeforeSave = cubeCoordinates(state);
  await page.locator('#build-save').click();
  var downloaded = page.waitForEvent('download');
  await page.locator('#build-export').click();
  var download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith('.json'), 'export downloads a JSON model');
  var exportedStream = await download.createReadStream();
  var exportedChunks = [];
  for await (var chunk of exportedStream) exportedChunks.push(chunk);
  var exported = JSON.parse(Buffer.concat(exportedChunks).toString('utf8'));
  assert.strictEqual(exported.version, 1);
  assert.strictEqual(exported.size, 4);
  assert.deepStrictEqual(exported.cubes.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }), modelBeforeSave, 'export contains the exact editable model');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.SanviewDebug; });
  if (await page.locator('#build-resume').isVisible()) await page.locator('#build-resume').click();
  else await page.locator('button[data-mode="build"]').click();
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), modelBeforeSave, 'saved work is recoverable after reload');
  var imported = { version: 1, size: 4, cubes: [[0, 0, 0], [0, 1, 0]] };
  await importModel(page, imported);
  await page.waitForFunction(function () {
    var cubes = window.SanviewDebug.getState().cubes;
    return cubes.length === 2 && cubes.some(function (cube) { return cube.x === 0 && cube.y === 1 && cube.z === 0; });
  });
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), imported.cubes, 'import replaces the model with valid supported blocks');
  await importModel(page, '{not valid JSON');
  await page.waitForTimeout(150);
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), imported.cubes, 'invalid JSON does not damage the current model');
  await importModel(page, { version: 1, size: 4, cubes: [[1, 1, 1]] });
  await page.waitForTimeout(150);
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), imported.cubes, 'an unsupported floating model does not damage the current model');

  await setSize(page, 3);
  state = await debugState(page);
  assert.deepStrictEqual(state.dimensions, [3, 3, 3]);
  assert.strictEqual(await page.locator('#grid-front .cell').count(), 9);
  assert.strictEqual(await page.locator('.build-cell').count(), 9);
  await setSize(page, 8);
  state = await debugState(page);
  assert.deepStrictEqual(state.dimensions, [8, 8, 8]);
  assert.strictEqual(await page.locator('#grid-front .cell').count(), 64);
  assert.strictEqual(await page.locator('.build-cell').count(), 64);
  await setSize(page, 5);

  var fullscreenButton = page.locator('#fullscreen-btn');
  if (await fullscreenButton.isVisible()) {
    await fullscreenButton.click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(function () {
      return !!document.fullscreenElement || document.querySelector('.stage').classList.contains('is-expanded');
    }), 'stage enters native or compatible fullscreen');
    await fullscreenButton.click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(function () { return !document.fullscreenElement; }), 'stage exits fullscreen');
  }

  await page.locator('button[data-mode="learn"]').click();
  await page.waitForTimeout(800);
  assert.ok((await debugState(page)).cubes.length >= 2, 'observation mode loads a teaching model');
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator('#learn-difficulty').textContent(), '挑战');
  assert.strictEqual(await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').isDisabled(), true, 'difficulty increase is disabled at its upper boundary');
  assert.ok((await debugState(page)).cubes.length >= 8, 'challenging random observation creates a richer structure');
  await page.locator('#learn-random').click();
  assert.ok((await debugState(page)).cubes.length >= 9, 'random observation can be regenerated');
  var examples = {};
  for (var example of ['stairs', 'corner', 'towers']) {
    await page.locator('#learn-example').selectOption(example);
    examples[example] = cubeCoordinates(await debugState(page));
    assert.ok(examples[example].length >= 2, example + ' is a nonempty teaching example');
  }
  assert.notDeepStrictEqual(examples.stairs, examples.corner, 'teaching examples have distinct structures');
  assert.notDeepStrictEqual(examples.stairs, examples.towers, 'the towers example is distinct from stairs');
  await page.locator('#learn-example').selectOption('stairs');
  assert.deepStrictEqual(cubeCoordinates(await debugState(page)), examples.stairs, 'selecting the same example recreates a deterministic model');
  await waitForCamera(page);
  await page.screenshot({ path: path.join(ARTIFACTS, 'desktop.png'), fullPage: true });
  assert.deepStrictEqual(errors, [], 'desktop browser has no console errors');

  var mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce'
  });
  mobileContext.setDefaultTimeout(10000);
  mobile = await mobileContext.newPage();
  var mobileErrors = [];
  mobile.on('pageerror', function (error) { mobileErrors.push(error.message); });
  mobile.on('console', function (message) { if (message.type() === 'error') mobileErrors.push(message.text()); });
  await mobile.goto(BASE_URL + '?test=1', { waitUntil: 'networkidle' });
  await mobile.waitForFunction(function () { return !!window.SanviewDebug; });
  assert.strictEqual(await mobile.evaluate(function () { return navigator.maxTouchPoints > 0; }), true, 'mobile context provides actual touch input');
  await mobile.locator('#learn-example').selectOption('stairs');
  var mobilePixels = await mobile.evaluate(function () { return window.SanviewDebug.canvasPixels(); });
  assert.ok(mobilePixels.visibleSamples > 50, 'mobile 3D canvas renders');
  await noHorizontalOverflow(mobile, 'mobile observation');
  await mobile.locator('button[data-mode="build"]').tap();
  await mobile.waitForTimeout(800);
  await mobile.locator('#size-toggle').tap();
  await mobile.locator('.size-options [data-size="8"]').tap();
  assert.strictEqual(await mobile.locator('.build-cell').count(), 64, 'mobile supports the full 8 by 8 build pad');
  var buildTargetSizes = await mobile.locator('.build-cell').evaluateAll(function (cells) {
    return cells.map(function (cell) { var rect = cell.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  });
  assert.ok(buildTargetSizes.every(function (size) { return size.width >= 32 && size.height >= 32; }), '8 by 8 mobile build cells are at least 32px in both dimensions');
  await mobile.locator('.build-cell').nth(0).tap();
  await mobile.locator('.build-cell').nth(0).tap();
  assert.strictEqual((await debugState(mobile)).cubes.length, 2, 'touch adds blocks through the selected tool');
  await mobile.locator('#tool-remove').tap();
  await mobile.locator('.build-cell').nth(0).tap();
  assert.strictEqual((await debugState(mobile)).cubes.length, 1, 'touch respects the remove tool');
  await mobile.locator('#tool-undo').tap();
  assert.strictEqual((await debugState(mobile)).cubes.length, 2);
  await mobile.locator('#tool-redo').tap();
  assert.strictEqual((await debugState(mobile)).cubes.length, 1, 'touch redo reapplies the action');
  await noHorizontalOverflow(mobile, 'mobile 8 by 8 building');
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'mobile-build.png'), fullPage: true });

  await mobile.locator('button[data-mode="practice"]').tap();
  assert.strictEqual(await mobile.locator('body').getAttribute('data-practice-mode'), 'draw');
  assert.strictEqual(await mobile.locator('.view-grid button.cell').count(), 192, 'three mobile drawing grids each retain 64 cells in the document');
  assert.strictEqual(await mobile.locator('body').getAttribute('data-active-projection'), 'front', 'mobile drawing opens on the front projection');
  assert.strictEqual(await mobile.locator('.view-card:visible').count(), 1, 'mobile displays one projection at a time');
  assert.strictEqual(await mobile.locator('#card-front').isVisible(), true);
  var practiceTargetSizes = await mobile.locator('#grid-front button.cell').evaluateAll(function (cells) {
    return cells.map(function (cell) { var rect = cell.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  });
  assert.strictEqual(practiceTargetSizes.length, 64, 'the visible front drawing grid contains all 64 cells');
  assert.ok(practiceTargetSizes.every(function (size) { return size.width >= 28 && size.height >= 28; }), 'visible 8 by 8 mobile drawing cells are at least 28px in both dimensions');
  var wrongFrontCell = (await debugState(mobile)).views.front.findIndex(function (value) { return value === null; });
  assert.ok(wrongFrontCell >= 0, 'the front projection has an empty cell for the correction test');
  await mobile.locator('#grid-front .cell').nth(wrongFrontCell).tap();
  assert.strictEqual(await mobile.locator('#grid-front .cell').nth(wrongFrontCell).getAttribute('aria-pressed'), 'true', 'a touch toggles the drawing cell');
  var mobilePracticeModel = cubeCoordinates(await debugState(mobile));
  for (var projection of ['front', 'left', 'top']) {
    await mobile.locator('#projection-tabs button[data-projection="' + projection + '"]').tap();
    assert.strictEqual(await mobile.locator('body').getAttribute('data-active-projection'), projection, 'the selected mobile projection is reflected on the page');
    assert.strictEqual(await mobile.locator('.view-card:visible').count(), 1, 'switching projections keeps only one card visible');
    assert.strictEqual(await mobile.locator('#card-' + projection).isVisible(), true);
    assert.strictEqual(await mobile.locator('#grid-' + projection + ' .cell').count(), 64, 'projection switching keeps the complete drawing grid');
    await mobile.locator('.return-model:visible').tap();
    await mobile.waitForFunction(function () {
      var rect = document.getElementById('three-container').getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });
    assert.deepStrictEqual(cubeCoordinates(await debugState(mobile)), mobilePracticeModel, 'returning to the model does not replace the current question');
  }
  await mobile.locator('#projection-tabs button[data-projection="front"]').tap();
  assert.strictEqual(await mobile.locator('#grid-front .cell').nth(wrongFrontCell).getAttribute('aria-pressed'), 'true', 'front drawing survives visits to the other projections and the model');
  await mobile.locator('#projection-tabs button[data-projection="top"]').tap();
  await mobile.locator('#practice-check').tap();
  assert.strictEqual(await mobile.locator('body').getAttribute('data-active-projection'), 'front', 'checking an incorrect drawing opens the first projection needing correction');
  assert.strictEqual(await mobile.locator('#card-front').isVisible(), true);
  await noHorizontalOverflow(mobile, 'mobile 8 by 8 drawing');
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'mobile-practice.png'), fullPage: true });
  await mobile.locator('button[data-mode="build"]').tap();
  assert.strictEqual((await debugState(mobile)).cubes.length, 1, 'mobile mode changes preserve the free build');
  await mobile.locator('#build-pad-collapse').tap();
  await mobile.waitForFunction(function () { return document.getElementById('build-pad').getBoundingClientRect().width < 55; });
  assert.ok(await mobile.locator('#build-pad').evaluate(function (el) { return el.getBoundingClientRect().width < 55; }));
  await mobile.locator('#section-toggle').tap();
  var sectionBounds = await mobile.locator('#section-panel').evaluate(function (el) {
    var rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  assert.ok(sectionBounds.left >= 0 && sectionBounds.right <= 390, 'mobile section controls fit the viewport');
  assert.ok(sectionBounds.top >= 0 && sectionBounds.bottom < 844, 'mobile section controls remain fully reachable');
  assert.strictEqual(await mobile.locator('#build-pad').isVisible(), false, 'mobile build pad yields space to section controls');
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'section-mobile.png'), fullPage: true });
  await mobile.locator('#section-close').tap();
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'mobile.png'), fullPage: true });
  assert.deepStrictEqual(mobileErrors, [], 'mobile browser has no console errors');

  console.log('e2e tests passed');
  } catch (error) {
    for (var entry of [{ name: 'desktop', page: page }, { name: 'mobile', page: mobile }]) {
      if (entry.page && !entry.page.isClosed()) {
        try {
          await entry.page.screenshot({ path: path.join(ARTIFACTS, 'failure-' + entry.name + '.png'), fullPage: true, timeout: 5000 });
        } catch (screenshotError) {
          console.error('Could not capture ' + entry.name + ' failure screenshot: ' + screenshotError.message);
        }
      }
    }
    throw error;
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (localServer) await localServer.close();
    }
  }
}

run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
