<template>
  <div class="game-wrapper">
    <div ref="gameContainer" class="canvas"></div>
    <div class="ui-layer">
      <div class="step-tag">{{ stepLabels[currentStep] }}</div>
      <Transition name="fade">
        <div v-if="msg" class="toast" :class="{ success: isSuccess }">{{ msg }}</div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as Phaser from 'phaser';

const gameContainer = ref(null);
let game = null;

// UI 响应式状态
const currentStep = ref(0);
const msg = ref('');
const isSuccess = ref(false);
const stepLabels = ['🔍 术前检查', '🪥 清洁牙面', '🧊 隔湿准备', '🧪 酸蚀处理', '💨 再次吹干', '💡 涂布固化'];

// 向 Phaser 场景暴露 UI 更新方法的桥梁
let sceneRef = null;
function showToast(text, success = false, duration = 1500) {
  msg.value = text;
  isSuccess.value = success;
  if (duration > 0) setTimeout(() => { msg.value = ''; }, duration);
}

class SealantScene extends Phaser.Scene {
  constructor() { super('SealantScene'); }
preload() {
    // ⚠️ 关键：Vite 项目中，src/assets 下的文件必须用 new URL() 或 import 才能被正确打包
    // 第一个参数是游戏内的唯一ID，第二个是真实路径
    this.load.image('tooth', new URL('../assets/img/tooth-occlusal.png', import.meta.url).href);
  }
  create() {
    this.step = 0;
    this.objs = []; // 存储当前步骤所有显示对象
    sceneRef = this;
    this.initStep(0);
  }

  // ==================== 核心状态机 ====================
  initStep(n) {
    // 1. 清理上一步
    this.objs.forEach(o => o.destroy());
    this.objs = [];
    this.input.removeAllListeners();
    this.time.removeAllEvents();
    
    // 2. 更新 Vue UI
    currentStep.value = n;
    msg.value = '';
    this.step = n;

    // 3. 分发到具体步骤
    const builders = [
      () => this.buildCheck(),
      () => this.buildClean(),
      () => this.buildIsolate(),
      () => this.buildEtch(),
      () => this.buildDry(),
      () => this.buildSealCure(),
    ];
    if (n < builders.length) builders[n]();
  }

  next() {
    if (this.step < 5) this.initStep(this.step + 1);
    else showToast('🎉 窝沟封闭完成！获得防蛀勋章！', true, 0);
  }

  // 通用：绘制牙齿底图
  drawTooth() {
  const { width, height } = this.scale;
  
  // 使用 preload 中定义的 ID 'tooth'
  const tooth = this.add.image(width / 2, height / 2, 'tooth')
    .setDisplaySize(360, 360) // 根据图片实际比例调整大小
    .setInteractive({ useHandCursor: true });
  
  this.objs.push(tooth);
  return { cx: width / 2, cy: height / 2 };
}

  // ==================== STEP 0: 术前检查 ====================
  buildCheck() {
    const { cx, cy } = this.drawTooth();
    const points = [
      { x: cx - 40, y: cy - 30, bad: true },
      { x: cx + 50, y: cy + 20, bad: false },
      { x: cx + 10, y: cy - 50, bad: true },
    ];
    let found = 0;
    points.forEach(p => {
      const dot = this.add.circle(p.x, p.y, 14, p.bad ? 0x5D4037 : 0xFFCCBC, 0.9)
        .setInteractive({ useHandCursor: true });
      dot.on('pointerdown', () => {
        if (p.bad) {
          dot.setFillStyle(0x4CAF50);
          found++;
          showToast(`发现隐患 ${found}/2`, true, 800);
          if (found >= 2) setTimeout(() => this.next(), 1000);
        } else {
          showToast('这里很健康哦~', false, 800);
        }
      });
      this.objs.push(dot);
    });
    showToast('点击找出2处蛀牙/隐患', false, 0);
  }

 
buildClean() {
  const { cx, cy } = this.drawTooth(); // cx=240, cy=320（即中央点隙位置）

  // 🔑 核心：使用你图中真实的窝沟路径控制点（已按480×640画布校准）
  const groovePoints = [
    { x: 192, y: 304 }, // 近中沟起点（左上）
    { x: 240, y: 320 }, // 中央点隙中心（正中）
    { x: 168, y: 392 }, // 颊侧沟末端（左下）
    { x: 312, y: 392 }, // 舌侧沟末端（右下）
    { x: 288, y: 272 }  // 远中沟出口（右上）
  ];

  // 构建两条主窝沟路径（严格匹配图中Y型结构）
  const grooveMain = new Phaser.Curves.Path(groovePoints[0].x, groovePoints[0].y);
  grooveMain.splineTo([
    groovePoints[1].x, groovePoints[1].y, // → 中央
    groovePoints[4].x, groovePoints[4].y  // → 远中
  ]);

  const grooveSide = new Phaser.Curves.Path(groovePoints[1].x, groovePoints[1].y);
  grooveSide.splineTo([
    groovePoints[2].x, groovePoints[2].y, // → 颊侧
    groovePoints[3].x, groovePoints[3].y  // → 舌侧
  ]);

  // 沿真实窝沟采样污渍点（仅在深色凹陷区！）
  const stains = [];
  const sampleCurve = (curve, count) => {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = curve.getPoint(t);
      // 微扰动：模拟菌斑自然沉积（±3px，避免过于规则）
      stains.push({
        x: p.x + Phaser.Math.Between(-3, 3),
        y: p.y + Phaser.Math.Between(-3, 3),
        alive: true
      });
    }
  };
  sampleCurve(grooveMain, 35);   // 主沟：35点
  sampleCurve(grooveSide, 25);   // 侧沟：25点

