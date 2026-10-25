// npm run build: writes dist/solea.html, one self-contained file (styles and
// scripts inline) that also opens from the file system. No dependency: the ES
// modules of src/ are wrapped in functions and joined in dependency order.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/app.js';

const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function readModule(path) {
  const source = readFileSync(join(ROOT, path), 'utf8');
  if (/^\s*export\s+default\b/m.test(source) || /^\s*export\s*\{/m.test(source) || /^\s*import\s+[^{\s]/m.test(source)) {
    throw new Error(`${path}: only named imports and "export function|const|let|class" are supported by the build`);
  }
  const imports = [];
  let code = source.replace(IMPORT_RE, (match, names, from) => {
    const dep = posix.normalize(posix.join(posix.dirname(path), from));
    imports.push(dep);
    const bindings = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ': '))
      .join(', ');
    return `const { ${bindings} } = __modules[${JSON.stringify(dep)}];`;
  });
  const exported = [];
  code = code.replace(EXPORT_DECL_RE, (match, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  return { path, code, imports, exported };
}

// Depth-first walk so every module comes after the modules it imports.
function collect(path, seen = new Map(), stack = []) {
  if (seen.has(path)) return seen;
  if (stack.includes(path)) throw new Error(`Import cycle: ${[...stack, path].join(' > ')}`);
  const mod = readModule(path);
  mod.imports.forEach((dep) => collect(dep, seen, [...stack, path]));
  seen.set(path, mod);
  return seen;
}

function bundle() {
  const modules = [...collect(ENTRY).values()];
  const parts = modules.map(
    (m) =>
      `// ---- ${m.path} ----\n__modules[${JSON.stringify(m.path)}] = (() => {\n${m.code}\nreturn { ${m.exported.join(', ')} };\n})();`,
  );
  return `const __modules = {};\n${parts.join('\n\n')}\n`;
}

const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const safeStyle = (code) => code.replace(/<\/style/gi, '<\\/style');

function build() {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
  const cssTag = /<link rel="stylesheet" href="src\/styles\.css"\s*\/?>/;
  const jsTag = /<script type="module" src="src\/app\.js"><\/script>/;
  if (!cssTag.test(html) || !jsTag.test(html)) {
    throw new Error('index.html must link src/styles.css and src/app.js with the expected tags');
  }
  html = html.replace(cssTag, () => `<style>\n${safeStyle(css)}</style>`);
  html = html.replace(jsTag, () => `<script type="module">\n${safeScript(bundle())}</script>`);
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist/solea.html');
  writeFileSync(out, html);
  console.log(`Built dist/solea.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
}

build();
