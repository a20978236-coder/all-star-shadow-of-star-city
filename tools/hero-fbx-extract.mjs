// Pipeline helper: extract the skeleton + skin weights from a rigged FBX (e.g. a Meshy /
// Mixamo-style auto-rig) so tools/hero-rig.mjs can transfer them onto the detailed mesh.
// Usage: node tools/hero-fbx-extract.mjs <rigged.fbx> <out.json>
import fs from 'node:fs';
// FBXLoader only needs a DOM for textures, which we don't use: provide inert stubs.
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
    createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
    createElement: () => ({ style: {}, getContext: () => null })
};
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.DefaultLoadingManager.setURLModifier(() => 'data:,');   // never fetch textures
const warn = console.warn; console.warn = () => {};
const [, , input, output] = process.argv;
const buf = fs.readFileSync(input);
const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
console.warn = warn;
fbx.updateMatrixWorld(true);
let mesh = null;
fbx.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
if (!mesh) throw new Error('no skinned mesh in FBX');
const sk = mesh.skeleton;
const bones = sk.bones.map((b, i) => {
    const bindWorld = new THREE.Matrix4().copy(sk.boneInverses[i]).invert();
    return { name: b.name, parent: b.parent && b.parent.isBone ? b.parent.name : null, pos: new THREE.Vector3().setFromMatrixPosition(bindWorld).toArray() };
});
const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const v = new THREE.Vector3(), P = [], J = [], W = [];
for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);          // skeleton bind space
    P.push(v.x, v.y, v.z);
    for (let k = 0; k < 4; k++) { J.push(si.getComponent(i, k)); W.push(sw.getComponent(i, k)); }
}
fs.writeFileSync(output, JSON.stringify({ bones, P, J, W }));
console.log(`extracted ${bones.length} joints, ${pos.count} skinned vertices from ${input}`);
