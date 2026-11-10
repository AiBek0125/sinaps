// Модуль рендера и анимации 3D-мультяшного робота «Синапс»
// Построен на однократно собираемых SVG-градиентах, CSS cubic-bezier и оптимизированном rAF (~30 fps)

export class SynapseAvatar {
  constructor(container, { state = 'sleep', subject = 'biology' } = {}) {
    this.container = container;
    this.state = state;
    this.subject = subject;
    this.amplitude = 0;

    // Параметры плавной физики анимаций
    this._rafId = null;
    this._lastFrame = 0;
    this._paused = typeof document !== 'undefined' ? document.hidden : false;
    this._startTime = performance.now();

    // Саккады и повороты головы (текущие и целевые значения для плавного lerp)
    this._eyeX = 0;
    this._eyeY = 0;
    this._targetEyeX = 0;
    this._targetEyeY = 0;
    this._nextSaccadeAt = 800;

    this._headTurn = 0;
    this._targetHeadTurn = 0;
    this._nextHeadTurnAt = 4000;

    this._voiceImpulse = 0;
    this._soundBalance = 0;   // направление последнего звука: -1 слева … +1 справа
    this._antennaSwing = 0;

    // Моргание (2–7 сек, 20% двойных)
    this._blinkAmount = 0; // 0 = открыт, 1 = закрыт
    this._blinkPhase = 'idle'; // idle | closing | opening
    this._doubleBlinkPending = false;
    this._nextBlinkAt = 2400;

    // Ссылки на DOM-узлы SVG (собираются один раз)
    this.els = {};
    this._buildSvgOnce();
    this._applySubjectBadge();
    this._applyStateVisuals();

    this._onVisibilityChange = () => {
      this._paused = document.hidden;
      if (!this._paused) {
        this._lastFrame = performance.now();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    this.start();
  }

  // Однократная сборка всего SVG и всех градиентов/фильтров при загрузке
  _buildSvgOnce() {
    if (!this.container) return;
    const uid = Math.random().toString(36).slice(2, 7);

    this.container.innerHTML = `
      <div class="synapse-avatar-wrap" style="position:relative;width:100%;max-width:250px;margin:0 auto;user-select:none;">
        <svg viewBox="0 0 240 270" width="100%" height="100%" style="overflow:visible;display:block;" role="img" aria-label="Робот Синапс">
          <defs>
            <!-- Мягкое фоновое свечение за роботом -->
            <radialGradient id="bgGlow-${uid}" cx="50%" cy="48%" r="50%">
              <stop offset="0%" stop-color="#9e8cff" stop-opacity="0.30"/>
              <stop offset="55%" stop-color="#7ef9e0" stop-opacity="0.10"/>
              <stop offset="100%" stop-color="#1b1730" stop-opacity="0"/>
            </radialGradient>

            <!-- 3D-градиент молочно-сиреневого корпуса -->
            <linearGradient id="bodyGrad-${uid}" x1="20%" y1="5%" x2="85%" y2="95%">
              <stop offset="0%" stop-color="#faf7ff"/>
              <stop offset="48%" stop-color="#f2ecfb"/>
              <stop offset="100%" stop-color="#dfd5f0"/>
            </linearGradient>

            <!-- 3D-объём космо-шлема (головы) -->
            <radialGradient id="helmetGrad-${uid}" cx="36%" cy="28%" r="72%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="38%" stop-color="#f5f1fa"/>
              <stop offset="82%" stop-color="#e6dff2"/>
              <stop offset="100%" stop-color="#cfc4e6"/>
            </radialGradient>

            <!-- Экран лица: глубокий тёплый синий -->
            <linearGradient id="screenGrad-${uid}" x1="15%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stop-color="#35345c"/>
              <stop offset="60%" stop-color="#2b2a4a"/>
              <stop offset="100%" stop-color="#201f3a"/>
            </linearGradient>

            <!-- Блик стекла космо-шлема -->
            <linearGradient id="visorShine-${uid}" x1="0%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
              <stop offset="45%" stop-color="#ffffff" stop-opacity="0.04"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
            </linearGradient>

            <!-- Светящиеся мятно-голубые глаза -->
            <radialGradient id="eyeGrad-${uid}" cx="42%" cy="38%" r="60%">
              <stop offset="0%" stop-color="#b8fff1"/>
              <stop offset="55%" stop-color="#7ef9e0"/>
              <stop offset="100%" stop-color="#39d2d6"/>
            </radialGradient>

            <!-- Золотистая антенна -->
            <radialGradient id="antennaBulb-${uid}" cx="38%" cy="32%" r="65%">
              <stop offset="0%" stop-color="#fff8d6"/>
              <stop offset="55%" stop-color="#ffd27f"/>
              <stop offset="100%" stop-color="#f0a83e"/>
            </radialGradient>

            <!-- Мягкая тень-эллипс под роботом -->
            <radialGradient id="shadowGrad-${uid}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#0b0918" stop-opacity="0.55"/>
              <stop offset="65%" stop-color="#141126" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#141126" stop-opacity="0"/>
            </radialGradient>

            <!-- Мягкое свечение для глаз и огонька антенны -->
            <filter id="softGlow-${uid}" x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="3.2" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Фоновый ореол -->
          <circle cx="120" cy="128" r="112" fill="url(#bgGlow-${uid})" />

          <!-- Облачко-тень под парящим телом -->
          <ellipse class="av-shadow" cx="120" cy="248" rx="54" ry="12" fill="url(#shadowGrad-${uid})" />

          <!-- Основная группа дыхания и парения -->
          <g class="av-float" style="transform-origin:120px 150px;">

            <!-- Маленькое тельце (без ног) -->
            <g class="av-torso" style="transform-origin:120px 198px;">
              <!-- Левая ручка -->
              <g class="av-arm-left" style="transform-origin:78px 185px;transition:transform 0.45s cubic-bezier(0.34,1.56,0.64,1);">
                <ellipse cx="67" cy="196" rx="12" ry="19" transform="rotate(20 67 196)" fill="url(#bodyGrad-${uid})"/>
              </g>

              <!-- Правая ручка (делает жест-указание в состоянии show) -->
              <g class="av-arm-right" style="transform-origin:162px 185px;transition:transform 0.48s cubic-bezier(0.34,1.56,0.64,1);">
                <ellipse cx="173" cy="196" rx="12" ry="19" transform="rotate(-20 173 196)" fill="url(#bodyGrad-${uid})"/>
              </g>

              <!-- Округлый торс -->
              <rect x="82" y="166" width="76" height="58" rx="36" fill="url(#bodyGrad-${uid})" />
              <!-- Светящийся сердечник-индикатор на груди -->
              <circle class="av-core" cx="120" cy="197" r="9" fill="#7ef9e0" opacity="0.72" filter="url(#softGlow-${uid})" />
              <circle cx="118" cy="195" r="3" fill="#ffffff" opacity="0.85" />
            </g>

            <!-- Большая круглая голова-космошлем (~60% высоты фигуры) -->
            <g class="av-head" style="transform-origin:120px 115px;">
              <!-- Антенна с золотистым огоньком -->
              <g class="av-antenna" style="transform-origin:120px 44px;">
                <rect x="116" y="20" width="8" height="24" rx="4" fill="#d9cef0"/>
                <circle class="av-bulb-halo" cx="120" cy="16" r="16" fill="#ffd27f" opacity="0.22" />
                <circle class="av-bulb" cx="120" cy="16" r="10.5" fill="url(#antennaBulb-${uid})" filter="url(#softGlow-${uid})"/>
                <circle cx="117" cy="13" r="3" fill="#ffffff" opacity="0.88"/>
              </g>

              <!-- Внешний мягкий корпус шлема -->
              <rect x="34" y="40" width="172" height="134" rx="64" fill="url(#helmetGrad-${uid})" />
              <!-- Маленькие мягкие "ушки"-наушники по бокам шлема -->
              <rect x="27" y="92" width="12" height="34" rx="6" fill="#dcd3ee"/>
              <rect x="201" y="92" width="12" height="34" rx="6" fill="#dcd3ee"/>

              <!-- Тёмный синий экран лица -->
              <rect x="52" y="56" width="136" height="102" rx="49" fill="url(#screenGrad-${uid})" />

              <!-- Розовые щёчки-румянец -->
              <ellipse class="av-cheek-l" cx="75" cy="122" rx="12" ry="6.5" fill="#ffb3c1" opacity="0.65" />
              <ellipse class="av-cheek-r" cx="165" cy="122" rx="12" ry="6.5" fill="#ffb3c1" opacity="0.65" />

              <!-- Группа взгляда (саккады и отслеживание звука) -->
              <g class="av-face-gaze" style="transform-origin:120px 104px;">
                <!-- Обычные светящиеся глаза с бликами -->
                <g class="av-eyes-open" filter="url(#softGlow-${uid})">
                  <g class="av-eye-left" style="transform-origin:92px 102px;">
                    <ellipse cx="92" cy="102" rx="14.5" ry="16" fill="url(#eyeGrad-${uid})" />
                    <circle cx="87" cy="95" r="4.5" fill="#ffffff" />
                    <circle cx="96" cy="107" r="2" fill="#ffffff" opacity="0.7" />
                  </g>
                  <g class="av-eye-right" style="transform-origin:148px 102px;">
                    <ellipse cx="148" cy="102" rx="14.5" ry="16" fill="url(#eyeGrad-${uid})" />
                    <circle cx="143" cy="95" r="4.5" fill="#ffffff" />
                    <circle cx="152" cy="107" r="2" fill="#ffffff" opacity="0.7" />
                  </g>
                </g>

                <!-- Глаза-полумесяцы для состояния sleep -->
                <g class="av-eyes-sleep" style="opacity:0;transition:opacity 0.35s ease;" filter="url(#softGlow-${uid})">
                  <path d="M 79 104 Q 92 114 105 104" fill="none" stroke="#7ef9e0" stroke-width="5" stroke-linecap="round"/>
                  <path d="M 135 104 Q 148 114 161 104" fill="none" stroke="#7ef9e0" stroke-width="5" stroke-linecap="round"/>
                </g>

                <!-- Глаза-звёздочки для состояния show -->
                <g class="av-eyes-star" style="opacity:0;transition:opacity 0.3s ease;" filter="url(#softGlow-${uid})">
                  <path d="M 92 86 L 96 97 L 107 101 L 96 105 L 92 116 L 88 105 L 77 101 L 88 97 Z" fill="#ffd27f"/>
                  <circle cx="92" cy="101" r="3" fill="#ffffff"/>
                  <path d="M 148 86 L 152 97 L 163 101 L 152 105 L 148 116 L 144 105 L 133 101 L 144 97 Z" fill="#ffd27f"/>
                  <circle cx="148" cy="101" r="3" fill="#ffffff"/>
                </g>

                <!-- Дуга-улыбка (динамически меняется в talk) -->
                <path class="av-mouth" d="M 105 126 Q 120 137 135 126" fill="none" stroke="#7ef9e0" stroke-width="5" stroke-linecap="round" filter="url(#softGlow-${uid})" />
              </g>

              <!-- Лёгкий стеклянный блик поверх экрана -->
              <path d="M 65 72 Q 112 56 168 74 Q 134 84 82 94 Z" fill="url(#visorShine-${uid})" pointer-events="none"/>
            </g>

            <!-- Бейдж предмета у головы (правый верхний угол шлема) -->
            <g class="av-subject-badge" transform="translate(186, 48)" style="transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);">
              <circle cx="0" cy="0" r="19" fill="#2b2449" stroke="#7ef9e0" stroke-opacity="0.45" stroke-width="2" />
              <g class="av-badge-icon"></g>
            </g>
          </g>

          <!-- Частицы Zzz для сна -->
          <g class="av-zzz" style="opacity:0;transition:opacity 0.4s ease;">
            <text class="av-z1" x="176" y="46" fill="#b7adff" font-size="15" font-weight="700" font-family="system-ui, sans-serif">Z</text>
            <text class="av-z2" x="191" y="31" fill="#7ef9e0" font-size="12" font-weight="700" font-family="system-ui, sans-serif">z</text>
            <text class="av-z3" x="203" y="19" fill="#ffd27f" font-size="10" font-weight="700" font-family="system-ui, sans-serif">z</text>
          </g>

          <!-- Точки-мысли для состояния think -->
          <g class="av-thoughts" style="opacity:0;transition:opacity 0.35s ease;">
            <circle class="av-th1" cx="176" cy="40" r="4" fill="#a99bff"/>
            <circle class="av-th2" cx="190" cy="28" r="5.5" fill="#7ef9e0"/>
            <circle class="av-th3" cx="206" cy="16" r="7" fill="#ffd27f"/>
          </g>
        </svg>
      </div>
    `;

    const q = (sel) => this.container.querySelector(sel);
    this.els = {
      float: q('.av-float'),
      shadow: q('.av-shadow'),
      torso: q('.av-torso'),
      head: q('.av-head'),
      antenna: q('.av-antenna'),
      bulb: q('.av-bulb'),
      bulbHalo: q('.av-bulb-halo'),
      armLeft: q('.av-arm-left'),
      armRight: q('.av-arm-right'),
      core: q('.av-core'),
      gaze: q('.av-face-gaze'),
      eyesOpen: q('.av-eyes-open'),
      eyeLeft: q('.av-eye-left'),
      eyeRight: q('.av-eye-right'),
      eyesSleep: q('.av-eyes-sleep'),
      eyesStar: q('.av-eyes-star'),
      mouth: q('.av-mouth'),
      zzz: q('.av-zzz'),
      z1: q('.av-z1'),
      z2: q('.av-z2'),
      z3: q('.av-z3'),
      thoughts: q('.av-thoughts'),
      th1: q('.av-th1'),
      th2: q('.av-th2'),
      th3: q('.av-th3'),
      badgeWrap: q('.av-subject-badge'),
      badgeIcon: q('.av-badge-icon')
    };
  }

  // Смена состояния аватара: sleep | listen | think | talk | show
  setState(nextState) {
    if (!nextState || this.state === nextState) return;
    this.state = nextState;
    this._applyStateVisuals();
  }

  // Смена предмета: biology | physics | chemistry | history
  setSubject(subjectId) {
    if (!subjectId || this.subject === subjectId) return;
    this.subject = subjectId;
    this._applySubjectBadge();
  }

  // Передача амплитуды речи (0..1) для плавной анимации улыбки в состоянии talk
  setVoiceAmplitude(amp) {
    this.amplitude = Math.max(0, Math.min(1, Number(amp) || 0));
  }

  // Реакция на голос/микрофон — поворачивает голову и зрачки к источнику звука и качает антенну
  reactToVoice(direction = 1) {
    this._voiceImpulse = 1;
    this._targetHeadTurn = direction * 6.5;
    this._targetEyeX = direction * 5.2;
    this._targetEyeY = 1.2;
  }

  // Поворот к источнику звука: balance от -1 (слева) до +1 (справа), 0 — по центру.
  // Вызывается сразу после стоп-слова; в состоянии listen голова и взгляд удерживаются на этом направлении.
  turnToSound(balance = 0) {
    this._soundBalance = Math.max(-1, Math.min(1, Number(balance) || 0));
    this._voiceImpulse = 1;
    this._targetHeadTurn = this._soundBalance * 13;
    this._targetEyeX = this._soundBalance * 6;
    this._targetEyeY = -1;
  }

  _applySubjectBadge() {
    if (!this.els.badgeIcon) return;
    const icons = {
      biology: `
        <path d="M -7 7 C -8 -3, 0 -9, 9 -8 C 8 2, 2 8, -7 7 Z" fill="#7ef9e0"/>
        <path d="M -7 7 Q 1 0 7 -6" fill="none" stroke="#1d3540" stroke-width="1.6" stroke-linecap="round"/>
      `,
      chemistry: `
        <path d="M -3 -8 L 3 -8 L 3 -3 L 8 6 C 9 8, 7 9, 5 9 L -5 9 C -7 9, -9 8, -8 6 L -3 -3 Z" fill="#c08cff" opacity="0.9"/>
        <path d="M -6 4 L 6 4 L 7 7 L -7 7 Z" fill="#7ef9e0"/>
        <circle cx="0" cy="1" r="1.4" fill="#ffffff"/>
      `,
      physics: `
        <ellipse cx="0" cy="0" rx="10" ry="4" transform="rotate(35)" fill="none" stroke="#8cb8ff" stroke-width="1.7"/>
        <ellipse cx="0" cy="0" rx="10" ry="4" transform="rotate(-35)" fill="none" stroke="#7ef9e0" stroke-width="1.7"/>
        <circle cx="0" cy="0" r="2.6" fill="#ffd27f"/>
      `,
      history: `
        <rect x="-7" y="-7" width="14" height="14" rx="3" fill="#ffd27f"/>
        <path d="M -4 -3 L 4 -3 M -4 1 L 4 1 M -4 5 L 1 5" stroke="#2b2449" stroke-width="1.8" stroke-linecap="round"/>
      `
    };
    this.els.badgeIcon.innerHTML = icons[this.subject] || icons.biology;
  }

  _applyStateVisuals() {
    const { eyesOpen, eyesSleep, eyesStar, zzz, thoughts, armRight, armLeft } = this.els;
    if (!eyesOpen) return;

    const isSleep = this.state === 'sleep';
    const isShow = this.state === 'show';
    const isThink = this.state === 'think';
    const isListen = this.state === 'listen';

    eyesOpen.style.opacity = isSleep || isShow ? '0' : '1';
    eyesSleep.style.opacity = isSleep ? '1' : '0';
    eyesStar.style.opacity = isShow ? '1' : '0';

    zzz.style.opacity = isSleep ? '1' : '0';
    thoughts.style.opacity = isThink ? '1' : '0';

    // Жест-указание правой рукой вправо в состоянии show
    if (isShow) {
      armRight.style.transform = 'rotate(-58deg) translate(10px, -10px)';
      armLeft.style.transform = 'rotate(8deg)';
    } else if (isListen) {
      armRight.style.transform = 'rotate(-10deg) translateY(-3px)';
      armLeft.style.transform = 'rotate(10deg) translateY(-3px)';
    } else {
      armRight.style.transform = 'rotate(0deg)';
      armLeft.style.transform = 'rotate(0deg)';
    }

    // Куда направить взгляд при переходе состояния
    if (isThink) {
      this._targetEyeX = -6;
      this._targetEyeY = -6;
      this._targetHeadTurn = -5;
    } else if (isListen) {
      // Слушаем: голова и взгляд повёрнуты к источнику звука
      this._targetEyeX = this._soundBalance * 6;
      this._targetEyeY = -1;
      this._targetHeadTurn = this._soundBalance * 13 + 2;
    } else if (isShow) {
      this._targetEyeX = 5;
      this._targetEyeY = 0;
      this._targetHeadTurn = 6;
    }
  }

  start() {
    if (this._rafId !== null) return;
    const tick = (now) => {
      this._rafId = requestAnimationFrame(tick);
      if (this._paused) return;

      // Throttle кадров до ~30 fps (~33ms) для минимальной нагрузки на CPU
      if (now - this._lastFrame < 32) return;
      const dt = Math.min(100, now - this._lastFrame || 33);
      this._lastFrame = now;

      this._animateFrame(now, dt);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  _animateFrame(now, dt) {
    const t = (now - this._startTime) / 1000;
    const lerpFactor = Math.min(1, dt / 150);

    // 1. Дыхание: плавная синусоида (scale ±1.5%, y ±2px, в sleep медленнее)
    const breathSpeed = this.state === 'sleep' ? 1.15 : this.state === 'talk' ? 3.0 : 1.9;
    const breathSin = Math.sin(t * breathSpeed);
    const breathScale = 1 + breathSin * 0.015;
    const floatY = breathSin * 2.2 + (this.state === 'talk' ? -Math.abs(Math.sin(t * 7.5)) * (2.5 * this.amplitude) : 0);

    if (this.els.float) {
      this.els.float.style.transform = `translateY(${floatY.toFixed(2)}px) scale(${breathScale.toFixed(4)})`;
    }
    if (this.els.shadow) {
      const shScale = 1 - breathSin * 0.04;
      this.els.shadow.style.transform = `scale(${shScale.toFixed(3)})`;
      this.els.shadow.style.transformOrigin = '120px 248px';
    }

    // 2. Моргание: каждые 2–7 сек, 20% вероятность двойного моргания
    if (this.state !== 'sleep' && this.state !== 'show') {
      if (this._blinkPhase === 'idle' && now >= this._nextBlinkAt) {
        this._blinkPhase = 'closing';
        this._doubleBlinkPending = Math.random() < 0.2;
      }

      if (this._blinkPhase === 'closing') {
        this._blinkAmount = Math.min(1, this._blinkAmount + dt / 75);
        if (this._blinkAmount >= 1) this._blinkPhase = 'opening';
      } else if (this._blinkPhase === 'opening') {
        this._blinkAmount = Math.max(0, this._blinkAmount - dt / 100);
        if (this._blinkAmount <= 0) {
          if (this._doubleBlinkPending) {
            this._doubleBlinkPending = false;
            this._blinkPhase = 'closing';
          } else {
            this._blinkPhase = 'idle';
            this._nextBlinkAt = now + 2000 + Math.random() * 5000;
          }
        }
      }

      const listenWide = this.state === 'listen' ? 1.12 : 1.0;
      const eyeScaleY = Math.max(0.08, (1 - this._blinkAmount * 0.92) * listenWide);
      const eyeScaleX = this.state === 'listen' ? 1.06 : 1.0;
      if (this.els.eyeLeft && this.els.eyeRight) {
        this.els.eyeLeft.style.transform = `scale(${eyeScaleX}, ${eyeScaleY.toFixed(3)})`;
        this.els.eyeRight.style.transform = `scale(${eyeScaleX}, ${eyeScaleY.toFixed(3)})`;
      }
    }

    // 3. Саккады зрачков каждые 0.3–1.5 сек (плавное скольжение через lerp)
    if (now >= this._nextSaccadeAt) {
      this._nextSaccadeAt = now + 350 + Math.random() * 1150;
      if (this.state === 'listen') {
        // Взгляд удерживается на источнике звука с лёгким «вниманием»
        this._targetEyeX = this._soundBalance * 6 + (Math.random() - 0.5) * 1.2;
        this._targetEyeY = -1 + (Math.random() - 0.5) * 0.8;
      } else if (this.state === 'think') {
        this._targetEyeX = -6 + (Math.random() - 0.5) * 2.5;
        this._targetEyeY = -6 + (Math.random() - 0.5) * 2;
      } else if (this.state === 'show') {
        this._targetEyeX = 5 + Math.random() * 2;
        this._targetEyeY = (Math.random() - 0.5) * 2;
      } else if (this.state === 'sleep') {
        this._targetEyeX = 0;
        this._targetEyeY = 2;
      } else {
        this._targetEyeX = (Math.random() - 0.5) * 8;
        this._targetEyeY = (Math.random() - 0.5) * 4.5;
      }
    }

    this._eyeX += (this._targetEyeX - this._eyeX) * lerpFactor * 0.9;
    this._eyeY += (this._targetEyeY - this._eyeY) * lerpFactor * 0.9;

    // 4. Поворот головы по сторонам каждые 5–15 сек
    // В состоянии listen голова держится на источнике звука и не уходит на случайный поворот
    if (this.state === 'listen') {
      this._targetHeadTurn = this._soundBalance * 13 + 2;
    } else if (now >= this._nextHeadTurnAt) {
      this._nextHeadTurnAt = now + 5000 + Math.random() * 10000;
      if (this.state === 'sleep') {
        this._targetHeadTurn = -2.5;
      } else if (this.state === 'think') {
        this._targetHeadTurn = -5;
      } else if (this.state === 'show') {
        this._targetHeadTurn = 6;
      } else {
        this._targetHeadTurn = (Math.random() - 0.5) * 9;
      }
    }

    this._headTurn += (this._targetHeadTurn - this._headTurn) * (lerpFactor * 0.35);
    this._voiceImpulse = Math.max(0, this._voiceImpulse - dt / 900);

    const headTilt = this._headTurn + (this.state === 'listen' ? 4 : 0);
    if (this.els.head) {
      this.els.head.style.transform = `rotate(${headTilt.toFixed(2)}deg)`;
    }
    if (this.els.gaze) {
      this.els.gaze.style.transform = `translate(${this._eyeX.toFixed(2)}px, ${this._eyeY.toFixed(2)}px)`;
    }

    // 5. Антенна и огонёк по состояниям
    this._antennaSwing =
      Math.sin(t * 2.4) * 3 + Math.sin(t * 9) * (this._voiceImpulse * 8);
    if (this.els.antenna) {
      this.els.antenna.style.transform = `rotate(${this._antennaSwing.toFixed(2)}deg)`;
    }

    if (this.els.bulb && this.els.bulbHalo) {
      let pulse = 0.22;
      if (this.state === 'listen') {
        pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5.2));
      } else if (this.state === 'think') {
        pulse = 0.2 + 0.65 * (0.5 + 0.5 * Math.sin(t * 11));
      } else if (this.state === 'talk' || this.state === 'show') {
        pulse = 0.48 + 0.25 * Math.sin(t * 4);
      }
      this.els.bulbHalo.setAttribute('opacity', pulse.toFixed(2));
      const bulbScale = 1 + pulse * 0.25;
      this.els.bulbHalo.setAttribute('r', (14 * bulbScale).toFixed(1));
    }

    // 6. Рот-дуга (в talk анимируется по амплитуде голоса)
    if (this.els.mouth) {
      if (this.state === 'sleep') {
        this.els.mouth.setAttribute('d', 'M 111 128 Q 120 132 129 128');
      } else if (this.state === 'think') {
        this.els.mouth.setAttribute('d', 'M 110 128 Q 120 125 130 128');
      } else if (this.state === 'talk') {
        const open = 4 + this.amplitude * 12;
        this.els.mouth.setAttribute(
          'd',
          `M 104 125 Q 120 ${(128 + open).toFixed(1)} 136 125`
        );
      } else if (this.state === 'show') {
        this.els.mouth.setAttribute('d', 'M 102 124 Q 120 140 138 124');
      } else {
        this.els.mouth.setAttribute('d', 'M 105 126 Q 120 137 135 126');
      }
    }

    // 7. Всплывающие частицы Zzz (sleep) и мысли (think)
    if (this.state === 'sleep' && this.els.z1) {
      const p1 = (t * 0.45) % 1;
      const p2 = (t * 0.45 + 0.33) % 1;
      const p3 = (t * 0.45 + 0.66) % 1;
      this.els.z1.setAttribute('transform', `translate(0, ${(-p1 * 18).toFixed(1)})`);
      this.els.z1.setAttribute('opacity', (Math.sin(p1 * Math.PI)).toFixed(2));
      this.els.z2.setAttribute('transform', `translate(0, ${(-p2 * 18).toFixed(1)})`);
      this.els.z2.setAttribute('opacity', (Math.sin(p2 * Math.PI)).toFixed(2));
      this.els.z3.setAttribute('transform', `translate(0, ${(-p3 * 18).toFixed(1)})`);
      this.els.z3.setAttribute('opacity', (Math.sin(p3 * Math.PI)).toFixed(2));
    }

    if (this.state === 'think' && this.els.th1) {
      this.els.th1.setAttribute('opacity', (0.45 + 0.55 * Math.sin(t * 4)).toFixed(2));
      this.els.th2.setAttribute('opacity', (0.45 + 0.55 * Math.sin(t * 4 - 0.9)).toFixed(2));
      this.els.th3.setAttribute('opacity', (0.45 + 0.55 * Math.sin(t * 4 - 1.8)).toFixed(2));
    }

    // 8. Плавное парение бейджа предмета
    if (this.els.badgeWrap) {
      const by = 48 + Math.sin(t * 2.2 + 0.8) * 3;
      this.els.badgeWrap.setAttribute('transform', `translate(186, ${by.toFixed(1)})`);
    }
  }
}