  // ✅ 绘制引导线：紧贴你图中的深色窝沟（颜色=图中凹陷色 #795548）
  const guideGfx = this.add.graphics();
  guideGfx.lineStyle(14, 0x795548, 0.25); // 宽度14px，半透明深棕
  grooveMain.draw(guideGfx);
  grooveSide.draw(guideGfx);
  this.objs.push(guideGfx);

  // 绘制污渍（小圆点，颜色=图中凹陷加深色 #5D4037）
  const stainGfx = this.add.graphics();
  this.objs.push(stainGfx);
  const redrawStains = () => {
    stainGfx.clear();
    stains.forEach(s => {
      if (s.alive) {
        stainGfx.fillStyle(0x5D4037, 0.92); // 深棕，接近图中凹陷
        stainGfx.fillCircle(s.x, s.y, 7);   // 直径14px，小巧真实
      }
    });
  };
  redrawStains();

  // UI：进度条 & 刷子
  const barBg = this.add.rectangle(cx, 60, 220, 16, 0xE0E0E0).setOrigin(0.5);
  const barFill = this.add.rectangle(cx - 110, 60, 0, 16, 0x66BB6A).setOrigin(0, 0.5);
  this.objs.push(barBg, barFill);

  const brush = this.add.circle(0, 0, 18, 0x4FC3F7, 0.6)
    .setStrokeStyle(2, 0x0288D1)
    .setVisible(false);
  this.objs.push(brush);

  let cleaning = false;
  let lastCleanTime = 0;

  // 交互：仅当在窝沟附近滑动时才有效
  this.input.on('pointerdown', () => { 
    cleaning = true; 
    brush.setVisible(true); 
  });
  this.input.on('pointerup', () => { 
    cleaning = false; 
    brush.setVisible(false); 
  });
  this.input.on('pointerout', () => { 
    cleaning = false; 
    brush.setVisible(false); 
  });

  this.input.on('pointermove', (ptr) => {
    brush.setPosition(ptr.x, ptr.y);
    if (!cleaning) return;

    // ⏱️ 节流：防高频触发
    const now = this.time.now;
    if (now - lastCleanTime < 25) return;
    lastCleanTime = now;

    let changed = false;
    stains.forEach(s => {
      // ✅ 关键：判定半径 = 22px（略大于污渍直径），适配触控误差
      if (s.alive && Phaser.Math.Distance.Between(ptr.x, ptr.y, s.x, s.y) < 22) {
        s.alive = false;
        changed = true;
      }
    });

    if (changed) {
      redrawStains();
      const total = stains.length;
      const cleaned = stains.filter(s => !s.alive).length;
      const pct = Math.round((cleaned / total) * 100);
      barFill.width = 220 * (pct / 100);

      if (pct >= 95) {
        showToast('✅ 窝沟清洁完成！深色裂隙已无菌斑', true);
        this.time.delayedCall(800, () => this.next());
      }
    }
  });

