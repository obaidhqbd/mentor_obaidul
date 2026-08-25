import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const classesDir = path.join(root, 'classes');
const dataDir = path.join(root, 'data');
const distDir = path.join(root, 'dist');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push(rel);
  }
  return out;
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(path.join(distDir, 'classes'), { recursive: true });
await fs.mkdir(dataDir, { recursive: true });

const siteConfig = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
const classNames = (await fs.readdir(classesDir, { withFileTypes: true }))
  .filter(x => x.isDirectory())
  .map(x => x.name)
  .sort();

const classes = [];
for (const dirName of classNames) {
  const classRoot = path.join(classesDir, dirName);
  const metaPath = path.join(classRoot, 'class.json');
  if (!(await exists(metaPath))) {
    console.warn(`Skipping ${dirName}: missing class.json`);
    continue;
  }
  let meta;
  try { meta = JSON.parse(await fs.readFile(metaPath, 'utf8')); }
  catch (err) { throw new Error(`Invalid JSON in ${dirName}/class.json: ${err.message}`); }
  if (!meta.id || !meta.title) throw new Error(`Class ${dirName} must include id and title.`);
  const files = await walk(classRoot);
  if (!files.includes(meta.entry ?? 'index.html')) console.warn(`Warning: ${dirName} entry file missing.`);
  classes.push({ ...meta, slug: dirName, files });
}

await fs.writeFile(path.join(dataDir, 'classes.json'), JSON.stringify(classes, null, 2));
await fs.writeFile(path.join(distDir, 'classes.json'), JSON.stringify(classes));
await fs.writeFile(path.join(distDir, 'site-config.json'), JSON.stringify(siteConfig));

const copyPaths = ['src/index.html', 'src/app.js', 'src/styles.css'];
for (const rel of copyPaths) {
  const target = path.join(distDir, path.basename(rel));
  await fs.copyFile(path.join(root, rel), target);
}

for (const relClass of classNames) {
  const source = path.join(classesDir, relClass);
  const target = path.join(distDir, 'classes', relClass);
  await fs.cp(source, target, { recursive: true });
}

console.log(`Built ${classes.length} classes.`);
