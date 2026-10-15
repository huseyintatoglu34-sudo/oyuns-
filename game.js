/**
 * PARKUR USTASI 2D - Pure Vanilla JavaScript Engine
 * Doğrudan derleme gerektirmeden tarayıcıda çalışan 2D Parkur Oyunu.
 */

// --- SABİTLER VE YAPILANDIRMA ---
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;
const GRAVITY = 0.58;
const MAX_FALL_SPEED = 14;
const MOVE_ACCEL = 0.85;
const MOVE_FRICTION = 0.82;
const MAX_RUN_SPEED = 6.2;
const MAX_SPRINT_SPEED = 7.8;
const JUMP_FORCE = -11.8;
const WALL_SLIDE_SPEED = 2.0;
const WALL_JUMP_FORCE_Y = -11.0;
const WALL_JUMP_FORCE_X = 7.5;
const DASH_SPEED = 14.5;
const DASH_DURATION = 14; // frames
const DASH_COOLDOWN = 65; // frames (~1.1s)
const COYOTE_TIME = 7;    // frames
const JUMP_BUFFER = 7;    // frames
const SLIDE_HEIGHT = 20;
const NORMAL_HEIGHT = 36;
const PLAYER_WIDTH = 24;

// --- SES MOTORU (Web Audio API - Bağımlılık Yok) ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.musicTimer = null;
    this.musicStep = 0;
    this.initContext();
  }

  initContext() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  ensureAudio() {
    if (!this.ctx) this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, duration, type = 'sine', gainVal = 0.15, freqEnd = null) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio context might be restricted
    }
  }

  playNoise(duration, gainVal = 0.1) {
    if (!this.enabled || !this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch (e) {}
  }

  jump() {
    this.playTone(220, 0.14, 'square', 0.12, 540);
  }

  wallJump() {
    this.playTone(320, 0.16, 'triangle', 0.18, 680);
    this.playTone(480, 0.18, 'sine', 0.12, 780);
  }

  dash() {
    this.playNoise(0.2, 0.18);
    this.playTone(600, 0.2, 'sawtooth', 0.1, 150);
  }

  slide() {
    this.playNoise(0.18, 0.08);
  }

  land() {
    this.playTone(130, 0.08, 'triangle', 0.1, 60);
  }

  spring() {
    this.playTone(280, 0.35, 'sine', 0.22, 920);
  }

  coin() {
    this.playTone(987, 0.09, 'sine', 0.14);
    setTimeout(() => this.playTone(1318, 0.15, 'sine', 0.16), 80);
  }

  star() {
    this.playTone(523, 0.12, 'triangle', 0.18);
    setTimeout(() => this.playTone(659, 0.14, 'triangle', 0.18), 90);
    setTimeout(() => this.playTone(784, 0.16, 'triangle', 0.18), 180);
    setTimeout(() => this.playTone(1046, 0.3, 'sine', 0.22), 270);
  }

  checkpoint() {
    this.playTone(440, 0.12, 'square', 0.12);
    setTimeout(() => this.playTone(554, 0.12, 'square', 0.12), 100);
    setTimeout(() => this.playTone(659, 0.25, 'square', 0.14), 200);
  }

  death() {
    this.playTone(300, 0.28, 'sawtooth', 0.25, 40);
    this.playNoise(0.28, 0.2);
  }

  victory() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    const delays = [0, 110, 220, 330, 480, 600, 750];
    notes.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 0.25, 'triangle', 0.22), delays[i]);
    });
  }

  startMusic() {
    if (this.musicTimer || !this.musicEnabled) return;
    const bpm = 124;
    const interval = (60 / bpm / 2) * 1000; // 16th notes
    const bassline = [110, 110, 0, 110, 130, 0, 146, 110, 98, 98, 0, 98, 123, 0, 130, 98];
    const melody = [440, 0, 523, 0, 659, 0, 587, 0, 440, 523, 0, 659, 784, 659, 587, 523];

    this.musicTimer = setInterval(() => {
      if (!this.musicEnabled || !this.enabled || !this.ctx) return;
      const bFreq = bassline[this.musicStep % bassline.length];
      const mFreq = melody[this.musicStep % melody.length];
      if (bFreq > 0) {
        this.playTone(bFreq, 0.12, 'sawtooth', 0.025, bFreq * 0.9);
      }
      if (this.musicStep % 2 === 0 && mFreq > 0) {
        this.playTone(mFreq, 0.14, 'triangle', 0.02);
      }
      if (this.musicStep % 4 === 2) {
        this.playNoise(0.04, 0.015); // Hi-hat / snare pulse
      }
      this.musicStep++;
    }, interval);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopMusic();
    } else if (this.musicEnabled) {
      this.startMusic();
    }
    return this.enabled;
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (this.enabled) {
      this.startMusic();
    }
    return this.musicEnabled;
  }
}

