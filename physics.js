// Физические шаблоны «Синапса»: электрическая цепь, силы, график движения, интерференция и линза.
//
// Принцип плавности: ползунок и переключатель задают только ЦЕЛЬ, а каждый кадр значение мягко догоняет её
// (экспоненциальное сглаживание не зависит от частоты кадров). SVG-элементы создаются один раз,
// дальше меняются только атрибуты — поэтому при перетаскивании ползунка нет рывков и мерцания.
// Перестройка DOM происходит только при переключении режима (кнопкой), а не при движении ползунка.

const CARD_STYLE =
  'padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(140,184,255,0.24);';
const TITLE_STYLE = 'font-size:15px;font-weight:700;color:#f5f1fa;';
const TIP_STYLE =
  'margin-top:8px;padding:9px 12px;border-radius:12px;background:rgba(20,17,38,0.6);font-size:12.5px;color:#d6cef0;text-align:center;min-height:20px;';

// Плавное приближение к цели. tau — примерное время, за которое значение проходит около 2/3 пути
export function approach(current, target, dt, tau = 0.15) {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return current + (target - current) * k;
}

// Тонкая линза: f — положение изображения (f > 0 — действительное, f < 0 — мнимое),
// m — линейное увеличение (m < 0 — перевёрнутое изображение)
export function lensGeometry(d, F) {
  const denom = d - F;
  if (Math.abs(denom) < 1e-6) return { f: Infinity, m: Infinity };
  const f = (d * F) / denom;
  return { f, m: -f / d };
}

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

// Цикл кадров, который останавливается при смене шаблона и не работает на скрытой вкладке
function runLoop(addCleanup, fn) {
  let id = 0;
  let last = performance.now();
  const step = (now) => {
    id = requestAnimationFrame(step);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fn(now / 1000, dt);
  };
  id = requestAnimationFrame(step);
  if (typeof addCleanup === 'function') addCleanup(() => cancelAnimationFrame(id));
}

// Обновляем текст и атрибуты только при реальном изменении — меньше работы браузеру
function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setAttr(el, name, value) {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
}

// Формула KaTeX: перерисовываем только если текст формулы изменился
function updateTex(state, tex) {
  if (!state.el || tex === state.last) return;
  state.last = tex;
  const katex = typeof window !== 'undefined' ? window.katex : null;
  if (katex) {
    try {
      katex.render(tex, state.el, { displayMode: false, throwOnError: false });
      return;
    } catch {
      // Ниже — текстовый вариант, если KaTeX не справился
    }
  }
  state.el.textContent = tex
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\approx/g, '≈')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/[\\{}]/g, '');
}

/* ============================================================
   ФИЗИКА 1: Электрическая цепь и закон Ома
   ============================================================ */
