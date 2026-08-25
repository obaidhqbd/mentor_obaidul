import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root path configuration
const rootDir = path.resolve(__dirname, '..');
const classesDir = path.join(rootDir, 'classes');
const distDir = path.join(rootDir, 'dist');
const distClassesDir = path.join(distDir, 'classes');

// Clean and create dist directory
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distClassesDir, { recursive: true });

// Copy src assets to dist
const srcDir = path.join(rootDir, 'src');
if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, distDir, { recursive: true });
}

// Read all class directories
const classDirs = fs.readdirSync(classesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const classesData = [];

for (const dirName of classDirs) {
    const classFolderPath = path.join(classesDir, dirName);
    const jsonPath = path.join(classFolderPath, 'class.json');

    if (fs.existsSync(jsonPath)) {
        try {
            const rawData = fs.readFileSync(jsonPath, 'utf8');
            const classInfo = JSON.parse(rawData);
            classInfo.slug = dirName;
            classesData.push(classInfo);

            // Copy individual class folder to dist/classes
            fs.cpSync(classFolderPath, path.join(distClassesDir, dirName), { recursive: true });
        } catch (err) {
            console.error(`Error processing class in ${dirName}:`, err);
        }
    }
}

// Sort classes by order or slug if available
classesData.sort((a, b) => (a.order || 0) - (b.order || 0));

// Output classes.json for runtime rendering
fs.writeFileSync(
    path.join(distDir, 'classes.json'),
    JSON.stringify(classesData, null, 2)
);

console.log(`Successfully built ${classesData.length} classes into /dist directory!`);