  // 🎯 Toast 提示语精准对应图像
  showToast('👉 请沿图中深棕色Y型裂隙滑动清洁（避开牙尖光滑面）', false, 0);
}
  // ==================== STEP 2: 隔湿准备 ====================
  buildIsolate() {
    const { cx } = this.drawTooth();
    let moisture = 100;
    const barBg = this.add.rectangle(cx, 60, 220, 16, 0xE0E0E0);
    const barFill = this.add.rectangle(cx - 110, 60, 220, 16, 0x4FC3F7).setOrigin(0, 0.5);
    this.objs.push(barBg, barFill);

    const btn = this.add.text(cx, this.scale.height - 70, '🌬️ 按住吹干', {
      fontSize: '22px', backgroundColor: '#29B6F6', padding: { x: 20, y: 10 }, color: '#fff'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.objs.push(btn);

    let blowing = false;
    btn.on('pointerdown', () => { blowing = true; });
    btn.on('pointerup', () => { blowing = false; });
    btn.on('pointerout', () => { blowing = false; });

    this.time.addEvent({
      delay: 50, loop: true,
      callback: () => {
        moisture = blowing ? Math.max(0, moisture - 2.5) : Math.min(100, moisture + 4);
        barFill.width = 220 * (moisture / 100);
        barFill.fillColor = moisture > 50 ? 0x4FC3F7 : moisture > 15 ? 0xFFB74D : 0x66BB6A;
        if (moisture <= 0) {
          this.time.removeAllEvents();
          showToast('✅ 完全干燥！', true);
          this.time.delayedCall(800, () => this.next());
        }
      }
    });
    showToast('长按按钮吹干，松手湿度会反弹！', false, 0);
  }

  // ==================== STEP 3: 酸蚀处理 ====================
  // buildEtch() {
  //   const { cx, cy } = this.drawTooth();
  //   // 酸蚀剂涂抹区
  //   const etchZone = this.add.rectangle(cx, cy, 180, 120, 0x7E57C2, 0).setInteractive();
  //   this.objs.push(etchZone);
  //   let applied = false;

  //   this.input.on('pointerdown', (ptr) => {
  //     if (etchZone.getBounds().contains(ptr.x, ptr.y) && !applied) {
  //       applied = true;
  //       etchZone.setAlpha(0.4);
  //       showToast('⏱️ 酸蚀中...等待25秒', true, 0);
  //       let sec = 25;
  //       const timer = this.time.addEvent({
  //         delay: 1000, loop: true,
  //         callback: () => {
  //           sec--;
  //           if (sec <= 0) {
  //             timer.destroy();
  //             showToast('✅ 酸蚀完成！已自动冲洗', true);
  //             this.time.delayedCall(1000, () => this.next());
  //           }
  //         }
  //       });
  //       this.objs.push(timer);
  //     }
  //   });
  //   showToast('点击牙齿窝沟区域涂抹酸蚀剂', false, 0);
  // }
// ==================== STEP 3: 酸蚀处理 (优化版) ====================
// ==================== STEP 3: 酸蚀处理 (儿童友好版) ====================
buildEtch() {
  const { cx, cy } = this.drawTooth();
  
  // 1. 扩大有效涂抹区域（比临床范围外扩20px，降低边缘判定难度）
  const etchPolygon = new Phaser.Geom.Polygon([
    { x: cx - 90, y: cy - 65 }, { x: cx + 90, y: cy - 65 },
    { x: cx + 110, y: cy + 50 }, { x: cx + 40, y: cy + 75 },
    { x: cx - 40, y: cy + 75 }, { x: cx - 110, y: cy + 50 }
  ]);
  
  // 2. 绘制更明显的彩色引导区（替代细虚线，视觉提示更强）
  const guideGfx = this.add.graphics();
  guideGfx.fillStyle(0xE1BEE7, 0.25); // 淡紫色半透明底色
  guideGfx.fillPoints(etchPolygon.points, true);
  guideGfx.lineStyle(3, 0xAB47BC, 0.6); // 加粗边框
  guideGfx.strokePoints(etchPolygon.points, true);
  this.objs.push(guideGfx);
  
  // 3. 涂抹层与状态
  const etchLayer = this.add.graphics();
  this.objs.push(etchLayer);
  let appliedPoints = [];
  const totalRequired = 25; // ✅ 降至25个点，约5-8秒即可完成
  
  // 4. 更大更可爱的刷子光标
  const brush = this.add.circle(0, 0, 18, 0xCE93D8, 0.7)
    .setStrokeStyle(3, 0x8E24AA)
    .setVisible(false);
  this.objs.push(brush);
  
  // 5. 简化交互：仅检测是否在区域内，不惩罚越界
  this.input.on('pointermove', (ptr) => {
    brush.setVisible(true).setPosition(ptr.x, ptr.y);
    if (!this.input.activePointer.isDown) return;
    
    // 宽松判定：只要在多边形内就记录，无额外警告
    if (!Phaser.Geom.Polygon.Contains(etchPolygon, ptr.x, ptr.y)) return;
    
    // 防重复采样（间距放宽至12px，减少所需滑动距离）
    const tooClose = appliedPoints.some(p => 
      Phaser.Math.Distance.Between(ptr.x, ptr.y, p.x, p.y) < 12
    );
    if (tooClose) return;
    
    appliedPoints.push({ x: ptr.x, y: ptr.y });
    etchLayer.fillStyle(0xCE93D8, 0.6);
    etchLayer.fillCircle(ptr.x, ptr.y, 14);
    
    // ✅ 实时进度条（替代文字百分比，更适合儿童）
    const pct = Math.min(1, appliedPoints.length / totalRequired);
    barFill.width = 200 * pct;
    
    // 每完成25%给一次鼓励
    if (appliedPoints.length === Math.round(totalRequired * 0.25) ||
        appliedPoints.length === Math.round(totalRequired * 0.5) ||
        appliedPoints.length === Math.round(totalRequired * 0.75)) {
      showToast('🌟 涂得真棒！继续加油~', true, 600);
    }
    
    if (pct >= 1) {
      startEtchTimer();
    }
  });
  
  this.input.on('pointerout', () => brush.setVisible(false));
  
  // 6. 添加进度条UI（位于牙齿上方）
  const barBg = this.add.rectangle(cx, 80, 200, 14, 0xF3E5F5).setOrigin(0.5);
  const barFill = this.add.rectangle(cx - 100, 80, 0, 14, 0xAB47BC).setOrigin(0, 0.5);
  this.objs.push(barBg, barFill);
  
  // 7. 简化计时器（无污染风险，固定等待）
  let timerStarted = false;
  const startEtchTimer = () => {
    if (timerStarted) return;
    timerStarted = true;
    brush.setVisible(false);
    showToast('⏱️ 魔法药水生效中...数到20就好啦！', true, 0);
    
    let sec = 20; // ✅ 恒牙酸蚀时间缩短至20秒（儿童配合度考量）
    const timer = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        sec--;
        // 倒计时可视化提示
        if (sec > 0 && sec % 5 === 0) {
          showToast(`还剩 ${sec} 秒哦~`, false, 800);
        }
        if (sec <= 0) {
          timer.destroy();
          showToast('✅ 酸蚀完成！牙齿准备好啦~', true);
          this.time.delayedCall(1000, () => this.next());
        }
      }
    });
    this.objs.push(timer);
  };
  
  showToast('👉 用手指把紫色区域涂满吧！', false, 0);
}
  // ==================== STEP 4: 再次吹干 ====================
 // ==================== STEP 4: 再次吹干 (修复版) ====================
