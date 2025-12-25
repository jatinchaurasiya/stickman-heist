/**
 * Stickman Heist - "The Digital Vault"
 * Phase 8/9: Scalable Levels & Save System
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const lootDisplay = document.getElementById('loot-count');
const timeDisplay = document.getElementById('time-display');
const shopBtn = document.getElementById('shop-btn');
const shopModal = document.getElementById('shop-modal');
const shopItemsContainer = document.getElementById('shop-items');
const closeShopBtn = document.getElementById('close-shop');

// Overlays
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const nextLevelBtn = document.getElementById('next-level-btn');

let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

// --- Config & Constants ---
const GRAVITY = 0.5;
const FRICTION = 0.99;
const BOUNCE = 0.5;
const STIFFNESS = 5;
const FIXED_TIME_STEP = 1000 / 60; // 60 FPS fixed physics

// Tile IDs
const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_LASER = 2;
const TILE_LOOT = 3;
const TILE_EXIT = 4;
const TILE_CAMERA = 5;

// Game State
const points = [];
const sticks = [];
let stickman;
let levelManager;
let camera;
let soundManager;
let saveManager;
let mouseX = 0;
let mouseY = 0;

// Global Game Data
let gameState = {
    loot: 0,
    startTime: Date.now(),
    unlockedColors: ['#0ff'],
    currentColor: '#0ff',
    timeScale: 1.0,
    paused: true,
    shake: 0,
    state: 'START'
};

const SHOP_ITEMS = [
    { name: 'Cyan', color: '#0ff', cost: 0 },
    { name: 'Lime', color: '#0f0', cost: 10 },
    { name: 'Pink', color: '#f0f', cost: 15 },
    { name: 'Gold', color: 'gold', cost: 50 },
    { name: 'Red', color: '#f00', cost: 100 }
];

// --- Save System ---
class SaveManager {
    constructor() {
        this.STORAGE_KEY = 'heistSaveData_v2';
    }

    load() {
        const dataStr = localStorage.getItem(this.STORAGE_KEY);
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                gameState.loot = data.loot || 0;
                gameState.unlockedColors = data.unlockedColors || ['#0ff'];
                gameState.currentColor = data.currentColor || '#0ff';
                console.log("Save loaded:", data);
                return data.currentLevel || 0;
            } catch (e) {
                console.error("Save Corrupt", e);
                return 0;
            }
        }
        return 0;
    }

    save(levelIndex) {
        const data = {
            currentLevel: levelIndex,
            loot: gameState.loot,
            unlockedColors: gameState.unlockedColors,
            currentColor: gameState.currentColor
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        console.log("Game Saved", data);
    }

    reset() {
        localStorage.removeItem(this.STORAGE_KEY);
        location.reload();
    }
}

// --- Audio System ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
    }
    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }
    playTone(freq, type, duration) {
        if (!this.initialized) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq; osc.type = type;
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.stop(this.ctx.currentTime + duration);
    }
    playGrapple() {
        if (!this.initialized) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.1);
        osc.type = 'sawtooth'; gain.gain.value = 0.05;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.1);
    }
    playLoot() { this.playTone(1200, 'sine', 0.1); setTimeout(() => this.playTone(1800, 'sine', 0.2), 50); }
    playDeath() {
        if (!this.initialized) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.frequency.value = 100; osc.type = 'sawtooth';
        osc.frequency.linearRampToValueAtTime(10, this.ctx.currentTime + 0.5);
        gain.gain.value = 0.2; gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.5);
    }
    playWin() { this.playTone(440, 'sine', 0.1); setTimeout(() => this.playTone(554, 'sine', 0.1), 100); setTimeout(() => this.playTone(659, 'sine', 0.4), 200); }
}

// --- Object Pooling ---
const MAX_PARTICLES = 100;
const particlePool = [];

class Particle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.life = 0; this.decay = 0; this.color = '#fff';
    }
    activate(x, y, color, speed) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const v = Math.random() * speed;
        this.vx = Math.cos(angle) * v;
        this.vy = Math.sin(angle) * v;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.color = color;
        this.active = true;
    }
    update() {
        if (!this.active) return;
        this.x += this.vx; this.y += this.vy;
        this.life -= this.decay;
        if (this.life <= 0) this.active = false;
    }
    draw() {
        if (!this.active) return;
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 5; ctx.shadowColor = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }
}
for (let i = 0; i < MAX_PARTICLES; i++) particlePool.push(new Particle());

function createSparks(x, y, count = 5) {
    let spawned = 0;
    for (let p of particlePool) {
        if (!p.active) { p.activate(x, y, '#fff', 3); spawned++; if (spawned >= count) break; }
    }
}

function createExplosion(x, y, color) {
    let spawned = 0;
    for (let p of particlePool) {
        if (!p.active) { p.activate(x, y, color, 8); spawned++; if (spawned >= 30) break; }
    }
}
function updateParticles() { for (let p of particlePool) p.update(); }
function drawParticles() { for (let p of particlePool) p.draw(); }

// --- Classes ---

class Camera {
    constructor() { this.x = 0; this.y = 0; }
    update() {
        if (!stickman || stickman.dead) return;
        const target = stickman.points[2];
        const targetX = target.x - width / 2;
        const targetY = target.y - height / 2;
        this.x += (targetX - this.x) * 0.1;
        this.y += (targetY - this.y) * 0.1;
        if (levelManager) {
            this.x = Math.max(0, Math.min(this.x, levelManager.width - width));
            this.y = Math.max(0, Math.min(this.y, levelManager.height - height));
        }
    }
    apply() {
        const sx = (Math.random() - 0.5) * gameState.shake;
        const sy = (Math.random() - 0.5) * gameState.shake;
        ctx.translate(-this.x + sx, -this.y + sy);
    }
}

class Point {
    constructor(x, y, pinned = false) { this.x = x; this.y = y; this.oldx = x; this.oldy = y; this.pinned = pinned; }
    update() {
        if (this.pinned) return;
        const vx = (this.x - this.oldx) * FRICTION;
        const vy = (this.y - this.oldy) * FRICTION;
        this.oldx = this.x; this.oldy = this.y;
        this.x += vx; this.y += vy; this.y += GRAVITY;
    }
    constrain() {
        if (this.pinned) return;
        const vx = (this.x - this.oldx) * FRICTION;
        const vy = (this.y - this.oldy) * FRICTION;
        let collided = false;
        if (this.x > levelManager.width) { this.x = levelManager.width; this.oldx = this.x + vx * BOUNCE; collided = true; }
        else if (this.x < 0) { this.x = 0; this.oldx = this.x + vx * BOUNCE; collided = true; }
        if (this.y > levelManager.height) { this.y = levelManager.height; this.oldy = this.y + vy * BOUNCE; collided = true; }
        else if (this.y < 0) { this.y = 0; this.oldy = this.y + vy * BOUNCE; collided = true; }

        if (collided) {
            const speed = Math.sqrt(vx * vx + vy * vy);
            // Increased threshold from 5 to 15 to prevent constant shaking when sliding
            if (speed > 15) { createSparks(this.x, this.y); gameState.shake = 3; }
        }
        const tile = levelManager.getTileAt(this.x, this.y);
        if (tile === TILE_LASER && !stickman.dead) stickman.die();
        else if (tile === TILE_EXIT && !stickman.dead) levelComplete();
        else if (tile === TILE_LOOT) levelManager.collectLoot(this.x, this.y);
    }
}

class Stick {
    constructor(p0, p1, length = null, visible = true) {
        this.p0 = p0; this.p1 = p1;
        this.length = length === null ? Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2) : length;
        this.visible = visible; this.color = gameState.currentColor;
    }
    update() {
        const dx = this.p1.x - this.p0.x; const dy = this.p1.y - this.p0.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = this.length - dist;
        const percent = diff / dist / 2;
        const ox = dx * percent; const oy = dy * percent;
        if (!this.p0.pinned) { this.p0.x -= ox; this.p0.y -= oy; }
        if (!this.p1.pinned) { this.p1.x += ox; this.p1.y += oy; }
    }
    draw() {
        if (!this.visible) return;
        ctx.beginPath();
        if (this.color === '#fff') {
            ctx.shadowBlur = 10; ctx.shadowColor = 'cyan'; ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2;
            const segs = 6; const dx = this.p1.x - this.p0.x; const dy = this.p1.y - this.p0.y;
            ctx.moveTo(this.p0.x, this.p0.y);
            for (let i = 1; i < segs; i++) {
                const t = i / segs; const j = (Math.random() - 0.5) * 8;
                ctx.lineTo(this.p0.x + dx * t + j, this.p0.y + dy * t + j);
            }
            ctx.lineTo(this.p1.x, this.p1.y); ctx.stroke(); return;
        }
        if (this.color === gameState.currentColor) {
            ctx.strokeStyle = '#444'; ctx.lineWidth = 4; ctx.shadowBlur = 0;
            ctx.moveTo(this.p0.x, this.p0.y); ctx.lineTo(this.p1.x, this.p1.y); ctx.stroke(); return;
        }
        ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.moveTo(this.p0.x, this.p0.y); ctx.lineTo(this.p1.x, this.p1.y); ctx.stroke();
    }
}

class Stickman {
    constructor(x, y) { this.x = x; this.y = y; this.createRagdoll(); this.grapple = null; this.dead = false; this.history = []; }
    createRagdoll() {
        const h = 20;
        const nodes = [[0, 0], [0, h], [0, 3 * h], [-h, 1.5 * h], [-2 * h, 2 * h], [h, 1.5 * h], [2 * h, 2 * h], [-0.5 * h, 4 * h], [-0.5 * h, 5.5 * h], [0.5 * h, 4 * h], [0.5 * h, 5.5 * h]];
        this.points = nodes.map(n => new Point(this.x + n[0], this.y + n[1]));
        points.push(...this.points);
        const links = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10], [0, 2, { v: false }], [3, 5, { v: false }], [7, 9, { v: false }], [3, 2, { v: false }], [5, 2, { v: false }]];
        this.sticks = links.map(l => new Stick(this.points[l[0]], this.points[l[1]], l[2]?.len, l[2]?.v !== false));
        sticks.push(...this.sticks);
    }
    shootGrapple(sx, sy) {
        if (this.dead) return;
        const hand = this.points[6];
        const wx = sx + camera.x; const wy = sy + camera.y;
        const hit = levelManager.castRay(hand.x, hand.y, wx, wy);
        if (hit.hit) {
            soundManager.playGrapple();
            const anchor = new Point(hit.x, hit.y, true);
            const rope = new Stick(hand, anchor); rope.color = '#fff';
            this.grapple = { anchor, rope };
            sticks.push(rope);
            triggerSlowMotion();
        }
    }
    releaseGrapple() {
        if (this.grapple) {
            const idx = sticks.indexOf(this.grapple.rope);
            if (idx > -1) sticks.splice(idx, 1);
            this.grapple = null;
        }
    }
    die() {
        if (this.dead) return;
        this.dead = true;
        soundManager.playDeath();
        for (let p of this.points) createExplosion(p.x, p.y, gameState.currentColor);
        points.length = 0; sticks.length = 0; this.grapple = null;
        gameState.shake = 20;
        setTimeout(() => { gameOverScreen.style.display = 'flex'; gameState.state = 'GAMEOVER'; }, 1000);
    }
    applyStiffness() {
        if (this.dead) return;
        const h = this.points[0]; const hips = this.points[2];
        h.x += (hips.x - h.x) * 0.05; h.y += (hips.y - 60 - h.y) * 0.05;
    }
    draw() {
        if (this.dead) return;
        if (this.points[2]) {
            const vel = Math.abs(this.points[2].x - this.points[2].oldx) + Math.abs(this.points[2].y - this.points[2].oldy);
            if (vel > 4) { this.history.push({ x: this.points[2].x, y: this.points[2].y }); if (this.history.length > 5) this.history.shift(); }
            else this.history = [];
        }
        ctx.fillStyle = gameState.currentColor;
        for (let i = 0; i < this.history.length; i++) {
            ctx.globalAlpha = i * 0.1; ctx.beginPath(); ctx.arc(this.history[i].x, this.history[i].y, 10, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 10; ctx.shadowColor = gameState.currentColor; ctx.fillStyle = gameState.currentColor;
        for (let p of this.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
        const n = this.points[1];
        if (n) {
            ctx.fillStyle = '#222'; ctx.strokeStyle = gameState.currentColor; ctx.lineWidth = 1;
            ctx.fillRect(n.x - 8, n.y - 5, 16, 20); ctx.strokeRect(n.x - 8, n.y - 5, 16, 20);
        }
        const head = this.points[0];
        if (head) {
            ctx.strokeStyle = gameState.currentColor; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(head.x, head.y, 12, 0, Math.PI * 2); ctx.stroke();
            const wx = mouseX + camera.x; const wy = mouseY + camera.y;
            const dx = wx - head.x; const dy = wy - head.y; const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / len; const ny = dy / len;
            ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.arc(head.x + nx * 5 - 3, head.y + ny * 5, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(head.x + nx * 5 + 3, head.y + ny * 5, 2, 0, Math.PI * 2); ctx.fill();
        }
    }
}

class LevelManager {
    constructor() { this.levelIndex = 0; this.tiles = []; this.tileSize = 60; this.width = 0; this.height = 0; this.levels = window.LEVELS_DATA || []; }
    loadLevel(index) {
        if (index >= this.levels.length) { index = 0; console.log("Game Loop!"); }
        this.levelIndex = index;
        const levelData = this.levels[index];
        this.tiles = levelData.grid.map(row => [...row]);
        this.rows = this.tiles.length; this.cols = this.tiles[0].length;
        this.calculateDimensions();
        // Use Start Pos Config
        const spawnCol = levelData.start ? levelData.start.col : 2;
        const spawnRow = levelData.start ? levelData.start.row : 2;
        this.spawnPlayer(spawnCol, spawnRow);

        for (let p of particlePool) p.active = false;
        gameState.shake = 0; gameState.startTime = Date.now(); gameState.state = 'PLAYING';
    }
    calculateDimensions() {
        if (width > height) this.tileSize = Math.min(80, height / 10);
        else this.tileSize = width / 12;
        this.width = this.cols * this.tileSize; this.height = this.rows * this.tileSize;
    }
    spawnPlayer(c, r) {
        const spawnX = c * this.tileSize; const spawnY = r * this.tileSize;
        points.length = 0; sticks.length = 0;
        stickman = new Stickman(spawnX, spawnY);
    }
    getTileAt(x, y) {
        const col = Math.floor(x / this.tileSize); const row = Math.floor(y / this.tileSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return TILE_EMPTY;
        return this.tiles[row][col];
    }
    collectLoot(x, y) {
        const col = Math.floor(x / this.tileSize); const row = Math.floor(y / this.tileSize);
        if (this.tiles[row][col] === TILE_LOOT) {
            this.tiles[row][col] = TILE_EMPTY; gameState.loot++;
            updateUI(); createSparks(x, y, 10); soundManager.playLoot();
            saveManager.save(this.levelIndex); // Auto Save
        }
    }
    castRay(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1; const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy; let x = x0; let y = y0; let dist = 0;
        while (dist < 1000) {
            if (this.getTileAt(x, y) === TILE_WALL || this.getTileAt(x, y) === TILE_CAMERA) return { x, y, hit: true };
            if (Math.abs(x - x1) < 1 && Math.abs(y - y1) < 1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
            dist++;
        }
        return { x: x1, y: y1, hit: false };
    }
    draw() {
        const now = Date.now();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = this.tiles[r][c];
                if (tile === TILE_EMPTY) continue;
                const x = c * this.tileSize; const y = r * this.tileSize;
                const cx = x + this.tileSize / 2; const cy = y + this.tileSize / 2;

                if (tile === TILE_WALL) {
                    ctx.fillStyle = '#050505'; ctx.strokeStyle = 'cyan';
                    ctx.shadowBlur = 10; ctx.shadowColor = 'cyan'; ctx.lineWidth = 1;
                    ctx.fillRect(x, y, this.tileSize, this.tileSize);
                    ctx.strokeRect(x, y, this.tileSize, this.tileSize); ctx.shadowBlur = 0;
                } else if (tile === TILE_LASER) {
                    const pulse = Math.abs(Math.sin(now / 150));
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    ctx.shadowBlur = 15; ctx.shadowColor = 'red';
                    ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 + pulse * 0.5})`;
                    ctx.lineWidth = 2 + pulse * 2;
                    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + this.tileSize, cy); ctx.stroke();
                    ctx.restore();
                } else if (tile === TILE_LOOT) {
                    ctx.save(); ctx.translate(cx, cy + Math.sin(now / 400) * 5); ctx.rotate(now / 1000);
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)'; ctx.strokeStyle = 'gold';
                    ctx.shadowBlur = 15; ctx.shadowColor = 'gold'; ctx.lineWidth = 2;
                    const size = this.tileSize / 3.5;
                    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.restore();
                } else if (tile === TILE_EXIT) {
                    ctx.save(); ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'; ctx.strokeStyle = '#0f0';
                    ctx.shadowBlur = 15; ctx.shadowColor = '#0f0'; ctx.lineWidth = 2;
                    const h = this.tileSize * 0.8; const w = this.tileSize * 0.5;
                    ctx.beginPath(); ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.stroke(); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(cx - w / 2, cy - h / 2 + (now % 1000) / 1000 * h);
                    ctx.lineTo(cx + w / 2, cy - h / 2 + (now % 1000) / 1000 * h);
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; ctx.stroke();
                    ctx.restore();
                } else if (tile === TILE_CAMERA) {
                    ctx.save(); ctx.translate(cx, cy);
                    const angle = Math.sin(now / 1000) * 0.5 + Math.PI / 2;
                    ctx.fillStyle = '#444'; ctx.fillRect(-10, -10, 20, 10);
                    ctx.rotate(angle);
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
                    ctx.beginPath(); ctx.moveTo(0, 0);
                    ctx.lineTo(-this.tileSize * 2, this.tileSize * 3);
                    ctx.lineTo(this.tileSize * 2, this.tileSize * 3);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; ctx.stroke();
                    if (stickman && !stickman.dead) {
                        const coneLen = this.tileSize * 3; const coneWidthHalf = Math.PI / 4;
                        for (let p of stickman.points) {
                            const dx = p.x - cx; const dy = p.y - cy; const d = Math.sqrt(dx * dx + dy * dy);
                            if (d < coneLen && d > 10) {
                                let pAngle = Math.atan2(dy, dx); let diff = pAngle - angle;
                                while (diff <= -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                                if (Math.abs(diff) < coneWidthHalf) { stickman.die(); break; }
                            }
                        }
                    }
                    ctx.restore();
                }
            }
        }
    }
}

function drawParallaxBackground() {
    ctx.save(); ctx.strokeStyle = '#112233'; ctx.lineWidth = 1; const gridSize = 100;
    const offX = -(camera.x * 0.2) % gridSize; const offY = -(camera.y * 0.2) % gridSize;
    ctx.beginPath();
    for (let x = offX; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = offY; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    ctx.fillStyle = '#224466';
    for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + camera.x * 0.1) % width + width) % width;
        const sy = ((i * 199 + camera.y * 0.1) % height + height) % height;
        ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.restore();
}

function triggerSlowMotion() {
    gameState.timeScale = 0.2;
    let iv = setInterval(() => { gameState.timeScale += 0.05; if (gameState.timeScale >= 1) { gameState.timeScale = 1; clearInterval(iv); } }, 50);
}

function levelComplete() {
    if (gameState.state === 'WIN') return;
    gameState.state = 'WIN'; soundManager.playWin();
    saveManager.save(levelManager.levelIndex + 1); // Save progress
    levelCompleteScreen.style.display = 'flex';
}

function updateUI() {
    lootDisplay.innerText = gameState.loot;
    if (gameState.state === 'PLAYING') {
        const el = Date.now() - gameState.startTime;
        const m = Math.floor(el / 60000).toString().padStart(2, '0');
        const s = Math.floor((el % 60000) / 1000).toString().padStart(2, '0');
        timeDisplay.innerText = `${m}:${s}`;
    }
}

function windowResized() { width = window.innerWidth; height = window.innerHeight; canvas.width = width; canvas.height = height; if (levelManager) levelManager.calculateDimensions(); }
window.addEventListener('resize', windowResized);

function handleInput(x, y, isDown) {
    if (gameState.paused || gameState.state !== 'PLAYING') return;
    if (!stickman || stickman.dead) return;
    if (isDown) stickman.shootGrapple(x, y);
    else stickman.releaseGrapple();
}
canvas.addEventListener('mousedown', e => handleInput(e.clientX, e.clientY, true));
canvas.addEventListener('mouseup', e => handleInput(e.clientX, e.clientY, false));
canvas.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
canvas.addEventListener('touchstart', e => { if (e.target === canvas) { e.preventDefault(); handleInput(e.touches[0].clientX, e.touches[0].clientY, true); mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY; } }, { passive: false });
canvas.addEventListener('touchend', e => { if (e.target === canvas) { e.preventDefault(); handleInput(0, 0, false); } }, { passive: false });
canvas.addEventListener('touchmove', e => { if (e.target === canvas) { e.preventDefault(); mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY; } }, { passive: false });

window.handleShopAction = (color) => {
    const item = SHOP_ITEMS.find(i => i.color === color);
    if (!item) return;
    if (gameState.unlockedColors.includes(color)) gameState.currentColor = color;
    else if (gameState.loot >= item.cost) {
        gameState.loot -= item.cost; gameState.unlockedColors.push(color); gameState.currentColor = color; soundManager.playLoot();
    }
    saveManager.save(levelManager.levelIndex);
    updateUI(); renderShop();
};
function renderShop() {
    shopItemsContainer.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const div = document.createElement('div'); div.className = 'shop-item';
        const isUnlocked = gameState.unlockedColors.includes(item.color);
        const canBuy = gameState.loot >= item.cost;
        const isEquipped = gameState.currentColor === item.color;
        let btnText = isEquipped ? 'EQUIPPED' : (isUnlocked ? 'EQUIP' : `BUY (${item.cost})`);
        let btnDisabled = isEquipped || (!isUnlocked && !canBuy);
        div.innerHTML = `<div style="display:flex; align-items:center;"><div class="color-btn" style="background:${item.color}; margin-right:10px;"></div><span>${item.name}</span></div><button class="buy-btn" onclick="window.handleShopAction('${item.color}')" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>`;
        shopItemsContainer.appendChild(div);
    });
}
shopBtn.addEventListener('click', () => { if (gameState.state !== 'PLAYING') return; gameState.paused = true; shopModal.style.display = 'block'; });
closeShopBtn.addEventListener('click', () => { gameState.paused = false; shopModal.style.display = 'none'; });

startBtn.addEventListener('click', () => {
    soundManager.init();
    const savedLevel = saveManager.load();
    startScreen.style.display = 'none';
    gameState.paused = false;
    levelManager.loadLevel(savedLevel);
});
retryBtn.addEventListener('click', () => { gameOverScreen.style.display = 'none'; levelManager.loadLevel(levelManager.levelIndex); gameState.paused = false; });
nextLevelBtn.addEventListener('click', () => { levelCompleteScreen.style.display = 'none'; levelManager.loadLevel(levelManager.levelIndex + 1); gameState.paused = false; });

// --- Game Loop (Fixed Timestep) ---

function init() {
    saveManager = new SaveManager();
    soundManager = new SoundManager();
    levelManager = new LevelManager();
    camera = new Camera();

    // Check save data for initial UI logic if needed, but Start Click will load it.
    renderShop();
    requestAnimationFrame(loop);
}

function update() {
    if (gameState.paused || gameState.state !== 'PLAYING') return;
    if (gameState.shake > 0) gameState.shake *= 0.9;

    if (stickman) stickman.applyStiffness();
    for (let p of points) p.update();
    for (let i = 0; i < STIFFNESS; i++) {
        for (let s of sticks) s.update();
        for (let p of points) p.constrain();
    }
    updateParticles();
    // Camera update moved to render loop for smoothness
}

let lastTime = 0;
let accumulator = 0;

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    if (deltaTime > 100) accumulator += 100;
    else accumulator += deltaTime * gameState.timeScale;

    while (accumulator >= FIXED_TIME_STEP) {
        update();
        accumulator -= FIXED_TIME_STEP;
    }

    // Smooth Camera Update (Every Render Frame)
    // We update camera here to interpolate smoothly between physics steps
    if (camera) camera.update();

    // Draw
    ctx.clearRect(0, 0, width, height);
    drawParallaxBackground();
    ctx.save();
    camera.apply();
    if (levelManager) levelManager.draw();
    for (let s of sticks) s.draw();
    if (stickman) stickman.draw();
    drawParticles();
    ctx.restore();
    updateUI();

    requestAnimationFrame(loop);
}

init();
