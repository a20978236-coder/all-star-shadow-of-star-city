import { ICONS, STAR_PATH } from './Icons.js';
import { CITY_EDGE } from '../world/City.js';
import { IS_TOUCH } from '../config.js';

const $ = (root, sel) => root.querySelector(sel);

/**
 * DOM-based HUD: vitals, objective tracker, rotating minimap, combo counter,
 * reticle, prompts, toasts, banners, pause/map screen and title screen.
 */
export class HUD {
    constructor(root, game) {
        this.game = game;
        this.root = root;
        root.innerHTML = `
        <div class="hud" hidden>
            <div class="damage-flash"></div>
            <div class="vitals">
                <div class="portrait"><svg viewBox="0 0 48 48"><path d="${STAR_PATH}" /></svg></div>
                <div class="bars">
                    <div class="bar health"><i></i></div>
                    <div class="bar energy"><i></i></div>
                    <div class="shards"><svg viewBox="0 0 48 48"><path d="${STAR_PATH}"/></svg><span>0</span></div>
                </div>
            </div>
            <div class="objective">
                <div class="obj-mission"></div>
                <div class="obj-label">CURRENT OBJECTIVE</div>
                <div class="obj-text"><span class="diamond"></span><span class="txt"></span></div>
                <div class="obj-dist"><span class="diamond gold"></span><span class="d"></span></div>
            </div>
            <div class="minimap-wrap">
                <canvas class="minimap" width="220" height="220"></canvas>
                <div class="compass-n">N</div>
            </div>
            <button class="pause-btn" aria-label="Pause">${ICONS.pause}</button>
            <div class="reticle"><span></span></div>
            <div class="combo"><div class="combo-n"></div><div class="combo-label">COMBO</div><div class="combo-tag"></div></div>
            <div class="district"></div>
            <div class="toast"></div>
            <div class="banner"><div class="b1"></div><div class="b2"></div></div>
            <div class="prompt"></div>
            <div class="hint"></div>
            <div class="bike-meter"><div class="speed"><b>0</b> km/h</div><div class="bar boost"><i></i></div></div>
        </div>
        <div class="screen title-screen">
            <div class="logo">
                <div class="logo-main">ALL<svg viewBox="0 0 48 48"><path d="${STAR_PATH}"/></svg>STAR</div>
                <div class="logo-sub">SHADOWS OF STAR CITY</div>
            </div>
            <button class="start-btn">${IS_TOUCH ? 'TAP TO START' : 'CLICK TO START'}</button>
            <div class="controls-help">${this._controlsHTML()}</div>
            <div class="loading">Building Star City…</div>
        </div>
        <div class="screen pause-screen" hidden>
            <div class="pause-panel">
                <div class="pause-head">
                    <div class="logo-main small">ALL<svg viewBox="0 0 48 48"><path d="${STAR_PATH}"/></svg>STAR</div>
                    <div class="tabs"><span class="tab active">MAP</span><span class="tab">CONTROLS</span><span class="tab">GRAPHICS</span></div>
                </div>
                <div class="pause-body">
                    <div class="map-view"><canvas class="bigmap" width="720" height="720"></canvas><div class="map-legend"></div></div>
                    <div class="controls-view" hidden>${this._controlsHTML()}</div>
                    <div class="graphics-view" hidden>
                        <div class="gfx-title">GRAPHICS QUALITY</div>
                        <div class="gfx-options">
                            <button data-q="low">LOW<small>Older phones · max battery</small></button>
                            <button data-q="medium">MEDIUM<small>iPhone default · shadows, reflections</small></button>
                            <button data-q="high">HIGH<small>PC default · AO, depth of field, dense rain</small></button>
                        </div>
                        <div class="gfx-note">Post effects, resolution and shadows change instantly. Texture resolution, rain density and street detail apply after a reload.</div>
                        <button class="gfx-reload">RELOAD WITH NEW SETTINGS</button>
                    </div>
                </div>
                <button class="resume-btn">RESUME</button>
            </div>
        </div>
        <div class="screen defeat-screen" hidden><div class="defeat-title">ALL-STAR IS DOWN</div><div class="defeat-sub">Returning to last checkpoint…</div></div>
        <div class="rotate-hint">Rotate your iPhone to landscape for the best experience</div>`;

        this.el = $(root, '.hud');
        this.healthBar = $(root, '.bar.health i');
        this.energyBar = $(root, '.bar.energy i');
        this.shardCount = $(root, '.shards span');
        this.objMission = $(root, '.obj-mission');
        this.objText = $(root, '.obj-text .txt');
        this.objDist = $(root, '.obj-dist .d');
        this.objDistRow = $(root, '.obj-dist');
        this.minimap = $(root, '.minimap');
        this.mctx = this.minimap.getContext('2d');
        this.reticle = $(root, '.reticle');
        this.comboEl = $(root, '.combo');
        this.comboN = $(root, '.combo-n');
        this.comboTag = $(root, '.combo-tag');
        this.districtEl = $(root, '.district');
        this.toastEl = $(root, '.toast');
        this.bannerEl = $(root, '.banner');
        this.promptEl = $(root, '.prompt');
        this.hintEl = $(root, '.hint');
        this.flashEl = $(root, '.damage-flash');
        this.bikeMeter = $(root, '.bike-meter');
        this.titleScreen = $(root, '.title-screen');
        this.pauseScreen = $(root, '.pause-screen');
        this.defeatScreen = $(root, '.defeat-screen');
        this.bigmap = $(root, '.bigmap');

        $(root, '.pause-btn').addEventListener('click', () => game.togglePause());
        $(root, '.resume-btn').addEventListener('click', () => game.togglePause(false));
        root.querySelectorAll('.tab').forEach((t, i) => t.addEventListener('click', () => {
            root.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
            $(root, '.map-view').hidden = i !== 0;
            $(root, '.controls-view').hidden = i !== 1;
            $(root, '.graphics-view').hidden = i !== 2;
        }));

        root.querySelectorAll('.gfx-options button').forEach(b => b.addEventListener('click', () => {
            game.setQuality(b.dataset.q);
            this._markQuality(b.dataset.q);
        }));
        $(root, '.gfx-reload').addEventListener('click', () => window.location.reload());
        this._markQuality(game.qualityName);

        this._hintTimer = 0;
        this._toastTimer = 0;
        this._bannerTimer = 0;
        this._districtTimer = 0;
        this._comboTimer = 0;
        this._lastDistrict = null;
        this._flash = 0;
    }