buildDry() {
  const { cx, cy } = this.drawTooth();
  
  // 1. 牙面状态层（确保在按钮之前创建，避免z-index遮挡）
  const surface = this.add.rectangle(cx, cy, 200, 160, 0xFFFFFF, 0.6);
  this.objs.push(surface);

  let dryness = 0;
  let blowing = false; // ✅ 显式初始化，防止继承上一步状态

  // 2. ✅ 修复核心：使用 Zone 作为热区替代纯 Text 交互
  // 纯 Text 在某些移动端浏览器上 hitArea 计算不准
  const btnWidth = 220, btnHeight = 56;
  const btnX = cx, btnY = this.scale.height - 70;
  
  // 按钮背景
  const btnBg = this.add.rectangle(btnX, btnY, btnWidth, btnHeight, 0xFF9800, 1)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true }); // ✅ 交互绑定在矩形上
  
  // 按钮文字（仅显示，不参与交互判定）
  const btnText = this.add.text(btnX, btnY, '💨 按住吹干观察', {
    fontSize: '20px', color: '#fff', fontStyle: 'bold'
  }).setOrigin(0.5);
  
  this.objs.push(btnBg, btnText);

  // 3. ✅ 使用 pointerdown/up 而非 input.on 全局监听
  // 避免与其他步骤残留事件冲突
  btnBg.on('pointerdown', () => { 
    blowing = true; 
    btnBg.setFillStyle(0xF57C00); // 按下变深色，提供即时视觉反馈
    btnText.setText('💨 吹干中...');
  });
  
  const stopBlow = () => {
    blowing = false;
    btnBg.setFillStyle(0xFF9800); // 恢复原色
    btnText.setText('💨 按住吹干观察');
  };
  
  btnBg.on('pointerup', stopBlow);
  btnBg.on('pointerout', stopBlow);
  // ✅ 关键：添加 pointerleave 处理移动端滑出边界的情况
  btnBg.on('pointerleave', stopBlow); 

  // 4. 进度循环
  const timer = this.time.addEvent({
    delay: 50, loop: true,
    callback: () => {
      dryness = blowing ? Math.min(100, dryness + 2) : Math.max(0, dryness - 3);
      
      // 视觉反馈
      const alpha = 0.6 - (dryness / 100) * 0.5;
      surface.setAlpha(alpha);
      surface.fillColor = dryness > 80 ? 0xF5F5DC : 0xFFFFFF;

      if (dryness >= 95) {
        timer.destroy();
        showToast('✅ 白垩色哑光！酸蚀成功', true);
        this.time.delayedCall(1000, () => this.next());
      } else if (!blowing && dryness < 10 && dryness > 0) {
        // ✅ 降低提示频率，避免刷屏干扰操作
        if (Math.random() < 0.05) {
          showToast('⚠️ 牙面发亮=被口水污染，继续吹！', false, 1000);
        }
      }
    }
  });
  
  // ✅ 将timer存入objs，确保切步时销毁
  this.objs.push(timer);
  
  showToast('长按橙色按钮，观察牙面变哑光', false, 0);
}

 // ==================== STEP 5: 涂布封闭剂 + 光固化 (单击10s自动固化版) ====================
// buildSealCure() {
//   const { cx, cy } = this.drawTooth();
  
//   // 🔑 Y形五边形引导区
//   const groovePoints = [
//     { x: cx - 20, y: cy - 15 }, { x: cx + 20, y: cy - 15 },
//     { x: cx + 35, y: cy + 40 }, { x: cx - 10, y: cy + 60 },
//     { x: cx - 35, y: cy + 40 }
//   ];
  
//   const guideGfx = this.add.graphics();
//   const path = new Phaser.Curves.Path(groovePoints[0].x, groovePoints[0].y);
//   for (let i = 1; i < groovePoints.length; i++) path.lineTo(groovePoints[i].x, groovePoints[i].y);
//   path.closePath();
//   guideGfx.fillStyle(0x81D4FA, 0.25).fillPath(path);
//   guideGfx.lineStyle(3, 0x4FC3F7, 0.6).strokePath(path);
//   this.objs.push(guideGfx);

//   // 封闭剂涂抹层 & 刷子
//   const sealLayer = this.add.graphics();
//   this.objs.push(sealLayer);
//   const brush = this.add.ellipse(0, 0, 24, 12, 0xB3E5FC, 0.7)
//     .setStrokeStyle(2, 0x0288D1).setVisible(false);
//   this.objs.push(brush);

//   // ========== 阶段1：涂布五边形坑 (保留原有防秒过逻辑) ==========
//   let phase = 'paint';
//   let fillProgress = 0;
//   const TARGET_FILL = 40;
//   let lastFillTime = 0;
//   let lastFillPos = { x: -999, y: -999 };

//   this.input.on('pointermove', (ptr) => {
//     if (phase !== 'paint') return;
//     brush.setVisible(true).setPosition(ptr.x, ptr.y);
//     if (!this.input.activePointer.isDown) return;

