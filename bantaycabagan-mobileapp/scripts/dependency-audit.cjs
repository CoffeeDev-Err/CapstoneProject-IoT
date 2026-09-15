const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check using npm run audit:dependencies.');
const result = spawnSync(process.execPath, [npmCli, 'audit', '--json'], {
  cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true,
});
if (result.error || ![0, 1].includes(result.status)) {
  throw new Error('npm audit could not complete. Check registry/network access.');
}
const audit = JSON.parse(result.stdout);
if (audit.error || !audit.metadata?.vulnerabilities) throw new Error('Invalid npm audit response.');
const advisories = [...new Map(Object.values(audit.vulnerabilities || {}).flatMap((entry) => (
  entry.via.filter((via) => typeof via === 'object').map((via) => [via.url, {
    package: via.name, title: via.title, severity: via.severity, url: via.url, range: via.range,
  }])
))).values()];
const policy = JSON.parse(fs.readFileSync(path.join(root, 'dependency-audit-policy.json'), 'utf8'));
const failures = [];
for (const advisory of advisories) {
  const exception = policy.exceptions.find((entry) => entry.url === advisory.url);
  if (!exception || exception.package !== advisory.package
      || exception.severity !== advisory.severity || Date.now() >= Date.parse(exception.expiresAt)) {
    failures.push(advisory.url);
  }
}
// This temporary exception relies on no inbound URL-to-navigation parsing.
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
if (!/<NavigationContainer\s+theme=\{navigationTheme\}>/.test(app)
    || /\blink(?:ing)?\s*=|getStateFromPath|useLinking/.test(app)) {
  failures.push('Navigation setup changed: reassess the untrusted URL decoding exception.');
}
const report = {
  generatedAt: new Date().toISOString(),
  lockfileSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
  counts: audit.metadata.vulnerabilities, advisories,
  exceptions: policy.exceptions, policyPassed: failures.length === 0, failures,
};
const reportDir = path.join(root, 'security-reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'dependency-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ counts: report.counts, uniqueAdvisories: advisories.length, policyPassed: report.policyPassed, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
