/**
 * Renderer-agnostic graphics layer.
 *
 * All gameplay and world-building code talks to the active backend through this
 * module, so the same game runs on PlayCanvas (`src/gfx/PcGfx.js`, the original
 * renderer) and on Three.js (`src/gfx/ThreeGfx.js`).
 *
 * Backend contract (both implementations provide all of these):
 *
 *   node(name)                          -> Node (transform only)
 *   mesh(type, material, opts)          -> Node with a primitive: 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus'
 *   customMesh(data, material, opts)    -> Node; data = { positions, normals, uvs, indices }; opts.dynamic enables updateGeometry()
 *   add(node, parent?)                  -> attach to the scene root (or a parent node)
 *   material(spec) / neon(color, k)     -> material handle (spec keys: see world/Materials.js)
 *   setEmissive(mat, color|null, k)     -> live emissive change (flashes, blinking beacons)
 *   setOpacity(mat, value)
 *   texture(canvas, opts)               -> texture handle; opts { srgb, repeat, mipmaps, gloss }
 *   pointLight(opts) / spotLight(opts)  -> Node with setLight({ color, intensity, range })
 *   camera(opts)                        -> Node with setFov(deg)
 *   createPost(cameraNode)              -> { applyQuality(q), setFocus(distance, range) }
 *   createEnvironment(game)             -> sky, fog, moonlight, rain, reflections
 *   steam(x, y, z)                      -> optional street steam effect
 *   start(loop), setPixelRatio(r), drawCalls, maxDynamicLights, name
 *
 * Node API (a subset of PlayCanvas' Entity, mirrored by the Three.js wrapper):
 *   setPosition, getPosition, setLocalPosition, setEulerAngles, setLocalEulerAngles,
 *   setLocalScale, lookAt, rotateLocal, addChild, destroy, enabled,
 *   forward, up, right, getWorldTransform() (returns a playcanvas Mat4)
 */
let active = null;

export function setGfx(g) { active = g; }

export function gfx() {
    if (!active) throw new Error('Graphics backend not initialised');
    return active;
}
