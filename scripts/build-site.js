'use strict';

// An explicit runtime bundle keeps source archives, credentials and developer
// tooling out of the public web root. No bundler or network access is required.
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var output = path.join(root, '_site');
var runtime = ['index.html', 'favicon.svg', 'css', 'js', 'assets', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'third_party_licenses'];

function copyRuntime(source, destination) {
  var stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Refusing to publish a symlink: ' + source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    fs.readdirSync(source).forEach(function (name) { copyRuntime(path.join(source, name), path.join(destination, name)); });
  } else {
    fs.copyFileSync(source, destination);
  }
}

if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('_site must be a regular directory');
runtime.forEach(function (entry) {
  if (!fs.existsSync(path.join(root, entry))) throw new Error('Missing runtime asset: ' + entry);
});
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
runtime.forEach(function (entry) { copyRuntime(path.join(root, entry), path.join(output, entry)); });
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Static site ready: ' + output);
