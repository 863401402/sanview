'use strict';

var fs = require('fs');
var http = require('http');
var path = require('path');

var DEFAULT_ROOT = path.resolve(__dirname, '..');
var CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function isWithinRoot(root, filename) {
  var relative = path.relative(root, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function isRuntimeFile(parts) {
  if (parts.length === 1) return parts[0] === 'index.html' || parts[0] === 'favicon.svg';
  var extension = path.extname(parts[parts.length - 1]).toLowerCase();
  if (parts[0] === 'css') return extension === '.css';
  if (parts[0] === 'js') return extension === '.js';
  return parts[0] === 'assets' && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, extension);
}

async function startServer(options) {
  options = options || {};
  var root = await fs.promises.realpath(path.resolve(options.root || DEFAULT_ROOT));
  var port = options.port === undefined ? 0 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid server port.');

  var server = http.createServer(async function (request, response) {
    function send(status, message) {
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : message);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      send(405, 'Method not allowed');
      return;
    }

    var pathname;
    try {
      // Decode before normalization so encoded traversal cannot disappear in URL parsing.
      pathname = decodeURIComponent((request.url || '').split(/[?#]/, 1)[0]);
    } catch (error) {
      send(400, 'Malformed URL');
      return;
    }
    if (!pathname.startsWith('/') || /[\u0000-\u001f\u007f]/.test(pathname)) {
      send(400, 'Malformed URL');
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    var parts = pathname.slice(1).split('/');
    if (/[\\:]/.test(pathname) || parts.some(function (part) {
      return !part || part.startsWith('.') || part.endsWith('.') || part.endsWith(' ');
    }) || !isRuntimeFile(parts)) {
      send(403, 'Not a public application file');
      return;
    }

    try {
      var filename = await fs.promises.realpath(path.join(root, ...parts));
      var realParts = path.relative(root, filename).split(path.sep);
      if (!isWithinRoot(root, filename) || realParts.some(function (part) { return part.startsWith('.'); }) || !isRuntimeFile(realParts)) {
        send(403, 'Not a public application file');
        return;
      }
      var stat = await fs.promises.stat(filename);
      if (!stat.isFile()) { send(404, 'Not found'); return; }
      var data = request.method === 'HEAD' ? null : await fs.promises.readFile(filename);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(data);
    } catch (error) {
      send(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'File unavailable');
    }
  });

  await new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', function () {
      server.removeListener('error', reject);
      resolve();
    });
  });

  var closing = null;
  return {
    server: server,
    url: 'http://127.0.0.1:' + server.address().port + '/',
    close: function () {
      if (!closing) closing = new Promise(function (resolve, reject) {
        server.close(function (error) { if (error) reject(error); else resolve(); });
        if (server.closeAllConnections) server.closeAllConnections();
      });
      return closing;
    }
  };
}

module.exports = { startServer: startServer };

if (require.main === module) {
  startServer({ port: process.env.PORT === undefined ? 4173 : process.env.PORT }).then(function (running) {
    console.log('Sanview: ' + running.url);
    function stop() { running.close().catch(function (error) { console.error(error.message); process.exitCode = 1; }); }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch(function (error) {
    console.error(error.message);
    process.exitCode = 1;
  });
}
