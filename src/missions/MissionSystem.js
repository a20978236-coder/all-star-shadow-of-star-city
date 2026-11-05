import { makeMaterial } from '../world/Materials.js';
import { COLORS } from '../config.js';

/**
 * Data-driven mission chain. Each mission has ordered objectives:
 *   reach   { target: Vec3, radius, minY? }
 *   height  { minY }                     – get onto any rooftop
 *   collect { count }                    – Star Shards collected (total)
 *   defeat  { group, spawn: fn }         – clear an enemy group
 *   mount   {}                           – ride the Star Cycle
 * Objectives may have onStart callbacks (spawn enemies, hints) and a checkpoint.
 */
export function buildMissions(game) {
    const L = game.city.landmarks;
    return [
        {
            title: 'Prologue: Night Patrol',
            objectives: [
                { type: 'height', minY: 12, text: 'Grapple onto a rooftop', hint: 'Aim at a ledge and press Q (or the Grapple button) to zip up.' },
                { type: 'reach', target: L.techcoreDeck, radius: 26, minY: 66, text: 'Reach the Techcore Tower terrace', hint: 'Chain grapples and glides — hold Space in the air to glide. Hold E to swing.' },
                { type: 'collect', count: 3, text: 'Recover Star Shards', hint: 'Star Shards glow on nearby rooftops (yellow on the minimap).' }
            ]
        },
        {
            title: 'The Chaos Empire',
            objectives: [
                { type: 'reach', target: L.chaosPlaza, radius: 30, text: 'Investigate the Chaos Empire hideout', hint: 'Head north into the Occupation Zone. Glide or take the Star Cycle (B).' },
                {
                    type: 'defeat', group: 'hideout', text: 'Defeat the Chaos Empire crew',
                    hint: 'Click / Fist to strike. Right-click / Shield to counter when the cyan marker flashes.',
                    onStart: g => g.enemies.spawnGroup('hideout', L.chaosPlaza, 7, { brutes: 1, spread: 9 }),
                    checkpoint: true
                },
                { type: 'reach', target: L.chaosIntel, radius: 4, text: 'Search the hideout for intel', hint: 'Look for the glowing marker by the garage.' }
            ]
        },
        {
            title: 'Harbor Run',
            objectives: [
                { type: 'mount', text: 'Summon and ride the Star Cycle', hint: 'Press B at street level to summon it, then F to ride.' },
                { type: 'reach', target: L.harbor, radius: 32, text: 'Race to the Harbor District docks', hint: 'Shift to boost. Space ejects you into the air.' },
                {
                    type: 'defeat', group: 'harbor', text: 'Break up the Harbor shipment',
                    hint: 'Build your combo and unleash a Star Burst (R) when energy is full.',
                    onStart: g => g.enemies.spawnGroup('harbor', L.harbor, 9, { brutes: 2, spread: 10 }),
                    checkpoint: true
                }
            ]
        },
        {
            title: 'Free Roam',
            objectives: [
                { type: 'collect', count: 20, text: 'Explore Star City — collect every Star Shard', hint: 'Chaos Empire patrols roam the rooftops. More story missions coming soon!' }
            ]
        }
    ];
}

export class MissionSystem {
    constructor(game) {
        this.game = game;
        this.missions = buildMissions(game);
        this.mi = 0;
        this.oi = -1;
        this.done = false;
        this._mounted = false;

        // Waypoint beacon in the world
        const mat = makeMaterial({ name: 'waypoint', diffuse: [0, 0, 0], emissive: COLORS.neonCyan, emissiveIntensity: 3, opacity: 0.35, blend: 'additive', twoSided: true, noFog: true });
        const g = game.gfx;
        this.beacon = g.node('Waypoint');
        const beam = g.mesh('cylinder', mat, { castShadows: false, receiveShadows: false });
        beam.setLocalScale(1.2, 400, 1.2);
        beam.setLocalPosition(0, 200, 0);
        this.beacon.addChild(beam);
        const ring = g.mesh('torus', mat, { castShadows: false, receiveShadows: false });
        ring.setLocalScale(4, 4, 4);
        this.beacon.addChild(ring);
        this.ring = ring;
        g.add(this.beacon);
        this.beacon.enabled = false;
    }

