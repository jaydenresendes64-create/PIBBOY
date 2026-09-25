// The parts of Three.js the app uses (js/items3d.js). tools/build-three.mjs
// bundles only these into vendor/three/three.pibboy.min.js.
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group,
  LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute,
  EdgesGeometry, BoxGeometry, ExtrudeGeometry, TorusGeometry, SphereGeometry,
  Shape, Path, Box3, Sphere, Vector3
} from 'three';
