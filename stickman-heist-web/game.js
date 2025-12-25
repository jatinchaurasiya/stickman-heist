/**
 * Stickman Heist - Ragdoll & Grapple Logic
 * Phase 3: Juice, Engagement & Scaling
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const lootDisplay = document.getElementById('loot-count');
const shopBtn = document.getElementById('shop-btn');
const shopModal = document.getElementById('shop-modal');
const shopItemsContainer = document.getElementById('shop-items');
const closeShopBtn = document.getElementById('close-shop');

let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

// --- Config & Constants ---
const GRAVITY = 0.5;
const FRICTION = 0.99;
const BOUNCE = 0.5;
const STIFFNESS = 5;

// Tile IDs
const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_LASER = 2;
const TILE_LOOT = 3;
const TILE_EXIT = 4;

// Game State
const points = [];
const sticks = [];
let particles = [];
let stickman;
let levelManager;
let camera;

// Global Game Data
let gameState = {
    loot: 0,
    unlockedColors: ['#0ff'], // Cyan default
    currentColor: '#0ff',
    timeScale: 1.0,
    paused: false
};

// Colors Shop Data
const SHOP_ITEMS = [
    { name: 'Cyan', color: '#0ff', cost: 0 },
    { name: 'Lime', color: '#0f0', cost: 10 },
    { name: 'Pink', color: '#f0f', cost: 20 },
    { name: 'Gold', color: 'gold', cost: 50 },
    { name: 'Red', color: '#f00', cost: 100 }
];

// --- Level Data ---
// Expanded with a few more levels for testing progression
const LEVELS = [
    // Level 1: Basics
    [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 1],
        [1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 4, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    // Level 2: Verticality
    [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 4, 0, 0, 0, 3, 1],
        [1, 1, 0, 0, 0, 1, 1],
        [1, 0, 0, 1, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 2, 2, 2, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
    ]
];

// --- Particle System ---

class Particle {
    constructor(x, y, color, speed) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const v = Math.random() * speed;
        this.vx = Math.cos(angle) * v;
        this.vy = Math.sin(angle) * v;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }

    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }
}

function createSparks(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, '#fff', 3)); // White sparks on hit
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 30; i++) {
        particles.push(new Particle(x, y, color, 8));
    }
}

// --- Classes ---

class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
    }

    update() {
        if (!stickman || stickman.dead) return;

        // Target is stickman's "Neck" (Point index 1)
        const target = stickman.points[1];

        const targetX = target.x - width / 2;
        const targetY = target.y - height / 2;

        // Smooth follow
        this.x += (targetX - this.x) * 0.1;
        this.y += (targetY - this.y) * 0.1;

        // Clamp
        if (levelManager) {
            this.x = Math.max(0, Math.min(this.x, levelManager.width - width));
            this.y = Math.max(0, Math.min(this.y, levelManager.height - height));
        }
    }

    apply() {
        ctx.translate(-this.x, -this.y);
    }
}

class LevelManager {
    constructor() {
        this.levelIndex = 0;
        this.tiles = [];
        this.rows = 0;
        this.cols = 0;
        this.tileSize = 60;
        this.width = 0;
        this.height = 0;
    }

    loadLevel(index) {
        // Ads check
        this.checkAdBreak(index);

        if (index >= LEVELS.length) {
            index = 0; // Loop game
            console.log("Game Completed! Looping.");
        }
        this.levelIndex = index;

        // Deep copy level so we can modify it (eat loot) without breaking resets
        this.tiles = LEVELS[index].map(row => [...row]);
        this.rows = this.tiles.length;
        this.cols = this.tiles[0].length;

        this.calculateDimensions();
        this.spawnPlayer();
        particles = [];
    }

    checkAdBreak(index) {
        // Pseudo-logic for CrazyGames Ad
        if (index > 0 && index % 3 === 0) {
            console.log("--- CRAZYGAMES MIDROLL AD PLACEHOLDER ---");
            // window.CrazyGames.SDK.requestAd('midgame'); // Example API
        }
    }

    calculateDimensions() {
        if (width > height) {
            // Desktop: fit height-wise mostly
            this.tileSize = Math.min(80, height / 10);
        } else {
            // Mobile: fit width-wise
            this.tileSize = width / 12;
        }

        this.width = this.cols * this.tileSize;
        this.height = this.rows * this.tileSize;
    }

    spawnPlayer() {
        // Find empty spot or use 2,2
        const spawnX = 2 * this.tileSize;
        const spawnY = 2 * this.tileSize;

        points.length = 0;
        sticks.length = 0;
        stickman = new Stickman(spawnX, spawnY);
    }

    getTileAt(x, y) {
        const col = Math.floor(x / this.tileSize);
        const row = Math.floor(y / this.tileSize);

        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return TILE_EMPTY;
        return this.tiles[row][col];
    }

    collectLoot(x, y) {
        const col = Math.floor(x / this.tileSize);
        const row = Math.floor(y / this.tileSize);
        if (this.tiles[row][col] === TILE_LOOT) {
            this.tiles[row][col] = TILE_EMPTY; // Remove loot
            gameState.loot++;
            updateUI();
            createSparks(x, y, 10); // Sparkle effect
        }
    }

    castRay(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        let dist = 0;
        while (dist < 1000) {
            const tile = this.getTileAt(x, y);
            if (tile === TILE_WALL) {
                return { x, y, hit: true };
            }
            if (Math.abs(x - x1) < 1 && Math.abs(y - y1) < 1) break;

            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
            dist++;
        }
        return { x: x1, y: y1, hit: false };
    }

    draw() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = this.tiles[r][c];
                if (tile === TILE_EMPTY) continue;

                const x = c * this.tileSize;
                const y = r * this.tileSize;

                if (tile === TILE_WALL) {
                    ctx.fillStyle = '#011';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = 'cyan';
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 1;
                    ctx.fillRect(x, y, this.tileSize, this.tileSize);
                    ctx.strokeRect(x, y, this.tileSize, this.tileSize);
                } else if (tile === TILE_LASER) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'red';
                    ctx.fillRect(x, y, this.tileSize, this.tileSize);
                    ctx.beginPath();
                    ctx.moveTo(x, y + this.tileSize / 2);
                    ctx.lineTo(x + this.tileSize, y + this.tileSize / 2);
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else if (tile === TILE_LOOT) {
                    ctx.fillStyle = 'gold';
                    ctx.shadowColor = 'yellow';
                    ctx.beginPath();
                    ctx.arc(x + this.tileSize / 2, y + this.tileSize / 2, this.tileSize / 4, 0, Math.PI * 2);
                    ctx.fill();
                } else if (tile === TILE_EXIT) {
                    ctx.fillStyle = '#0f0';
                    ctx.shadowColor = 'green';
                    ctx.fillRect(x + this.tileSize / 4, y, this.tileSize / 2, this.tileSize);
                }
            }
        }
    }
}


class Point {
    constructor(x, y, pinned = false) {
        this.x = x;
        this.y = y;
        this.oldx = x;
        this.oldy = y;
        this.pinned = pinned;
    }

    update() {
        if (this.pinned) return;

        const vx = (this.x - this.oldx) * FRICTION;
        const vy = (this.y - this.oldy) * FRICTION;

        this.oldx = this.x;
        this.oldy = this.y;

        // Apply Time Scale to velocity integration essentially
        // Actually, Verlet is time-step dependent. 
        // Simple way: scale forces, but for "Slow Mo" feeling, we just slow down the update loop frequency or step count?
        // Better: We scale the position update by timeScale^2? No, simplest is just update less distance.
        // Let's just Apply Gravity scaled

        this.x += vx; // We should probably scale this for true slowmo, but let's keep it simple
        this.y += vy;
        this.y += GRAVITY;
    }

    constrain() {
        if (this.pinned) return;

        const vx = (this.x - this.oldx) * FRICTION;
        const vy = (this.y - this.oldy) * FRICTION;

        // World Bounds
        if (this.x > levelManager.width) {
            this.x = levelManager.width;
            this.oldx = this.x + vx * BOUNCE;
            createSparks(this.x, this.y);
        } else if (this.x < 0) {
            this.x = 0;
            this.oldx = this.x + vx * BOUNCE;
            createSparks(this.x, this.y);
        }

        if (this.y > levelManager.height) {
            this.y = levelManager.height;
            this.oldy = this.y + vy * BOUNCE;
            createSparks(this.x, this.y);
        } else if (this.y < 0) {
            this.y = 0;
            this.oldy = this.y + vy * BOUNCE;
            createSparks(this.x, this.y);
        }

        // Interactions
        const tile = levelManager.getTileAt(this.x, this.y);
        if (tile === TILE_LASER && !stickman.dead) {
            stickman.die();
        } else if (tile === TILE_EXIT && !stickman.dead) {
            console.log("Win!");
            levelManager.loadLevel(levelManager.levelIndex + 1);
        } else if (tile === TILE_LOOT) {
            levelManager.collectLoot(this.x, this.y);
        }

        // Wall Collisions (Basic Box)
        // If inside a wall, push out? Complex for verlet points.
        // For now, rely on world bounds and hope player doesn't clip through walls too much.
        // Raycast prevents grappling THROUGH walls, so you just bang into them.
    }
}

class Stick {
    constructor(p0, p1, length = null, visible = true) {
        this.p0 = p0;
        this.p1 = p1;
        this.length = length === null ? this.getDistance(p0, p1) : length;
        this.visible = visible;
        this.color = gameState.currentColor;
    }

    getDistance(p0, p1) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    update() {
        const dx = this.p1.x - this.p0.x;
        const dy = this.p1.y - this.p0.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const difference = this.length - distance;
        const percent = difference / distance / 2;
        const offsetX = dx * percent;
        const offsetY = dy * percent;

        if (!this.p0.pinned) {
            this.p0.x -= offsetX;
            this.p0.y -= offsetY;
        }
        if (!this.p1.pinned) {
            this.p1.x += offsetX;
            this.p1.y += offsetY;
        }
    }

    draw() {
        if (!this.visible) return;
        ctx.beginPath();
        // Dynamic color for body parts
        if (this.color !== gameState.currentColor && this.color !== '#fff') {
            this.color = gameState.currentColor;
        }
        ctx.strokeStyle = this.color;

        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.moveTo(this.p0.x, this.p0.y);
        ctx.lineTo(this.p1.x, this.p1.y);
        ctx.stroke();
    }
}

class Stickman {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.createRagdoll();
        this.grapple = null;
        this.dead = false;
    }

    createRagdoll() {
        const h = 20;
        const head = new Point(this.x, this.y);
        const neck = new Point(this.x, this.y + h);
        const hips = new Point(this.x, this.y + 3 * h);
        const lElbow = new Point(this.x - h, this.y + 1.5 * h);
        const lHand = new Point(this.x - 2 * h, this.y + 2 * h);
        const rElbow = new Point(this.x + h, this.y + 1.5 * h);
        const rHand = new Point(this.x + 2 * h, this.y + 2 * h);
        const lKnee = new Point(this.x - 0.5 * h, this.y + 4 * h);
        const lFoot = new Point(this.x - 0.5 * h, this.y + 5.5 * h);
        const rKnee = new Point(this.x + 0.5 * h, this.y + 4 * h);
        const rFoot = new Point(this.x + 0.5 * h, this.y + 5.5 * h);

        this.points = [head, neck, hips, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot];
        points.push(...this.points);

        this.sticks = [
            new Stick(head, neck), new Stick(neck, hips),
            new Stick(neck, lElbow), new Stick(lElbow, lHand),
            new Stick(neck, rElbow), new Stick(rElbow, rHand),
            new Stick(hips, lKnee), new Stick(lKnee, lFoot),
            new Stick(hips, rKnee), new Stick(rKnee, rFoot),
            new Stick(head, hips, null, false),
            new Stick(lElbow, rElbow, null, false),
            new Stick(lKnee, rKnee, null, false),
        ];
        sticks.push(...this.sticks);
    }

    shootGrapple(screenX, screenY) {
        if (this.dead) return;
        const hand = this.points[6];
        const worldX = screenX + camera.x;
        const worldY = screenY + camera.y;

        const hitResult = levelManager.castRay(hand.x, hand.y, worldX, worldY);

        if (hitResult.hit) {
            const anchor = new Point(hitResult.x, hitResult.y, true);
            const rope = new Stick(hand, anchor);
            rope.color = '#fff';
            this.grapple = { anchor, rope };
            sticks.push(rope);

            // JUICE: Slow Motion on connect
            triggerSlowMotion();
        }
    }

    releaseGrapple() {
        if (this.grapple) {
            const index = sticks.indexOf(this.grapple.rope);
            if (index > -1) sticks.splice(index, 1);
            this.grapple = null;
        }
    }

    die() {
        this.dead = true;

        // Shatter effect
        // 1. Create particles at all point locations
        for (let p of this.points) {
            createExplosion(p.x, p.y, gameState.currentColor);
        }

        // 2. Remove stickman physics bodies
        points.length = 0;
        sticks.length = 0;
        this.grapple = null;

        // 3. Restart timer
        setTimeout(() => {
            levelManager.loadLevel(levelManager.levelIndex);
        }, 1000);
    }
}

// --- Logic ---

function triggerSlowMotion() {
    gameState.timeScale = 0.2;
    // Tween back to 1.0
    // Simple decay
    let interval = setInterval(() => {
        gameState.timeScale += 0.05;
        if (gameState.timeScale >= 1.0) {
            gameState.timeScale = 1.0;
            clearInterval(interval);
        }
    }, 50);
}

function init() {
    levelManager = new LevelManager();
    camera = new Camera();
    levelManager.loadLevel(0);
    renderShop();
    updateUI();
}

function updateUI() {
    lootDisplay.innerText = gameState.loot;
}

function update() {
    if (gameState.paused) return;

    // Time Scale Logic
    // We can simulate slow motion by skipping frames or reducing delta
    // Simple approach: probabilistic update
    if (Math.random() > gameState.timeScale) return;

    // 1. Update Physics
    for (let point of points) point.update();

    // 2. Solve Constraints
    for (let i = 0; i < STIFFNESS; i++) {
        for (let stick of sticks) stick.update();
        for (let point of points) point.constrain();
    }

    // 3. Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 4. Camera
    camera.update();
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    camera.apply();

    levelManager.draw();
    for (let stick of sticks) stick.draw();
    for (let p of particles) p.draw();

    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- Shop Logic ---
function renderShop() {
    shopItemsContainer.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item';

        const isUnlocked = gameState.unlockedColors.includes(item.color);
        const canBuy = gameState.loot >= item.cost;
        const isEquipped = gameState.currentColor === item.color;

        let btnText = isEquipped ? 'EQUIPPED' : (isUnlocked ? 'EQUIP' : `BUY (${item.cost})`);
        let btnDisabled = isEquipped || (!isUnlocked && !canBuy);

        div.innerHTML = `
            <div style="display:flex; align-items:center;">
                <div class="color-btn" style="background:${item.color}; margin-right:10px;"></div>
                <span>${item.name}</span>
            </div>
            <button class="buy-btn" onclick="handleShopAction('${item.color}')" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
        `;
        shopItemsContainer.appendChild(div);
    });
}

window.handleShopAction = (color) => {
    const item = SHOP_ITEMS.find(i => i.color === color);
    if (!item) return;

    if (gameState.unlockedColors.includes(color)) {
        // Equip
        gameState.currentColor = color;
    } else if (gameState.loot >= item.cost) {
        // Buy
        gameState.loot -= item.cost;
        gameState.unlockedColors.push(color);
        gameState.currentColor = color;
    }
    updateUI();
    renderShop();
};


// --- Inputs ---

function handleInput(x, y, isDown) {
    // If shop open, ignore
    if (gameState.paused) return;

    if (!stickman || stickman.dead) return;

    if (isDown) {
        if (stickman.grapple) stickman.releaseGrapple();
        stickman.shootGrapple(x, y);
    } else {
        stickman.releaseGrapple();
    }
}

canvas.addEventListener('mousedown', e => handleInput(e.clientX, e.clientY, true));
canvas.addEventListener('mouseup', e => handleInput(e.clientX, e.clientY, false));
canvas.addEventListener('touchstart', e => {
    // Don't prevent default on UI elements, but do on canvas
    if (e.target === canvas) {
        e.preventDefault();
        handleInput(e.touches[0].clientX, e.touches[0].clientY, true);
    }
}, { passive: false });
canvas.addEventListener('touchend', e => {
    if (e.target === canvas) {
        e.preventDefault();
        handleInput(0, 0, false);
    }
}, { passive: false });

window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (levelManager) levelManager.calculateDimensions();
});

// Shop Listeners
shopBtn.addEventListener('click', () => {
    gameState.paused = true;
    shopModal.style.display = 'block';
});
closeShopBtn.addEventListener('click', () => {
    gameState.paused = false;
    shopModal.style.display = 'none';
});


// Start
init();
loop();