function electricCircuit(container, data, addCleanup) {
  const goal = { U: Number(data?.voltage || 12), R: Number(data?.resistance || 6), open: 0 };
  const cur = { U: goal.U, R: goal.R, open: 0, flow: 0 };
  const tex = { el: null, last: '' };

  container.innerHTML = `
    <div class="syn-card-anim" style="${CARD_STYLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="${TITLE_STYLE}">Цепь: амперметр, вольтметр и ключ</span>
        <button class="ec-key syn-pill-btn active" type="button">Ключ замкнут</button>
      </div>
      <svg viewBox="0 0 420 215" width="100%" style="display:block;">
        <rect class="ec-wire" x="62" y="42" width="296" height="116" rx="16" fill="none" stroke="#8cb8ff" stroke-width="3.5" stroke-dasharray="10 8" stroke-linecap="round"/>
        <path d="M 142 42 L 142 96 L 278 96 L 278 42" fill="none" stroke="#a99bff" stroke-width="2" stroke-dasharray="4 4"/>
        <circle cx="210" cy="96" r="15" fill="#231c42" stroke="#a99bff" stroke-width="2"/>
        <text x="210" y="100" text-anchor="middle" fill="#a99bff" font-size="12" font-weight="800">V</text>
        <text class="ec-v" x="210" y="122" text-anchor="middle" fill="#d6cef0" font-size="10.5"></text>
        <rect x="46" y="76" width="32" height="48" rx="6" fill="#231c42"/>
        <line x1="48" y1="90" x2="76" y2="90" stroke="#ffd27f" stroke-width="4"/>
        <line x1="54" y1="108" x2="70" y2="108" stroke="#7ef9e0" stroke-width="4"/>
        <text x="36" y="88" fill="#ffd27f" font-size="12">+</text>
        <text class="ec-ulbl" x="62" y="140" text-anchor="middle" fill="#ffd27f" font-size="11"></text>
        <rect x="172" y="30" width="76" height="24" rx="5" fill="#352a61" stroke="#c08cff" stroke-width="2.5"/>
        <text class="ec-rlbl" x="210" y="46" text-anchor="middle" fill="#f5f1fa" font-size="11.5"></text>
        <circle cx="152" cy="158" r="15" fill="#231c42" stroke="#7ef9e0" stroke-width="2.2"/>
        <text x="152" y="162" text-anchor="middle" fill="#7ef9e0" font-size="12" font-weight="800">A</text>
        <text class="ec-a" x="152" y="186" text-anchor="middle" fill="#7ef9e0" font-size="10.5"></text>
        <rect x="242" y="146" width="52" height="22" rx="4" fill="#231c42"/>
        <circle cx="248" cy="158" r="3.5" fill="#ffd27f"/>
        <circle cx="288" cy="158" r="3.5" fill="#ffd27f"/>
        <line class="ec-arm" x1="248" y1="158" x2="288" y2="158" stroke="#ffd27f" stroke-width="3.2" stroke-linecap="round"/>
        <text x="268" y="186" text-anchor="middle" fill="#ffd27f" font-size="10.5">Ключ</text>
        <circle class="ec-glow" cx="358" cy="100" r="28" fill="#ffd27f" opacity="0.05"/>
        <circle cx="358" cy="100" r="16" fill="#2b2449" stroke="#ffd27f" stroke-width="2.5"/>
        <path d="M 350 92 L 366 108 M 366 92 L 350 108" stroke="#ffd27f" stroke-width="2"/>
        <text x="325" y="104" text-anchor="end" fill="#ffd27f" font-size="11">Лампа</text>
      </svg>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;">
        <label style="font-size:12.5px;color:#d6cef0;">Напряжение U: <strong class="ec-uv" style="color:#ffd27f;">${goal.U}</strong> В
          <input class="ec-u" type="range" min="3" max="24" step="1" value="${goal.U}" style="width:100%;accent-color:#ffd27f;">
        </label>
        <label style="font-size:12.5px;color:#d6cef0;">Сопротивление R: <strong class="ec-rv" style="color:#c08cff;">${goal.R}</strong> Ом
          <input class="ec-r" type="range" min="2" max="12" step="1" value="${goal.R}" style="width:100%;accent-color:#c08cff;">
        </label>
      </div>
      <div class="ec-readout" style="margin-top:8px;text-align:center;font-size:13px;font-weight:700;color:#7ef9e0;"></div>
      <div class="ec-tex" style="margin-top:6px;text-align:center;color:#f5f1fa;font-size:18px;min-height:28px;"></div>
    </div>
  `;

  const q = (sel) => container.querySelector(sel);
  const el = {
    wire: q('.ec-wire'), arm: q('.ec-arm'), glow: q('.ec-glow'), key: q('.ec-key'),
    v: q('.ec-v'), a: q('.ec-a'), uLbl: q('.ec-ulbl'), rLbl: q('.ec-rlbl'),
    readout: q('.ec-readout'), uVal: q('.ec-uv'), rVal: q('.ec-rv')
  };
  tex.el = q('.ec-tex');

  // Ползунки задают цель: значения в подписях меняются сразу, а картинка догоняет плавно
  q('.ec-u').addEventListener('input', (e) => {
    goal.U = Number(e.target.value);
    setText(el.uVal, String(goal.U));
  });
  q('.ec-r').addEventListener('input', (e) => {
    goal.R = Number(e.target.value);
    setText(el.rVal, String(goal.R));
  });
  el.key.addEventListener('click', () => {
    goal.open = goal.open ? 0 : 1;
    setText(el.key, goal.open ? 'Ключ разомкнут' : 'Ключ замкнут');
    el.key.classList.toggle('active', !goal.open);
  });

  runLoop(addCleanup, (_t, dt) => {
    cur.U = approach(cur.U, goal.U, dt, 0.2);
    cur.R = approach(cur.R, goal.R, dt, 0.2);
    cur.open = approach(cur.open, goal.open, dt, 0.12);

    const I = (cur.U / cur.R) * (1 - cur.open);
    // Скорость бегущих зарядов зависит от тока: при разомкнутом ключе пунктир останавливается
    cur.flow = (cur.flow + Math.min(140, 7 * I) * dt) % 18;

    setAttr(el.wire, 'stroke-dashoffset', (-cur.flow).toFixed(2));
    setAttr(el.arm, 'y2', (158 - 20 * cur.open).toFixed(2));
    setAttr(el.glow, 'opacity', (0.05 + Math.min(0.85, I * 0.14)).toFixed(3));
    setAttr(el.glow, 'r', (18 + Math.min(20, I * 3.5)).toFixed(2));

    setText(el.a, `${I.toFixed(2)} А`);
    setText(el.v, `${(I * cur.R).toFixed(1)} В`);
    setText(el.uLbl, `U=${Math.round(cur.U)}В`);
    setText(el.rLbl, `R = ${Math.round(cur.R)} Ом`);
    setText(el.readout, goal.open ? 'Цепь разомкнута: I = 0 А' : `I = ${I.toFixed(2)} А`);
    updateTex(
      tex,
      goal.open
        ? '\\text{Ключ разомкнут} \\Rightarrow I = 0\\text{ А}'
        : `I = \\frac{U}{R} = \\frac{${goal.U}}{${goal.R}} \\approx ${(goal.U / goal.R).toFixed(2)}\\text{ А}`
    );
  });
}

