/**
 * Stickman Heist - Ragdoll & Grapple Logic
 * Verlet Integration Physics System
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

// Physics Constants
const GRAVITY = 0.5;
const FRICTION = 0.99;
const BOUNCE = 0.9;
const STIFFNESS = 5; // Iterations for constraint solving

// Game State
const points = [];
const sticks = [];
let stickman;

// --- Physics Classes ---

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

        this.x += vx;
        this.y += vy;
        this.y += GRAVITY;
    }

    constrain() {
        if (this.pinned) return;

        const vx = (this.x - this.oldx) * FRICTION;
        const vy = (this.y - this.oldy) * FRICTION;

        if (this.x > width) {
            this.x = width;
            this.oldx = this.x + vx * BOUNCE;
        } else if (this.x < 0) {
            this.x = 0;
            this.oldx = this.x + vx * BOUNCE;
        }

        if (this.y > height) {
            this.y = height;
            this.oldy = this.y + vy * BOUNCE;
        } else if (this.y < 0) {
            this.y = 0;
            this.oldy = this.y + vy * BOUNCE;
        }
    }
}

class Stick {
    constructor(p0, p1, length = null, visible = true) {
        this.p0 = p0;
        this.p1 = p1;
        this.length = length === null ? this.getDistance(p0, p1) : length;
        this.visible = visible;
        this.color = '#0ff'; // Cyan default
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
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.moveTo(this.p0.x, this.p0.y);
        ctx.lineTo(this.p1.x, this.p1.y);
        ctx.stroke();
    }
}

// --- Stickman Entity ---

class Stickman {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.createRagdoll();
        this.grapple = null;
        this.isGrappling = false;
    }

    createRagdoll() {
        // Create Points
        // 0: Head
        // 1: Neck/Shoulders
        // 2: Hips/Torso Bottom
        // 3: Left Elbow
        // 4: Left Hand
        // 5: Right Elbow
        // 6: Right Hand
        // 7: Left Knee
        // 8: Left Foot
        // 9: Right Knee
        // 10: Right Foot

        const head = new Point(this.x, this.y);
        const neck = new Point(this.x, this.y + 20);
        const hips = new Point(this.x, this.y + 60);

        const lElbow = new Point(this.x - 20, this.y + 30);
        const lHand = new Point(this.x - 40, this.y + 40);

        const rElbow = new Point(this.x + 20, this.y + 30);
        const rHand = new Point(this.x + 40, this.y + 40);

        const lKnee = new Point(this.x - 10, this.y + 85);
        const lFoot = new Point(this.x - 10, this.y + 110);

        const rKnee = new Point(this.x + 10, this.y + 85);
        const rFoot = new Point(this.x + 10, this.y + 110);

        this.points = [head, neck, hips, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot];

        // Add all to global points array
        points.push(...this.points);

        // Create Sticks (Body Structure)
        this.sticks = [
            // Head & Torso
            new Stick(head, neck),
            new Stick(neck, hips),

            // Arms
            new Stick(neck, lElbow),
            new Stick(lElbow, lHand),
            new Stick(neck, rElbow),
            new Stick(rElbow, rHand),

            // Legs
            new Stick(hips, lKnee),
            new Stick(lKnee, lFoot),
            new Stick(hips, rKnee),
            new Stick(rKnee, rFoot),

            // Structural constraints (invisible) to prevent unnatural folding
            new Stick(head, hips, null, false), // Keep head uprightish
            new Stick(lElbow, rElbow, null, false), // Shoulder width
            new Stick(lKnee, rKnee, null, false), // Hip width base
        ];

        // Add to global sticks
        sticks.push(...this.sticks);
    }

    shootGrapple(targetX, targetY) {
        // Determine which hand is closer or use the "main" hand (e.g., Right Hand - index 6)
        const hand = this.points[6]; // Right Hand

        // Raycasting logic can be added here if we have walls. 
        // For now, we grapple directly to the clicked point if it's "above" the stickman (simple logic).

        // Create a dynamic spring constraint
        // We use a "pinned" point for the anchor
        const anchor = new Point(targetX, targetY, true);

        // The grapple stick (rope)
        // Length can be the current distance (swing) or slightly shorter to pull up
        const rope = new Stick(hand, anchor);
        rope.color = '#fff'; // White rope
        // rope.length *= 0.8; // Pull slightly

        this.grapple = { anchor, rope };

        // Add rope to physics
        sticks.push(rope);
    }

    releaseGrapple() {
        if (this.grapple) {
            // Remove rope from physics sticks array
            const index = sticks.indexOf(this.grapple.rope);
            if (index > -1) {
                sticks.splice(index, 1);
            }
            this.grapple = null;
        }
    }

    update() {
        // Additional game logic for stickman (e.g. key inputs for muscle movement) can go here
    }
}

// --- Input Handling ---

function handleInput(x, y, isDown) {
    if (isDown) {
        if (stickman.grapple) {
            stickman.releaseGrapple();
        }
        stickman.shootGrapple(x, y);
    } else {
        stickman.releaseGrapple();
    }
}

canvas.addEventListener('mousedown', e => handleInput(e.clientX, e.clientY, true));
canvas.addEventListener('mouseup', e => handleInput(e.clientX, e.clientY, false));

canvas.addEventListener('touchstart', e => {
    e.preventDefault(); // Prevent scroll
    handleInput(e.touches[0].clientX, e.touches[0].clientY, true);
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    handleInput(0, 0, false); // Coordinates don't matter for release
}, { passive: false });


// --- Initialization ---

function init() {
    stickman = new Stickman(width / 2, 100);
}

window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

init();
loop();