// --- PARÇACIK MOTORU (Visual Particles) ---
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  add(x, y, vx, vy, color, size, life, gravity = 0, shape = 'circle') {
    this.particles.push({
      x, y, vx, vy, color, size, maxLife: life, life, gravity, shape, alpha: 1
    });
  }

  burst(x, y, count, colors, speedMin = 1, speedMax = 5, life = 30) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const col = colors[Math.floor(Math.random() * colors.length)];
      this.add(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        col,
        2 + Math.random() * 4,
        life + Math.floor(Math.random() * 20),
        0.1
      );
    }
  }

  dust(x, y, dir = 1) {
    for (let i = 0; i < 4; i++) {
      this.add(
        x + (Math.random() * 12 - 6),
        y,
        -dir * (0.5 + Math.random() * 2),
        -(0.3 + Math.random() * 1.5),
        '#94a3b8',
        2 + Math.random() * 3,
        18,
        0.05
      );
    }
  }

  dashTrail(x, y, width, height, dir) {
    this.particles.push({
      x, y, vx: -dir * 0.5, vy: 0,
      color: '#06b6d4',
      size: width,
      height: height,
      maxLife: 15,
      life: 15,
      gravity: 0,
      shape: 'ghost',
      alpha: 0.6
    });
  }

  confetti(x, y) {
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    for (let i = 0; i < 45; i++) {
      const angle = -Math.PI / 2 + (Math.random() * 1.8 - 0.9);
      const spd = 3 + Math.random() * 7;
      this.add(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        colors[Math.floor(Math.random() * colors.length)],
        3 + Math.random() * 4,
        45 + Math.floor(Math.random() * 30),
        0.18,
        'rect'
      );
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx, camera) {
    for (const p of this.particles) {
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      if (sx < -50 || sx > VIEWPORT_WIDTH + 50 || sy < -50 || sy > VIEWPORT_HEIGHT + 50) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.shape === 'ghost') {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.fillRect(sx, sy, p.size, p.height);
      } else if (p.shape === 'rect') {
        ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size * 1.4);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

// --- BÖLÜM TASARIMLARI (6 Handcrafted Challenging Parkour Stages) ---
const LEVELS = [
  {
    id: 1,
    name: "Temel Eğitim",
    subtitle: "Koşma, zıplama ve duvar tırmanışını öğren",
    timeTarget: 18.0,
    width: 2200,
    height: 600,
    playerStart: { x: 80, y: 440 },
    platforms: [
      { x: 0, y: 500, w: 550, h: 100, type: 'solid' },
      { x: 620, y: 460, w: 180, h: 140, type: 'solid' },
      { x: 860, y: 410, w: 160, h: 190, type: 'solid' },
      { x: 1080, y: 350, w: 120, h: 250, type: 'solid' },
      // Duvar tırmanışı şaftı
      { x: 1280, y: 180, w: 40, h: 420, type: 'solid' },
      { x: 1400, y: 180, w: 40, h: 420, type: 'solid' },
      // Üst çıkış
      { x: 1440, y: 260, w: 220, h: 340, type: 'solid' },
      { x: 1720, y: 340, w: 160, h: 260, type: 'solid' },
      { x: 1920, y: 400, w: 280, h: 200, type: 'solid' }
    ],
    checkpoints: [
      { x: 920, y: 410, reached: false },
      { x: 1470, y: 260, reached: false }
    ],
    springs: [
      { x: 740, y: 460, force: -15.5 }
    ],
    hazards: [
      { x: 550, y: 540, w: 70, h: 60, type: 'spikes' },
      { x: 800, y: 540, w: 60, h: 60, type: 'spikes' }
    ],
    crumbling: [],
    moving: [],
    lasers: [],
    stars: [
      { x: 700, y: 360, collected: false },
      { x: 1340, y: 220, collected: false },
      { x: 1800, y: 270, collected: false }
    ],
    coins: [
      { x: 260, y: 450 }, { x: 340, y: 450 }, { x: 420, y: 450 },
      { x: 910, y: 360 }, { x: 970, y: 360 },
      { x: 1540, y: 220 }, { x: 1600, y: 220 }
    ],
    portal: { x: 2080, y: 400 }
  },
  {
    id: 2,
    name: "Şehir Çatıları",
    subtitle: "Hızlı kayma, hava atılımı ve yüksek zıplamalar",
    timeTarget: 22.0,
    width: 2800,
    height: 700,
    playerStart: { x: 80, y: 500 },
    platforms: [
      { x: 0, y: 560, w: 420, h: 140, type: 'solid' },
      // Düşük engel (kayarak geç)
      { x: 240, y: 500, w: 80, h: 28, type: 'solid' }, // Havada engel, altından kay!
      { x: 490, y: 520, w: 220, h: 180, type: 'solid' },
      { x: 780, y: 440, w: 240, h: 260, type: 'solid' },
      // Duvar atlama kulesi
      { x: 1100, y: 260, w: 30, h: 440, type: 'solid' },
      { x: 1220, y: 200, w: 30, h: 500, type: 'solid' },
      // Yüksek çatı
      { x: 1250, y: 260, w: 260, h: 440, type: 'solid' },
      // Geniş çatı boşluğu (Dash ile geç)
      { x: 1650, y: 300, w: 220, h: 400, type: 'solid' },
      { x: 1940, y: 380, w: 220, h: 320, type: 'solid' },
      // İkinci kayma engeli
      { x: 2020, y: 324, w: 60, h: 28, type: 'solid' },
      { x: 2240, y: 460, w: 200, h: 240, type: 'solid' },
      { x: 2520, y: 420, w: 280, h: 280, type: 'solid' }
    ],
    checkpoints: [
      { x: 880, y: 440, reached: false },
      { x: 1720, y: 300, reached: false }
    ],
    springs: [
      { x: 650, y: 520, force: -16.0 },
      { x: 2120, y: 380, force: -16.5 }
    ],
    hazards: [
      { x: 420, y: 640, w: 70, h: 60, type: 'spikes' },
      { x: 710, y: 640, w: 70, h: 60, type: 'spikes' },
      { x: 1510, y: 640, w: 140, h: 60, type: 'spikes' }
    ],
    crumbling: [
      { x: 1530, y: 340, w: 80, h: 24, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 340 }
    ],
    moving: [],
    lasers: [],
    stars: [
      { x: 280, y: 535, collected: false }, // Kayarak alınan yıldız
      { x: 1160, y: 150, collected: false }, // Kule tepesi
      { x: 2420, y: 350, collected: false }
    ],
    coins: [
      { x: 550, y: 470 }, { x: 600, y: 470 },
      { x: 1300, y: 210 }, { x: 1360, y: 210 }, { x: 1420, y: 210 },
      { x: 1780, y: 250 }, { x: 1840, y: 250 }
    ],
    portal: { x: 2680, y: 420 }
  },
  {
    id: 3,
    name: "Siber Fabrika",
    subtitle: "Hareketli platformlar ve zaman ayarlı lazerler",
    timeTarget: 26.0,
    width: 3200,
    height: 700,
    playerStart: { x: 80, y: 480 },
    platforms: [
      { x: 0, y: 540, w: 380, h: 160, type: 'solid' },
      { x: 720, y: 500, w: 160, h: 200, type: 'solid' },
      { x: 1220, y: 440, w: 180, h: 260, type: 'solid' },
      { x: 1760, y: 360, w: 220, h: 340, type: 'solid' },
      { x: 2280, y: 300, w: 200, h: 400, type: 'solid' },
      { x: 2820, y: 420, w: 380, h: 280, type: 'solid' }
    ],
    checkpoints: [
      { x: 780, y: 500, reached: false },
      { x: 1820, y: 360, reached: false }
    ],
    springs: [
      { x: 1320, y: 440, force: -17.0 }
    ],
    hazards: [
      { x: 380, y: 650, w: 2440, h: 50, type: 'acid' } // Dev asit havuzu!
    ],
    crumbling: [
      { x: 920, y: 480, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 480 },
      { x: 1040, y: 460, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 460 },
      { x: 2020, y: 340, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 340 },
      { x: 2140, y: 320, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 320 }
    ],
    moving: [
      { x: 420, y: 520, w: 110, h: 22, vx: 2.2, minX: 400, maxX: 670, vy: 0, minY: 520, maxY: 520 },
      { x: 1440, y: 380, w: 100, h: 22, vx: 0, minX: 1440, maxX: 1440, vy: 2.0, minY: 220, maxY: 420 },
      { x: 2520, y: 320, w: 110, h: 22, vx: 2.6, minX: 2500, maxX: 2770, vy: 0, minY: 320, maxY: 320 }
    ],
    lasers: [
      { x: 800, y: 360, w: 8, h: 140, cycle: 180, offset: 0, activeTime: 90, vertical: true },
      { x: 1860, y: 220, w: 8, h: 140, cycle: 160, offset: 60, activeTime: 80, vertical: true },
      { x: 2340, y: 160, w: 8, h: 140, cycle: 150, offset: 20, activeTime: 75, vertical: true }
    ],
    stars: [
      { x: 530, y: 430, collected: false },
      { x: 1490, y: 170, collected: false },
      { x: 2630, y: 240, collected: false }
    ],
    coins: [
      { x: 220, y: 490 }, { x: 280, y: 490 },
      { x: 960, y: 430 }, { x: 1080, y: 410 },
      { x: 2060, y: 290 }, { x: 2180, y: 270 }
    ],
    portal: { x: 3040, y: 420 }
  },
  {
    id: 4,
    name: "Yer Altı Tünelleri",
    subtitle: "Dikey duvar şaftları ve dar koridorlar",
    timeTarget: 30.0,
    width: 3000,
    height: 850,
    playerStart: { x: 80, y: 680 },
    platforms: [
      { x: 0, y: 740, w: 420, h: 110, type: 'solid' },
      // Dikey tırmanış bacası 1
      { x: 440, y: 360, w: 40, h: 480, type: 'solid' },
      { x: 570, y: 300, w: 40, h: 540, type: 'solid' },
      // Üst koridor
      { x: 610, y: 360, w: 380, h: 40, type: 'solid' },
      { x: 610, y: 260, w: 380, h: 30, type: 'solid' }, // Düşük tavan! Kaymak gerek
      // Tünel devamı
      { x: 1050, y: 420, w: 180, h: 430, type: 'solid' },
      // Dikenli iniş ve çıkış
      { x: 1350, y: 480, w: 160, h: 370, type: 'solid' },
      // Dikey baca 2
      { x: 1650, y: 180, w: 40, h: 670, type: 'solid' },
      { x: 1780, y: 180, w: 40, h: 670, type: 'solid' },
      { x: 1820, y: 240, w: 320, h: 610, type: 'solid' },
      // Çıkış bölgesi
      { x: 2260, y: 340, w: 240, h: 510, type: 'solid' },
      { x: 2620, y: 420, w: 380, h: 430, type: 'solid' }
    ],
    checkpoints: [
      { x: 1120, y: 420, reached: false },
      { x: 1940, y: 240, reached: false }
    ],
    springs: [
      { x: 1430, y: 480, force: -18.0 }
    ],
    hazards: [
      { x: 420, y: 810, w: 1230, h: 40, type: 'spikes' },
      { x: 1230, y: 810, w: 120, h: 40, type: 'spikes' },
      { x: 2140, y: 810, w: 120, h: 40, type: 'spikes' },
      { x: 2500, y: 810, w: 120, h: 40, type: 'spikes' }
    ],
    crumbling: [
      { x: 1240, y: 460, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 460 },
      { x: 2150, y: 280, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 280 }
    ],
    moving: [
      { x: 2520, y: 380, w: 80, h: 22, vx: 0, minX: 2520, maxX: 2520, vy: 2.2, minY: 280, maxY: 480 }
    ],
    lasers: [
      { x: 750, y: 290, w: 8, h: 70, cycle: 140, offset: 0, activeTime: 70, vertical: true },
      { x: 1715, y: 380, w: 60, h: 8, cycle: 160, offset: 40, activeTime: 80, vertical: false }
    ],
    stars: [
      { x: 505, y: 250, collected: false }, // Baca 1 zirvesi
      { x: 800, y: 330, collected: false }, // Dar tünel
      { x: 1715, y: 130, collected: false } // Baca 2 zirvesi
    ],
    coins: [
      { x: 200, y: 690 }, { x: 270, y: 690 },
      { x: 1100, y: 370 }, { x: 1160, y: 370 },
      { x: 2320, y: 290 }, { x: 2380, y: 290 }
    ],
    portal: { x: 2860, y: 420 }
  },
  {
    id: 5,
    name: "Neon Kanyonu",
    subtitle: "Yüksek hız, çift yönlü lazerler ve hassas zıplamalar",
    timeTarget: 32.0,
    width: 3600,
    height: 750,
    playerStart: { x: 80, y: 560 },
    platforms: [
      { x: 0, y: 620, w: 360, h: 130, type: 'solid' },
      { x: 440, y: 560, w: 120, h: 190, type: 'solid' },
      { x: 680, y: 480, w: 140, h: 270, type: 'solid' },
      { x: 940, y: 400, w: 180, h: 350, type: 'solid' },
      // Kanyon arası sütunlar
      { x: 1300, y: 460, w: 80, h: 290, type: 'solid' },
      { x: 1540, y: 380, w: 80, h: 370, type: 'solid' },
      { x: 1780, y: 300, w: 160, h: 450, type: 'solid' },
      // Duvar atlama koridoru
      { x: 2100, y: 200, w: 40, h: 550, type: 'solid' },
      { x: 2240, y: 200, w: 40, h: 550, type: 'solid' },
      { x: 2280, y: 280, w: 260, h: 470, type: 'solid' },
      // Son etap
      { x: 2760, y: 360, w: 200, h: 390, type: 'solid' },
      { x: 3200, y: 440, w: 400, h: 310, type: 'solid' }
    ],
    checkpoints: [
      { x: 1000, y: 400, reached: false },
      { x: 1850, y: 300, reached: false },
      { x: 2400, y: 280, reached: false }
    ],
    springs: [
      { x: 500, y: 560, force: -16.8 },
      { x: 1340, y: 460, force: -17.2 }
    ],
    hazards: [
      { x: 360, y: 700, w: 2840, h: 50, type: 'acid' }
    ],
    crumbling: [
      { x: 1160, y: 420, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 420 },
      { x: 1420, y: 390, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 390 },
      { x: 1660, y: 340, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 340 },
      { x: 2580, y: 320, w: 80, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 320 },
      { x: 2670, y: 340, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 340 }
    ],
    moving: [
      { x: 2980, y: 400, w: 120, h: 22, vx: 3.2, minX: 2970, maxX: 3180, vy: 0, minY: 400, maxY: 400 }
    ],
    lasers: [
      { x: 1040, y: 260, w: 8, h: 140, cycle: 140, offset: 0, activeTime: 70, vertical: true },
      { x: 1860, y: 160, w: 8, h: 140, cycle: 150, offset: 60, activeTime: 75, vertical: true },
      { x: 2170, y: 360, w: 70, h: 8, cycle: 130, offset: 20, activeTime: 65, vertical: false }
    ],
    stars: [
      { x: 740, y: 420, collected: false },
      { x: 2170, y: 150, collected: false },
      { x: 3040, y: 330, collected: false }
    ],
    coins: [
      { x: 200, y: 570 }, { x: 260, y: 570 },
      { x: 800, y: 430 }, { x: 860, y: 430 },
      { x: 2340, y: 230 }, { x: 2420, y: 230 },
      { x: 2820, y: 310 }, { x: 2880, y: 310 }
    ],
    portal: { x: 3440, y: 440 }
  },
  {
    id: 6,
    name: "Usta Sınavı",
    subtitle: "Tüm parkur reflekslerinin sınandığı nihai bölüm",
    timeTarget: 38.0,
    width: 4000,
    height: 900,
    playerStart: { x: 80, y: 700 },
    platforms: [
      { x: 0, y: 760, w: 340, h: 140, type: 'solid' },
      { x: 480, y: 680, w: 100, h: 220, type: 'solid' },
      { x: 740, y: 580, w: 80, h: 320, type: 'solid' },
      // Duvar labirenti 1
      { x: 960, y: 380, w: 40, h: 520, type: 'solid' },
      { x: 1090, y: 320, w: 40, h: 580, type: 'solid' },
      { x: 1130, y: 380, w: 220, h: 520, type: 'solid' },
      // Düşük engel
      { x: 1200, y: 320, w: 80, h: 30, type: 'solid' },
      // Havada izole ada
      { x: 1520, y: 460, w: 100, h: 440, type: 'solid' },
      { x: 1820, y: 400, w: 100, h: 500, type: 'solid' },
      // İkinci şaft
      { x: 2120, y: 220, w: 40, h: 680, type: 'solid' },
      { x: 2260, y: 220, w: 40, h: 680, type: 'solid' },
      { x: 2300, y: 300, w: 260, h: 600, type: 'solid' },
      // Son etap hareketli ve yıkılan kısımlar
      { x: 2780, y: 380, w: 120, h: 520, type: 'solid' },
      { x: 3180, y: 440, w: 120, h: 460, type: 'solid' },
      { x: 3560, y: 500, w: 440, h: 400, type: 'solid' }
    ],
    checkpoints: [
      { x: 1240, y: 380, reached: false },
      { x: 2360, y: 300, reached: false },
      { x: 3240, y: 440, reached: false }
    ],
    springs: [
      { x: 530, y: 680, force: -17.5 },
      { x: 1570, y: 460, force: -18.0 }
    ],
    hazards: [
      { x: 340, y: 860, w: 3220, h: 40, type: 'spikes' }
    ],
    crumbling: [
      { x: 360, y: 720, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 720 },
      { x: 620, y: 620, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 620 },
      { x: 1390, y: 420, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 420 },
      { x: 1680, y: 430, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 430 },
      { x: 1980, y: 360, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 360 },
      { x: 2600, y: 340, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 340 },
      { x: 2690, y: 360, w: 70, h: 22, respawnTimer: 0, falling: false, fallSpeed: 0, oy: 360 }
    ],
    moving: [
      { x: 2940, y: 420, w: 110, h: 22, vx: 3.5, minX: 2920, maxX: 3150, vy: 0, minY: 420, maxY: 420 },
      { x: 3340, y: 480, w: 110, h: 22, vx: 0, minX: 3340, maxX: 3340, vy: 2.5, minY: 320, maxY: 520 }
    ],
    lasers: [
      { x: 1025, y: 480, w: 65, h: 8, cycle: 130, offset: 10, activeTime: 65, vertical: false },
      { x: 1250, y: 240, w: 8, h: 80, cycle: 140, offset: 30, activeTime: 70, vertical: true },
      { x: 2190, y: 340, w: 70, h: 8, cycle: 120, offset: 0, activeTime: 60, vertical: false },
      { x: 2840, y: 240, w: 8, h: 140, cycle: 140, offset: 40, activeTime: 70, vertical: true }
    ],
    stars: [
      { x: 1025, y: 260, collected: false },
      { x: 2190, y: 170, collected: false },
      { x: 3400, y: 270, collected: false }
    ],
    coins: [
      { x: 220, y: 710 }, { x: 280, y: 710 },
      { x: 1150, y: 340 }, { x: 1430, y: 370 },
      { x: 2400, y: 250 }, { x: 2470, y: 250 },
      { x: 3220, y: 390 }, { x: 3700, y: 450 }
    ],
    portal: { x: 3820, y: 500 }
  }
];

// --- OYUNCU SINIFI (Fluid Parkour Physics) ---
class Player {
  constructor(x, y) {
    this.startX = x;
    this.startY = y;
    this.respawnX = x;
    this.respawnY = y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.width = PLAYER_WIDTH;
    this.height = NORMAL_HEIGHT;
    this.facing = 1; // 1: right, -1: left

    // Durumlar
    this.isGrounded = false;
    this.isOnWall = false;
    this.wallDir = 0; // -1: left wall, 1: right wall
    this.isCrouching = false;
    this.isDashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.coyoteCounter = 0;
    this.jumpBufferCounter = 0;

    // Animasyon & Efekt
    this.animFrame = 0;
    this.animTimer = 0;
    this.state = 'idle'; // idle, run, jump, fall, wallslide, dash, slide
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = false;
    this.isOnWall = false;
    this.isCrouching = false;
    this.isDashing = false;
    this.dashTimer = 0;
    this.height = NORMAL_HEIGHT;
  }
}

// --- ANA OYUN YÖNETİCİSİ (Game Controller) ---
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundEngine();
    this.particles = new ParticleSystem();

    // Canvas ölçekleme
    this.canvas.width = VIEWPORT_WIDTH;
    this.canvas.height = VIEWPORT_HEIGHT;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Seviye ve Oyun Durumu
    this.currentLevelIndex = 0;
    this.currentLevel = null;
    this.player = null;
    this.camera = { x: 0, y: 0, lookAhead: 0 };
    this.screenShake = 0;

    this.gameState = 'menu'; // 'menu', 'playing', 'paused', 'victory', 'gameover'
    this.levelTime = 0;
    this.levelCoins = 0;
    this.levelStars = 0;
    this.levelDeaths = 0;
    this.lastFrameTime = performance.now();

    // Tuş Girdileri
    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
      dash: false,
      sprint: false
    };
    this.prevJumpKey = false;
    this.prevDashKey = false;

    // Kayıtlı İlerleme (localStorage)
    this.saveData = this.loadSaveData();

    this.initInputs();
    this.initUI();
    this.loadLevel(0);

    // İlk animasyon döngüsü
    requestAnimationFrame((t) => this.loop(t));
  }

  loadSaveData() {
    try {
      const data = localStorage.getItem('parkur_ustasi_data');
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      unlockedLevels: [1],
      levelBestTimes: {},
      levelStars: {}
    };
  }

  saveGameProgress(levelId, time, stars) {
    if (!this.saveData.unlockedLevels.includes(levelId + 1) && levelId < LEVELS.length) {
      this.saveData.unlockedLevels.push(levelId + 1);
    }
    const currentBest = this.saveData.levelBestTimes[levelId];
    if (!currentBest || time < currentBest) {
      this.saveData.levelBestTimes[levelId] = time;
    }
    const currentStars = this.saveData.levelStars[levelId] || 0;
    if (stars > currentStars) {
      this.saveData.levelStars[levelId] = stars;
    }
    try {
      localStorage.setItem('parkur_ustasi_data', JSON.stringify(this.saveData));
    } catch (e) {}
  }

  resizeCanvas() {
    const container = document.getElementById('canvas-wrapper');
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    const targetRatio = VIEWPORT_WIDTH / VIEWPORT_HEIGHT;
    let w = windowW;
    let h = windowW / targetRatio;

    if (h > windowH) {
      h = windowH;
      w = windowH * targetRatio;
    }

    container.style.width = `${Math.floor(w)}px`;
    container.style.height = `${Math.floor(h)}px`;
  }

  loadLevel(index) {
    if (index < 0 || index >= LEVELS.length) index = 0;
    this.currentLevelIndex = index;
    // Derin kopya ile seviyeyi sıfırla
    const rawLevel = LEVELS[index];
    this.currentLevel = JSON.parse(JSON.stringify(rawLevel));

    // Crumbling platformları hazırla
    if (this.currentLevel.crumbling) {
      this.currentLevel.crumbling.forEach(p => {
        p.oy = p.y;
        p.falling = false;
        p.respawnTimer = 0;
        p.fallSpeed = 0;
      });
    }

    this.player = new Player(this.currentLevel.playerStart.x, this.currentLevel.playerStart.y);
    this.camera.x = Math.max(0, this.player.x - VIEWPORT_WIDTH / 3);
    this.camera.y = Math.max(0, this.player.y - VIEWPORT_HEIGHT / 2);

    this.levelTime = 0;
    this.levelCoins = 0;
    this.levelStars = 0;
    this.levelDeaths = 0;

    this.updateHUD();
    this.showToast(`Bölüm ${this.currentLevel.id}: ${this.currentLevel.name}`);
  }

  // --- GİRDİ YÖNETİMİ ---
  initInputs() {
    window.addEventListener('keydown', (e) => {
      this.sound.ensureAudio();

      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
        this.keys.jump = true;
        this.keys.up = true;
      }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') this.keys.dash = true;

      // Hızlı Tuşlar
      if (e.code === 'KeyR' && this.gameState === 'playing') {
        this.restartLevel();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.gameState === 'playing') this.pauseGame();
        else if (this.gameState === 'paused') this.resumeGame();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
        this.keys.jump = false;
        this.keys.up = false;
        // Zıplamayı erken kesme (Variable jump height)
        if (this.player && this.player.vy < -4) {
          this.player.vy *= 0.55;
        }
      }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') this.keys.dash = false;
    });

    // Mobil / Dokunmatik Kontroller
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const touchPanel = document.getElementById('touch-controls');
    if (isTouch && touchPanel) {
      touchPanel.style.display = 'flex';
    }

    const bindTouch = (id, onDown, onUp) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        this.sound.ensureAudio();
        onDown();
      };
      const end = (e) => {
        e.preventDefault();
        onUp();
      };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
    };

    bindTouch('btn-left', () => this.keys.left = true, () => this.keys.left = false);
    bindTouch('btn-right', () => this.keys.right = true, () => this.keys.right = false);
    bindTouch('btn-jump', () => {
      this.keys.jump = true;
    }, () => {
      this.keys.jump = false;
      if (this.player && this.player.vy < -4) this.player.vy *= 0.55;
    });
    bindTouch('btn-dash', () => this.keys.dash = true, () => this.keys.dash = false);
    bindTouch('btn-slide', () => this.keys.down = true, () => this.keys.down = false);
  }

  // --- KULLANICI ARAYÜZÜ (UI) ---
  initUI() {
    // Üst HUD butonları
    const btnPause = document.getElementById('hud-pause-btn');
    if (btnPause) btnPause.onclick = () => this.pauseGame();

    const btnAudio = document.getElementById('hud-sound-btn');
    if (btnAudio) {
      btnAudio.onclick = () => {
        const active = this.sound.toggleSound();
        btnAudio.textContent = active ? '🔊 Ses' : '🔇 Sessiz';
      };
    }

    const btnMusic = document.getElementById('hud-music-btn');
    if (btnMusic) {
      btnMusic.onclick = () => {
        const active = this.sound.toggleMusic();
        btnMusic.textContent = active ? '🎵 Müzik' : '🎵 Müzik (Kapalı)';
      };
    }

    // Menü Butonları
    document.getElementById('btn-start-game').onclick = () => {
      this.sound.ensureAudio();
      this.hideModal('modal-menu');
      this.gameState = 'playing';
      this.sound.startMusic();
    };

    document.getElementById('btn-open-levels').onclick = () => this.openLevelSelect();
    document.getElementById('btn-open-controls').onclick = () => this.openControls();

    // Pause Modalı
    document.getElementById('btn-resume').onclick = () => this.resumeGame();
    document.getElementById('btn-restart').onclick = () => {
      this.hideModal('modal-pause');
      this.restartLevel();
      this.gameState = 'playing';
    };
    document.getElementById('btn-pause-levels').onclick = () => {
      this.hideModal('modal-pause');
      this.openLevelSelect();
    };

    // Zafer Modalı
    document.getElementById('btn-next-level').onclick = () => {
      this.hideModal('modal-victory');
      if (this.currentLevelIndex < LEVELS.length - 1) {
        this.loadLevel(this.currentLevelIndex + 1);
        this.gameState = 'playing';
      } else {
        this.openGameClearModal();
      }
    };
    document.getElementById('btn-retry-level').onclick = () => {
      this.hideModal('modal-victory');
      this.restartLevel();
      this.gameState = 'playing';
    };
    document.getElementById('btn-victory-levels').onclick = () => {
      this.hideModal('modal-victory');
      this.openLevelSelect();
    };

    // Kontroller Kapat
    document.getElementById('btn-close-controls').onclick = () => {
      this.hideModal('modal-controls');
      if (this.gameState === 'menu') {
        this.showModal('modal-menu');
      }
    };

    // Bölüm Seçim Kapat
    document.getElementById('btn-close-levels').onclick = () => {
      this.hideModal('modal-levels');
      if (this.gameState === 'menu') {
        this.showModal('modal-menu');
      }
    };

    // Oyun Bitirme Ekranı
    const btnClearMenu = document.getElementById('btn-clear-menu');
    if (btnClearMenu) {
      btnClearMenu.onclick = () => {
        this.hideModal('modal-gameclear');
        this.showModal('modal-menu');
        this.gameState = 'menu';
      };
    }
  }

  showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  pauseGame() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    this.showModal('modal-pause');
  }

  resumeGame() {
    if (this.gameState !== 'paused') return;
    this.hideModal('modal-pause');
    this.gameState = 'playing';
    this.lastFrameTime = performance.now();
  }

  openControls() {
    this.hideModal('modal-menu');
    this.showModal('modal-controls');
  }

  openLevelSelect() {
    this.renderLevelGrid();
    this.showModal('modal-levels');
  }

  renderLevelGrid() {
    const grid = document.getElementById('level-grid');
    if (!grid) return;
    grid.innerHTML = '';

    LEVELS.forEach((lvl, idx) => {
      const isUnlocked = this.saveData.unlockedLevels.includes(lvl.id);
      const stars = this.saveData.levelStars[lvl.id] || 0;
      const best = this.saveData.levelBestTimes[lvl.id];

      const card = document.createElement('div');
      card.className = `level-card ${isUnlocked ? 'unlocked' : 'locked'}`;

      let starHtml = '';
      for (let s = 1; s <= 3; s++) {
        starHtml += s <= stars ? '★' : '☆';
      }

      card.innerHTML = `
        <div class="level-num">${isUnlocked ? lvl.id : '🔒'}</div>
        <div class="level-name">${lvl.name}</div>
        <div class="level-stars">${starHtml}</div>
        <div class="level-best">${best ? best.toFixed(2) + 's' : '--'}</div>
      `;

      if (isUnlocked) {
        card.onclick = () => {
          this.sound.ensureAudio();
          this.sound.startMusic();
          this.hideModal('modal-levels');
          this.hideModal('modal-menu');
          this.loadLevel(idx);
          this.gameState = 'playing';
        };
      }
      grid.appendChild(card);
    });
  }

  showToast(msg) {
    const toast = document.getElementById('banner-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  updateHUD() {
    const lvlText = document.getElementById('hud-level-text');
    if (lvlText) lvlText.textContent = `Bölüm ${this.currentLevel.id}: ${this.currentLevel.name}`;

    const timeText = document.getElementById('hud-timer-text');
    if (timeText) timeText.textContent = this.levelTime.toFixed(2) + 's';

    const starsText = document.getElementById('hud-stars-text');
    if (starsText) starsText.textContent = `⭐ ${this.levelStars}/3`;

    const coinsText = document.getElementById('hud-coins-text');
    if (coinsText) coinsText.textContent = `🪙 ${this.levelCoins}`;

    const deathsText = document.getElementById('hud-deaths-text');
    if (deathsText) deathsText.textContent = `💀 ${this.levelDeaths}`;

    const dashFill = document.getElementById('hud-dash-fill');
    if (dashFill && this.player) {
      const pct = Math.min(100, Math.max(0, 100 - (this.player.dashCooldown / DASH_COOLDOWN) * 100));
      dashFill.style.width = `${pct}%`;
      dashFill.style.background = pct >= 100 ? 'linear-gradient(90deg, #06b6d4, #10b981)' : '#64748b';
    }
  }

  restartLevel() {
    this.sound.death();
    this.particles.burst(this.player.x, this.player.y, 20, ['#06b6d4', '#f43f5e', '#ffffff'], 2, 6);
    this.player.reset(this.player.respawnX, this.player.respawnY);
    this.levelDeaths++;
    this.updateHUD();
  }

  triggerVictory() {
    this.gameState = 'victory';
    this.sound.victory();
    this.particles.confetti(this.player.x, this.player.y);

    // Yıldız Hesaplama (En az 1, toplanan yıldızlara göre + süre bonusu)
    let starsEarned = Math.max(1, this.levelStars);
    if (this.levelTime <= this.currentLevel.timeTarget && starsEarned < 3) {
      starsEarned = Math.min(3, starsEarned + 1);
    }

    this.saveGameProgress(this.currentLevel.id, this.levelTime, starsEarned);

    const titleEl = document.getElementById('victory-title');
    if (titleEl) titleEl.textContent = `Bölüm ${this.currentLevel.id} Tamamlandı!`;

    const starsContainer = document.getElementById('victory-stars-box');
    if (starsContainer) {
      starsContainer.innerHTML = '';
      for (let i = 1; i <= 3; i++) {
        const span = document.createElement('span');
        span.textContent = '★';
        span.className = i <= starsEarned ? 'star-active' : '';
        span.style.animationDelay = `${i * 0.15}s`;
        starsContainer.appendChild(span);
      }
    }

    const timeStat = document.getElementById('stat-time');
    if (timeStat) timeStat.textContent = this.levelTime.toFixed(2) + 's';

    const targetStat = document.getElementById('stat-target');
    if (targetStat) targetStat.textContent = this.currentLevel.timeTarget.toFixed(1) + 's';

    const deathsStat = document.getElementById('stat-deaths');
    if (deathsStat) deathsStat.textContent = this.levelDeaths;

    const coinsStat = document.getElementById('stat-coins');
    if (coinsStat) coinsStat.textContent = this.levelCoins;

    this.showModal('modal-victory');
  }

  openGameClearModal() {
    this.gameState = 'victory';
    this.showModal('modal-gameclear');
  }

  // --- FİZİK VE GÜNCELLEME (Physics Loop) ---
  updatePhysics() {
    const p = this.player;
    if (!p) return;

    // Zamanlayıcı
    this.levelTime += 1 / 60;

    // Dash Soğuma
    if (p.dashCooldown > 0) p.dashCooldown--;

    // Jump Buffering
    if (this.keys.jump && !this.prevJumpKey) {
      p.jumpBufferCounter = JUMP_BUFFER;
    } else if (p.jumpBufferCounter > 0) {
      p.jumpBufferCounter--;
    }

    // --- DASH MEKANİĞİ ---
    if (this.keys.dash && !this.prevDashKey && p.dashCooldown <= 0 && !p.isDashing) {
      p.isDashing = true;
      p.dashTimer = DASH_DURATION;
      p.dashCooldown = DASH_COOLDOWN;
      p.vy = 0;
      p.vx = p.facing * DASH_SPEED;
      this.sound.dash();
      this.screenShake = 4;
      this.particles.burst(p.x, p.y + p.height / 2, 10, ['#06b6d4', '#e0f2fe'], 2, 5);
    }
    this.prevDashKey = this.keys.dash;

    if (p.isDashing) {
      p.dashTimer--;
      p.vy = 0;
      this.particles.dashTrail(p.x, p.y, p.width, p.height, p.facing);
      if (p.dashTimer <= 0) {
        p.isDashing = false;
        p.vx *= 0.6;
      }
    } else {
      // --- KAYMA / ÇÖMELME (Slide / Crouch) ---
      if (this.keys.down && p.isGrounded) {
        if (!p.isCrouching) {
          p.isCrouching = true;
          p.height = SLIDE_HEIGHT;
          p.y += (NORMAL_HEIGHT - SLIDE_HEIGHT);
          if (Math.abs(p.vx) > 2) {
            p.vx *= 1.25;
            this.sound.slide();
            this.particles.dust(p.x + p.width / 2, p.y + p.height, p.facing);
          }
        }
      } else if (p.isCrouching) {
        // Üstte engel var mı kontrol et
        const ceilingBlocked = this.checkCeilingCollision(p.x, p.y - (NORMAL_HEIGHT - SLIDE_HEIGHT), p.width, NORMAL_HEIGHT);
        if (!ceilingBlocked) {
          p.isCrouching = false;
          p.height = NORMAL_HEIGHT;
          p.y -= (NORMAL_HEIGHT - SLIDE_HEIGHT);
        }
      }

      // --- YATAY HAREKET ---
      const maxSpd = p.isCrouching ? MAX_RUN_SPEED * 0.75 : (this.keys.sprint ? MAX_SPRINT_SPEED : MAX_RUN_SPEED);
      if (this.keys.left && !this.keys.right) {
        p.vx = Math.max(p.vx - MOVE_ACCEL, -maxSpd);
        p.facing = -1;
        if (p.isGrounded && Math.random() < 0.25) this.particles.dust(p.x + p.width, p.y + p.height, -1);
      } else if (this.keys.right && !this.keys.left) {
        p.vx = Math.min(p.vx + MOVE_ACCEL, maxSpd);
        p.facing = 1;
        if (p.isGrounded && Math.random() < 0.25) this.particles.dust(p.x, p.y + p.height, 1);
      } else {
        p.vx *= MOVE_FRICTION;
        if (Math.abs(p.vx) < 0.1) p.vx = 0;
      }

      // --- YERÇEKİMİ VE DUVAR KAYMASI (Wall Slide) ---
      if (p.isOnWall && !p.isGrounded && p.vy > 0 && (this.keys.left || this.keys.right)) {
        p.vy = Math.min(p.vy + GRAVITY * 0.4, WALL_SLIDE_SPEED);
        if (Math.random() < 0.3) {
          const sparkX = p.wallDir === -1 ? p.x : p.x + p.width;
          this.particles.add(sparkX, p.y + p.height * 0.7, -p.wallDir * Math.random(), -1, '#38bdf8', 2, 10);
        }
      } else {
        p.vy = Math.min(p.vy + GRAVITY, MAX_FALL_SPEED);
      }

      // Coyote Time
      if (p.isGrounded) {
        p.coyoteCounter = COYOTE_TIME;
      } else if (p.coyoteCounter > 0) {
        p.coyoteCounter--;
      }

      // --- ZIPLAMA KONTROLÜ (Jump & Wall Jump) ---
      if (p.jumpBufferCounter > 0) {
        if (p.coyoteCounter > 0) {
          // Normal Zıplama
          p.vy = JUMP_FORCE;
          p.jumpBufferCounter = 0;
          p.coyoteCounter = 0;
          p.isGrounded = false;
          this.sound.jump();
          this.particles.burst(p.x + p.width / 2, p.y + p.height, 6, ['#e2e8f0', '#94a3b8'], 1, 3);
        } else if (p.isOnWall) {
          // Duvar Zıplaması (Wall Jump)
          p.vy = WALL_JUMP_FORCE_Y;
          p.vx = -p.wallDir * WALL_JUMP_FORCE_X;
          p.facing = -p.wallDir;
          p.jumpBufferCounter = 0;
          p.isOnWall = false;
          this.sound.wallJump();
          this.screenShake = 3;
          this.particles.burst(p.wallDir === -1 ? p.x : p.x + p.width, p.y + p.height / 2, 10, ['#38bdf8', '#0284c7'], 2, 5);
        }
      }
    }
    this.prevJumpKey = this.keys.jump;

    // --- HAREKETLİ PLATFORMLAR GÜNCELLEMESİ ---
    if (this.currentLevel.moving) {
      this.currentLevel.moving.forEach(m => {
        m.x += m.vx;
        m.y += m.vy;
        if (m.x <= m.minX || m.x >= m.maxX) m.vx *= -1;
        if (m.y <= m.minY || m.y >= m.maxY) m.vy *= -1;

        // Oyuncu platformun üstünde mi?
        if (p.isGrounded && p.y + p.height >= m.y - 4 && p.y + p.height <= m.y + 10 &&
            p.x + p.width > m.x && p.x < m.x + m.w) {
          p.x += m.vx;
          p.y += m.vy;
        }
      });
    }

    // --- YIKILAN PLATFORMLAR GÜNCELLEMESİ ---
    if (this.currentLevel.crumbling) {
      this.currentLevel.crumbling.forEach(c => {
        if (c.falling) {
          c.fallSpeed += 0.4;
          c.y += c.fallSpeed;
          c.respawnTimer--;
          if (c.respawnTimer <= 0) {
            c.y = c.oy;
            c.falling = false;
            c.fallSpeed = 0;
          }
        }
      });
    }

    // --- LAZERLER GÜNCELLEMESİ ---
    if (this.currentLevel.lasers) {
      this.currentLevel.lasers.forEach(laser => {
        laser.step = ((laser.step || 0) + 1) % laser.cycle;
        laser.isActive = ((laser.step + laser.offset) % laser.cycle) < laser.activeTime;
      });
    }

    // --- HAREKET VE ÇARPIŞMA (AABB Collision) ---
    // Yatay Hareket
    p.x += p.vx;
    p.isOnWall = false;
    p.wallDir = 0;
    this.resolveHorizontalCollisions();

    // Dikey Hareket
    p.y += p.vy;
    p.isGrounded = false;
    this.resolveVerticalCollisions();

    // Trambolin / Yay Etkileşimi
    if (this.currentLevel.springs) {
      this.currentLevel.springs.forEach(s => {
        if (p.x + p.width > s.x && p.x < s.x + 32 &&
            p.y + p.height >= s.y && p.y + p.height <= s.y + 16 && p.vy > 0) {
          p.vy = s.force;
          p.isGrounded = false;
          this.sound.spring();
          this.screenShake = 6;
          this.particles.burst(s.x + 16, s.y, 14, ['#10b981', '#6ee7b7'], 3, 8);
        }
      });
    }

    // Tehlikeler (Dikenler & Asit Havuzları)
    if (this.currentLevel.hazards) {
      this.currentLevel.hazards.forEach(h => {
        if (this.checkOverlap(p, h)) {
          this.restartLevel();
        }
      });
    }

    // Lazer Çarpışması
    if (this.currentLevel.lasers) {
      this.currentLevel.lasers.forEach(l => {
        if (l.isActive && this.checkOverlap(p, l)) {
          this.restartLevel();
        }
      });
    }

    // Seviye Düşme Sınırı
    if (p.y > this.currentLevel.height + 100) {
      this.restartLevel();
    }

    // Kontrol Noktaları (Checkpoints)
    if (this.currentLevel.checkpoints) {
      this.currentLevel.checkpoints.forEach(cp => {
        if (!cp.reached && Math.abs(p.x - cp.x) < 32 && Math.abs(p.y - (cp.y - 40)) < 48) {
          cp.reached = true;
          p.respawnX = cp.x;
          p.respawnY = cp.y - p.height;
          this.sound.checkpoint();
          this.showToast('Kontrol Noktası Kaydedildi!');
          this.particles.burst(cp.x, cp.y - 24, 18, ['#10b981', '#34d399', '#ffffff'], 2, 6);
        }
      });
    }

    // Toplanabilir Yıldızlar
    if (this.currentLevel.stars) {
      this.currentLevel.stars.forEach(st => {
        if (!st.collected && Math.abs((p.x + p.width / 2) - st.x) < 28 && Math.abs((p.y + p.height / 2) - st.y) < 28) {
          st.collected = true;
          this.levelStars++;
          this.sound.star();
          this.updateHUD();
          this.particles.burst(st.x, st.y, 16, ['#fbbf24', '#f59e0b', '#ffffff'], 2, 6);
        }
      });
    }

    // Toplanabilir Jetonlar
    if (this.currentLevel.coins) {
      for (let i = this.currentLevel.coins.length - 1; i >= 0; i--) {
        const c = this.currentLevel.coins[i];
        if (Math.abs((p.x + p.width / 2) - c.x) < 22 && Math.abs((p.y + p.height / 2) - c.y) < 22) {
          this.currentLevel.coins.splice(i, 1);
          this.levelCoins++;
          this.sound.coin();
          this.updateHUD();
          this.particles.burst(c.x, c.y, 8, ['#38bdf8', '#06b6d4'], 1, 4);
        }
      }
    }

    // Bitiş Portalı
    const port = this.currentLevel.portal;
    if (port && Math.abs((p.x + p.width / 2) - port.x) < 36 && Math.abs((p.y + p.height / 2) - port.y) < 48) {
      this.triggerVictory();
    }

    // Kamera Takibi (Smooth lerp)
    const targetCamX = p.x - VIEWPORT_WIDTH / 2 + p.facing * 80;
    const targetCamY = p.y - VIEWPORT_HEIGHT / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.08;
    this.camera.y += (targetCamY - this.camera.y) * 0.08;

    // Kamera seviye sınırlarına kenetlenmesi
    this.camera.x = Math.max(0, Math.min(this.camera.x, this.currentLevel.width - VIEWPORT_WIDTH));
    this.camera.y = Math.max(0, Math.min(this.camera.y, this.currentLevel.height - VIEWPORT_HEIGHT));

    // Screen Shake sönümü
    if (this.screenShake > 0) this.screenShake *= 0.85;
    if (this.screenShake < 0.2) this.screenShake = 0;

    // HUD Zaman güncellemesi
    this.updateHUD();
  }

  // --- ÇARPIŞMA YÖNETİMİ ---
  resolveHorizontalCollisions() {
    const p = this.player;
    const platforms = this.getAllSolidPlatforms();

    for (const plat of platforms) {
      if (p.x < plat.x + plat.w && p.x + p.width > plat.x &&
          p.y < plat.y + plat.h && p.y + p.height > plat.y) {
        if (p.vx > 0) {
          p.x = plat.x - p.width;
          p.isOnWall = true;
          p.wallDir = 1;
        } else if (p.vx < 0) {
          p.x = plat.x + plat.w;
          p.isOnWall = true;
          p.wallDir = -1;
        }
        p.vx = 0;
      }
    }
  }

  resolveVerticalCollisions() {
    const p = this.player;
    const platforms = this.getAllSolidPlatforms();

    for (const plat of platforms) {
      if (p.x < plat.x + plat.w && p.x + p.width > plat.x &&
          p.y < plat.y + plat.h && p.y + p.height > plat.y) {
        if (p.vy > 0) {
          p.y = plat.y - p.height;
          p.vy = 0;
          p.isGrounded = true;

          // Yıkılan platformu tetikle
          if (plat.isCrumble && !plat.falling) {
            setTimeout(() => {
              plat.falling = true;
              plat.respawnTimer = 180; // 3 saniye
              plat.fallSpeed = 1;
            }, 350);
          }
        } else if (p.vy < 0) {
          p.y = plat.y + plat.h;
          p.vy = 0;
        }
      }
    }
  }

  checkCeilingCollision(x, y, w, h) {
    const platforms = this.getAllSolidPlatforms();
    for (const plat of platforms) {
      if (x < plat.x + plat.w && x + w > plat.x &&
          y < plat.y + plat.h && y + h > plat.y) {
        return true;
      }
    }
    return false;
  }

  checkOverlap(boxA, boxB) {
    const aX = boxA.x;
    const aY = boxA.y;
    const aW = boxA.width || boxA.w;
    const aH = boxA.height || boxA.h;

    const bX = boxB.x;
    const bY = boxB.y;
    const bW = boxB.width || boxB.w;
    const bH = boxB.height || boxB.h;

    return aX < bX + bW && aX + aW > bX && aY < bY + bH && aY + aH > bY;
  }

  getAllSolidPlatforms() {
    const solids = [...this.currentLevel.platforms];
    if (this.currentLevel.moving) {
      this.currentLevel.moving.forEach(m => solids.push({ x: m.x, y: m.y, w: m.w, h: m.h }));
    }
    if (this.currentLevel.crumbling) {
      this.currentLevel.crumbling.forEach(c => {
        if (!c.falling) {
          solids.push({ x: c.x, y: c.y, w: c.w, h: c.h, isCrumble: true, ref: c });
        }
      });
    }
    return solids;
  }

  // --- ÇİZİM VE GÖRSELLEŞTİRME (Canvas Rendering) ---
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Screen Shake Ofseti
    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake;
      shakeY = (Math.random() - 0.5) * this.screenShake;
    }

    const camX = this.camera.x + shakeX;
    const camY = this.camera.y + shakeY;

    // 1. KATMAN: PARALAKS ARKA PLAN (Parallax Sky & Cyber Skyline)
    this.renderParallaxBackground(camX, camY);

    // 2. KATMAN: OYUN ELEMANLARI (Platforms, Traps, Collectibles)
    ctx.save();
    ctx.translate(-camX, -camY);

    this.renderLevelElements(ctx);
    this.renderPlayer(ctx);
    this.particles.render(ctx, { x: camX, y: camY });

    ctx.restore();
  }

  renderParallaxBackground(camX, camY) {
    const ctx = this.ctx;

    // Gökyüzü Degrade
    const grad = ctx.createLinearGradient(0, 0, 0, VIEWPORT_HEIGHT);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(0.5, '#0b1329');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Uzak Ay / Neon Halka
    ctx.save();
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(VIEWPORT_WIDTH - 120, 80, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1. Paralaks Katmanı: Uzak Binalar (Hız faktörü 0.12)
    ctx.fillStyle = '#0f172a';
    const bg1Offset = (camX * 0.12) % 180;
    for (let x = -bg1Offset - 180; x < VIEWPORT_WIDTH + 180; x += 90) {
      const h = 200 + ((x * 13) % 120);
      ctx.fillRect(x, VIEWPORT_HEIGHT - h, 75, h);
    }

    // 2. Paralaks Katmanı: Orta Binalar ve Işıklı Pencereler (Hız faktörü 0.28)
    const bg2Offset = (camX * 0.28) % 140;
    for (let x = -bg2Offset - 140; x < VIEWPORT_WIDTH + 140; x += 110) {
      const h = 140 + ((x * 29) % 160);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, VIEWPORT_HEIGHT - h, 95, h);

      // Pencereler
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      for (let wy = VIEWPORT_HEIGHT - h + 20; wy < VIEWPORT_HEIGHT - 20; wy += 26) {
        ctx.fillRect(x + 18, wy, 8, 12);
        ctx.fillRect(x + 48, wy, 8, 12);
        ctx.fillRect(x + 72, wy, 8, 12);
      }
    }
  }

  renderLevelElements(ctx) {
    // Katı Platformlar
    for (const plat of this.currentLevel.platforms) {
      // Platform Gövdesi
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

      // Üst Kenar Işıması (Neon Edge)
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(plat.x, plat.y, plat.w, 4);

      // Izgara Dokusu
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let gx = plat.x; gx < plat.x + plat.w; gx += 32) {
        ctx.strokeRect(gx, plat.y, 32, plat.h);
      }
    }

    // Hareketli Platformlar
    if (this.currentLevel.moving) {
      for (const m of this.currentLevel.moving) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(m.x, m.y, m.w, m.h);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(m.x, m.y, m.w, 4);

        // Ok işareti
        ctx.fillStyle = '#a7f3d0';
        ctx.font = '10px monospace';
        ctx.fillText('◄►', m.x + m.w / 2 - 10, m.y + 14);
      }
    }

    // Yıkılan Platformlar
    if (this.currentLevel.crumbling) {
      for (const c of this.currentLevel.crumbling) {
        if (!c.falling || c.respawnTimer > 0) {
          ctx.fillStyle = c.falling ? 'rgba(244, 63, 94, 0.7)' : '#334155';
          ctx.fillRect(c.x, c.y, c.w, c.h);
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(c.x, c.y, c.w, 3);
          // Çatlak çizgileri
          ctx.strokeStyle = '#fca5a5';
          ctx.beginPath();
          ctx.moveTo(c.x + 10, c.y + 3);
          ctx.lineTo(c.x + c.w / 2, c.y + c.h - 4);
          ctx.lineTo(c.x + c.w - 10, c.y + 4);
          ctx.stroke();
        }
      }
    }

    // Trambolinler / Yaylar
    if (this.currentLevel.springs) {
      for (const s of this.currentLevel.springs) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(s.x, s.y + 8, 32, 8);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(s.x + 4, s.y + 2, 24, 6);
      }
    }

    // Dikenler ve Asitler
    if (this.currentLevel.hazards) {
      for (const h of this.currentLevel.hazards) {
        if (h.type === 'spikes') {
          ctx.fillStyle = '#f43f5e';
          const spikeW = 16;
          const count = Math.ceil(h.w / spikeW);
          for (let i = 0; i < count; i++) {
            ctx.beginPath();
            ctx.moveTo(h.x + i * spikeW, h.y + h.h);
            ctx.lineTo(h.x + i * spikeW + spikeW / 2, h.y);
            ctx.lineTo(h.x + (i + 1) * spikeW, h.y + h.h);
            ctx.closePath();
            ctx.fill();
          }
        } else if (h.type === 'acid') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
          ctx.fillRect(h.x, h.y, h.w, h.h);
          // Yüzey parıltısı
          ctx.fillStyle = '#6ee7b7';
          ctx.fillRect(h.x, h.y, h.w, 4);
        }
      }
    }

    // Lazerler
    if (this.currentLevel.lasers) {
      for (const l of this.currentLevel.lasers) {
        if (l.isActive) {
          ctx.save();
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(l.x, l.y, l.w, l.h);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(l.x + (l.w > l.h ? 0 : 2), l.y + (l.h > l.w ? 0 : 2), l.w > l.h ? l.w : l.w - 4, l.h > l.w ? l.h : l.h - 4);
          ctx.restore();
        } else {
          // Lazer uyarı hali (sönük kırmızı kılavuz çizgisi)
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
          ctx.strokeRect(l.x, l.y, l.w, l.h);
        }
      }
    }

    // Kontrol Noktaları (Checkpoints)
    if (this.currentLevel.checkpoints) {
      for (const cp of this.currentLevel.checkpoints) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cp.x - 2, cp.y - 36, 4, 36);
        ctx.fillStyle = cp.reached ? '#10b981' : '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(cp.x + 2, cp.y - 36);
        ctx.lineTo(cp.x + 22, cp.y - 26);
        ctx.lineTo(cp.x + 2, cp.y - 16);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Toplanabilir Yıldızlar
    if (this.currentLevel.stars) {
      for (const st of this.currentLevel.stars) {
        if (!st.collected) {
          ctx.save();
          const t = performance.now() * 0.004;
          const floatY = Math.sin(t) * 5;
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#fbbf24';
          ctx.font = '24px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('★', st.x, st.y + floatY);
          ctx.restore();
        }
      }
    }

    // Toplanabilir Jetonlar
    if (this.currentLevel.coins) {
      for (const c of this.currentLevel.coins) {
        ctx.save();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Bitiş Portalı
    const port = this.currentLevel.portal;
    if (port) {
      ctx.save();
      const t = performance.now() * 0.003;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 24;

      // Dış Halka
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(port.x, port.y - 28, 28, t, t + Math.PI * 1.5);
      ctx.stroke();

      // İç Halka
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(port.x, port.y - 28, 16, -t, -t + Math.PI * 1.5);
      ctx.stroke();

      // Merkez Işıltısı
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(port.x, port.y - 28, 6 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  renderPlayer(ctx) {
    const p = this.player;
    if (!p) return;

    ctx.save();

    // Dash Görsel Halesi
    if (p.isDashing) {
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 20;
    }

    // Oyuncu Gövdesi (Cyber Parkour Runner)
    ctx.fillStyle = p.isDashing ? '#38bdf8' : '#0284c7';
    ctx.fillRect(p.x, p.y, p.width, p.height);

    // Kask / Vizör
    ctx.fillStyle = '#06b6d4';
    const visorX = p.facing === 1 ? p.x + p.width - 9 : p.x + 2;
    const visorY = p.y + (p.isCrouching ? 4 : 6);
    ctx.fillRect(visorX, visorY, 7, 6);

    // Neon Şeritler (Ayakkabı / Kemer)
    ctx.fillStyle = '#10b981';
    ctx.fillRect(p.x + 2, p.y + p.height - 4, p.width - 4, 3);

    // Duvara yaslanma efekti
    if (p.isOnWall) {
      ctx.fillStyle = '#38bdf8';
      const handX = p.wallDir === 1 ? p.x + p.width - 2 : p.x;
      ctx.fillRect(handX, p.y + 10, 2, 8);
    }

    ctx.restore();
  }

  // --- OYUN DÖNGÜSÜ (Game Loop) ---
  loop(timestamp) {
    if (this.gameState === 'playing') {
      this.updatePhysics();
      this.particles.update();
    }
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Oyunu Başlat
window.addEventListener('DOMContentLoaded', () => {
  window.parkurGame = new Game();
});
