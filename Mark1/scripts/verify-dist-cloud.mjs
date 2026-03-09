import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const bannedPatterns = [
  /localhost/i,
  /127\.0\.0\.1/i,
  /ws:\/\/localhost/i,
  /http:\/\/localhost/i,
  /http:\/\/127\.0\.0\.1/i,
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

if (!fs.existsSync(distDir)) {
  console.error('[verify:dist-cloud] dist not found. Run build first.');
  process.exit(1);
}

const files = walk(distDir).filter((f) => /\.(js|css|html|json|map|txt)$/i.test(f));
const hits = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of bannedPatterns) {
    if (pattern.test(content)) {
      hits.push({ file, pattern: pattern.toString() });
      break;
    }
  }
}

if (hits.length > 0) {
  console.error('[verify:dist-cloud] FAILED. Found non-production endpoints in dist:');
  for (const hit of hits) {
    console.error(`- ${path.relative(process.cwd(), hit.file)} matches ${hit.pattern}`);
  }
  process.exit(1);
}

console.log('[verify:dist-cloud] PASS. dist looks production-safe.');