    _controlsHTML() {
        if (IS_TOUCH) {
            return `<div class="ctrl-grid">
                <span>Left stick</span><b>Move (push fully to sprint)</b>
                <span>Drag right side</span><b>Camera</b>
                <span>Fist</span><b>Strike (chain for combos)</b>
                <span>Shield</span><b>Counter (cyan warning)</b>
                <span>Up arrow</span><b>Jump · tap again in air to glide</b>
                <span>Hook</span><b>Grapple to ledge in crosshair</b>
                <span>Swing</span><b>Hold to web-swing</b>
                <span>Star</span><b>Star Burst special</b>
                <span>Bike / Hand</span><b>Summon Star Cycle / Ride</b>
            </div>`;
        }
        return `<div class="ctrl-grid">
            <span>WASD</span><b>Move</b><span>Mouse</span><b>Camera</b>
            <span>Shift</span><b>Sprint / Bike boost</b><span>Space</span><b>Jump · again in air: Glide</b>
            <span>Left click</span><b>Strike</b><span>Right click</span><b>Counter</b>
            <span>Q</span><b>Grapple to ledge</b><span>Hold E</span><b>Web-swing</b>
            <span>Ctrl / C</span><b>Dodge</b><span>R</span><b>Star Burst</b>
            <span>B</span><b>Summon Star Cycle</b><span>F</span><b>Ride / Dismount</b>
            <span>M / Esc</span><b>Map / Pause</b>
        </div>`;
    }

    _markQuality(name) {
        this.root.querySelectorAll('.gfx-options button').forEach(b => b.classList.toggle('active', b.dataset.q === name));
    }

    // ------------------------------------------------------------ screens
    ready(onStart) {
        $(this.root, '.loading').hidden = true;
        document.getElementById('boot')?.remove();
        const btn = $(this.root, '.start-btn');
        btn.classList.add('ready');
        const go = () => {
            this.titleScreen.hidden = true;
            this.el.hidden = false;
            onStart();
        };
        btn.addEventListener('click', go, { once: true });
    }

    showPause(v) {
        this.pauseScreen.hidden = !v;
        if (v) this._drawBigMap();
    }

