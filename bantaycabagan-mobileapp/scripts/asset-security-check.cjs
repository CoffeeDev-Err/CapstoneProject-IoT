const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const ignoredDirectories = new Set([
  '.expo',
  '.git',
  'android',
  'dist',
  'ios',
  'node_modules',
]);
const blockedExtensions = new Set(['.heic', '.heif', '.icns', '.jxl']);
const isoBmffBrands = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

function detectBlockedFormat(header) {
  if (header.length >= 4 && header.subarray(0, 4).toString('ascii') === 'icns') {
    return 'ICNS';
  }

  if (
    header.length >= 12 &&
    header.subarray(0, 12).equals(
      Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]),
    )
  ) {
    return 'JPEG XL container';
  }

  if (header.length >= 2 && header[0] === 0xff && header[1] === 0x0a) {
    return 'JPEG XL codestream';
  }

  if (
    header.length >= 12 &&
    header.subarray(4, 8).toString('ascii') === 'ftyp' &&
    isoBmffBrands.has(header.subarray(8, 12).toString('ascii'))
  ) {
    return 'HEIF';
  }

  return null;
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : listFiles(absolutePath);
    }
    return entry.isFile() ? [absolutePath] : [];
  });
}

const violations = [];

for (const filePath of listFiles(projectRoot)) {
  const relativePath = path.relative(projectRoot, filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (blockedExtensions.has(extension)) {
    violations.push(`${relativePath}: blocked ${extension} asset extension`);
    continue;
  }

  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(32);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    const detectedFormat = detectBlockedFormat(header.subarray(0, bytesRead));
    if (detectedFormat) {
      violations.push(`${relativePath}: detected ${detectedFormat} payload`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

if (violations.length > 0) {
  console.error('Unsafe image assets were found:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Asset security check passed: no ICNS, JPEG XL, or HEIF inputs found.');
}