/* ============================================================
   ФИЗИКА 2: Силы и равнодействующая (тело плавно разгоняется)
   ============================================================ */
function freeBody(container, data, addCleanup) {
  const FRICTION = 8; // сила трения (Н), постоянная на горизонтальной плоскости
  const goal = { F: Number(data?.force || 12), mode: 'flat' };
  const cur = { F: goal.F, grow: 0, dx: 0, vel: 0, homing: false };
  let refs = null;

  const flatMarkup = () => `
    <div class="syn-card-anim" style="${CARD_STYLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="${TITLE_STYLE}">Силы и равнодействующая</span>
        <div style="display:flex;gap:6px;">
          <button data-fb="flat" class="syn-pill-btn active" type="button">Плоскость</button>
          <button data-fb="incline" class="syn-pill-btn" type="button">Наклон</button>
        </div>
      </div>
      <svg viewBox="0 0 420 225" width="100%" style="display:block;overflow:visible;">
        <defs>
          <marker id="fbA1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#ff8fab"/></marker>
          <marker id="fbA2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#7ef9e0"/></marker>
          <marker id="fbA3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#ffd27f"/></marker>
          <marker id="fbA4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#c08cff"/></marker>
          <marker id="fbA5" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#63d2ff"/></marker>
        </defs>
        <line x1="36" y1="154" x2="384" y2="154" stroke="#786ea6" stroke-width="3"/>
        <g class="fb-body">
          <rect x="172" y="100" width="76" height="54" rx="10" fill="#3c3368" stroke="#8cb8ff" stroke-width="2.5"/>
          <circle cx="210" cy="127" r="3.5" fill="#fff"/>
          <line class="fb-mg" x1="210" y1="127" x2="210" y2="127" stroke="#ff8fab" stroke-width="3.2" marker-end="url(#fbA1)"/>
          <text x="220" y="204" fill="#ff8fab" font-size="13" font-weight="700">mg</text>
          <line class="fb-n" x1="210" y1="127" x2="210" y2="127" stroke="#7ef9e0" stroke-width="3.2" marker-end="url(#fbA2)"/>
          <text x="220" y="52" fill="#7ef9e0" font-size="13" font-weight="700">N</text>
          <line class="fb-f" x1="210" y1="127" x2="210" y2="127" stroke="#ffd27f" stroke-width="3.4" marker-end="url(#fbA3)"/>
          <text class="fb-f-lbl" x="250" y="116" fill="#ffd27f" font-size="12.5" font-weight="700">F</text>
          <line class="fb-ff" x1="210" y1="127" x2="210" y2="127" stroke="#c08cff" stroke-width="3.2" marker-end="url(#fbA4)"/>
          <text class="fb-ff-lbl" x="150" y="116" fill="#c08cff" font-size="12.5" font-weight="700">Fтр = ${FRICTION} Н</text>
          <line class="fb-net" x1="210" y1="86" x2="210" y2="86" stroke="#63d2ff" stroke-width="2.8" stroke-dasharray="4 3" marker-end="url(#fbA5)"/>
        </g>
      </svg>
      <label style="display:block;font-size:12.5px;color:#d6cef0;">Сила тяги F: <strong class="fb-fv" style="color:#ffd27f;">${goal.F} Н</strong>
        <input class="fb-force" type="range" min="4" max="20" step="1" value="${goal.F}" style="width:100%;accent-color:#ffd27f;">
      </label>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span class="fb-state" style="font-size:12.5px;color:#7ef9e0;font-weight:600;"></span>
        <button class="fb-home syn-pill-btn" type="button">↺ В начало</button>
      </div>
    </div>
  `;

  const inclineMarkup = () => `
    <div class="syn-card-anim" style="${CARD_STYLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="${TITLE_STYLE}">Силы на наклонной плоскости</span>
        <div style="display:flex;gap:6px;">
          <button data-fb="flat" class="syn-pill-btn" type="button">Плоскость</button>
          <button data-fb="incline" class="syn-pill-btn active" type="button">Наклон</button>
        </div>
      </div>
      <svg viewBox="0 0 420 225" width="100%" style="display:block;overflow:visible;">
        <defs>
          <marker id="fbA1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#ff8fab"/></marker>
          <marker id="fbA2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#7ef9e0"/></marker>
          <marker id="fbA4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#c08cff"/></marker>
        </defs>
        <polygon points="60,192 360,192 360,72" fill="rgba(120,110,166,0.22)" stroke="#786ea6" stroke-width="2.5"/>
        <g transform="translate(220,122) rotate(-21.8)">
          <rect x="-34" y="-44" width="68" height="44" rx="8" fill="#3c3368" stroke="#8cb8ff" stroke-width="2.5"/>
          <circle cx="0" cy="-22" r="3.5" fill="#fff"/>
          <line class="fb-n" x1="0" y1="-22" x2="0" y2="-22" stroke="#7ef9e0" stroke-width="3.2" marker-end="url(#fbA2)"/>
          <text x="10" y="-82" fill="#7ef9e0" font-size="13" font-weight="700">N</text>
          <line class="fb-ff" x1="0" y1="-22" x2="0" y2="-22" stroke="#c08cff" stroke-width="3.2" marker-end="url(#fbA4)"/>
          <text x="64" y="-32" fill="#c08cff" font-size="13" font-weight="700">Fтр</text>
        </g>
        <line class="fb-mg" x1="212" y1="101" x2="212" y2="101" stroke="#ff8fab" stroke-width="3.2" marker-end="url(#fbA1)"/>
        <text x="222" y="182" fill="#ff8fab" font-size="13" font-weight="700">mg</text>
      </svg>
      <div style="text-align:center;font-size:12.5px;color:#d6cef0;">На наклоне сила тяжести раскладывается на две составляющие: вдоль наклона (её компенсирует трение) и перпендикулярно (её уравновешивает реакция опоры N).</div>
    </div>
  `;

  const bind = () => {
    container.querySelectorAll('[data-fb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        goal.mode = btn.getAttribute('data-fb');
        cur.grow = 0; // векторы заново «вырастают» из центра тела
        cur.vel = 0;
        render();
      });
    });
    const force = container.querySelector('.fb-force');
    if (force) {
      force.addEventListener('input', (e) => {
        goal.F = Number(e.target.value);
        setText(container.querySelector('.fb-fv'), `${goal.F} Н`);
      });
    }
    const home = container.querySelector('.fb-home');
    if (home) {
      home.addEventListener('click', () => {
        cur.homing = true;
        cur.vel = 0;
      });
    }
  };

  const render = () => {
    const flat = goal.mode === 'flat';
    container.innerHTML = flat ? flatMarkup() : inclineMarkup();
    refs = {
      flat,
      body: container.querySelector('.fb-body'),
      mg: container.querySelector('.fb-mg'),
      n: container.querySelector('.fb-n'),
      f: container.querySelector('.fb-f'),
      fLbl: container.querySelector('.fb-f-lbl'),
      ff: container.querySelector('.fb-ff'),
      ffLbl: container.querySelector('.fb-ff-lbl'),
      net: container.querySelector('.fb-net'),
      state: container.querySelector('.fb-state')
    };
    bind();
  };
  render();

  runLoop(addCleanup, (_t, dt) => {
    cur.grow = approach(cur.grow, 1, dt, 0.2);
    if (cur.grow > 0.999) cur.grow = 1;
    const k = cur.grow;

    if (refs.flat) {
      cur.F = approach(cur.F, goal.F, dt, 0.25);
      const net = cur.F - FRICTION;          // равнодействующая по оси X
      const fLen = (40 + cur.F * 5.2) * k;
      const ffLen = (40 + FRICTION * 5.2) * k;

      setAttr(refs.f, 'x2', (210 + fLen).toFixed(1));
      setAttr(refs.fLbl, 'x', (210 + fLen + 6).toFixed(1));
      setAttr(refs.ff, 'x2', (210 - ffLen).toFixed(1));
      setAttr(refs.ffLbl, 'x', (210 - ffLen - 4).toFixed(1));
      setAttr(refs.mg, 'y2', (127 + 80 * k).toFixed(1));
      setAttr(refs.n, 'y2', (127 - 85 * k).toFixed(1));
      setAttr(refs.net, 'x2', (210 + net * 7 * k).toFixed(1));
      setAttr(refs.net, 'opacity', Math.abs(net) > 0.3 ? '1' : '0');

      // Скорость тела стремится к значению, пропорциональному равнодействующей:
      // больше сила — быстрее разгон; при равенстве сил тело движется равномерно
      if (cur.homing) {
        cur.dx = approach(cur.dx, 0, dt, 0.25);
        if (Math.abs(cur.dx) < 0.3) {
          cur.dx = 0;
          cur.homing = false;
        }
      } else {
        cur.vel = approach(cur.vel, net * 4, dt, 0.5);
        cur.dx += cur.vel * dt;
        if (cur.dx > 70 || cur.dx < -70) {
          cur.dx = Math.max(-70, Math.min(70, cur.dx));
          cur.vel = 0;
        }
      }
      setAttr(refs.body, 'transform', `translate(${cur.dx.toFixed(2)},0)`);

      const goalNet = goal.F - FRICTION;
      setText(
        refs.state,
        goalNet > 0.5
          ? `Fрез = +${goalNet} Н: тело разгоняется вправо`
          : goalNet < -0.5
            ? `Fрез = ${goalNet} Н: тело замедляется`
            : 'Fрез = 0: тело движется равномерно (или стоит)'
      );
    } else {
      setAttr(refs.n, 'y2', (-22 - 70 * k).toFixed(1));
      setAttr(refs.ff, 'x2', (72 * k).toFixed(1));
      setAttr(refs.mg, 'y2', (101 + 87 * k).toFixed(1));
    }
  });
}