//     const now = this.time.now;
//     if (now - lastFillTime < 80) return;
//     if (Phaser.Math.Distance.Between(ptr.x, ptr.y, lastFillPos.x, lastFillPos.y) < 8) return;

//     const inPolygon = Phaser.Geom.Polygon.Contains(
//       new Phaser.Geom.Polygon(groovePoints.map(p => ({ x: p.x, y: p.y }))), ptr.x, ptr.y
//     );
//     if (inPolygon || Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) < 55) {
//       fillProgress++;
//       sealLayer.fillStyle(0xB3E5FC, 0.75).fillCircle(ptr.x, ptr.y, 12);
//       lastFillTime = now;
//       lastFillPos = { x: ptr.x, y: ptr.y };
      
//       if (fillProgress >= TARGET_FILL) {
//         phase = 'check';
//         brush.setVisible(false);
//         showToast('✅ 主窝沟已填满！请点击下方按钮开始光固化', true, 0);
//         showCureBtn();
//       }
//     }
//   });
//   this.input.on('pointerout', () => brush.setVisible(false));

//   // ========== 阶段2：光固化 (单击触发 + 10s自动完成 + 颜色渐变) ==========
//   const showCureBtn = () => {
//     // 护目镜提示
//     const goggle = this.add.text(cx, cy - 80, '🕶️ 已佩戴护目镜', {
//       fontSize: '14px', color: '#F57F17', fontStyle: 'bold'
//     }).setOrigin(0.5);
//     this.objs.push(goggle);

//     // 静态光源装饰
//     const lightHead = this.add.circle(cx, cy - 130, 28, 0x2196F3, 0.8).setStrokeStyle(3, 0x0D47A1);
//     const lightBeam = this.add.triangle(cx, cy - 102, 0, 0, -20, 40, 20, 40, 0x64B5F6, 0.4);
//     this.objs.push(lightHead, lightBeam);

//     // 进度条UI
//     const barBg = this.add.rectangle(cx, cy + 120, 240, 16, 0xE0E0E0).setOrigin(0.5);
//     const barFill = this.add.rectangle(cx - 120, cy + 120, 0, 16, 0x2196F3).setOrigin(0, 0.5);
//     const barText = this.add.text(cx, cy + 120, '0%', {
//       fontSize: '12px', color: '#fff', fontStyle: 'bold'
//     }).setOrigin(0.5);
//     this.objs.push(barBg, barFill, barText);

//     // ✅ 核心修改：单击按钮，禁用后续交互
//     const cureBtn = this.add.text(cx, this.scale.height - 70, '💡 点击开始光固化（10秒）', {
//       fontSize: '20px', backgroundColor: '#1976D2', padding: { x: 20, y: 12 }, color: '#fff'
//     }).setOrigin(0.5).setDepth(999).setInteractive({ useHandCursor: true });
//     this.objs.push(cureBtn);

//     cureBtn.once('pointerdown', () => {
//       // 立即禁用按钮防止重复点击
//       cureBtn.disableInteractive();
//       cureBtn.setText('⏳ 固化中...请勿移动');
//       cureBtn.setBackgroundColor('#0D47A1');
      
//       // ✅ 基于时间戳的精确进度，杜绝99%卡死
//       const CURE_DURATION = 10000; // 10秒
//       const startTime = this.time.now;
      
//       const cureTimer = this.time.addEvent({
//         delay: 50, 
//         loop: true,
//         callback: () => {
//           const elapsed = this.time.now - startTime;
//           const progress = Math.min(1, elapsed / CURE_DURATION);
          
//           // 更新进度条
//           barFill.width = 240 * progress;
//           barText.setText(`${Math.floor(progress * 100)}%`);
          
//           // ✅ 颜色渐变：从淡蓝(0xB3E5FC) → 牙齿本色(0xF5F5DC 米黄)
//           // 使用Tween太复杂，这里用手动插值更可控
//           const r = Phaser.Math.Linear(0xB3, 0xF5, progress);
//           const g = Phaser.Math.Linear(0xE5, 0xF5, progress);
//           const b = Phaser.Math.Linear(0xFC, 0xDC, progress);
//           const curedColor = Phaser.Display.Color.GetColor(r, g, b);
          
//           // 重绘封闭剂层为当前固化颜色
//           sealLayer.clear();
//           sealLayer.fillStyle(curedColor, 0.85);
//           // 重新绘制所有已涂抹的点（简化：直接画一个覆盖多边形）
//           sealLayer.fillPoints(groovePoints, true);
          
//           // ✅ 严格判定完成
//           if (progress >= 1) {
//             cureTimer.destroy();
//             barFill.fillColor = 0x66BB6A;
//             barText.setText('100% ✅');
//             cureBtn.setText('✅ 固化完成！').setBackgroundColor('#4CAF50');
//             lightBeam.setFillStyle(0x66BB6A, 0.3);
            
//             showToast('🎉 光固化成功！封闭剂已与牙齿融为一体', true, 0);
//             this.time.delayedCall(1500, () => this.next());
//           }
//         }
//       });
//       this.objs.push(cureTimer);
//     });
//   };

