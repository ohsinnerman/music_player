/**
 * Babel plugin: `import { Play, Pause } from 'lucide-react-native'` →
 * `import Play from 'lucide-react-native/icons/play'` (one module per icon).
 *
 * Metro doesn't tree-shake, so the barrel import bundled all ~2000 icons
 * (~1.9 MB of source) for the ~60 the app uses. Names that don't map to an
 * icon file (types like LucideIcon, helpers) stay on the original import.
 */
const fs = require('fs');
const path = require('path');

const PKG = 'lucide-react-native';
let iconsDir = null;
const exists = new Map();

function kebab(name) {
  return name
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase();
}

function hasIcon(file) {
  if (!iconsDir) {
    // The package's "exports" hide package.json; resolve the CJS entry and walk up to dist/.
    const entry = require.resolve(PKG); // …/dist/cjs/lucide-react-native.js
    iconsDir = path.join(path.dirname(entry), '..', 'esm', 'icons');
  }
  if (!exists.has(file)) exists.set(file, fs.existsSync(path.join(iconsDir, `${file}.mjs`)));
  return exists.get(file);
}

module.exports = function lucideDirectImports({ types: t }) {
  return {
    name: 'lucide-direct-imports',
    visitor: {
      ImportDeclaration(p) {
        if (p.node.source.value !== PKG || p.node.importKind === 'type') return;
        const keep = [];
        const direct = [];
        for (const s of p.node.specifiers) {
          if (t.isImportSpecifier(s) && s.importKind !== 'type') {
            const imported = t.isIdentifier(s.imported) ? s.imported.name : s.imported.value;
            const file = kebab(imported);
            if (hasIcon(file)) {
              direct.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(s.local.name))], t.stringLiteral(`${PKG}/icons/${file}`)));
              continue;
            }
          }
          keep.push(s);
        }
        if (!direct.length) return;
        if (keep.length) {
          p.node.specifiers = keep;
          p.insertAfter(direct);
        } else {
          p.replaceWithMultiple(direct);
        }
      },
    },
  };
};

module.exports.kebab = kebab;