/* ============================================================
   ФИЗИКА 3: Графики x(t) и v(t) — точка движется синхронно
   ============================================================ */
function motionGraph(container, data, addCleanup) {
  const goal = { b: 0, auto: true, scrub: 0 };      // b: 0 — равномерное, 1 — равноускоренное
  const cur = { b: 0, u: 0, phase: 0 };
  let lastT = 0;
  let refs = null;

  container.innerHTML = `
    <div class="syn-card-anim" style="${CARD_STYLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="${TITLE_STYLE}">Синхронные графики x(t) и v(t)</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="syn-pill-btn mg-b active" data-b="0" type="button">Равномерное</button>
          <button class="syn-pill-btn mg-b" data-b="1" type="button">Равноускоренное</button>
          <button class="syn-pill-btn mg-auto active" type="button">▶ Авто</button>
        </div>
      </div>
      <svg viewBox="0 0 420 245" width="100%" style="display:block;">
        <line x1="48" y1="36" x2="375" y2="36" stroke="#786ea6" stroke-width="2.5"/>
        <rect class="mg-cart" x="48" y="13" width="28" height="19" rx="6" fill="#ffd27f"/>
        <line x1="48" y1="138" x2="380" y2="138" stroke="#8cb8ff" stroke-width="1.8"/>
        <line x1="48" y1="54" x2="48" y2="138" stroke="#8cb8ff" stroke-width="1.8"/>
        <text x="385" y="142" fill="#d6cef0" font-size="11">t</text>
        <text x="32" y="64" fill="#7ef9e0" font-size="11.5" font-weight="700">x</text>
        <path class="mg-x" fill="none" stroke="#7ef9e0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="mg-pt" cx="48" cy="138" r="6" fill="#ffd27f" stroke="#ffffff" stroke-width="2"/>
        <line x1="48" y1="224" x2="380" y2="224" stroke="#8cb8ff" stroke-width="1.8"/>
        <line x1="48" y1="162" x2="48" y2="224" stroke="#8cb8ff" stroke-width="1.8"/>
        <text x="385" y="228" fill="#d6cef0" font-size="11">t</text>
        <text x="32" y="172" fill="#c08cff" font-size="11.5" font-weight="700">v</text>
        <path class="mg-v" fill="none" stroke="#c08cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="mg-vpt" cx="48" cy="190" r="5.5" fill="#c08cff" stroke="#ffffff" stroke-width="1.8"/>
      </svg>
      <label style="display:block;font-size:12.5px;color:#d6cef0;">Момент времени (перетащи, чтобы посмотреть состояние):
        <input class="mg-scrub" type="range" min="0" max="1" step="0.005" value="0" style="width:100%;accent-color:#7ef9e0;">
      </label>
      <div class="mg-tel" style="margin-top:6px;text-align:center;font-size:12.5px;color:#7ef9e0;font-weight:600;"></div>
    </div>
  `;

  const q = (sel) => container.querySelector(sel);
  refs = {
    cart: q('.mg-cart'), x: q('.mg-x'), pt: q('.mg-pt'), v: q('.mg-v'), vpt: q('.mg-vpt'),
    tel: q('.mg-tel'), auto: q('.mg-auto'), pills: container.querySelectorAll('.mg-b')
  };

  // Переключение равномерного / равноускоренного: график плавно перетекает в другую форму
  container.querySelectorAll('.mg-b').forEach((btn) => {
    btn.addEventListener('click', () => {
      goal.b = Number(btn.getAttribute('data-b'));
      refs.pills.forEach((p) => p.classList.toggle('active', p === btn));
    });
  });

  // Перетаскивание по времени: точка плавно догоняет положение ползунка
  q('.mg-scrub').addEventListener('input', (e) => {
    goal.auto = false;
    goal.scrub = Number(e.target.value);
    refs.auto.classList.remove('active');
  });

  // Возврат в авто: продолжаем с того места, где остановились — без скачка
  refs.auto.addEventListener('click', () => {
    cur.phase = cur.u - lastT * 0.25;
    goal.auto = true;
    refs.auto.classList.add('active');
  });

  runLoop(addCleanup, (t, dt) => {
    lastT = t;
    if (goal.auto) {
      cur.u = wrap01(t * 0.25 + cur.phase);
    } else {
      cur.u = approach(cur.u, goal.scrub, dt, 0.12);
    }
    cur.b = approach(cur.b, goal.b, dt, 0.35);

    const u = cur.u;
    const b = cur.b;
    // Положение x(t): при b=0 прямая, при b=1 парабола; v(t): константа или рост
    const frac = (uu) => (1 - b) * uu + b * uu * uu;
    const vY = (uu) => (1 - b) * 190 + b * (220 - uu * 52);

    let dX = '';
    let dV = '';
    for (let i = 0; i <= 24; i++) {
      const uu = i / 24;
      const px = (48 + uu * 317).toFixed(1);
      dX += `${i ? 'L' : 'M'} ${px} ${(138 - frac(uu) * 78).toFixed(1)} `;
      dV += `${i ? 'L' : 'M'} ${px} ${vY(uu).toFixed(1)} `;
    }
    setAttr(refs.x, 'd', dX);
    setAttr(refs.v, 'd', dV);

    const fu = frac(u);
    const px = (48 + u * 317).toFixed(1);
    setAttr(refs.pt, 'cx', px);
    setAttr(refs.pt, 'cy', (138 - fu * 78).toFixed(1));
    setAttr(refs.vpt, 'cx', px);
    setAttr(refs.vpt, 'cy', vY(u).toFixed(1));
    setAttr(refs.cart, 'x', (48 + fu * 298).toFixed(1));

    const speed = (1 - b) * 10 + b * u * 20;
    setText(refs.tel, `t = ${(u * 5).toFixed(1)} с · x = ${(fu * 50).toFixed(1)} м · v = ${speed.toFixed(1)} м/с`);
  });
}