//   showToast('👉 用手指填满中央Y形深坑（淡蓝五边形区）', false, 0);
// }
// ==================== STEP 5: 涂布封闭剂 + 光固化 (保留笔触 + 颜色渐变版) ====================
// ==================== STEP 5: 涂布封闭剂 + 光固化 (稳定涂抹 + Mesh变色版) ====================
buildSealCure() {
  const { cx, cy } = this.drawTooth();

  // 🔑 Y形五边形引导区
  const groovePoints = [
    { x: cx - 20, y: cy - 15 }, { x: cx + 20, y: cy - 15 },
    { x: cx + 35, y: cy + 40 }, { x: cx - 10, y: cy + 60 },
    { x: cx - 35, y: cy + 40 }
  ];

  const guideGfx = this.add.graphics();
  const path = new Phaser.Curves.Path(groovePoints[0].x, groovePoints[0].y);
  for (let i = 1; i < groovePoints.length; i++) path.lineTo(groovePoints[i].x, groovePoints[i].y);
  path.closePath();
  guideGfx.fillStyle(0x81D4FA, 0.25).fillPath(path);
  guideGfx.lineStyle(3, 0x4FC3F7, 0.6).strokePath(path);
  this.objs.push(guideGfx);

  // ✅ 回归最稳定的 Graphics 绘制，确保涂抹100%正常
  const sealLayer = this.add.graphics();
  this.objs.push(sealLayer);

  const brush = this.add.ellipse(0, 0, 24, 12, 0xB3E5FC, 0.7)
    .setStrokeStyle(2, 0x0288D1).setVisible(false);
  this.objs.push(brush);

  // ========== 阶段1：涂布（记录原始坐标）==========
  let phase = 'paint';
  const paintedPoints = []; // 存储所有涂抹点坐标
  let fillProgress = 0;
  const TARGET_FILL = 40;
  let lastFillTime = 0;
  let lastFillPos = { x: -999, y: -999 };

  // 重绘函数：将记录的点重新画到 Graphics 上
  const redrawSealant = (tintColor = 0xB3E5FC) => {
    sealLayer.clear();
    sealLayer.fillStyle(tintColor, 0.75);
    paintedPoints.forEach(p => {
      sealLayer.fillCircle(p.x, p.y, 12);
    });
  };

  this.input.on('pointermove', (ptr) => {
    if (phase !== 'paint') return;
    brush.setVisible(true).setPosition(ptr.x, ptr.y);
    if (!this.input.activePointer.isDown) return;

    const now = this.time.now;
    if (now - lastFillTime < 80) return;
    if (Phaser.Math.Distance.Between(ptr.x, ptr.y, lastFillPos.x, lastFillPos.y) < 8) return;

    const inPolygon = Phaser.Geom.Polygon.Contains(
      new Phaser.Geom.Polygon(groovePoints.map(p => ({ x: p.x, y: p.y }))), ptr.x, ptr.y
    );

    if (inPolygon || Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) < 55) {
      fillProgress++;
      paintedPoints.push({ x: ptr.x, y: ptr.y });
      redrawSealant(); // 每添加一个点就重绘，保留真实笔触

      lastFillTime = now;
      lastFillPos = { x: ptr.x, y: ptr.y };

      if (fillProgress >= TARGET_FILL) {
        phase = 'check';
        brush.setVisible(false);
        showToast('✅ 主窝沟已填满！请点击下方按钮开始光固化', true, 0);
        showCureBtn();
      }
    }
  });
  this.input.on('pointerout', () => brush.setVisible(false));

  // ========== 阶段2：光固化（Tween驱动颜色渐变，保留笔触形状）==========
  const showCureBtn = () => {
    const goggle = this.add.text(cx, cy - 80, '🕶️ 已佩戴护目镜', {
      fontSize: '14px', color: '#F57F17', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.objs.push(goggle);

    const lightHead = this.add.circle(cx, cy - 130, 28, 0x2196F3, 0.8).setStrokeStyle(3, 0x0D47A1);
    const lightBeam = this.add.triangle(cx, cy - 102, 0, 0, -20, 40, 20, 40, 0x64B5F6, 0.4);
    this.objs.push(lightHead, lightBeam);

    const barBg = this.add.rectangle(cx, cy + 120, 240, 16, 0xE0E0E0).setOrigin(0.5);
    const barFill = this.add.rectangle(cx - 120, cy + 120, 0, 16, 0x2196F3).setOrigin(0, 0.5);
    const barText = this.add.text(cx, cy + 120, '0%', {
      fontSize: '12px', color: '#fff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.objs.push(barBg, barFill, barText);

    const cureBtn = this.add.text(cx, this.scale.height - 70, '💡 点击开始光固化（10秒）', {
      fontSize: '20px', backgroundColor: '#1976D2', padding: { x: 20, y: 12 }, color: '#fff'
    }).setOrigin(0.5).setDepth(999).setInteractive({ useHandCursor: true });
    this.objs.push(cureBtn);

    cureBtn.once('pointerdown', () => {
      cureBtn.disableInteractive();
      cureBtn.setText('⏳ 固化中...请勿移动');
      cureBtn.setBackgroundColor('#0D47A1');

      // ✅ 核心：用 Tween 插值 RGB，每帧用新颜色重绘原始笔触
      // 这样既保留了用户涂抹的不规则边缘，又实现了平滑变色
      const startColor = { r: 0xB3, g: 0xE5, b: 0xFC }; // 淡蓝
      const endColor = { r: 0xF5, g: 0xF5, b: 0xDC };   // 牙齿象牙白

      this.tweens.add({
        targets: startColor,
        r: endColor.r,
        g: endColor.g,
        b: endColor.b,
        duration: 10000,
        ease: 'Linear',
        onUpdate: (tween) => {
          const c = tween.targets[0];
          const tintColor = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
          redrawSealant(tintColor); // 用当前插值颜色重绘所有笔触点

          const progress = tween.progress;
          barFill.width = 240 * progress;
          barText.setText(`${Math.floor(progress * 100)}%`);
        },
        onComplete: () => {
          barFill.width = 240;
          barFill.fillColor = 0x66BB6A;
          barText.setText('100% ✅');
          cureBtn.setText('✅ 固化完成！').setBackgroundColor('#4CAF50');
          lightBeam.setFillStyle(0x66BB6A, 0.3);

          showToast('🎉 光固化成功！封闭剂已与牙齿融为一体', true, 0);
          this.time.delayedCall(1500, () => this.next());
        }
      });
    });
  };

  showToast('👉 用手指填满中央Y形深坑（淡蓝五边形区）', false, 0);
}

  // buildSealCure() {
  //   const { cx, cy } = this.drawTooth();
    
  //   // 🔑 Y形五边形引导区
  //   const groovePoints = [
  //     { x: cx - 20, y: cy - 15 }, { x: cx + 20, y: cy - 15 },
  //     { x: cx + 35, y: cy + 40 }, { x: cx - 10, y: cy + 60 },
  //     { x: cx - 35, y: cy + 40 }
  //   ];
  //   const guideGfx = this.add.graphics();
  //   const path = new Phaser.Curves.Path(groovePoints[0].x, groovePoints[0].y);
  //   for (let i = 1; i < groovePoints.length; i++) path.lineTo(groovePoints[i].x, groovePoints[i].y);
  //   path.closePath();
  //   guideGfx.fillStyle(0x81D4FA, 0.25).fillPath(path);
  //   guideGfx.lineStyle(3, 0x4FC3F7, 0.6).strokePath(path);
  //   this.objs.push(guideGfx);

  //   // 封闭剂涂抹层 & 刷子
  //   const sealLayer = this.add.graphics();
  //   this.objs.push(sealLayer);
  //   const brush = this.add.ellipse(0, 0, 24, 12, 0xB3E5FC, 0.7)
  //     .setStrokeStyle(2, 0x0288D1).setVisible(false);
  //   this.objs.push(brush);

  //   // ========== 阶段1：涂布五边形坑 (防秒过) ==========
  //   let phase = 'paint';
  //   let fillProgress = 0;
  //   const TARGET_FILL = 40;
  //   let lastFillTime = 0;
  //   let lastFillPos = { x: -999, y: -999 };

  //   this.input.on('pointermove', (ptr) => {
  //     if (phase !== 'paint') return;
  //     brush.setVisible(true).setPosition(ptr.x, ptr.y);
  //     if (!this.input.activePointer.isDown) return;

  //     const now = this.time.now;
  //     if (now - lastFillTime < 80) return;
  //     if (Phaser.Math.Distance.Between(ptr.x, ptr.y, lastFillPos.x, lastFillPos.y) < 8) return;

  //     const inPolygon = Phaser.Geom.Polygon.Contains(
  //       new Phaser.Geom.Polygon(groovePoints.map(p => ({ x: p.x, y: p.y }))), ptr.x, ptr.y
  //     );
  //     if (inPolygon || Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) < 55) {
  //       fillProgress++;
  //       sealLayer.fillStyle(0xB3E5FC, 0.75).fillCircle(ptr.x, ptr.y, 12);
  //       lastFillTime = now;
  //       lastFillPos = { x: ptr.x, y: ptr.y };
  //       if (fillProgress >= TARGET_FILL) {
  //         phase = 'check';
  //         brush.setVisible(false).disableInteractive();
  //         sealLayer.disableInteractive();
  //         guideGfx.disableInteractive();
  //         this.input.enabled = true;
  //         showToast('✅ 主窝沟已填满！请确认后进入光固化', true, 0);
  //         showCheckBtn();
  //       }
  //     }
  //   });
  //   this.input.on('pointerout', () => brush.setVisible(false));

  //   const showCheckBtn = () => {
  //     const btn = this.add.text(cx, this.scale.height - 120, '🔍 确认无气泡，进入光固化', {
  //       fontSize: '18px', backgroundColor: '#4CAF50', padding: { x: 16, y: 8 }, color: '#fff'
  //     }).setOrigin(0.5).setDepth(999).setInteractive({ useHandCursor: true });
  //     this.objs.push(btn);
  //     btn.on('pointerdown', () => { btn.destroy(); startCurePhase(); });
  //   };

  //   // ========== 阶段2：光固化 (15秒长按极简版) ==========
  //   const startCurePhase = () => {
  //     phase = 'cure';
  //     sealLayer.setAlpha(0.9);

  //     // 护目镜提示
  //     const goggle = this.add.text(cx, cy - 80, '🕶️ 已佩戴护目镜', {
  //       fontSize: '14px', color: '#F57F17', fontStyle: 'bold'
  //     }).setOrigin(0.5);
  //     this.objs.push(goggle);

  //     // 静态光源装饰（无需拖拽）
  //     const lightHead = this.add.circle(cx, cy - 130, 28, 0x2196F3, 0.8).setStrokeStyle(3, 0x0D47A1);
  //     const lightBeam = this.add.triangle(cx, cy - 102, 0, 0, -20, 40, 20, 40, 0x64B5F6, 0.4);
  //     this.objs.push(lightHead, lightBeam);

  //     // 进度条
  //     const barBg = this.add.rectangle(cx, cy + 120, 240, 16, 0xE0E0E0).setOrigin(0.5);
  //     const barFill = this.add.rectangle(cx - 120, cy + 120, 0, 16, 0x2196F3).setOrigin(0, 0.5);
  //     const barText = this.add.text(cx, cy + 120, '0%', {
  //       fontSize: '12px', color: '#fff', fontStyle: 'bold'
  //     }).setOrigin(0.5);
  //     this.objs.push(barBg, barFill, barText);

  //     // ✅ 核心：15秒 = 15000ms，每50ms累加 100/300 ≈ 0.333
  //     let cureProgress = 0;
  //     let curing = false;
  //     let cureCompleted = false;
  //     const TOTAL_MS = 15000;
  //     const TICK_MS = 50;
  //     const INCREMENT = 100 / (TOTAL_MS / TICK_MS);

  //     const cureBtn = this.add.text(cx, this.scale.height - 70, '💡 按住此按钮照射15秒', {
  //       fontSize: '20px', backgroundColor: '#1976D2', padding: { x: 20, y: 12 }, color: '#fff'
  //     }).setOrigin(0.5).setDepth(999).setInteractive({ useHandCursor: true });
  //     this.objs.push(cureBtn);

  //     cureBtn.on('pointerdown', () => {
  //       if (cureCompleted) return;
  //       curing = true;
  //       cureBtn.setText('💡 照射中...请勿松手');
  //     });
  //     const stopCure = () => {
  //       curing = false;
  //       if (!cureCompleted) cureBtn.setText('💡 按住此按钮照射15秒');
  //     };
  //     cureBtn.on('pointerup', stopCure);
  //     cureBtn.on('pointerout', stopCure);
  //     cureBtn.on('pointerleave', stopCure);

  //     const cureTimer = this.time.addEvent({
  //       delay: TICK_MS, loop: true,
  //       callback: () => {
  //         if (!curing || cureCompleted) return;
  //         cureProgress = Math.min(100, cureProgress + INCREMENT);

  //         // 更新UI
  //         barFill.width = 240 * (cureProgress / 100);
  //         barText.setText(`${Math.floor(cureProgress)}%`);
  //         sealLayer.setAlpha(0.9 - (cureProgress / 120));

  //         // ✅ 完成
  //         if (cureProgress >= 100) {
  //           cureCompleted = true;
  //           curing = false;
  //           cureTimer.destroy();
  //           sealLayer.setAlpha(0.4).setTint(0xE0F7FA);
  //           lightBeam.setFillStyle(0x66BB6A, 0.3);
  //           barFill.fillColor = 0x66BB6A;
  //           barText.setText('100% ✅');
  //           cureBtn.setText('✅ 固化完成！').setBackgroundColor('#4CAF50');
  //           showToast('🎉 光固化成功！封闭剂已完全硬化', true, 0);
  //           this.time.delayedCall(1500, () => this.next());
  //         }
  //       }
  //     });
  //     this.objs.push(cureTimer);
  //     showToast('👉 持续按住下方蓝色按钮15秒完成固化', false, 0);
  //   };

  //   showToast('👉 用手指填满中央Y形深坑（淡蓝五边形区）', false, 0);
  // }


  
// 简化光固化（仅需确认覆盖主坑）
startCure() {
  const { cx, cy } = this.drawTooth();
  
  // 光束覆盖主坑即完成
  const beam = this.add.rectangle(cx, cy, 120, 100, 0x64B5F6, 0.2)
    .setOrigin(0.5);
  this.objs.push(beam);

  showToast('💡 移动光束覆盖蓝色区域，照射20秒...', true);
  
  this.time.delayedCall(2000, () => {
    beam.destroy();
    showToast('🎉 封闭成功！中央窝沟已完美填充', true);
    this.time.delayedCall(1000, () => this.next());
  });
}
}

onMounted(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameContainer.value,
    width: 480, height: 640,
    backgroundColor: '#E0F7FA',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [SealantScene],
  });
});

onBeforeUnmount(() => { game?.destroy(true); });
</script>

<style scoped>
.game-wrapper {
  position: relative;
  width: 100%; max-width: 480px;
  aspect-ratio: 3/4;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  background: #E0F7FA;
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none; /* 防止移动端滑动穿透 */
}
.canvas { width: 100%; height: 100%; }
.ui-layer {
  position: absolute; inset: 0;
  pointer-events: none;
  display: flex; flex-direction: column; align-items: center;
  padding-top: 12px;
}
.step-tag {
  background: rgba(255,255,255,0.92);
  padding: 6px 18px; border-radius: 20px;
  font-size: 14px; font-weight: bold; color: #01579B;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.toast {
  margin-top: 10px;
  padding: 8px 20px; border-radius: 12px;
  font-size: 13px; color: #fff;
  background: rgba(0,0,0,0.7);
  transition: all 0.3s;
}
.toast.success { background: rgba(76,175,80,0.9); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>