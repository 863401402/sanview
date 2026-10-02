'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');
var playwright = require('playwright');

var BASE_URL = process.env.SANVIEW_URL || null;
var ARTIFACTS = path.join(__dirname, '..', 'artifacts');
var ROOT = path.join(__dirname, '..');

function startServer() {
  return new Promise(function (resolve, reject) {
    var types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.mp3': 'audio/mpeg'
    };
    var server = http.createServer(function (request, response) {
      var pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/') pathname = '/index.html';
      var filename = path.resolve(ROOT, '.' + decodeURIComponent(pathname));
      if (filename.indexOf(ROOT + path.sep) !== 0) { response.writeHead(403); response.end(); return; }
      fs.readFile(filename, function (error, data) {
        if (error) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
        response.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, url: 'http://127.0.0.1:' + server.address().port + '/' });
    });
  });
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

async function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  var localServer = null;
  if (!BASE_URL) {
    localServer = await startServer();
    BASE_URL = localServer.url;
  }
  var browser = await playwright.chromium.launch({
    headless: process.env.SANVIEW_HEADED !== '1',
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  var context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (error) { errors.push('pageerror: ' + error.message); });
  page.on('console', function (message) {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });

  await page.goto(BASE_URL + '?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.SanviewDebug; });

  var state = await debugState(page);
  assert.deepStrictEqual(state.dimensions, [4, 4, 4], 'default space is 4x4x4');
  assert.strictEqual(state.mode, 'learn');
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

  await page.locator('[data-mode="practice"]').click();
  await page.waitForTimeout(900);
  assert.strictEqual((await debugState(page)).mode, 'practice');
  assert.strictEqual(await page.locator('#grid-front .cell').count(), 16);
  await page.locator('#practice-answer').click();
  assert.ok(await page.locator('.view-grid .cell.filled').count() > 0, 'answer reveals projected cells');
  await page.locator('#practice-check').click();
  await page.waitForSelector('#overlay.show');
  await page.locator('#win-close').click();
  await page.locator('#practice-clear').click();
  assert.strictEqual(await page.locator('.view-grid .cell.filled').count(), 0, 'clear removes the drawing');
  await page.locator('[data-difficulty="practice-difficulty"][data-step="-1"]').click();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator('#practice-difficulty').textContent(), '简单');

  await page.locator('[data-practice-mode="challenge"]').click();
  await page.waitForTimeout(900);
  state = await debugState(page);
  assert.strictEqual(state.practiceMode, 'challenge');
  assert.strictEqual(state.cubes.length, 0, 'restore-block challenge starts with an empty model');
  assert.ok(await page.locator('.view-grid .cell.filled').count() > 0, 'challenge displays target projections');
  assert.strictEqual(await page.locator('.build-cell').count(), 16, 'challenge reuses the precise build pad');

  await page.locator('[data-mode="build"]').click();
  await page.waitForTimeout(900);
  state = await debugState(page);
  assert.strictEqual(state.mode, 'build');
  assert.strictEqual(state.cubes.length, 0);
  assert.strictEqual(await page.locator('.build-cell').count(), 16);

  await page.locator('#build-pad-collapse').click();
  assert.ok(await page.locator('#build-pad').evaluate(function (el) { return el.classList.contains('collapsed'); }));
  var collapsedWidth = await page.locator('#build-pad').evaluate(function (el) { return el.getBoundingClientRect().width; });
  assert.ok(collapsedWidth < 55, 'collapsed build pad is icon-only');
  await page.locator('#build-pad-collapse').click();

  await page.locator('.build-cell').nth(0).click();
  await page.waitForTimeout(420);
  await page.locator('.build-cell').nth(0).click();
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

  await page.locator('[data-mode="learn"]').click();
  await page.waitForTimeout(800);
  assert.ok((await debugState(page)).cubes.length >= 2, 'observation mode loads a random model');
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.locator('[data-difficulty="learn-difficulty"][data-step="1"]').click();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator('#learn-difficulty').textContent(), '挑战');
  assert.ok((await debugState(page)).cubes.length >= 8, 'challenging random observation creates a richer structure');
  await page.locator('#learn-random').click();
  assert.ok((await debugState(page)).cubes.length >= 9, 'random observation can be regenerated');
  await page.screenshot({ path: path.join(ARTIFACTS, 'desktop.png'), fullPage: true });
  assert.deepStrictEqual(errors, [], 'desktop browser has no console errors');

  var mobile = await context.newPage();
  var mobileErrors = [];
  mobile.on('pageerror', function (error) { mobileErrors.push(error.message); });
  mobile.on('console', function (message) { if (message.type() === 'error') mobileErrors.push(message.text()); });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE_URL + '?test=1', { waitUntil: 'networkidle' });
  await mobile.waitForFunction(function () { return !!window.SanviewDebug; });
  var mobilePixels = await mobile.evaluate(function () { return window.SanviewDebug.canvasPixels(); });
  assert.ok(mobilePixels.visibleSamples > 50, 'mobile 3D canvas renders');
  var overflow = await mobile.evaluate(function () {
    return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
  });
  assert.ok(overflow.scroll <= overflow.client + 1, 'mobile page has no global horizontal overflow');
  await mobile.locator('[data-mode="build"]').click();
  await mobile.waitForTimeout(800);
  await mobile.locator('#build-pad-collapse').click();
  assert.ok(await mobile.locator('#build-pad').evaluate(function (el) { return el.getBoundingClientRect().width < 55; }));
  await mobile.locator('#section-toggle').click();
  var sectionBounds = await mobile.locator('#section-panel').evaluate(function (el) {
    var rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  assert.ok(sectionBounds.left >= 0 && sectionBounds.right <= 390, 'mobile section controls fit the viewport');
  assert.ok(sectionBounds.top >= 0 && sectionBounds.bottom < 844, 'mobile section controls remain fully reachable');
  assert.strictEqual(await mobile.locator('#build-pad').isVisible(), false, 'mobile build pad yields space to section controls');
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'section-mobile.png'), fullPage: true });
  await mobile.locator('#section-close').click();
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'mobile.png'), fullPage: true });
  assert.deepStrictEqual(mobileErrors, [], 'mobile browser has no console errors');

  await browser.close();
  if (localServer) await new Promise(function (resolve) { localServer.server.close(resolve); });
  console.log('e2e tests passed');
}

run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
