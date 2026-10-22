/**
 * Stamps sw.js with the app's version: a hash of every file in its
 * APP_SHELL. The service worker opens the app from its cache (cache first),
 * so the phone only notices a new version when sw.js itself changes; this
 * makes it change exactly when an app file does. Not part of the app.
 *
 *   node tools/stamp-sw.js          rewrites VERSION in sw.js if it's out of date
 *   node tools/stamp-sw.js --check  only says whether it is (exit code 1 if not)
 *
 * tests/sw.test.js fails when VERSION doesn't match the files, so a change
 * to the app can't be pushed without it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');
const VERSION_LINE = /^var VERSION = '([0-9a-f]*)';/m;

// APP_SHELL, read by running sw.js with just enough of a service worker around it.
function appShell(source) {
  const context = vm.createContext({ self: { location: new URL('https://example.test/sw.js'), addEventListener() {} }, URL });
  vm.runInContext(source, context);
  return Array.from(context.APP_SHELL);
}
// The hash of the files (their names and contents), 12 hex characters.
function shellVersion(root) {
  const source = fs.readFileSync(path.join(root || ROOT, 'sw.js'), 'utf8');
  const hash = crypto.createHash('sha256');
  appShell(source).filter(f => f !== './').sort().forEach(file => {
    hash.update(file + '\n');
    hash.update(fs.readFileSync(path.join(root || ROOT, file)));
    hash.update('\n');
  });
  return hash.digest('hex').slice(0, 12);
}
function stampedVersion(root) {
  const m = VERSION_LINE.exec(fs.readFileSync(path.join(root || ROOT, 'sw.js'), 'utf8'));
  return m ? m[1] : null;
}

if (require.main === module) {
  const want = shellVersion(), have = stampedVersion();
  if (have === null) { console.error('sw.js has no VERSION line'); process.exit(1); }
  if (want === have) { console.log('sw.js VERSION ' + have + ' is up to date'); process.exit(0); }
  if (process.argv.includes('--check')) { console.error('sw.js VERSION ' + have + ' is out of date: ' + want); process.exit(1); }
  fs.writeFileSync(SW, fs.readFileSync(SW, 'utf8').replace(VERSION_LINE, "var VERSION = '" + want + "';"));
  console.log('sw.js VERSION ' + have + ' -> ' + want);
}

module.exports = { shellVersion, stampedVersion, appShell };
