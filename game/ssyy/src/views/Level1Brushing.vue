<template>
  <div class="level1-container">
    <div ref="gameContainer" class="game-canvas"></div>

    <div class="ui-overlay">
      <div class="top-bar">
        <div class="timer">⏱️ {{ formattedTime }}</div>
        <div class="score">✨ 洁净度: {{ cleanliness }}%</div>
      </div>

      <Transition name="fade">
        <div v-if="showTip" class="science-tip" @click="showTip = false">
          <div class="tip-icon">{{ tipIcon }}</div>
          <p>{{ currentTip }}</p>
          <span class="tip-close">知道啦~</span>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="showReward" class="reward-modal">
          <div class="reward-content">
            <h2>🎉 太棒啦！</h2>
            <p>你把小牙齿刷得干干净净！</p>
            <div class="card-preview">🃏 解锁「护牙小卫士」勋章</div>
            <button @click="$emit('level-complete')">领取奖励</button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import * as Phaser from 'phaser';
import squirrelBrushImg from '@/assets/img/squirrel_brush.png';

const emit = defineEmits(['level-complete']);

// ==================== 状态 ====================
const gameContainer = ref(null);
let gameInstance = null;

const timeLeft = ref(120);
const cleanliness = ref(0);
const showTip = ref(false);
const currentTip = ref('');
const tipIcon = ref('🌟');
const showReward = ref(false);

const formattedTime = computed(() => {
  const m = Math.floor(timeLeft.value / 60);
  const s = timeLeft.value % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

const TIPS = [
  { icon: '🌟', text: '试试让牙刷斜斜地靠在牙齿上哦~' },
  { icon: '🎵', text: '像唱歌一样轻轻摆动牙刷吧！' },
  { icon: '🐿️', text: '小松鼠说：每个角落都要照顾到呀~' },
  { icon: '💪', text: '你已经做得很好了，继续加油！' },
];

function triggerTip() {
  if (showTip.value) return;
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  tipIcon.value = tip.icon;
  currentTip.value = tip.text;
  showTip.value = true;
  setTimeout(() => { showTip.value = false; }, 3500);
}

// ==================== Phaser 场景 ====================
class BrushingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BrushingScene' });
  }

  preload() {
    this.load.image('squirrel_brush', squirrelBrushImg);
  }

  create() {
    const { width, height } = this.scale;

    // ---------- 1. 绘制牙齿 ----------
    this.drawTooth(width / 2, height / 2);

    // ---------- 2. 污垢区域 ----------
    this.dirtyZones = [];
    const zonePositions = [
      { x: width / 2 - 70, y: height / 2 - 50 },
      { x: width / 2 + 70, y: height / 2 - 50 },
      { x: width / 2 - 70, y: height / 2 + 50 },
      { x: width / 2 + 70, y: height / 2 + 50 },
      { x: width / 2, y: height / 2 },
    ];

    zonePositions.forEach((pos, i) => {
      const dirt = this.add.circle(pos.x, pos.y, 35, 0x8B7355, 0.7);
      dirt.setDepth(2);
      dirt.zoneIndex = i;
      dirt.cleaned = false;
      dirt.brushCount = 0;
      dirt.lastBrushTime = 0;
      this.dirtyZones.push(dirt);
    });

    // ---------- 3. ✅ 固定水平角度（0°），刷毛朝右 ----------
    this.brushContainer = this.add.container(width / 2, height / 2);
    this.squirrel = this.add.sprite(0, 0, 'squirrel_brush');
    this.brushContainer.add(this.squirrel);
    this.brushContainer.setDepth(10);

    // 🔑 关键：水平放置 + 精准锚点
    this.brushContainer.rotation = 0; // 水平向右

    // 🔑 基于1291x1114实测校准：刷毛最右端（1291-31=1260）
    this.brushAnchor = {
      originalX: 1210,
      originalY: 800,
    };

    // 预计算固定角度（0°）的三角函数值
    this._fixedCos = 1;   // cos(0) = 1
    this._fixedSin = 0;   // sin(0) = 0

    this.updateBrushScale();

    // ---------- 4. 输入处理（仅跟随位置，不旋转） ----------
    this.input.on('pointermove', (pointer) => {
      this.brushContainer.setPosition(pointer.x, pointer.y);
      this.checkBrushing(pointer);
    });

    // ---------- 5. 定时器 ----------
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (timeLeft.value > 0 && !showReward.value) timeLeft.value--;
      },
    });

    this.recentlyCleaned = false;
    this._lastWrongTipTime = 0;

    // 粒子发射器
    this.sparkleEmitter = this.add.particles(0, 0, 'squirrel_brush', {
      speed: { min: 20, max: 60 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 400,
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(20);
  }

  // ✅ 水平放置下的精确刷毛世界坐标
  getBristleWorldPosition() {
    if (!this.squirrel) return { x: this.brushContainer.x, y: this.brushContainer.y };

    const bounds = this.squirrel.getBounds();
    const scaleX = bounds.width / 1291;
    const scaleY = bounds.height / 1114;

    const localX = this.brushAnchor.originalX * scaleX;
    const localY = this.brushAnchor.originalY * scaleY;

    // 水平放置：世界坐标 = 容器位置 + 局部偏移（无旋转变换）
    const worldX = this.brushContainer.x + localX;
    const worldY = this.brushContainer.y + localY;

    return { x: worldX, y: worldY };
  }

  updateBrushScale() {
    const { height } = this.scale;
    const texture = this.textures.get('squirrel_brush');
    if (!texture || !texture.source[0]) return;

    const originalHeight = 1114;
    const targetHeight = height * 0.18;
    const scaleFactor = targetHeight / originalHeight;

    this.squirrel.setScale(scaleFactor);
  }

  drawTooth(cx, cy) {
    const g = this.add.graphics();
    g.fillStyle(0xFFFDE7, 1);
    g.fillRoundedRect(cx - 120, cy - 100, 240, 200, 40);
    g.fillStyle(0xF8BBD0, 0.6);
    g.fillRoundedRect(cx - 130, cy - 110, 260, 40, 20);
    g.fillRoundedRect(cx - 130, cy + 70, 260, 40, 20);
  }

  checkBrushing(pointer) {
    if (!pointer.isDown) return;

    const bristlePos = this.getBristleWorldPosition();
    let hitZone = null;

    this.dirtyZones.forEach((z) => {
      if (!z.cleaned) {
        const dist = Phaser.Math.Distance.Between(bristlePos.x, bristlePos.y, z.x, z.y);
        if (dist < 55) hitZone = z;
      }
    });

    if (!hitZone) return;

    // 角度已固定为水平正确姿态，无需再判断角度偏差
    hitZone.alpha -= 0.06;
    hitZone.brushCount++;
    this.recentlyCleaned = true;

    const now = this.time.now;
    if (now - hitZone.lastBrushTime < 300) hitZone.alpha -= 0.03;
    hitZone.lastBrushTime = now;

    this.sparkleEmitter.emitParticleAt(bristlePos.x, bristlePos.y, 3);
    hitZone.setFillStyle(0x8B7355, hitZone.alpha);

    if (hitZone.alpha <= 0.08) {
      hitZone.cleaned = true;
      hitZone.setVisible(false);
      this.celebrateZone(hitZone.x, hitZone.y);
      this.updateCleanliness();
    }
  }

  celebrateZone(x, y) {
    const star = this.add.text(x, y, '⭐', { fontSize: '32px' })
      .setOrigin(0.5)
      .setDepth(25);

    this.tweens.add({
      targets: star,
      y: y - 50,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 600,
      ease: 'Back.easeOut',
      onComplete: () => star.destroy(),
    });
  }

  updateCleanliness() {
    const total = this.dirtyZones.length;
    const cleaned = this.dirtyZones.filter(z => z.cleaned).length;
    cleanliness.value = Math.round((cleaned / total) * 100);

    if (cleanliness.value >= 100) {
      showReward.value = true;
      this.scene.pause();
    }
  }
}

// ==================== 生命周期 ====================
onMounted(() => {
  const config = {
    type: Phaser.AUTO,
    parent: gameContainer.value,
    width: 480,
    height: 640,
    backgroundColor: '#E3F2FD',
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BrushingScene],
    input: { activePointers: 1 },
  };

  gameInstance = new Phaser.Game(config);
});