/* ============================================================
   ФИЗИКА 4: Волны и интерференция (сдвиг фаз плавно)
   ============================================================ */
function waveInterference(container, data, addCleanup) {
  const goal = { phi: 0 };
  const cur = { phi: 0 };
  let stateKey = '';

  container.innerHTML = `
    <div class="syn-card-anim" style="${CARD_STYLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="${TITLE_STYLE}">Интерференция двух волн</span>
        <span class="wi-status" style="font-size:12px;color:#7ef9e0;font-weight:600;">Усиление (пики совпадают)</span>
      </div>
      <svg viewBox="0 0 420 210" width="100%" style="display:block;">
        <line x1="20" y1="105" x2="400" y2="105" stroke="rgba(255,255,255,0.14)" stroke-dasharray="4 4"/>
        <path class="wi-w1" fill="none" stroke="#8cb8ff" stroke-width="2" opacity="0.65"/>
        <path class="wi-w2" fill="none" stroke="#c08cff" stroke-width="2" opacity="0.65"/>
        <path class="wi-sum" fill="none" stroke="#7ef9e0" stroke-width="3.5"/>
        <g class="wi-peaks"></g>
      </svg>
      <label style="display:block;margin-top:8px;font-size:12.5px;color:#d6cef0;">
        Сдвиг фаз Δφ: <strong class="wi-deg" style="color:#7ef9e0;">0°</strong>
        <input class="wi-slider" type="range" min="0" max="180" step="1" value="0" style="width:100%;accent-color:#7ef9e0;">
      </label>
    </div>
  `;

  const q = (sel) => container.querySelector(sel);
  const el = { w1: q('.wi-w1'), w2: q('.wi-w2'), sum: q('.wi-sum'), peaks: q('.wi-peaks'), deg: q('.wi-deg'), status: q('.wi-status') };

  q('.wi-slider').addEventListener('input', (e) => {
    goal.phi = Number(e.target.value);
    setText(el.deg, `${goal.phi}°`);
  });

  runLoop(addCleanup, (t, dt) => {
    cur.phi = approach(cur.phi, goal.phi, dt, 0.25);
    const phi = (cur.phi * Math.PI) / 180;

    let d1 = '';
    let d2 = '';
    let ds = '';
    let peaks = '';
    for (let x = 20; x <= 400; x += 6) {
      const k = (x - 20) * 0.042;
      const y1 = 22 * Math.sin(k - t * 3.2);
      const y2 = 22 * Math.sin(k - t * 3.2 + phi);
      const ys = y1 + y2;
      const c = x === 20 ? 'M' : 'L';
      d1 += `${c} ${x} ${(105 - y1).toFixed(1)} `;
      d2 += `${c} ${x} ${(105 - y2).toFixed(1)} `;
      ds += `${c} ${x} ${(105 - ys).toFixed(1)} `;
      // Пики усиления подсвечиваем жёлтым, впадины гашения — розовым
      if (Math.abs(ys) > 36 && x % 12 === 8) {
        peaks += `<circle cx="${x}" cy="${(105 - ys).toFixed(1)}" r="4" fill="${ys > 0 ? '#ffd27f' : '#ff8fab'}" opacity="0.85"/>`;
      }
    }
    setAttr(el.w1, 'd', d1);
    setAttr(el.w2, 'd', d2);
    setAttr(el.sum, 'd', ds);
    el.peaks.innerHTML = peaks;

    const key = cur.phi < 45 ? 'in' : cur.phi > 135 ? 'out' : 'mid';
    if (key !== stateKey) {
      stateKey = key;
      setText(
        el.status,
        key === 'in'
          ? 'Усиление (пики совпадают)'
          : key === 'out'
            ? 'Гашение (пик совпадает с впадиной)'
            : 'Промежуточное наложение волн'
      );
    }
  });
}

