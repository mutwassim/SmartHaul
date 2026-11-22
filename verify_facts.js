// SmartHaul fact check: prints raw evidence from the code, with no interpretation.
// Usage (from the repository root):  node verify_facts.js > srs-evidence/facts.txt 2>&1
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const out = (s = '') => process.stdout.write(s + '\n');
const hr = (t) => out('\n==================== ' + t + ' ====================');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 }); } catch (e) { return (e.stdout || '') + (e.stderr || '') + '\n[exit ' + e.status + ']'; } };

function walk(dir, exts, acc = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const d of ents) {
    if (['node_modules', '.git', '.next', 'build', '.dart_tool', 'srs-evidence'].includes(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, exts, acc); else if (exts.some((x) => p.endsWith(x))) acc.push(p);
  }
  return acc;
}
function grep(files, re, ctx = 0) {
  for (const f of files) {
    const L = (read(f) || '').split(/\r?\n/);
    L.forEach((l, i) => {
      if (re.test(l)) {
        for (let k = Math.max(0, i - ctx); k <= Math.min(L.length - 1, i + ctx); k++)
          out(`${f.replace(/\\/g, '/')}:${k + 1}: ${L[k]}`);
        if (ctx) out('--');
      }
    });
  }
}
function block(file, startRe, maxLines = 60) {
  const L = (read(file) || '').split(/\r?\n/);
  const i = L.findIndex((l) => startRe.test(l));
  if (i < 0) return out(`[not found in ${file}: ${startRe}]`);
  for (let k = i; k < Math.min(L.length, i + maxLines); k++) {
    out(`${file}:${k + 1}: ${L[k]}`);
    if (k > i && /^\}/.test(L[k])) break;
  }
}

const be = walk('Backend/src', ['.js']);
const schema = 'Backend/prisma/schema.prisma';

hr('0. Git state (any application code changed during the audit?)');
out(sh('git rev-parse HEAD'));
out(sh('git status --short'));
out(sh('git diff --stat'));

hr('1. Scheduled jobs: files and registration');
out(sh(process.platform === 'win32' ? 'dir /b Backend\\src\\jobs' : 'ls Backend/src/jobs'));
out(read('Backend/src/jobs/index.js') || '[Backend/src/jobs/index.js not found]');
grep(walk('Backend/src/jobs', ['.js']), /cron\.schedule|schedule\(|72|120|90|cutoff/);

hr('2. Storage: are file links signed and do they expire?');
grep(be, /createHmac|expires|signature|\bsig\b|signedUrl|SIGNED_URL/i);
grep(be.filter((f) => /storage/i.test(f)), /router\.|res\.(sendFile|download)|path\.join/);

hr('3. Prisma: Vehicle model, Shipment status enum, all enums');
block(schema, /^model Vehicle\b/);
grep([schema], /^enum /);
block(schema, /^enum ShipmentStatus/, 20);

hr('4. Matching: score formula, return load, shared load, distance');
grep(be.filter((f) => /matching/i.test(f)), /score|Weight|Bonus|isSharedLoad|isReturnLoad|RETURN_LOAD|distance|haversine/i);

hr('5. Haversine and fallback factor');
grep(be, /1\.3|1\.25|haversine|straightLine|estimatedRoadKm/i);

hr('6. Password recovery: what is returned');
grep(be, /resetToken|password-recovery|temporary|tempPassword/i);

hr('7. Bid acceptance: transaction, locking and notifications');
grep(be, /\$transaction|FOR UPDATE|isolationLevel/);
grep(be.filter((f) => /cargo-?owner/i.test(f)), /dispatchNotification|BID_ACCEPTED|BOOKED_BY|REJECTED/);

hr('8. Driver routes: role guard (do fleet owners get 403 on bidding?)');
grep(be.filter((f) => /driver\.routes/i.test(f)), /requireRole|requireAnyRole|router\.(get|post|put|delete|use)/);
grep(be.filter((f) => /fleet\.routes/i.test(f)), /router\.(get|post|put|delete|use)/);

hr('9. Status transitions');
grep(be, /VALID_STATUS_TRANSITIONS/, 12);

hr('10. Notifications and FCM');
grep(be, /FCM-MOCK|firebase-admin|messaging\(\)|sendEachForMulticast|isPushDelivered/);

hr('11. Retention and route summary');
grep(be, /tripPosition\.deleteMany|routeSummary|route_summary/i, 2);

hr('12. Mounted API routes (every router.METHOD line)');
for (const f of walk('Backend/src', ['.routes.js']))
  grep([f], /router\.(get|post|put|patch|delete)\(/);
grep(['Backend/src/app.js'], /app\.use\(|app\.get\(/);

hr('13. Mobile app: networking packages');
out(read('App/pubspec.yaml') || '[App/pubspec.yaml not found]');
grep(walk('App/lib', ['.dart']), /package:(http|dio|web_socket_channel|firebase_messaging)/);

hr('14. Logging configuration');
out(read('Backend/src/utils/logger.js') || '[logger.js not found]');

hr('15. Deployment artefacts');
for (const p of ['Dockerfile', 'Backend/Dockerfile', 'docker-compose.yml', '.github/workflows', 'Backend/prisma/migrations', 'vercel.json', 'ecosystem.config.js'])
  out(`${p}: ${fs.existsSync(p) ? 'EXISTS' : 'missing'}`);

hr('16. Test files added for the SRS audit');
for (const d of ['Backend/tests/srs', 'Website/tests/srs', 'App/test/srs'])
  out(`${d}: ${fs.existsSync(d) ? fs.readdirSync(d).join(', ') : 'missing'}`);

hr('17. Run the SRS test files (raw Jest output)');
out(sh('cd Backend && npx jest tests/srs --runInBand --verbose 2>&1'));

hr('18. Run the existing backend suite (raw Jest summary)');
out(sh('cd Backend && npx jest --runInBand --testPathIgnorePatterns=tests/srs 2>&1'));

hr('END');