    showDefeat(v) { this.defeatScreen.hidden = !v; }

    // ------------------------------------------------------------ messages
    hint(text, seconds = 3) {
        this.hintEl.textContent = text;
        this.hintEl.classList.add('show');
        this._hintTimer = seconds;
    }

    toast(text) {
        this.toastEl.textContent = text;
        this.toastEl.classList.remove('show');
        void this.toastEl.offsetWidth;
        this.toastEl.classList.add('show');
        this._toastTimer = 2.2;
    }

    banner(a, b) {
        this.bannerEl.querySelector('.b1').textContent = a;
        this.bannerEl.querySelector('.b2').textContent = b || '';
        this.bannerEl.classList.add('show');
        this._bannerTimer = 3;
    }

    combo(n, tag) {
        if (n <= 0) { this.comboEl.classList.remove('show'); return; }
        this.comboN.textContent = `x${n}`;
        this.comboTag.textContent = tag || '';
        this.comboEl.classList.add('show');
        this.comboEl.classList.remove('pop'); void this.comboEl.offsetWidth; this.comboEl.classList.add('pop');
    }

    damage() { this._flash = 1; }

    setObjective(o) {
        if (!o) { this.objText.textContent = 'Star City is safe… for now.'; this.objDistRow.hidden = true; return; }
        if (this.objText.textContent !== o.text) this.objText.textContent = o.text;
        this.objMission.textContent = o.mission;
        this.objDistRow.hidden = o.dist === null;
        if (o.dist !== null) this.objDist.textContent = `${Math.round(o.dist)} m`;
    }

    setPrompt(text) {
        if (this._prompt === text) return;
        this._prompt = text;
        this.promptEl.textContent = text || '';
        this.promptEl.classList.toggle('show', !!text);
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        const g = this.game, p = g.player;
        this.healthBar.style.width = `${Math.max(0, p.health)}%`;
        this.energyBar.style.width = `${p.energy}%`;
        this.energyBar.parentElement.classList.toggle('full', p.energy >= 100);
        this.shardCount.textContent = g.collectibles.collected;

        const zip = p.grapple.zipTarget;
        this.reticle.classList.toggle('locked', !!zip);
        this.reticle.hidden = p.onBike;

        this.bikeMeter.classList.toggle('show', p.onBike);
        if (p.onBike) {
            this.bikeMeter.querySelector('b').textContent = Math.round(Math.abs(g.bike.speed) * 3.6);
            this.bikeMeter.querySelector('.boost i').style.width = `${g.bike.boost}%`;
        }

        if (this._hintTimer > 0) { this._hintTimer -= dt; if (this._hintTimer <= 0) this.hintEl.classList.remove('show'); }
        if (this._toastTimer > 0) { this._toastTimer -= dt; if (this._toastTimer <= 0) this.toastEl.classList.remove('show'); }
        if (this._bannerTimer > 0) { this._bannerTimer -= dt; if (this._bannerTimer <= 0) this.bannerEl.classList.remove('show'); }
        if (this._districtTimer > 0) { this._districtTimer -= dt; if (this._districtTimer <= 0) this.districtEl.classList.remove('show'); }
        this._flash = Math.max(0, this._flash - dt * 2.5);
        this.flashEl.style.opacity = this._flash * 0.7 + (p.health < 30 ? 0.25 + Math.sin(g.time * 6) * 0.1 : 0);

        const d = g.city.districtAt(p.pos.x, p.pos.z);
        if (d.name !== this._lastDistrict) {
            this._lastDistrict = d.name;
            this.districtEl.textContent = d.name.toUpperCase();
            this.districtEl.style.setProperty('--dc', d.color);
            this.districtEl.classList.add('show');
            this._districtTimer = 2.6;
        }
        this._drawMinimap();
    }

    _worldToMap(x, z, s) { return [(x + CITY_EDGE) * s, (z + CITY_EDGE) * s]; }

