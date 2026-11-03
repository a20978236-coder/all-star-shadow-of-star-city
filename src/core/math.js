// Shared math types. PlayCanvas' math classes are small, dependency-free and
// tree-shake cleanly (the package is side-effect free), so the Three.js build
// only pulls in these few classes - not the PlayCanvas engine.
export { Vec2, Vec3, Quat, Mat4, Color } from 'playcanvas';
