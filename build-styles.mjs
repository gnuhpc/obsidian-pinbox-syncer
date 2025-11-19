import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read all CSS files and concatenate them
const stylesDir = path.join(__dirname, 'src/styles');
const outputFile = path.join(__dirname, 'styles.css');

// Read index.css which imports all other files
const indexPath = path.join(stylesDir, 'index.css');
let indexContent = fs.readFileSync(indexPath, 'utf-8');

// Process @import statements
const importRegex = /@import\s+['"](.+?)['"];/g;
let match;
const imports = [];

while ((match = importRegex.exec(indexContent)) !== null) {
	imports.push(match[1]);
}

// Build final CSS by reading and concatenating all imported files
let finalCSS = '/* Pinbox Syncer Plugin Styles - Generated file, do not edit directly */\n\n';

for (const importPath of imports) {
	const filePath = path.join(stylesDir, importPath);
	if (fs.existsSync(filePath)) {
		const content = fs.readFileSync(filePath, 'utf-8');
		// Remove comments at the start of each file
		const cleanContent = content.replace(/^\/\*[\s\S]*?\*\/\s*/m, '');
		finalCSS += `/* From: ${importPath} */\n${cleanContent}\n\n`;
	}
}

// Write the final CSS file
fs.writeFileSync(outputFile, finalCSS.trim() + '\n');

console.log(`✓ Built styles.css from ${imports.length} modules`);