    _drawMinimap() {
        const g = this.game, ctx = this.mctx, W = this.minimap.width, H = this.minimap.height;
        const city = g.city, src = city.minimapCanvas, s = city.minimapScale;
        const p = g.player.pos;
        const zoom = g.player.onBike ? 0.9 : 1.6;     // map pixels per source pixel
        const yaw = g.camera.yaw * Math.PI / 180;
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = '#04080e'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2);
        ctx.rotate(yaw);                  // camera forward points up
        ctx.scale(zoom, zoom);
        const [mx, my] = this._worldToMap(p.x, p.z, s);
        ctx.drawImage(src, -mx, -my);
        // markers
        const mark = (x, z, color, r, shape) => {
            const [ax, ay] = this._worldToMap(x, z, s);
            ctx.fillStyle = color;
            ctx.beginPath();
            if (shape === 'diamond') { ctx.moveTo(ax - mx, ay - my - r); ctx.lineTo(ax - mx + r, ay - my); ctx.lineTo(ax - mx, ay - my + r); ctx.lineTo(ax - mx - r, ay - my); }
            else ctx.arc(ax - mx, ay - my, r, 0, Math.PI * 2);
            ctx.fill();
        };
        for (const it of g.collectibles.remaining()) mark(it.pos.x, it.pos.z, '#ffe14a', 2.2 / zoom * 2);
        for (const e of g.enemies.list) if (e.alive) mark(e.pos.x, e.pos.z, e.engaged ? '#ff3030' : '#a02020', 2.4 / zoom * 2);
        if (g.bike.active && !g.player.onBike) mark(g.bike.pos.x, g.bike.pos.z, '#39d0ff', 3 / zoom * 2);
        ctx.restore();

        // objective marker (clamped to the rim)
        const t = g.missions.targetPos();
        if (t) {
            const dx = (t.x - p.x) * s * zoom, dz = (t.z - p.z) * s * zoom;
            const c = Math.cos(yaw), sn = Math.sin(yaw);
            let rx = dx * c - dz * sn, ry = dx * sn + dz * c;
            const len = Math.hypot(rx, ry), maxR = W / 2 - 12;
            if (len > maxR) { rx *= maxR / len; ry *= maxR / len; }
            ctx.save();
            ctx.translate(W / 2 + rx, H / 2 + ry);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#ffc531'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
            ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
            ctx.restore();
        }
        // player arrow
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(yaw - g.player.heading);
        ctx.fillStyle = '#b8ff2c'; ctx.shadowColor = '#b8ff2c'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        // rim
        ctx.strokeStyle = 'rgba(57,208,255,0.7)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
        // compass N position
        const nEl = this.root.querySelector('.compass-n');
        const rr = this.minimap.clientWidth / 2 - 12;
        const nx = Math.sin(yaw) * rr, ny = -Math.cos(yaw) * rr;
        nEl.style.transform = `translate(${nx}px, ${ny}px)`;
    }

    _drawBigMap() {
        const g = this.game, c = this.bigmap, ctx = c.getContext('2d');
        const src = g.city.minimapCanvas, s = c.width / src.width;
        ctx.drawImage(src, 0, 0, c.width, c.height);
        const k = g.city.minimapScale * s;
        const toMap = (x, z) => [(x + CITY_EDGE) * k, (z + CITY_EDGE) * k];
        // district labels
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const seen = new Set();
        for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
            const x = -400 + i * 80 + 40, z = -400 + j * 80 + 40;
            const d = g.city.districtAt(x, z);
            if (seen.has(d.name)) continue;
            seen.add(d.name);
            const [mx, my] = toMap(x, z);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 70, my - 11, 140, 18);
            ctx.fillStyle = d.color; ctx.fillText(d.name.toUpperCase(), mx, my + 3);
        }
        for (const it of g.collectibles.remaining()) { const [x, y] = toMap(it.pos.x, it.pos.z); ctx.fillStyle = '#ffe14a'; ctx.fillRect(x - 3, y - 3, 6, 6); }
        const t = g.missions.targetPos();
        if (t) { const [x, y] = toMap(t.x, t.z); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#ffc531'; ctx.fillRect(-7, -7, 14, 14); ctx.restore(); }
        const [px, py] = toMap(g.player.pos.x, g.player.pos.z);
        ctx.save(); ctx.translate(px, py); ctx.rotate(-g.player.heading);
        ctx.fillStyle = '#b8ff2c'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
        this.root.querySelector('.map-legend').innerHTML =
            `<span class="lg you">You</span><span class="lg obj">Objective</span><span class="lg shard">Star Shard</span><span class="lg">Shards: ${g.collectibles.collected}/${g.collectibles.total}</span>`;
    }
}