/* ============================================================
   ФИЗИКА 5: Линза — ход лучей и изображение следуют за предметом
   ============================================================ */
function lensRefraction(container, data, addCleanup) {
  const LENS_X = 210;
  const AXIS_Y = 125;
  const H = 40;       // высота предмета
  const FOCUS = 60;   // модуль фокусного расстояния
  const EXTENT = 400; // правая граница отрисовки лучей

  const goal = { objX: 85, diverging: false };
  const cur = { objX: 85 };
  let refs = null;
  let kindKey = '';

  const lensPath = (diverging) =>
    diverging
      ? `M ${LENS_X - 14} 38 L ${LENS_X + 14} 38 Q ${LENS_X + 4} ${AXIS_Y} ${LENS_X + 14} 212 L ${LENS_X - 14} 212 Q ${LENS_X - 4} ${AXIS_Y} ${LENS_X - 14} 38 Z`
      : `M ${LENS_X} 38 Q ${LENS_X + 18} ${AXIS_Y} ${LENS_X} 212 Q ${LENS_X - 18} ${AXIS_Y} ${LENS_X} 38 Z`;

  // Форму линзы и её название меняем только при переключении (это редкое действие)
  const render = () => {
    const title = goal.diverging ? 'Рассеивающая линза' : 'Собирающая линза';
    container.innerHTML = `
      <div class="syn-card-anim" style="${CARD_STYLE}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="${TITLE_STYLE}">${title}</span>
          <div style="display:flex;gap:6px;">
            <button data-lt="conv" class="syn-pill-btn ${goal.diverging ? '' : 'active'}" type="button">Собирающая</button>
            <button data-lt="div" class="syn-pill-btn ${goal.diverging ? 'active' : ''}" type="button">Рассеивающая</button>
          </div>
        </div>
        <svg viewBox="0 0 420 230" width="100%" style="display:block;overflow:visible;">
          <line x1="15" y1="${AXIS_Y}" x2="405" y2="${AXIS_Y}" stroke="#786ea6" stroke-dasharray="5 4" stroke-width="1.5"/>
          <path d="${lensPath(goal.diverging)}" fill="rgba(126,249,224,0.22)" stroke="#7ef9e0" stroke-width="2.5"/>
          <circle cx="${LENS_X - FOCUS}" cy="${AXIS_Y}" r="3.5" fill="#ffd27f"/>
          <text x="${LENS_X - FOCUS}" y="${AXIS_Y + 16}" text-anchor="middle" fill="#ffd27f" font-size="11">F</text>
          <circle cx="${LENS_X + FOCUS}" cy="${AXIS_Y}" r="3.5" fill="#ffd27f"/>
          <text x="${LENS_X + FOCUS}" y="${AXIS_Y + 16}" text-anchor="middle" fill="#ffd27f" font-size="11">F</text>
          <line class="lz-obj" stroke="#c08cff" stroke-width="4" stroke-linecap="round"/>
          <polygon class="lz-arrow" fill="#c08cff"/>
          <line class="lz-r1" stroke="#ffd27f" stroke-width="2.2"/>
          <line class="lz-r1b" stroke="#ffd27f" stroke-width="2.2"/>
          <line class="lz-r1x" stroke="#ffd27f" stroke-width="1.6" stroke-dasharray="4 4" opacity="0"/>
          <line class="lz-r2" stroke="#7ef9e0" stroke-width="2.2"/>
          <line class="lz-img" stroke="#ffb3c1" stroke-width="4" stroke-linecap="round"/>
          <text class="lz-img-lbl" fill="#ffb3c1" font-size="11" text-anchor="middle"></text>
        </svg>
        <label style="display:block;margin-top:6px;font-size:12.5px;color:#d6cef0;">
          Расстояние до предмета: <strong class="lz-d" style="color:#ffd27f;"></strong>
          <input class="lz-slider" type="range" min="40" max="175" step="1" value="${goal.objX}" style="width:100%;accent-color:#ffd27f;">
        </label>
        <div class="lz-tip" style="${TIP_STYLE}"></div>
      </div>
    `;

    refs = {
      obj: container.querySelector('.lz-obj'),
      arrow: container.querySelector('.lz-arrow'),
      r1: container.querySelector('.lz-r1'),
      r1b: container.querySelector('.lz-r1b'),
      r1x: container.querySelector('.lz-r1x'),
      r2: container.querySelector('.lz-r2'),
      img: container.querySelector('.lz-img'),
      imgLbl: container.querySelector('.lz-img-lbl'),
      d: container.querySelector('.lz-d'),
      tip: container.querySelector('.lz-tip')
    };
    kindKey = '';

    container.querySelectorAll('[data-lt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        goal.diverging = btn.getAttribute('data-lt') === 'div';
        render();
      });
    });
    container.querySelector('.lz-slider').addEventListener('input', (e) => {
      goal.objX = Number(e.target.value);
    });
  };
  render();

  runLoop(addCleanup, (_t, dt) => {
    // Предмет плавно едет за ползунком
    cur.objX = approach(cur.objX, goal.objX, dt, 0.14);

    const F = goal.diverging ? -FOCUS : FOCUS;
    const sgn = goal.diverging ? -1 : 1;
    const d = LENS_X - cur.objX;
    const g = lensGeometry(d, F);
    const nearInfinity = !Number.isFinite(g.f) || Math.abs(g.f) > 190;

    // Ограничиваем изображение, чтобы у самого фокуса картинка не уходила за пределы рисунка
    const f = nearInfinity ? 190 : Math.max(-300, Math.min(190, g.f));
    const m = -f / d;
    const hImg = Math.max(-90, Math.min(90, H * m));
    const imgX = LENS_X + f;
    const imgTop = AXIS_Y - hImg;
    const isVirtual = f < 0;

    const P = { x: cur.objX, y: AXIS_Y - H };   // верхушка предмета
    const L = { x: LENS_X, y: P.y };            // точка падения луча на линзу
    const O = { x: LENS_X, y: AXIS_Y };         // оптический центр

    // Преломлённый луч: в собирающей линзе идёт к фокусу справа, в рассеивающей — расходится от фокуса слева
    const focalX = LENS_X + sgn * FOCUS;
    const dirX = goal.diverging ? L.x - focalX : focalX - L.x;
    const dirY = goal.diverging ? L.y - AXIS_Y : AXIS_Y - L.y;
    const k1 = (EXTENT - L.x) / dirX;
    const end1 = { x: EXTENT, y: L.y + dirY * k1 };

    // Луч через оптический центр не преломляется
    const k2 = (EXTENT - P.x) / (O.x - P.x);
    const end2 = { x: EXTENT, y: P.y + (O.y - P.y) * k2 };

    setAttr(refs.obj, 'x1', cur.objX.toFixed(1));
    setAttr(refs.obj, 'y1', AXIS_Y);
    setAttr(refs.obj, 'x2', P.x.toFixed(1));
    setAttr(refs.obj, 'y2', P.y.toFixed(1));
    setAttr(refs.arrow, 'points', `${P.x.toFixed(1)},${(P.y - 7).toFixed(1)} ${(P.x - 5).toFixed(1)},${(P.y + 3).toFixed(1)} ${(P.x + 5).toFixed(1)},${(P.y + 3).toFixed(1)}`);

    setAttr(refs.r1, 'x1', P.x.toFixed(1));
    setAttr(refs.r1, 'y1', P.y.toFixed(1));
    setAttr(refs.r1, 'x2', L.x.toFixed(1));
    setAttr(refs.r1, 'y2', L.y.toFixed(1));
    setAttr(refs.r1b, 'x1', L.x.toFixed(1));
    setAttr(refs.r1b, 'y1', L.y.toFixed(1));
    setAttr(refs.r1b, 'x2', end1.x.toFixed(1));
    setAttr(refs.r1b, 'y2', end1.y.toFixed(1));

    // Для мнимого изображения обратное продолжение луча показываем пунктиром
    setAttr(refs.r1x, 'opacity', isVirtual ? '1' : '0');
    setAttr(refs.r1x, 'x1', L.x.toFixed(1));
    setAttr(refs.r1x, 'y1', L.y.toFixed(1));
    setAttr(refs.r1x, 'x2', imgX.toFixed(1));
    setAttr(refs.r1x, 'y2', imgTop.toFixed(1));

    setAttr(refs.r2, 'x1', P.x.toFixed(1));
    setAttr(refs.r2, 'y1', P.y.toFixed(1));
    setAttr(refs.r2, 'x2', end2.x.toFixed(1));
    setAttr(refs.r2, 'y2', end2.y.toFixed(1));

    setAttr(refs.img, 'x1', imgX.toFixed(1));
    setAttr(refs.img, 'y1', AXIS_Y);
    setAttr(refs.img, 'x2', imgX.toFixed(1));
    setAttr(refs.img, 'y2', imgTop.toFixed(1));
    setAttr(refs.img, 'stroke-dasharray', isVirtual ? '5 3' : 'none');

    const labelX = Math.max(30, Math.min(390, imgX));
    setAttr(refs.imgLbl, 'x', labelX.toFixed(1));
    setAttr(refs.imgLbl, 'y', (isVirtual ? imgTop - 8 : imgTop + 14).toFixed(1));

    // Описание изображения: действительное/мнимое, прямое/перевёрнутое, уменьшенное/увеличенное
    const real = !isVirtual;
    const orient = m < 0 ? 'перевёрнутое' : 'прямое';
    const size = Math.abs(m) > 1.05 ? 'увеличенное' : Math.abs(m) < 0.95 ? 'уменьшенное' : 'равное по размеру';
    const kind = nearInfinity
      ? 'Предмет у фокуса: лучи после линзы почти параллельны, изображение очень далеко'
      : `${real ? 'Действительное' : 'Мнимое'}, ${orient}, ${size}`;
    setText(refs.imgLbl, nearInfinity ? 'в бесконечности' : real ? 'действительное' : 'мнимое');
    setText(refs.d, `${Math.round(d)} (F = ${FOCUS})`);
    if (kind !== kindKey) {
      kindKey = kind;
      setText(refs.tip, `Изображение: ${kind}`);
    }
  });
}

// Точка входа для шаблонов физики (вызывается из animations.js)
export function renderPhysicsTemplate(container, name, data, addCleanup) {
  const templates = {
    electric_circuit: electricCircuit,
    free_body: freeBody,
    motion_graph: motionGraph,
    wave_interference: waveInterference,
    lens_refraction: lensRefraction
  };
  const draw = templates[name];
  if (draw) draw(container, data, addCleanup);
}
