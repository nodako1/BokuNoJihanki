import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const requiredFiles = [
  'package.json',
  'PROJECT_STATE.json',
  'vercel.json',
  'public/manifest.webmanifest',
  'docs/PRODUCT_VISION.md',
  'docs/TECH_ARCHITECTURE.md',
  'docs/ART_BIBLE.md',
  'docs/ROADMAP.md',
  'docs/specs/M0_FOUNDATION.md',
];

const failures = [];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

const packageJson = JSON.parse(await readFile('package.json', 'utf-8'));
const projectState = JSON.parse(await readFile('PROJECT_STATE.json', 'utf-8'));
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf-8'));

if (packageJson.name !== 'boku-no-jihanki') {
  failures.push('package.json name must be boku-no-jihanki.');
}
if (projectState.currentMilestone !== 'M0') {
  failures.push('PROJECT_STATE.json currentMilestone must be M0 during this milestone.');
}
if (manifest.orientation !== 'landscape') {
  failures.push('PWA manifest orientation must be landscape.');
}
if (manifest.display !== 'standalone') {
  failures.push('PWA manifest display must be standalone.');
}

if (failures.length > 0) {
  console.error('Project validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Project validation passed (${requiredFiles.length} required files).`);
}
