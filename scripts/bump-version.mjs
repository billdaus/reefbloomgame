#!/usr/bin/env node
// Reef Bloom versions are Major.Minor.Patch:
//   major — a big release / major changes            2.0.0
//   minor — new features or content                  1.1.0
//   patch — bug fixes and maintenance only           1.0.1
// Pick the bump by what the release CONTAINS, not by how many uploads it took:
// if a build adds any feature or content, it is a minor bump. Re-uploading the
// same release (a fix found in TestFlight before it ships) is `build`.
//
// Bump the iOS app version in one go:
//   npm run version:bump            → patch  (1.0.0 → 1.0.1), build +1
//   npm run version:bump minor      → 1.0.1 → 1.1.0
//   npm run version:bump major      → 1.1.0 → 2.0.0
//   npm run version:bump build      → same version, build +1
//   npm run version:bump 1.2.3      → exact version
// Updates: ios/App/App.xcodeproj (MARKETING_VERSION, CURRENT_PROJECT_VERSION),
// package.json "version", and the APP_VERSION shown in the app's Home footer.
// The build number only ever goes up — App Store Connect requires that.
import { readFileSync, writeFileSync } from 'node:fs';

const PBX = 'ios/App/App.xcodeproj/project.pbxproj';
const APP = 'app.html';
const PKG = 'package.json';

const arg = process.argv[2] ?? 'patch';
let pbx = readFileSync(PBX, 'utf8');
const cur = pbx.match(/MARKETING_VERSION = ([\d.]+);/)?.[1];
const build = Number(pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1]);
if (!cur || !Number.isFinite(build)) { console.error('could not read versions from', PBX); process.exit(1); }

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'build') next = cur;          // same version, new build number (a re-upload of the same release)
else {
  const [maj, min, pat] = cur.split('.').map(Number);
  next = arg === 'major' ? `${maj + 1}.0.0` : arg === 'minor' ? `${maj}.${min + 1}.0`
       : arg === 'patch' ? `${maj}.${min}.${pat + 1}` : null;
  if (!next) { console.error('usage: bump-version [patch|minor|major|build|x.y.z]'); process.exit(1); }
}
const nextBuild = build + 1;

pbx = pbx.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${next};`)
         .replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${nextBuild};`);
writeFileSync(PBX, pbx);

let app = readFileSync(APP, 'utf8');
app = app.replace(/var APP_VERSION = '[\d.]+';/, `var APP_VERSION = '${next}';`);
writeFileSync(APP, app);

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
pkg.version = next;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

console.log(`${cur} (${build}) → ${next} (${nextBuild})`);
console.log(`next: git commit -am "iOS ${next} (${nextBuild})" && git tag ios-v${next}${arg === 'build' ? '-b' + nextBuild : ''}`);
