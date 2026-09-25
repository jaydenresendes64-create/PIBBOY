// Builds vendor/three/three.pibboy.min.js: only the parts of Three.js listed in
// tools/three-entry.mjs, minified, as one ES module the app imports when a 3D
// view is first shown (js/items3d.js). Run it again only to change version or
// add a part:
//
//   npm install --no-save three@0.186.1 esbuild
//   node tools/build-three.mjs
//
// (node_modules/ is ignored by git.) Licence: vendor/three/LICENSE.
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(root, 'tools/three-entry.mjs')],
  outfile: path.join(root, 'vendor/three/three.pibboy.min.js'),
  bundle: true, format: 'esm', minify: true, target: 'es2020',
  nodePaths: process.env.THREE_NODE_PATH ? [process.env.THREE_NODE_PATH] : [],
  legalComments: 'none',
  banner: { js: '/* Three.js r186 (0.186.1), https://threejs.org, MIT licence: vendor/three/LICENSE. Only the parts in tools/three-entry.mjs. */' }
});
console.log('built vendor/three/three.pibboy.min.js');
