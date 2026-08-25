import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const classesDir = path.join(rootDir, 'classes');
const distDir = path.join(rootDir, 'dist');
const distClassesDir = path.join(distDir, 'classes');

// Clean and recreate dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distClassesDir, { recursive: true });

// Copy src assets to dist
const srcDir = path.join(rootDir, 'src');
if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, distDir, { recursive: true });
}

// Copy site.config.json if present
const configFile = path.join(rootDir, 'site.config.json');
if (fs.existsSync(configFile)) {
  fs.copyFileSync(configFile, path.join(distDir, 'site.config.json'));
}

// Function to getAllFiles in a directory recursively
function getAllFiles(dirPath, arrayOfFiles = [], baseDir = dirPath) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, baseDir);
    } else {
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      arrayOfFiles.push(relativePath);
    }
  });

  return arrayOfFiles;
}

// Process classes
const classDirs = fs.readdirSync(classesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

const classesData = [];

for (const dirName of classDirs) {
  const classFolderPath = path.join(classesDir, dirName);
  const jsonPath = path.join(classFolderPath, 'class.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const rawData = fs.readFileSync(jsonPath, 'utf8');
      const classInfo = JSON.parse(rawData);
      
      classInfo.slug = dirName;
      if (!classInfo.id) classInfo.id = dirName;
      
      // Collect all files inside the class folder
      classInfo.files = getAllFiles(classFolderPath);

      classesData.push(classInfo);

      // Copy class folder to dist/classes/
      fs.cpSync(classFolderPath, path.join(distClassesDir, dirName), { recursive: true });
    } catch (err) {
      console.error(`Error processing class in ${dirName}:`, err);
    }
  }
}

classesData.sort((a, b) => (a.order || 0) - (b.order || 0));

// Output classes.json to dist/ and root data/
fs.writeFileSync(
  path.join(distDir, 'classes.json'),
  JSON.stringify(classesData, null, 2)
);

const dataDir = path.join(rootDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
fs.writeFileSync(
  path.join(dataDir, 'classes.json'),
  JSON.stringify(classesData, null, 2)
);

console.log(`Successfully built ${classesData.length} classes into /dist directory!`);