onBeforeUnmount(() => {
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
});
</script>

<style scoped>
.level1-container {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  aspect-ratio: 3/4;
  border-radius: 16px;
  overflow: hidden;
  background: #E3F2FD;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
}

.game-canvas { width: 100%; height: 100%; }

.ui-overlay { position: absolute; inset: 0; pointer-events: none; }

.top-bar {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  font-weight: bold;
  font-size: 16px;
  color: #1565C0;
}

.science-tip {
  pointer-events: auto;
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #FFF9C4, #FFF176);
  border: 2px solid #FFD54F;
  border-radius: 20px;
  padding: 16px 24px;
  max-width: 85%;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(255, 213, 79, 0.4);
}
.tip-icon { font-size: 32px; margin-bottom: 6px; }
.science-tip p { margin: 0; font-size: 15px; color: #5D4037; line-height: 1.6; }
.tip-close { font-size: 12px; color: #BDBDBD; margin-top: 8px; }

.reward-modal {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.reward-content {
  background: white;
  border-radius: 24px;
  padding: 32px 24px;
  text-align: center;
  max-width: 80%;
  animation: popIn 0.4s ease;
}
.reward-content h2 { margin: 0 0 8px; color: #2E7D32; font-size: 24px; }
.card-preview {
  margin: 16px 0;
  padding: 14px;
  background: #E8F5E9;
  border-radius: 14px;
  font-size: 15px;
  color: #33691E;
  font-weight: 500;
}
.reward-content button {
  margin-top: 12px;
  padding: 14px 36px;
  border: none;
  border-radius: 28px;
  background: linear-gradient(135deg, #43A047, #66BB6A);
  color: white;
  font-size: 17px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(67, 160, 71, 0.3);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes popIn {
  from { transform: scale(0.7); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
</style>