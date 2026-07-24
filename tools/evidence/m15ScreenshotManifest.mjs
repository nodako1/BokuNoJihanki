import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function fileSha256(filename) {
  return createHash('sha256')
    .update(fs.readFileSync(filename))
    .digest('hex');
}

export function readPngDimensions(filename) {
  const bytes = fs.readFileSync(filename);
  invariant(bytes.length >= 24, `PNG is too short: ${filename}`);
  invariant(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `PNG signature is invalid: ${filename}`,
  );
  invariant(
    bytes.toString('ascii', 12, 16) === 'IHDR',
    `PNG IHDR is missing: ${filename}`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  invariant(width > 0 && height > 0, `PNG dimensions are empty: ${filename}`);
  return Object.freeze({ width, height });
}

export function createM15ScreenshotManifest(
  directory,
  {
    viewportWidth,
    viewportHeight,
    deviceScaleFactor,
  },
) {
  const expectedWidth = viewportWidth * deviceScaleFactor;
  const expectedHeight = viewportHeight * deviceScaleFactor;
  invariant(
    Number.isSafeInteger(expectedWidth)
      && Number.isSafeInteger(expectedHeight)
      && expectedWidth > 0
      && expectedHeight > 0,
    'Viewport multiplied by DPR must produce positive integer pixels.',
  );
  const filenames = fs.readdirSync(directory)
    .filter((filename) => filename.toLowerCase().endsWith('.png'))
    .sort();
  invariant(filenames.length > 0, 'A completed M1.5 run has no PNG screenshots.');

  const files = filenames.map((filename) => {
    invariant(
      path.basename(filename) === filename,
      `Screenshot filename is unsafe: ${filename}`,
    );
    const absolutePath = path.join(directory, filename);
    const stats = fs.lstatSync(absolutePath);
    invariant(
      stats.isFile() && !stats.isSymbolicLink(),
      `Screenshot is not a regular file: ${filename}`,
    );
    const dimensions = readPngDimensions(absolutePath);
    invariant(
      dimensions.width === expectedWidth
        && dimensions.height === expectedHeight,
      `${filename} is ${dimensions.width}x${dimensions.height}; expected `
        + `${expectedWidth}x${expectedHeight}.`,
    );
    return Object.freeze({
      filename,
      bytes: stats.size,
      sha256: fileSha256(absolutePath),
      width: dimensions.width,
      height: dimensions.height,
    });
  });

  return Object.freeze({
    schemaVersion: 1,
    expectedPixelSize: Object.freeze({
      width: expectedWidth,
      height: expectedHeight,
    }),
    screenshotCount: files.length,
    files: Object.freeze(files),
  });
}