    get mission() { return this.missions[this.mi]; }
    get objective() { return this.mission?.objectives[this.oi]; }

    start() { this._advance(); }

    _advance() {
        this.oi++;
        if (this.oi >= this.mission.objectives.length) {
            this.game.hud.banner('MISSION COMPLETE', this.mission.title);
            this.mi++;
            this.oi = 0;
            if (this.mi >= this.missions.length) { this.done = true; this.beacon.enabled = false; this.game.hud.setObjective(null); return; }
            setTimeout(() => this.game.hud.banner('NEW MISSION', this.mission.title), 3200);
        } else if (this.mi === 0 && this.oi === 0) {
            this.game.hud.banner('ALL-STAR', this.mission.title);
        }
        const o = this.objective;
        if (o.onStart) o.onStart(this.game);
        if (o.checkpoint || o.type === 'reach') this.game.player.checkpoint.copy(this.game.player.pos);
        if (o.hint) this.game.hud.hint(o.hint, 6);
        this._refresh();
    }

    notify(event) { if (event === 'mount') this._mounted = true; }

    targetPos() {
        const o = this.objective;
        if (!o) return null;
        if (o.type === 'reach') return o.target;
        if (o.type === 'defeat') {
            const alive = this.game.enemies.list.filter(e => e.groupId === o.group && e.alive);
            if (alive.length) return alive[0].pos;
        }
        if (o.type === 'collect') {
            const p = this.game.player.pos;
            let best = null, bd = Infinity;
            for (const it of this.game.collectibles.remaining()) {
                const d = it.pos.distance(p);
                if (d < bd) { bd = d; best = it.pos; }
            }
            return best;
        }
        if (o.type === 'mount') return this.game.bike.active ? this.game.bike.pos : null;
        return null;
    }

    _refresh() {
        const o = this.objective;
        if (!o) return;
        let text = o.text;
        if (o.type === 'collect') text += ` (${Math.min(this.game.collectibles.collected, o.count)}/${o.count})`;
        if (o.type === 'defeat') text += ` (${this.game.enemies.remaining(o.group)} left)`;
        this._text = text;
    }

    update(dt) {
        if (this.done) return;
        const o = this.objective;
        const p = this.game.player.pos;
        let complete = false;
        switch (o.type) {
            case 'height': complete = p.y >= o.minY && this.game.player.body.grounded; break;
            case 'reach': {
                const dx = p.x - o.target.x, dz = p.z - o.target.z;
                complete = Math.hypot(dx, dz) < o.radius && (o.minY === undefined || p.y >= o.minY);
                break;
            }
            case 'collect': complete = this.game.collectibles.collected >= o.count; break;
            case 'defeat': complete = this.game.enemies.remaining(o.group) === 0; break;
            case 'mount': complete = this._mounted || this.game.player.onBike; break;
            default: break;
        }
        this._refresh();
        const target = this.targetPos();
        let dist = null;
        if (target) {
            dist = Math.hypot(target.x - p.x, target.z - p.z);
            this.beacon.enabled = o.type !== 'defeat';
            this.beacon.setPosition(target.x, target.y, target.z);
            this.ring.setLocalEulerAngles(0, this.game.time * 60, 0);
            const pulse = 3.5 + Math.sin(this.game.time * 4) * 0.5;
            this.ring.setLocalScale(pulse, 4, pulse);
        } else this.beacon.enabled = false;
        this.game.hud.setObjective({ text: this._text, dist, mission: this.mission.title });
        if (complete) {
            this.game.hud.toast('OBJECTIVE COMPLETE');
            this._advance();
        }
    }
}
