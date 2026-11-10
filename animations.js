// Модуль образовательных анимаций, шаблонов, локальных KaTeX-формул, интерактивных графиков и JSON-диаграмм
// Работает 100% локально без внешних CDN (не зависит от VPN и работает офлайн)

// Физические шаблоны с плавными ползунками вынесены в отдельный модуль
import { renderPhysicsTemplate } from './physics.js';

// Получение локально собранного KaTeX (или подключённого в window.katex)
export async function ensureKaTeX() {
  if (typeof window === 'undefined') return null;
  return window.katex || null;
}

export async function ensurePlotly() {
  if (typeof window === 'undefined') return null;
  return window.Plotly || null;
}

// Простой безопасный HTML-фолбэк для формул, если нет сети и KaTeX ещё не в кэше
function formatMathFallback(latex) {
  return String(latex || '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="syn-frac"><span>$1</span><span class="syn-frac-bar"></span><span>$2</span></span>')
    .replace(/\\cdot/g, ' · ')
    .replace(/\\times/g, ' × ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\vec\{([^}]+)\}/g, '$1⃗')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\^\{?([^}\s]+)\}?/g, '<sup>$1</sup>')
    .replace(/_\{?([^}\s]+)\}?/g, '<sub>$1</sub>')
    .replace(/[{}]/g, '');
}

// Отрисовка формулы в элемент через KaTeX (или офлайн-фолбэк)
export async function mountFormulaInto(el, latex, displayMode = true) {
  if (!el) return;
  const cleanLatex = String(latex || '').trim().replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '');
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.45s ease';

  const katex = await ensureKaTeX();
  if (katex) {
    try {
      katex.render(cleanLatex, el, { displayMode, throwOnError: false });
      requestAnimationFrame(() => {
        el.style.opacity = '1';
      });
      return;
    } catch {
      // Переход к текстовому фолбэку при ошибке синтаксиса
    }
  }

  el.innerHTML = `<span style="font-family:'Times New Roman',serif;font-size:1.35em;letter-spacing:0.02em;">${formatMathFallback(cleanLatex)}</span>`;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
}

// 1. Рендер типа SHOW = "formula"
export async function renderFormulaShow(container, data) {
  const latex = typeof data === 'string' ? data : data?.latex || data?.formula || 'I = \\frac{U}{R}';
  const title = data?.title || 'Формула';
  const note = data?.note || data?.description || '';

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:28px;border-radius:18px;background:rgba(43,36,73,0.55);border:1px solid rgba(126,249,224,0.22);text-align:center;">
      <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a99bff;margin-bottom:16px;">${escapeHtml(title)}</div>
      <div class="syn-katex-target" style="font-size:clamp(24px,3vw,36px);color:#f5f1fa;padding:18px 12px;"></div>
      ${note ? `<p style="margin-top:14px;font-size:15px;color:#d6cef0;line-height:1.5;">${escapeHtml(note)}</p>` : ''}
    </div>
  `;

  await mountFormulaInto(container.querySelector('.syn-katex-target'), latex, true);
  return { destroy() {} };
}

// 2. Рендер типа SHOW = "chart" (Plotly лениво + мягкий SVG-фолбэк)
export async function renderChartShow(container, data) {
  const title = data?.title || 'График зависимости';
  const x = Array.isArray(data?.x) ? data.x : [0, 1, 2, 3, 4, 5];
  const y = Array.isArray(data?.y) ? data.y : [0, 2, 4, 6, 8, 10];
  const xLabel = data?.xLabel || 'x';
  const yLabel = data?.yLabel || 'y';

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:18px;border-radius:18px;background:rgba(36,30,63,0.65);border:1px solid rgba(169,155,255,0.2);">
      <div style="font-size:15px;font-weight:600;color:#f5f1fa;margin-bottom:10px;text-align:center;">${escapeHtml(title)}</div>
      <div class="syn-plotly-box" style="width:100%;height:300px;"></div>
    </div>
  `;

  const box = container.querySelector('.syn-plotly-box');
  if (!box) return { destroy() {} };

  const rawTraces = Array.isArray(data?.traces) && data.traces.length
    ? data.traces.map((tr, idx) => ({
        x: Array.isArray(tr.x) ? tr.x.map(Number) : x.map(Number),
        y: Array.isArray(tr.y) ? tr.y.map(Number) : y.map(Number),
        name: tr.name || `Ряд ${idx + 1}`,
        color: ['#7ef9e0', '#ffd27f', '#ffb3c1', '#a99bff'][idx % 4]
      }))
    : [
        {
          x: x.map(Number),
          y: y.map(Number),
          name: data?.name || yLabel,
          color: '#7ef9e0'
        }
      ];

  const allX = rawTraces.flatMap((t) => t.x).filter(Number.isFinite);
  const allY = rawTraces.flatMap((t) => t.y).filter(Number.isFinite);
  const minX = allX.length ? Math.min(...allX) : 0;
  const maxX = allX.length ? Math.max(...allX) : 1;
  const minY = allY.length ? Math.min(...allY) : 0;
  const maxY = allY.length ? Math.max(...allY) : 1;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const padL = 52;
  const padR = 24;
  const padT = 22;
  const padB = 42;
  const W = 440;
  const H = 260;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toPx = (vx) => padL + ((vx - minX) / spanX) * plotW;
  const toPy = (vy) => padT + plotH - ((vy - minY) / spanY) * plotH;

  // Сетка координат (4 деления)
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const gy = padT + (plotH * i) / 4;
    const valY = maxY - (spanY * i) / 4;
    gridLines.push(
      `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="rgba(255,255,255,0.09)" stroke-dasharray="3 3"/>`,
      `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" fill="#bdb4df" font-size="10.5" text-anchor="end">${Number(valY.toFixed(1))}</text>`
    );

    const gx = padL + (plotW * i) / 4;
    const valX = minX + (spanX * i) / 4;
    gridLines.push(
      `<line x1="${gx.toFixed(1)}" y1="${padT}" x2="${gx.toFixed(1)}" y2="${H - padB}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="3 3"/>`,
      `<text x="${gx.toFixed(1)}" y="${H - padB + 16}" fill="#bdb4df" font-size="10.5" text-anchor="middle">${Number(valX.toFixed(1))}</text>`
    );
  }

  const seriesSvg = rawTraces
    .map((tr, tIdx) => {
      const pts = tr.x
        .map((vx, i) => ({
          vx,
          vy: tr.y[i] ?? 0,
          px: toPx(vx),
          py: toPy(tr.y[i] ?? 0)
        }))
        .filter((p) => Number.isFinite(p.px) && Number.isFinite(p.py));

      const poly = pts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
      const circles = pts
        .map(
          (p) =>
            `<circle class="chart-pt" data-tip="${escapeHtml(tr.name)}: (${p.vx}, ${p.vy})" cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="5" fill="#ffd27f" stroke="${tr.color}" stroke-width="2" style="cursor:pointer;"/>`
        )
        .join('');

      return `
        <polyline points="${poly}" fill="none" stroke="${tr.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" data-series="${tIdx}"/>
        ${circles}
      `;
    })
    .join('');

  box.style.height = 'auto';
  box.innerHTML = `
    <div style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
        ${gridLines.join('')}
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#8c7aff" stroke-width="1.8"/>
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#8c7aff" stroke-width="1.8"/>
        ${seriesSvg}
        <text x="${W - padR}" y="${H - 6}" fill="#e6dff2" font-size="11.5" font-weight="600" text-anchor="end">${escapeHtml(xLabel)}</text>
        <text x="${padL + 6}" y="${padT + 10}" fill="#e6dff2" font-size="11.5" font-weight="600">${escapeHtml(yLabel)}</text>
      </svg>
      <div class="chart-tip" style="margin-top:6px;text-align:center;font-size:12.5px;color:#7ef9e0;min-height:20px;">
        Наведи на точку графика, чтобы увидеть точные значения
      </div>
    </div>
  `;

  const tipEl = box.querySelector('.chart-tip');
  box.querySelectorAll('.chart-pt').forEach((pt) => {
    pt.addEventListener('mouseenter', () => {
      if (tipEl) tipEl.textContent = pt.getAttribute('data-tip') || '';
      pt.setAttribute('r', '7');
    });
    pt.addEventListener('mouseleave', () => {
      pt.setAttribute('r', '5');
    });
  });

  return { destroy() {} };
}

// 3. Рендер типа SHOW = "diagram" (SVG-анимация из JSON с пружинистым появлением, градиентами и пунктиром)
export function renderDiagramShow(container, data) {
  const title = data?.title || 'Схема';
  const elements = Array.isArray(data?.elements) ? data.elements : [];

  // Вычисляем подходящий viewBox
  let maxX = 480;
  let maxY = 280;
  for (const el of elements) {
    if (el.type === 'box') {
      maxX = Math.max(maxX, (el.x || 0) + (el.w || 120) + 30);
      maxY = Math.max(maxY, (el.y || 0) + (el.h || 50) + 30);
    } else if (el.type === 'circle') {
      maxX = Math.max(maxX, (el.cx || 0) + (el.r || 30) + 30);
      maxY = Math.max(maxY, (el.cy || 0) + (el.r || 30) + 30);
    } else if (el.type === 'arrow') {
      maxX = Math.max(maxX, el.from?.[0] || 0, (el.to?.[0] || 0) + 30);
      maxY = Math.max(maxY, el.from?.[1] || 0, (el.to?.[1] || 0) + 30);
    }
  }

  const uid = Math.random().toString(36).slice(2, 6);
  const svgParts = elements.map((el) => {
    const delay = Number(el.delay || 0);
    if (el.type === 'box') {
      const x = Number(el.x || 20);
      const y = Number(el.y || 20);
      const w = Number(el.w || 130);
      const h = Number(el.h || 52);
      return `
        <g class="syn-slide-up" style="animation-delay:${delay}ms;">
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="url(#boxGrad-${uid})" stroke="#7ef9e0" stroke-opacity="0.45" stroke-width="1.6" filter="url(#diagShadow-${uid})"/>
          <text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" fill="#f5f1fa" font-size="13.5" font-weight="600">${escapeHtml(el.text || '')}</text>
        </g>
      `;
    }
    if (el.type === 'circle') {
      const cx = Number(el.cx || 100);
      const cy = Number(el.cy || 100);
      const r = Number(el.r || 34);
      return `
        <g class="syn-slide-up" style="animation-delay:${delay}ms;">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#circleGrad-${uid})" stroke="#ffd27f" stroke-opacity="0.55" stroke-width="1.6" filter="url(#diagShadow-${uid})"/>
          <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#f5f1fa" font-size="13" font-weight="600">${escapeHtml(el.text || '')}</text>
        </g>
      `;
    }
    if (el.type === 'arrow') {
      const [x1, y1] = el.from || [40, 80];
      const [x2, y2] = el.to || [180, 80];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 8;
      const dashClass = el.animated !== false ? 'syn-dash-flow' : '';
      return `
        <g class="syn-fade-in" style="animation-delay:${delay}ms;">
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7ef9e0" stroke-width="2.6" stroke-linecap="round" class="${dashClass}" marker-end="url(#arrowHead-${uid})"/>
          ${el.label ? `<text x="${mx}" y="${my}" text-anchor="middle" fill="#ffd27f" font-size="11.5" font-weight="500">${escapeHtml(el.label)}</text>` : ''}
        </g>
      `;
    }
    return '';
  });

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:18px;border-radius:18px;background:rgba(36,30,63,0.65);border:1px solid rgba(126,249,224,0.2);">
      <div style="font-size:15px;font-weight:600;color:#f5f1fa;margin-bottom:10px;text-align:center;">${escapeHtml(title)}</div>
      <svg viewBox="0 0 ${maxX} ${maxY}" width="100%" style="max-height:330px;display:block;">
        <defs>
          <linearGradient id="boxGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3c3368"/>
            <stop offset="100%" stop-color="#28224a"/>
          </linearGradient>
          <radialGradient id="circleGrad-${uid}" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stop-color="#4e4085"/>
            <stop offset="100%" stop-color="#2c244f"/>
          </radialGradient>
          <filter id="diagShadow-${uid}" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feOffset dx="0" dy="3"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <marker id="arrowHead-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#7ef9e0"/>
          </marker>
        </defs>
        ${svgParts.join('')}
      </svg>
    </div>
  `;

  return { destroy() {} };
}

// 4. ГЛАВНЫЙ ДИСПЕТЧЕР 22+ ГОТОВЫХ ШАБЛОНОВ
export function renderTemplateShow(container, templateName, data = {}, callbacks = {}) {
  if (!container) return { destroy() {} };
  const cleanups = [];
  const addCleanup = (fn) => {
    if (typeof fn === 'function') cleanups.push(fn);
  };

  // Запускатель rAF с автоматической паузой при скрытии вкладки
  const runRaf = (fn) => {
    let rafId = null;
    let last = 0;
    const start = performance.now();
    const step = (now) => {
      rafId = requestAnimationFrame(step);
      if (document.hidden) return;
      if (now - last < 30) return;
      last = now;
      fn((now - start) / 1000);
    };
    rafId = requestAnimationFrame(step);
    addCleanup(() => cancelAnimationFrame(rafId));
  };

  switch (templateName) {
    case 'cell_animal':
    case 'cell_plant':
      renderCellTemplate(container, templateName, data);
      break;
    case 'mitosis':
      renderMitosisTemplate(container, runRaf, addCleanup);
      break;
    case 'amoeba':
    case 'paramecium':
      renderUnicellularTemplate(container, templateName, runRaf);
      break;
    case 'digestion':
      renderDigestionTemplate(container, runRaf);
      break;
    case 'blood_flow':
      renderBloodFlowTemplate(container, runRaf);
      break;
    case 'photosynthesis':
      renderPhotosynthesisTemplate(container, runRaf);
      break;
    case 'seed_structure':
      renderSeedStructureTemplate(container, data);
      break;
    case 'seed_growth':
      renderSeedGrowthTemplate(container, runRaf);
      break;
    case 'electric_circuit':
    case 'free_body':
    case 'motion_graph':
    case 'wave_interference':
    case 'lens_refraction':
      renderPhysicsTemplate(container, templateName, data, addCleanup);
      break;
    case 'physics_formulas':
      renderPhysicsFormulasTemplate(container);
      break;
    case 'atom':
      renderAtomTemplate(container, data, runRaf);
      break;
    case 'periodic_element':
      renderPeriodicElementTemplate(container, data);
      break;
    case 'reaction':
      renderReactionTemplate(container, data, runRaf);
      break;
    case 'molecule_shape':
      renderMoleculeShapeTemplate(container, data, runRaf);
      break;
    case 'solution_mix':
      renderSolutionMixTemplate(container, data, runRaf);
      break;
    case 'clothing_century':
      renderClothingCenturyTemplate(container, data, callbacks);
      break;
    case 'compare_eras':
      renderCompareErasTemplate(container, data, callbacks);
      break;
    case 'timeline':
      renderTimelineTemplate(container, data);
      break;
    case 'cause_effect':
      renderCauseEffectTemplate(container, data);
      break;
    default:
      container.innerHTML = `<div style="padding:24px;color:#cfc7eb;">Шаблон «${escapeHtml(templateName)}» загружен.</div>`;
  }

  return {
    destroy() {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          // ignore
        }
      }
    }
  };
}

/* ============================================================
   БИОЛОГИЯ: 1. Строение клетки (детализированная, с везикулами и лизосомами)
   ============================================================ */
function renderCellTemplate(container, initialType, data) {
  let mode = data?.template === 'cell_plant' || initialType === 'cell_plant' ? 'plant' : 'animal';

  const organelleDescriptions = {
    nucleus: 'Ядро с ядрышком и порами — «центр управления»: хранит ДНК и синтезирует рРНК.',
    mitochondria: 'Митохондрия с кристами — «энергостанция», вырабатывает энергию АТФ.',
    membrane: 'Клеточная мембрана — двойной слой липидов, избирательно пропускает вещества.',
    er: 'Эндоплазматическая сеть (ЭПС) с рибосомами — синтезирует и транспортирует белки.',
    golgi: 'Аппарат Гольджи — сортирует, упаковывает вещества в пузырьки-везикулы и отправляет к цели.',
    lysosome: 'Лизосома — «служба переработки» клетки: расщепляет ненужные частицы ферментами.',
    ribosome: 'Рибосомы — крошечные «фабрики» сборки белков по матрице мРНК.',
    wall: 'Клеточная стенка из целлюлозы — прочный каркас с порами, есть у растений.',
    chloroplast: 'Хлоропласты со стопками гран — ловят свет и создают глюкозу при фотосинтезе.',
    vacuole: 'Центральная вакуоль — резервуар с клеточным соком, поддерживает упругость (тургор).'
  };

  const render = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:15px;font-weight:700;color:#f5f1fa;">${mode === 'animal' ? 'Животная клетка (детальная схема)' : 'Растительная клетка (детальная схема)'}</span>
          <div style="display:flex;gap:6px;">
            <button data-cell="animal" class="syn-pill-btn ${mode === 'animal' ? 'active' : ''}">Животная</button>
            <button data-cell="plant" class="syn-pill-btn ${mode === 'plant' ? 'active' : ''}">Растительная</button>
          </div>
        </div>

        <svg viewBox="0 0 420 270" width="100%" style="display:block;">
          <defs>
            <radialGradient id="cytoA" cx="45%" cy="40%" r="65%">
              <stop offset="0%" stop-color="#483b7c"/>
              <stop offset="100%" stop-color="#251e45"/>
            </radialGradient>
            <radialGradient id="nucG" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#b79eff"/>
              <stop offset="100%" stop-color="#5840b3"/>
            </radialGradient>
          </defs>

          ${
            mode === 'animal'
              ? `
                <!-- Мембрана -->
                <path data-org="membrane" class="syn-org" d="M 210 24 C 328 20, 384 78, 378 142 C 372 214, 305 248, 208 245 C 102 242, 42 200, 44 132 C 46 66, 108 28, 210 24 Z" fill="url(#cytoA)" stroke="#7ef9e0" stroke-width="4"/>
                <!-- Цитоскелет -->
                <path d="M 76 110 Q 170 95 320 128 M 96 184 Q 210 165 335 190" stroke="rgba(169,155,255,0.16)" stroke-width="1.5" fill="none"/>
                <!-- ЭПС с каналами -->
                <g data-org="er" class="syn-org">
                  <path d="M 152 86 Q 112 104 138 134 Q 108 148 136 172 Q 118 186 144 192" fill="none" stroke="#c08cff" stroke-width="6.5" stroke-linecap="round"/>
                  <circle cx="132" cy="96" r="2.2" fill="#ffd27f"/><circle cx="122" cy="118" r="2.2" fill="#ffd27f"/><circle cx="124" cy="158" r="2.2" fill="#ffd27f"/>
                </g>
                <!-- Ядро с порами и ядрышком -->
                <g data-org="nucleus" class="syn-org">
                  <circle cx="206" cy="128" r="44" fill="url(#nucG)" stroke="#e9d8ff" stroke-width="2.5" stroke-dasharray="14 3"/>
                  <circle cx="216" cy="120" r="14" fill="#2b204d" opacity="0.78"/>
                  <path d="M 185 135 Q 200 148 220 140" stroke="#e9d8ff" stroke-opacity="0.45" stroke-width="2" fill="none"/>
                </g>
                <!-- Митохондрии с кристами -->
                <g data-org="mitochondria" class="syn-org" transform="translate(302,88) rotate(22)">
                  <ellipse cx="0" cy="0" rx="29" ry="14" fill="#ff8fab" stroke="#ffd2dc" stroke-width="2"/>
                  <path d="M -20 0 Q -12 -8 -6 0 Q 0 8 6 0 Q 12 -8 18 0" fill="none" stroke="#611834" stroke-width="2.2"/>
                </g>
                <g data-org="mitochondria" class="syn-org" transform="translate(115,198) rotate(-18)">
                  <ellipse cx="0" cy="0" rx="25" ry="12" fill="#ff8fab" stroke="#ffd2dc" stroke-width="2"/>
                  <path d="M -15 0 Q -8 -6 -2 0 Q 4 6 10 0 Q 15 -5 18 0" fill="none" stroke="#611834" stroke-width="2"/>
                </g>
                <!-- Аппарат Гольджи + движущаяся везикула -->
                <g data-org="golgi" class="syn-org" transform="translate(292,174)">
                  <path d="M -22 -10 Q 0 -18 22 -10 M -26 0 Q 0 -8 26 0 M -20 10 Q 0 2 20 10" fill="none" stroke="#ffd27f" stroke-width="4.5" stroke-linecap="round"/>
                  <circle cx="32" cy="4" r="4.5" fill="#ffd27f" opacity="0.85">
                    <animate attributeName="cx" values="24;46;24" dur="3.4s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.9;0.25;0.9" dur="3.4s" repeatCount="indefinite"/>
                  </circle>
                </g>
                <!-- Лизосомы и рибосомы -->
                <g data-org="lysosome" class="syn-org">
                  <circle cx="246" cy="204" r="11" fill="#63d2ff" fill-opacity="0.72" stroke="#b8f0ff" stroke-width="1.8"/>
                  <circle cx="243" cy="202" r="2.2" fill="#ffffff"/>
                  <circle cx="152" cy="64" r="9.5" fill="#63d2ff" fill-opacity="0.72" stroke="#b8f0ff" stroke-width="1.8"/>
                </g>
                <g data-org="ribosome" class="syn-org">
                  <circle cx="268" cy="134" r="3.2" fill="#7ef9e0"/><circle cx="277" cy="141" r="3.2" fill="#7ef9e0"/>
                  <circle cx="96" cy="142" r="3.2" fill="#7ef9e0"/><circle cx="176" cy="208" r="3.2" fill="#7ef9e0"/>
                </g>
              `
              : `
                <!-- Растительная клетка: клеточная стенка с плазмодесмами + мембрана -->
                <polygon data-org="wall" class="syn-org" points="95,24 325,24 384,135 325,246 95,246 36,135" fill="#2c4a46" stroke="#7ef9e0" stroke-width="6" stroke-linejoin="round"/>
                <polygon data-org="membrane" class="syn-org" points="102,34 318,34 372,135 318,236 102,236 48,135" fill="url(#cytoA)" stroke="#a7f3d0" stroke-width="2" stroke-linejoin="round"/>
                <!-- Вакуоль с пульсацией тургора -->
                <path data-org="vacuole" class="syn-org" d="M 164 64 C 248 54, 316 80, 310 144 C 306 202, 232 214, 175 196 C 145 186, 140 88, 164 64 Z" fill="#5de6ff" fill-opacity="0.28" stroke="#7ef9e0" stroke-width="2"/>
                <!-- Ядро + ЭПС -->
                <path data-org="er" class="syn-org" d="M 88 92 Q 72 118 86 146" fill="none" stroke="#c08cff" stroke-width="5" stroke-linecap="round"/>
                <g data-org="nucleus" class="syn-org">
                  <circle cx="118" cy="118" r="31" fill="url(#nucG)" stroke="#e9d8ff" stroke-width="2" stroke-dasharray="10 3"/>
                  <circle cx="112" cy="112" r="9.5" fill="#2b204d" opacity="0.75"/>
                </g>
                <!-- Хлоропласты с гранами -->
                <g data-org="chloroplast" class="syn-org" transform="translate(132,202) rotate(-14)">
                  <ellipse cx="0" cy="0" rx="26" ry="12.5" fill="#34d399" stroke="#a7f3d0" stroke-width="2"/>
                  <line x1="-12" y1="-5" x2="-12" y2="5" stroke="#065f46" stroke-width="3.2"/>
                  <line x1="0" y1="-6" x2="0" y2="6" stroke="#065f46" stroke-width="3.2"/>
                  <line x1="12" y1="-5" x2="12" y2="5" stroke="#065f46" stroke-width="3.2"/>
                </g>
                <g data-org="chloroplast" class="syn-org" transform="translate(308,74) rotate(26)">
                  <ellipse cx="0" cy="0" rx="25" ry="11.5" fill="#34d399" stroke="#a7f3d0" stroke-width="2"/>
                  <line x1="-10" y1="-4" x2="-10" y2="4" stroke="#065f46" stroke-width="3"/>
                  <line x1="2" y1="-5" x2="2" y2="5" stroke="#065f46" stroke-width="3"/>
                </g>
                <!-- Гольджи и митохондрия -->
                <g data-org="golgi" class="syn-org" transform="translate(210,214)">
                  <path d="M -18 -5 Q 0 -10 18 -5 M -16 3 Q 0 -2 16 3" fill="none" stroke="#ffd27f" stroke-width="3.5" stroke-linecap="round"/>
                </g>
                <g data-org="mitochondria" class="syn-org" transform="translate(312,190) rotate(-25)">
                  <ellipse cx="0" cy="0" rx="22" ry="11" fill="#ff8fab" stroke="#ffd2dc" stroke-width="1.8"/>
                  <path d="M -14 0 Q -7 -5 0 0 Q 7 5 14 0" fill="none" stroke="#611834" stroke-width="1.8"/>
                </g>
              `
          }
        </svg>

        <div class="syn-cell-tip" style="margin-top:8px;padding:10px 14px;border-radius:12px;background:rgba(20,17,38,0.65);font-size:13.5px;color:#d8d0f2;min-height:46px;display:flex;align-items:center;">
          Наведи курсор на любой органоид (ядро, ЭПС, Гольджи, лизосомы, хлоропласты), чтобы изучить его!
        </div>
      </div>
    `;

    container.querySelectorAll('[data-cell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.getAttribute('data-cell');
        render();
      });
    });

    const tip = container.querySelector('.syn-cell-tip');
    container.querySelectorAll('[data-org]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.style.transition = 'filter 0.25s ease';
      el.addEventListener('mouseenter', () => {
        const key = el.getAttribute('data-org');
        el.style.filter = 'drop-shadow(0 0 8px rgba(126,249,224,0.8))';
        if (tip && organelleDescriptions[key]) {
          tip.textContent = organelleDescriptions[key];
          tip.style.color = '#7ef9e0';
        }
      });
      el.addEventListener('mouseleave', () => {
        el.style.filter = '';
      });
    });
  };

  render();
}

/* ============================================================
   БИОЛОГИЯ: 2. Деление клетки — митоз (4 фазы каждые 2 сек)
   ============================================================ */
function renderMitosisTemplate(container, runRaf, addCleanup) {
  const phases = [
    { name: 'Профаза', desc: 'Хромосомы спирализуются, ядерная оболочка растворяется.' },
    { name: 'Метафаза', desc: 'Хромосомы выстраиваются ровно по экватору клетки.' },
    { name: 'Анафаза', desc: 'Нити веретена деления плавно растаскивают хроматиды к полюсам.' },
    { name: 'Телофаза', desc: 'Формируются два новых ядра и перетяжка делит клетку пополам.' }
  ];

  let phaseIdx = 0;
  let paused = false;

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(169,155,255,0.22);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span class="syn-mit-title" style="font-size:15px;font-weight:700;color:#7ef9e0;">Фаза 1/4: Профаза</span>
        <div style="display:flex;gap:5px;">
          ${phases.map((p, i) => `<button data-phase="${i}" class="syn-pill-btn ${i === 0 ? 'active' : ''}">${p.name}</button>`).join('')}
          <button data-pause class="syn-pill-btn">Пауза</button>
        </div>
      </div>

      <svg viewBox="0 0 420 230" width="100%" style="display:block;">
        <!-- Мембрана (растягивается и сжимается в телофазе) -->
        <path class="mit-membrane" d="M 210 28 C 305 28 335 72 335 115 C 335 158 305 202 210 202 C 115 202 85 158 85 115 C 85 72 115 28 210 28 Z" fill="rgba(72,58,125,0.52)" stroke="#7ef9e0" stroke-width="3"/>
        <!-- Центриоли на полюсах -->
        <g class="mit-centrioles">
          <circle cx="88" cy="115" r="6" fill="#ffd27f" opacity="0.85"/>
          <circle cx="332" cy="115" r="6" fill="#ffd27f" opacity="0.85"/>
        </g>
        <!-- Ядерная оболочка (пунктир) и ядрышко -->
        <circle class="mit-nuc-old" cx="210" cy="115" r="52" fill="none" stroke="#c08cff" stroke-width="2" stroke-dasharray="6 5"/>
        <!-- Нити веретена деления к центромерам -->
        <g class="mit-spindle" opacity="0"></g>
        <!-- Новые ядра (появляются в телофазе) -->
        <circle class="mit-nuc-l" cx="130" cy="115" r="36" fill="none" stroke="#c08cff" stroke-width="2.2" stroke-dasharray="5 4" opacity="0"/>
        <circle class="mit-nuc-r" cx="290" cy="115" r="36" fill="none" stroke="#c08cff" stroke-width="2.2" stroke-dasharray="5 4" opacity="0"/>

        <!-- 3 пары хроматид с центромерами, плавно расходящиеся к полюсам -->
        <g class="mit-chroms"></g>
      </svg>

      <div class="syn-mit-desc" style="margin-top:6px;font-size:13.5px;color:#e6dff2;text-align:center;">
        ${phases[0].desc}
      </div>
    </div>
  `;

  const titleEl = container.querySelector('.syn-mit-title');
  const descEl = container.querySelector('.syn-mit-desc');
  const memEl = container.querySelector('.mit-membrane');
  const nucOld = container.querySelector('.mit-nuc-old');
  const spindle = container.querySelector('.mit-spindle');
  const nucL = container.querySelector('.mit-nuc-l');
  const nucR = container.querySelector('.mit-nuc-r');
  const chromGroup = container.querySelector('.mit-chroms');

  const syncUi = () => {
    titleEl.textContent = `Фаза ${phaseIdx + 1}/4: ${phases[phaseIdx].name}`;
    descEl.textContent = phases[phaseIdx].desc;
    container.querySelectorAll('[data-phase]').forEach((b) => {
      b.classList.toggle('active', Number(b.getAttribute('data-phase')) === phaseIdx);
    });
  };

  const timer = setInterval(() => {
    if (paused) return;
    phaseIdx = (phaseIdx + 1) % 4;
    syncUi();
  }, 2000);
  addCleanup(() => clearInterval(timer));

  container.querySelectorAll('[data-phase]').forEach((b) => {
    b.addEventListener('click', () => {
      phaseIdx = Number(b.getAttribute('data-phase'));
      syncUi();
    });
  });

  const pauseBtn = container.querySelector('[data-pause]');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Пуск' : 'Пауза';
    pauseBtn.classList.toggle('active', paused);
  });

  // Плавная интерполяция позиций хромосом и перетяжки
  let sep = 0;
  let align = 0;
  let pinch = 0;
  let oldNucOp = 1;
  let newNucOp = 0;
  let spindleOp = 0;

  const ys = [78, 115, 152];
  const colors = ['#7ef9e0', '#ffd27f', '#ffb3c1'];

  runRaf(() => {
    const tSep = phaseIdx >= 2 ? 1 : 0;
    const tAlign = phaseIdx === 1 ? 1 : 0;
    const tPinch = phaseIdx === 3 ? 1 : 0;
    const tOldNuc = phaseIdx === 0 ? 1 : 0;
    const tNewNuc = phaseIdx === 3 ? 1 : 0;
    const tSpindle = phaseIdx === 1 || phaseIdx === 2 ? 1 : 0;

    sep += (tSep - sep) * 0.1;
    align += (tAlign - align) * 0.12;
    pinch += (tPinch - pinch) * 0.08;
    oldNucOp += (tOldNuc - oldNucOp) * 0.12;
    newNucOp += (tNewNuc - newNucOp) * 0.1;
    spindleOp += (tSpindle - spindleOp) * 0.12;

    nucOld.setAttribute('opacity', oldNucOp.toFixed(2));
    nucL.setAttribute('opacity', newNucOp.toFixed(2));
    nucR.setAttribute('opacity', newNucOp.toFixed(2));
    spindle.setAttribute('opacity', spindleOp.toFixed(2));

    // Перетяжка мембраны в телофазе
    const w = 125 + sep * 42;
    const waist = 87 - pinch * 52;
    memEl.setAttribute(
      'd',
      `M 210 ${115 - waist} C ${210 + w * 0.45} ${115 - waist - pinch * 24}, ${210 + w} ${50}, ${210 + w} 115 C ${210 + w} ${180}, ${210 + w * 0.45} ${115 + waist + pinch * 24}, 210 ${115 + waist} C ${210 - w * 0.45} ${115 + waist + pinch * 24}, ${210 - w} ${180}, ${210 - w} 115 C ${210 - w} ${50}, ${210 - w * 0.45} ${115 - waist - pinch * 24}, 210 ${115 - waist} Z`
    );

    const spreadX = sep * 78;
    const proScatter = (1 - align) * (1 - sep) * 18;
    const poleL = 88 - sep * 18;
    const poleR = 332 + sep * 18;

    const centGroup = container.querySelector('.mit-centrioles');
    if (centGroup) {
      centGroup.innerHTML = `
        <circle cx="${poleL.toFixed(1)}" cy="115" r="5.5" fill="#ffd27f"/>
        <circle cx="${poleR.toFixed(1)}" cy="115" r="5.5" fill="#ffd27f"/>
      `;
    }

    let html = '';
    let spHtml = '';
    for (let i = 0; i < 3; i++) {
      const cy = ys[i] + (i === 0 ? -proScatter : i === 2 ? proScatter : 0) * 0.4;
      const offsetX = (i === 1 ? 10 : -10) * (1 - align) * (1 - sep);
      const lx = 210 - spreadX + offsetX;
      const rx = 210 + spreadX + offsetX;
      const c = colors[i];

      spHtml += `
        <line x1="${poleL.toFixed(1)}" y1="115" x2="${lx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#ffd27f" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="4 3"/>
        <line x1="${poleR.toFixed(1)}" y1="115" x2="${rx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#ffd27f" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="4 3"/>
      `;

      html += `
        <path d="M ${lx - 4} ${cy - 11} Q ${lx + 2} ${cy} ${lx - 4} ${cy + 11}" stroke="${c}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <circle cx="${(lx - 1).toFixed(1)}" cy="${cy.toFixed(1)}" r="2.8" fill="#ffffff"/>
        <path d="M ${rx + 4} ${cy - 11} Q ${rx - 2} ${cy} ${rx + 4} ${cy + 11}" stroke="${c}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <circle cx="${(rx + 1).toFixed(1)}" cy="${cy.toFixed(1)}" r="2.8" fill="#ffffff"/>
      `;
    }
    spindle.innerHTML = spHtml;
    chromGroup.innerHTML = html;
  });
}

/* ============================================================
   БИОЛОГИЯ: 3. Одноклеточные — Амёба и Инфузория-туфелька
   ============================================================ */
function renderUnicellularTemplate(container, initialName, runRaf) {
  let organism = initialName === 'paramecium' ? 'paramecium' : 'amoeba';

  const drawShell = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:15px;font-weight:700;color:#f5f1fa;">${organism === 'amoeba' ? 'Амёба (ложноножки)' : 'Инфузория-туфелька (реснички)'}</span>
          <div style="display:flex;gap:6px;">
            <button data-orgbtn="amoeba" class="syn-pill-btn ${organism === 'amoeba' ? 'active' : ''}">Амёба</button>
            <button data-orgbtn="paramecium" class="syn-pill-btn ${organism === 'paramecium' ? 'active' : ''}">Инфузория</button>
          </div>
        </div>
        <svg class="uni-svg" viewBox="0 0 420 230" width="100%" style="display:block;">
          ${
            organism === 'amoeba'
              ? `
                <path class="amoeba-body" fill="rgba(126,249,224,0.2)" stroke="#7ef9e0" stroke-width="3.5"/>
                <circle class="amoeba-nuc" cx="205" cy="116" r="22" fill="#a99bff" fill-opacity="0.76" stroke="#e9d8ff" stroke-width="2"/>
                <circle class="amoeba-vac" cx="152" cy="94" r="14" fill="rgba(93,230,255,0.45)" stroke="#9beeff" stroke-width="2"/>
                <!-- Пищеварительная вакуоль с захваченной частицей (фагоцитоз) -->
                <g class="amoeba-food">
                  <circle cx="246" cy="142" r="11" fill="rgba(255,210,127,0.28)" stroke="#ffd27f" stroke-width="1.8"/>
                  <circle cx="246" cy="142" r="4.5" fill="#ffd27f"/>
                </g>
                <text x="205" y="120" text-anchor="middle" fill="#fff" font-size="11">Ядро</text>
                <text x="152" y="72" text-anchor="middle" fill="#9beeff" font-size="10.5">Сократ. вакуоль</text>
                <text x="246" y="168" text-anchor="middle" fill="#ffd27f" font-size="10">Пищевар. вакуоль</text>
                <text x="322" y="92" fill="#7ef9e0" font-size="11.5">Ложноножки</text>
              `
              : `
                <g class="para-cilia"></g>
                <path d="M 105 115 C 102 68, 175 56, 250 66 C 322 76, 345 100, 336 125 C 325 156, 250 176, 175 166 C 122 158, 108 140, 105 115 Z" fill="rgba(169,155,255,0.22)" stroke="#c08cff" stroke-width="3.2"/>
                <path d="M 134 126 Q 178 136 208 118" fill="none" stroke="#ffd27f" stroke-width="3.2" stroke-linecap="round"/>
                <!-- Большое и малое ядра -->
                <ellipse cx="226" cy="104" rx="26" ry="15" fill="#7ef9e0" fill-opacity="0.72" stroke="#b8fff1" stroke-width="2"/>
                <circle cx="248" cy="124" r="6.5" fill="#ffd27f" stroke="#fff" stroke-width="1"/>
                <!-- Сократительные вакуоли со звёздочками -->
                <g class="para-vac-g1">
                  <path d="M 145 92 L 145 120 M 131 106 L 159 106 M 136 97 L 154 115 M 154 97 L 136 115" stroke="#9beeff" stroke-width="1.5" opacity="0.65"/>
                  <circle class="para-vac1" cx="145" cy="106" r="10" fill="rgba(93,230,255,0.55)" stroke="#7ef9e0" stroke-width="1.5"/>
                </g>
                <g class="para-vac-g2">
                  <path d="M 292 98 L 292 126 M 278 112 L 306 112 M 283 103 L 301 121 M 301 103 L 283 121" stroke="#9beeff" stroke-width="1.5" opacity="0.65"/>
                  <circle class="para-vac2" cx="292" cy="112" r="10" fill="rgba(93,230,255,0.55)" stroke="#7ef9e0" stroke-width="1.5"/>
                </g>
                <text x="226" y="107" text-anchor="middle" fill="#17142b" font-size="9.5" font-weight="800">Макронуклеус</text>
                <text x="255" y="138" fill="#ffd27f" font-size="9.5">Микронуклеус</text>
                <text x="166" y="150" fill="#ffd27f" font-size="10.5">Клеточный рот</text>
                <text x="215" y="36" text-anchor="middle" fill="#7ef9e0" font-size="11.5">Волнообразное движение ресничек</text>
              `
          }
        </svg>
      </div>
    `;

    container.querySelectorAll('[data-orgbtn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        organism = btn.getAttribute('data-orgbtn');
        drawShell();
      });
    });
  };

  drawShell();

  runRaf((t) => {
    if (organism === 'amoeba') {
      const body = container.querySelector('.amoeba-body');
      const vac = container.querySelector('.amoeba-vac');
      const nuc = container.querySelector('.amoeba-nuc');
      if (!body) return;

      // Полярная гладкая кривая с 5 вытягивающимися ложноножками
      const pts = [];
      const count = 24;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r =
          72 +
          24 * Math.sin(3 * a + t * 1.4) +
          16 * Math.cos(5 * a - t * 1.1) +
          10 * Math.sin(2 * a + t * 0.8);
        pts.push([210 + Math.cos(a) * r * 1.28, 120 + Math.sin(a) * r * 0.78]);
      }

      let d = '';
      for (let i = 0; i < count; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % count];
        const mx = (p0[0] + p1[0]) / 2;
        const my = (p0[1] + p1[1]) / 2;
        if (i === 0) {
          const prev = pts[count - 1];
          d += `M ${((prev[0] + p0[0]) / 2).toFixed(1)} ${((prev[1] + p0[1]) / 2).toFixed(1)} `;
        }
        d += `Q ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} `;
      }
      body.setAttribute('d', d + 'Z');

      const vacR = 9 + 6 * (0.5 + 0.5 * Math.sin(t * 2.2));
      if (vac) vac.setAttribute('r', vacR.toFixed(1));
      if (nuc) nuc.setAttribute('cx', (205 + Math.sin(t * 0.7) * 8).toFixed(1));
    } else {
      const ciliaG = container.querySelector('.para-cilia');
      const v1 = container.querySelector('.para-vac1');
      const v2 = container.querySelector('.para-vac2');
      if (!ciliaG) return;

      // 44 реснички по овалу туфельки, волнообразно колеблющиеся
      let ciliaSvg = '';
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bx = 220 + Math.cos(a) * 116;
        const by = 115 + Math.sin(a) * 52;
        const wave = Math.sin(a * 3 - t * 8.5) * 0.42;
        const len = 13;
        const ex = bx + Math.cos(a + wave) * len;
        const ey = by + Math.sin(a + wave) * len;
        ciliaSvg += `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#7ef9e0" stroke-width="1.8" stroke-linecap="round"/>`;
      }
      ciliaG.innerHTML = ciliaSvg;

      if (v1) v1.setAttribute('r', (6 + 5 * (0.5 + 0.5 * Math.sin(t * 2.5))).toFixed(1));
      if (v2) v2.setAttribute('r', (6 + 5 * (0.5 + 0.5 * Math.cos(t * 2.5))).toFixed(1));
    }
  });
}

/* ============================================================
   БИОЛОГИЯ: 4. Пищеварительная система (путь еды точкой)
   ============================================================ */
function renderDigestionTemplate(container, runRaf) {
  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.22);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:15px;font-weight:700;color:#f5f1fa;">Пищеварительная система</span>
        <span class="dig-stage" style="font-size:12.5px;color:#ffd27f;font-weight:600;">1. Рот</span>
      </div>
      <svg viewBox="0 0 420 260" width="100%" style="display:block;">
        <!-- Печень и поджелудочная железа -->
        <path d="M 218 118 Q 272 112 278 134 Q 254 148 220 138 Z" fill="#a855f7" fill-opacity="0.35" stroke="#c08cff" stroke-width="1.8"/>
        <text x="284" y="132" fill="#c08cff" font-size="10.5">Печень (желчь)</text>
        <path d="M 224 156 Q 266 154 274 164 Q 250 172 224 166 Z" fill="#ffd27f" fill-opacity="0.32" stroke="#ffd27f" stroke-width="1.5"/>
        <text x="282" y="166" fill="#ffd27f" font-size="10">Поджелудочная</text>

        <!-- Рот и пищевод -->
        <path d="M 110 34 Q 150 32 162 56 L 162 108" fill="none" stroke="#c08cff" stroke-width="14" stroke-linecap="round" opacity="0.45"/>
        <!-- Желудок -->
        <path d="M 162 108 C 165 135, 226 122, 224 152 C 222 175, 165 180, 152 152 C 145 135, 162 122, 162 108 Z" fill="#ff8fab" fill-opacity="0.32" stroke="#ffb3c1" stroke-width="3"/>
        <!-- Кишечник -->
        <path d="M 195 168 C 235 170, 260 190, 220 202 C 175 212, 165 224, 215 228 C 268 232, 285 205, 285 175 L 285 235" fill="none" stroke="#ffd27f" stroke-width="14" stroke-linecap="round" opacity="0.35"/>

        <!-- Главная траектория пути еды -->
        <path class="dig-path" d="M 110 34 Q 150 32 162 56 L 162 115 C 162 145 210 142 204 162 C 195 180 245 182 225 198 C 185 214 195 226 238 226 C 276 226 285 202 285 238" fill="none" stroke="#7ef9e0" stroke-width="2.2" stroke-dasharray="4 4"/>

        <!-- Подписи органов и ферментов -->
        <text x="86" y="38" fill="#f5f1fa" font-size="12" text-anchor="end">Рот (амилаза)</text>
        <text x="144" y="88" fill="#d6cef0" font-size="11.5" text-anchor="end">Пищевод</text>
        <text x="132" y="152" fill="#ffb3c1" font-size="11.5" text-anchor="end">Желудок (пепсин)</text>
        <text x="300" y="206" fill="#ffd27f" font-size="11.5">Кишечник (ворсинки)</text>

        <!-- Светящийся шарик еды -->
        <circle class="dig-dot-halo" cx="110" cy="34" r="13" fill="#ffd27f" opacity="0.32"/>
        <circle class="dig-dot" cx="110" cy="34" r="6.5" fill="#7ef9e0" stroke="#ffffff" stroke-width="2"/>
      </svg>
    </div>
  `;

  const path = container.querySelector('.dig-path');
  const dot = container.querySelector('.dig-dot');
  const halo = container.querySelector('.dig-dot-halo');
  const stageEl = container.querySelector('.dig-stage');
  const total = path?.getTotalLength ? path.getTotalLength() : 300;

  runRaf((t) => {
    if (!path || !dot) return;
    const p = (t * 0.14) % 1;
    const pt = path.getPointAtLength(p * total);
    dot.setAttribute('cx', pt.x.toFixed(1));
    dot.setAttribute('cy', pt.y.toFixed(1));
    halo.setAttribute('cx', pt.x.toFixed(1));
    halo.setAttribute('cy', pt.y.toFixed(1));

    if (p < 0.16) stageEl.textContent = '1. Рот: измельчение и слюна';
    else if (p < 0.34) stageEl.textContent = '2. Пищевод: движение в желудок';
    else if (p < 0.56) stageEl.textContent = '3. Желудок: ферменты и кислота';
    else stageEl.textContent = '4. Кишечник: всасывание в кровь';
  });
}

/* ============================================================
   БИОЛОГИЯ: 5. Кровообращение и сердце (2 круга + эритроциты)
   ============================================================ */
function renderBloodFlowTemplate(container, runRaf) {
  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(255,179,193,0.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="font-size:15px;font-weight:700;color:#f5f1fa;">Кровообращение: 2 круга</span>
        <span style="font-size:12px;color:#d6cef0;"><span style="color:#ff7b9c;">●</span> артериальная (O₂) &nbsp; <span style="color:#78a6ff;">●</span> венозная (CO₂)</span>
      </div>
      <svg viewBox="0 0 420 250" width="100%" style="display:block;">
        <!-- Лёгкие (верх) -->
        <ellipse cx="210" cy="36" rx="76" ry="22" fill="rgba(126,249,224,0.16)" stroke="#7ef9e0" stroke-width="2"/>
        <text x="210" y="40" text-anchor="middle" fill="#7ef9e0" font-size="12" font-weight="600">Лёгкие (газообмен)</text>

        <!-- Органы тела (низ) -->
        <rect x="132" y="198" width="156" height="36" rx="14" fill="rgba(255,210,127,0.15)" stroke="#ffd27f" stroke-width="2"/>
        <text x="210" y="220" text-anchor="middle" fill="#ffd27f" font-size="12" font-weight="600">Органы и ткани тела</text>

        <!-- Сердце с пульсацией и клапанами (центр) -->
        <g class="bf-heart" style="transform-origin:210px 127px;">
          <rect x="166" y="96" width="88" height="62" rx="18" fill="rgba(255,123,156,0.24)" stroke="#ffb3c1" stroke-width="2.5"/>
          <line x1="210" y1="96" x2="210" y2="158" stroke="#ffb3c1" stroke-width="2"/>
          <line x1="166" y1="127" x2="254" y2="127" stroke="#ffb3c1" stroke-width="1.5" stroke-dasharray="5 3"/>
          <circle cx="188" cy="127" r="3" fill="#7ef9e0"/><circle cx="232" cy="127" r="3" fill="#7ef9e0"/>
          <text x="188" y="116" text-anchor="middle" fill="#9bc2ff" font-size="10" font-weight="700">ПП</text>
          <text x="188" y="146" text-anchor="middle" fill="#9bc2ff" font-size="10" font-weight="700">ПЖ</text>
          <text x="232" y="116" text-anchor="middle" fill="#ff9eb5" font-size="10" font-weight="700">ЛП</text>
          <text x="232" y="146" text-anchor="middle" fill="#ff9eb5" font-size="10" font-weight="700">ЛЖ</text>
        </g>

        <!-- Путь малого круга: ПЖ -> Лёгкие -> ЛП -->
        <path class="bf-small" d="M 188 140 C 125 140, 125 36, 210 36 C 295 36, 295 112, 232 112" fill="none" stroke="#9b8cff" stroke-opacity="0.45" stroke-width="5"/>
        <!-- Путь большого круга: ЛЖ -> Органы -> ПП -->
        <path class="bf-large" d="M 232 140 C 330 140, 330 216, 210 216 C 90 216, 90 112, 188 112" fill="none" stroke="#ff8fab" stroke-opacity="0.45" stroke-width="5"/>

        <text x="64" y="84" fill="#a99bff" font-size="11">Малый круг</text>
        <text x="318" y="178" fill="#ffb3c1" font-size="11">Большой круг</text>

        <g class="bf-rbcs"></g>
      </svg>
    </div>
  `;

  const small = container.querySelector('.bf-small');
  const large = container.querySelector('.bf-large');
  const rbcs = container.querySelector('.bf-rbcs');
  const sLen = small.getTotalLength();
  const lLen = large.getTotalLength();

  const heart = container.querySelector('.bf-heart');

  runRaf((t) => {
    if (heart) {
      const beat = 1 + 0.045 * Math.pow(Math.max(0, Math.sin(t * 3.6)), 4);
      heart.setAttribute('transform', `scale(${beat.toFixed(3)})`);
    }
    let html = '';
    // 6 эритроцитов на малом круге
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.22 + i / 6) % 1;
      const pt = small.getPointAtLength(p * sLen);
      const color = p < 0.5 ? '#78a6ff' : '#ff6b8b';
      html += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    }
    // 8 эритроцитов на большом круге
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.16 + i / 8) % 1;
      const pt = large.getPointAtLength(p * lLen);
      const color = p < 0.5 ? '#ff6b8b' : '#78a6ff';
      html += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.8" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    }
    rbcs.innerHTML = html;
  });
}

/* ============================================================
   БИОЛОГИЯ (бонус): Фотосинтез
   ============================================================ */
function renderPhotosynthesisTemplate(container, runRaf) {
  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.22);">
      <div style="font-size:15px;font-weight:700;color:#7ef9e0;margin-bottom:8px;">Фотосинтез в листе и хлоропластах</div>
      <svg viewBox="0 0 420 230" width="100%" style="display:block;">
        <circle cx="64" cy="48" r="24" fill="#ffd27f"/>
        <path class="ps-rays" d="M 92 66 L 164 102 M 84 82 L 154 118 M 102 52 L 176 88" stroke="#ffd27f" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>
        <!-- Лист с жилками и хлоропластами -->
        <path d="M 150 130 C 175 70, 268 70, 302 120 C 268 176, 175 176, 150 130 Z" fill="#276749" stroke="#7ef9e0" stroke-width="3"/>
        <path d="M 140 132 Q 218 122 292 120" fill="none" stroke="#a7f3d0" stroke-width="2.5"/>
        <ellipse cx="206" cy="104" rx="11" ry="6" fill="#34d399" stroke="#a7f3d0"/>
        <ellipse cx="242" cy="108" rx="11" ry="6" fill="#34d399" stroke="#a7f3d0"/>
        <ellipse cx="222" cy="142" rx="11" ry="6" fill="#34d399" stroke="#a7f3d0"/>
        <!-- Анимированные молекулы -->
        <g class="ps-molecules"></g>
        <!-- Входы и выходы -->
        <text x="54" y="138" fill="#9beeff" font-size="12.5" font-weight="600">CO₂ + H₂O →</text>
        <text x="312" y="114" fill="#ffd27f" font-size="12.5" font-weight="700">→ Глюкоза</text>
        <text x="312" y="138" fill="#7ef9e0" font-size="12.5" font-weight="700">→ O₂ (кислород)</text>
        <text x="215" y="202" text-anchor="middle" fill="#d6cef0" font-size="12">6CO₂ + 6H₂O + свет → C₆H₁₂O₆ + 6O₂</text>
      </svg>
    </div>
  `;
  const rays = container.querySelector('.ps-rays');
  const mols = container.querySelector('.ps-molecules');
  runRaf((t) => {
    if (rays) rays.setAttribute('stroke-dashoffset', (-t * 26).toFixed(1));
    if (mols) {
      const p1 = (t * 0.45) % 1;
      const p2 = (t * 0.45 + 0.5) % 1;
      mols.innerHTML = `
        <circle cx="${(105 + p1 * 72).toFixed(1)}" cy="${(152 - p1 * 18).toFixed(1)}" r="4.5" fill="#63d2ff" opacity="${Math.sin(p1 * Math.PI).toFixed(2)}"/>
        <circle cx="${(265 + p2 * 70).toFixed(1)}" cy="${(115 - p2 * 22).toFixed(1)}" r="4.5" fill="#7ef9e0" opacity="${Math.sin(p2 * Math.PI).toFixed(2)}"/>
      `;
    }
  });
}

/* ============================================================
   БИОЛОГИЯ: 6. Строение семян (двудольные и однодольные)
   ============================================================ */
function renderSeedStructureTemplate(container, data) {
  let seedType = data?.seedType === 'monocot' ? 'monocot' : 'dicot';

  const partDescriptions = {
    coat: 'Семенная кожура — плотный защитный покров, оберегает зародыш от высыхания, холода и бактерий.',
    cotyledon: 'Семядоли — первые зародышевые листья. У фасоли две крупные семядоли хранят запас белков и крахмала.',
    scutellum: 'Щиток (одна семядоля) — передаёт питательные вещества из эндосперма растущему зародышу пшеницы.',
    endosperm: 'Эндосперм — главная «кладовая» крахмала, жиров и белков у однодольных семян (пшеница, кукуруза).',
    radicle: 'Зародышевый корешок — пробивается из семени самым первым и даёт начало главному корню.',
    stem: 'Зародышевый стебелёк — соединяет корешок и почечку, выносит росток на поверхность почвы.',
    plumule: 'Зародышевая почечка — крошечные сложенные листочки, из которых вырастают стебель и первые листья.',
    micropyle: 'Семявход (микропиле) и рубчик — крошечное отверстие, через которое семя впитывает воду при набухании.'
  };

  const render = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.24);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:15px;font-weight:700;color:#f5f1fa;">
            ${seedType === 'dicot' ? 'Двудольное семя (фасоль)' : 'Однодольное семя (зерновка пшеницы)'}
          </span>
          <div style="display:flex;gap:6px;">
            <button data-seed="dicot" class="syn-pill-btn ${seedType === 'dicot' ? 'active' : ''}">Двудольное (фасоль)</button>
            <button data-seed="monocot" class="syn-pill-btn ${seedType === 'monocot' ? 'active' : ''}">Однодольное (пшеница)</button>
          </div>
        </div>

        <svg viewBox="0 0 420 250" width="100%" style="display:block;">
          <defs>
            <linearGradient id="cotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fde68a"/>
              <stop offset="100%" stop-color="#d97706"/>
            </linearGradient>
            <linearGradient id="endoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef3c7"/>
              <stop offset="100%" stop-color="#f59e0b"/>
            </linearGradient>
          </defs>

          ${
            seedType === 'dicot'
              ? `
                <!-- Кожура семени фасоли -->
                <path data-spart="coat" class="syn-org" d="M 150 42 C 250 22, 338 66, 334 134 C 330 202, 232 228, 146 206 C 95 194, 84 156, 112 128 C 128 112, 128 96, 108 78 C 96 64, 115 48, 150 42 Z" fill="#7c2d12" stroke="#fdba74" stroke-width="5"/>
                <!-- Две крупные семядоли (развёрнутый вид) -->
                <path data-spart="cotyledon" class="syn-org" d="M 155 50 C 242 34, 322 72, 318 134 C 314 192, 228 214, 154 196 C 115 186, 108 152, 128 130 C 142 114, 140 94, 122 76 C 112 64, 130 54, 155 50 Z" fill="url(#cotGrad)" opacity="0.92"/>
                <path data-spart="cotyledon" class="syn-org" d="M 192 64 C 248 64, 298 92, 294 138 C 290 176, 240 192, 192 184 Z" fill="#fef08a" opacity="0.55" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 3"/>
                <!-- Рубчик и семявход -->
                <ellipse data-spart="micropyle" class="syn-org" cx="116" cy="112" rx="7" ry="15" fill="#29140a" stroke="#fbbf24" stroke-width="1.5"/>
                <circle data-spart="micropyle" class="syn-org" cx="117" cy="94" r="4" fill="#38bdf8"/>
                <!-- Зародыш (корешок, стебелёк, почечка) -->
                <path data-spart="radicle" class="syn-org" d="M 134 114 Q 138 148 158 172 Q 148 148 152 122 Z" fill="#34d399" stroke="#065f46" stroke-width="1.5"/>
                <path data-spart="stem" class="syn-org" d="M 138 100 L 154 100 L 152 122 L 136 122 Z" fill="#6ee7b7" stroke="#065f46" stroke-width="1.5"/>
                <path data-spart="plumule" class="syn-org" d="M 146 102 C 138 82, 156 68, 174 78 C 166 96, 156 102, 146 102 Z" fill="#10b981" stroke="#064e3b" stroke-width="1.5"/>
                <!-- Подписи -->
                <text x="242" y="130" text-anchor="middle" fill="#451a03" font-size="13" font-weight="800">Семядоли (запас)</text>
                <text x="64" y="92" fill="#9beeff" font-size="10.5" text-anchor="end">Семявход</text>
                <text x="64" y="118" fill="#fbbf24" font-size="10.5" text-anchor="end">Рубчик</text>
                <text x="192" y="72" fill="#064e3b" font-size="11" font-weight="700">Почечка</text>
                <text x="172" y="166" fill="#064e3b" font-size="11" font-weight="700">Корешок</text>
                <text x="338" y="64" fill="#fdba74" font-size="11">Кожура</text>
              `
              : `
                <!-- Зерновка пшеницы (однодольное) -->
                <path data-spart="coat" class="syn-org" d="M 210 28 C 282 32, 314 96, 304 166 C 296 208, 255 224, 210 224 C 165 224, 124 208, 116 166 C 106 96, 138 32, 210 28 Z" fill="#92400e" stroke="#fdba74" stroke-width="5"/>
                <!-- Эндосперм (большая мучнистая часть) -->
                <path data-spart="endosperm" class="syn-org" d="M 210 36 C 272 40, 300 94, 292 152 C 254 146, 200 156, 168 186 C 134 176, 122 142, 126 102 C 132 54, 166 36, 210 36 Z" fill="url(#endoGrad)"/>
                <!-- Щиток (единственная семядоля) -->
                <path data-spart="scutellum" class="syn-org" d="M 164 176 Q 218 140 278 160 Q 254 198 185 204 Z" fill="#fef08a" stroke="#b45309" stroke-width="1.8"/>
                <!-- Зародыш в нижней части -->
                <path data-spart="plumule" class="syn-org" d="M 212 162 C 224 142, 240 148, 232 172 Z" fill="#10b981" stroke="#064e3b" stroke-width="1.5"/>
                <path data-spart="stem" class="syn-org" d="M 210 170 L 228 170 L 226 184 L 208 184 Z" fill="#6ee7b7" stroke="#065f46" stroke-width="1.2"/>
                <path data-spart="radicle" class="syn-org" d="M 208 182 Q 204 206 186 212 Q 214 210 224 184 Z" fill="#34d399" stroke="#065f46" stroke-width="1.5"/>
                <!-- Подписи -->
                <text x="210" y="96" text-anchor="middle" fill="#451a03" font-size="13.5" font-weight="800">Эндосперм</text>
                <text x="210" y="114" text-anchor="middle" fill="#78350f" font-size="11">(запас крахмала и белка)</text>
                <text x="150" y="192" text-anchor="end" fill="#fef08a" font-size="11.5">Щиток (1 семядоля)</text>
                <text x="248" y="156" fill="#064e3b" font-size="11" font-weight="700">Почечка</text>
                <text x="242" y="210" fill="#a7f3d0" font-size="11" font-weight="700">Корешок</text>
                <text x="316" y="72" fill="#fdba74" font-size="11">Плодовая кожура</text>
              `
          }
        </svg>

        <div class="syn-seed-tip" style="margin-top:8px;padding:10px 14px;border-radius:12px;background:rgba(20,17,38,0.65);font-size:13.5px;color:#d8d0f2;min-height:46px;display:flex;align-items:center;">
          Наведи курсор или нажми на часть семени, чтобы увидеть её функцию для прорастания!
        </div>
      </div>
    `;

    container.querySelectorAll('[data-seed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        seedType = btn.getAttribute('data-seed');
        render();
      });
    });

    const tip = container.querySelector('.syn-seed-tip');
    container.querySelectorAll('[data-spart]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.style.transition = 'filter 0.22s ease';
      const showHint = () => {
        const key = el.getAttribute('data-spart');
        if (tip && partDescriptions[key]) {
          tip.textContent = partDescriptions[key];
          tip.style.color = '#7ef9e0';
        }
      };
      el.addEventListener('mouseenter', () => {
        el.style.filter = 'drop-shadow(0 0 8px rgba(126,249,224,0.85))';
        showHint();
      });
      el.addEventListener('click', showHint);
      el.addEventListener('mouseleave', () => {
        el.style.filter = '';
      });
    });
  };
  render();
}

/* ============================================================
   БИОЛОГИЯ: 7. Рост и прорастание семян (с опытом по условиям)
   ============================================================ */
function renderSeedGrowthTemplate(container, runRaf) {
  let day = 0; // 0..10 дней
  let autoPlay = true;
  let hasWater = true;
  let hasWarmth = true;
  let hasOxygen = true;

  const stageNames = [
    'День 1: Набухание — семя впитывает воду через семявход',
    'День 3: Корешок — первым пробивается вниз за водой',
    'День 5: Петелька стебелька — выносит семядоли к свету',
    'День 7: Настоящие листья — запускается фотосинтез',
    'День 10: Молодое растение с корневыми волосками'
  ];

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(126,249,224,0.24);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:15px;font-weight:700;color:#7ef9e0;">Рост и прорастание семени</span>
        <div style="display:flex;gap:5px;align-items:center;">
          <span class="sg-day-badge" style="font-size:12px;font-weight:700;color:#ffd27f;">День 1</span>
          <button class="sg-play syn-pill-btn active">Авторост</button>
        </div>
      </div>

      <svg viewBox="0 0 420 220" width="100%" style="display:block;">
        <defs>
          <linearGradient id="skyBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1d2b53"/>
            <stop offset="100%" stop-color="#2b3a67"/>
          </linearGradient>
          <linearGradient id="soilBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#5a3e2b"/>
            <stop offset="100%" stop-color="#362216"/>
          </linearGradient>
        </defs>
        <!-- Небо / свет и почва -->
        <rect x="0" y="0" width="420" height="122" rx="12" fill="url(#skyBg)" opacity="0.72"/>
        <rect x="0" y="120" width="420" height="100" rx="10" fill="url(#soilBg)" opacity="0.92"/>
        <line x1="0" y1="120" x2="420" y2="120" stroke="#a3e635" stroke-opacity="0.35" stroke-width="2"/>
        <!-- Солнышко -->
        <circle class="sg-sun" cx="372" cy="36" r="18" fill="#ffd27f" opacity="0.88"/>
        <!-- Капли влаги -->
        <g class="sg-water-drops" fill="#63d2ff" opacity="0.65">
          <circle cx="145" cy="142" r="2.5"/><circle cx="278" cy="154" r="2.5"/><circle cx="176" cy="176" r="2"/>
        </g>

        <!-- Динамическое дерево роста ростка -->
        <g class="sg-plant"></g>
      </svg>

      <!-- Панель условий опыта для исследовательской работы учеников -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <button data-cond="water" class="syn-pill-btn active">💧 Вода: есть</button>
        <button data-cond="warmth" class="syn-pill-btn active">☀️ Тепло (+22°C)</button>
        <button data-cond="oxygen" class="syn-pill-btn active">💨 Воздух (O₂): есть</button>
      </div>

      <input class="sg-slider" type="range" min="0" max="10" step="0.1" value="0" style="width:100%;margin-top:8px;accent-color:#7ef9e0;">
      <div class="sg-desc" style="margin-top:4px;font-size:13px;color:#e6dff2;text-align:center;">
        ${stageNames[0]}
      </div>
    </div>
  `;

  const plantG = container.querySelector('.sg-plant');
  const descEl = container.querySelector('.sg-desc');
  const dayBadge = container.querySelector('.sg-day-badge');
  const slider = container.querySelector('.sg-slider');
  const playBtn = container.querySelector('.sg-play');
  const sunEl = container.querySelector('.sg-sun');
  const dropsEl = container.querySelector('.sg-water-drops');

  const getStopReason = () => {
    if (!hasWater) return 'Рост остановлен: без воды ферменты в семени не активируются и кожура не размягчается.';
    if (!hasWarmth) return 'Рост замедлен (холод): при низкой температуре биохимические реакции почти останавливаются.';
    if (!hasOxygen) return 'Рост остановлен: зародышу нужен кислород O₂ для клеточного дыхания и получения энергии.';
    return '';
  };

  const renderPlant = (d) => {
    const p = Math.max(0, Math.min(1, d / 10)); // 0..1
    dayBadge.textContent = `День ${Math.max(1, Math.round(d || 1))}`;
    slider.value = d.toFixed(1);

    const stopReason = getStopReason();
    if (stopReason) {
      descEl.textContent = stopReason;
      descEl.style.color = '#ffb3c1';
    } else {
      descEl.style.color = '#e6dff2';
      const idx = Math.min(4, Math.floor(p * 4.99));
      descEl.textContent = stageNames[idx];
    }

    // Расчёт размеров частей проростка по прогрессу p
    const swell = 1 + Math.min(0.25, p * 1.2);
    const seedY = 148 - Math.max(0, p - 0.35) * 95;
    const rootLen = Math.max(0, (p - 0.1) * 86);
    const stemTopY = Math.min(146, 146 - Math.max(0, p - 0.3) * 145);
    const leafScale = Math.max(0, (p - 0.55) / 0.45);
    const cotDrop = p > 0.72 ? 0.55 : 1;

    let svg = '';

    // 1. Главный корень и корневые волоски / боковые корни
    if (rootLen > 2) {
      svg += `<path d="M 210 154 Q 204 ${(154 + rootLen * 0.5).toFixed(1)} 210 ${(154 + rootLen).toFixed(1)}" fill="none" stroke="#fef3c7" stroke-width="4" stroke-linecap="round"/>`;
      if (p > 0.42) {
        const subLen = (p - 0.42) * 42;
        svg += `
          <path d="M 208 172 Q ${(208 - subLen).toFixed(1)} ${(176 + subLen * 0.4).toFixed(1)} ${(208 - subLen * 1.2).toFixed(1)} ${(182 + subLen * 0.5).toFixed(1)}" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round"/>
          <path d="M 208 184 Q ${(208 + subLen).toFixed(1)} ${(188 + subLen * 0.4).toFixed(1)} ${(208 + subLen * 1.1).toFixed(1)} ${(196 + subLen * 0.5).toFixed(1)}" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round"/>
        `;
      }
    }

    // 2. Стебель (от семени/гипокотиля вверх к листьям)
    if (p > 0.28) {
      const archX = p < 0.55 ? 210 - Math.sin((p - 0.28) * 10) * 16 : 210;
      svg += `<path d="M 210 152 Q ${archX.toFixed(1)} ${(152 + stemTopY) / 2} 210 ${stemTopY.toFixed(1)}" fill="none" stroke="#84cc16" stroke-width="5" stroke-linecap="round"/>`;
    }

    // 3. Семядоли / зерно (при набухании и выносе вверх)
    svg += `
      <g transform="translate(210, ${seedY.toFixed(1)}) scale(${swell.toFixed(2)})" opacity="${cotDrop}">
        <ellipse cx="-6" cy="0" rx="13" ry="9" transform="rotate(-12)" fill="#d97706" stroke="#fde68a" stroke-width="1.8"/>
        ${p > 0.45 ? `<ellipse cx="6" cy="0" rx="12" ry="8" transform="rotate(14)" fill="#f59e0b" stroke="#fef08a" stroke-width="1.4"/>` : ''}
      </g>
    `;

    // 4. Первые настоящие зелёные листья на вершине ростка
    if (leafScale > 0.02) {
      const ls = leafScale.toFixed(2);
      svg += `
        <g transform="translate(210, ${stemTopY.toFixed(1)}) scale(${ls})">
          <path d="M 0 0 C -14 -20, -44 -20, -48 -2 C -32 8, -10 6, 0 0 Z" fill="#22c55e" stroke="#86efac" stroke-width="1.8"/>
          <path d="M 0 0 C 14 -20, 44 -20, 48 -2 C 32 8, 10 6, 0 0 Z" fill="#22c55e" stroke="#86efac" stroke-width="1.8"/>
          <circle cx="0" cy="-3" r="3.5" fill="#bef264"/>
        </g>
      `;
    }

    plantG.innerHTML = svg;
  };

  playBtn.addEventListener('click', () => {
    autoPlay = !autoPlay;
    playBtn.classList.toggle('active', autoPlay);
    playBtn.textContent = autoPlay ? 'Авторост' : 'Пауза';
  });

  slider.addEventListener('input', (e) => {
    autoPlay = false;
    playBtn.classList.remove('active');
    playBtn.textContent = 'Пауза';
    day = Number(e.target.value);
    renderPlant(day);
  });

  container.querySelectorAll('[data-cond]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-cond');
      if (key === 'water') {
        hasWater = !hasWater;
        btn.textContent = hasWater ? '💧 Вода: есть' : '💧 Вода: сухо';
        btn.classList.toggle('active', hasWater);
        if (dropsEl) dropsEl.setAttribute('opacity', hasWater ? '0.65' : '0.05');
      } else if (key === 'warmth') {
        hasWarmth = !hasWarmth;
        btn.textContent = hasWarmth ? '☀️ Тепло (+22°C)' : '❄️ Холод (+2°C)';
        btn.classList.toggle('active', hasWarmth);
        if (sunEl) sunEl.setAttribute('opacity', hasWarmth ? '0.88' : '0.2');
      } else if (key === 'oxygen') {
        hasOxygen = !hasOxygen;
        btn.textContent = hasOxygen ? '💨 Воздух (O₂): есть' : '💨 Воздух: перекрыт';
        btn.classList.toggle('active', hasOxygen);
      }
      renderPlant(day);
    });
  });

  renderPlant(day);

  let lastTime = 0;
  runRaf((t) => {
    const dt = t - lastTime;
    lastTime = t;
    if (!autoPlay || !hasWater || !hasWarmth || !hasOxygen) return;
    day += Math.min(0.2, Math.max(0, dt)) * 1.1;
    if (day > 10.6) day = 0;
    renderPlant(Math.min(10, day));
  });
}






/* ============================================================
   ФИЗИКА (бонус): Электрические формулы через KaTeX
   ============================================================ */
function renderPhysicsFormulasTemplate(container) {
  const list = [
    { label: 'Закон Ома для участка цепи', tex: 'I = \\frac{U}{R}' },
    { label: 'Мощность электрического тока', tex: 'P = U \\cdot I = I^2 R' },
    { label: 'Закон Джоуля–Ленца (теплота)', tex: 'Q = I^2 R t' },
    { label: 'Последовательное сопротивление', tex: 'R = R_1 + R_2' }
  ];

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(140,184,255,0.24);">
      <div style="font-size:15px;font-weight:700;color:#f5f1fa;margin-bottom:10px;">Основные формулы электричества</div>
      <div style="display:grid;gap:10px;">
        ${list
          .map(
            (item, i) => `
            <div style="padding:10px 14px;border-radius:12px;background:rgba(20,17,38,0.55);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="font-size:13px;color:#d6cef0;">${item.label}</span>
              <span class="pf-tex-${i}" style="color:#7ef9e0;font-size:18px;"></span>
            </div>`
          )
          .join('')}
      </div>
    </div>
  `;
  list.forEach((item, i) => {
    mountFormulaInto(container.querySelector(`.pf-tex-${i}`), item.tex, false);
  });
}

/* ============================================================
   ХИМИЯ: 1. Строение атома (электроны по орбитам)
   ============================================================ */
function renderAtomTemplate(container, data, runRaf) {
  const presets = {
    C: { symbol: 'C', name: 'Углерод', protons: 6, neutrons: 6, shells: [2, 4] },
    O: { symbol: 'O', name: 'Кислород', protons: 8, neutrons: 8, shells: [2, 6] },
    Na: { symbol: 'Na', name: 'Натрий', protons: 11, neutrons: 12, shells: [2, 8, 1] },
    He: { symbol: 'He', name: 'Гелий', protons: 2, neutrons: 2, shells: [2] }
  };

  let atom = data?.shells ? data : presets[data?.symbol] || presets.C;

  const drawNucleons = (pCount, nCount) => {
    const total = Math.min(20, pCount + nCount);
    let out = '';
    for (let i = 0; i < total; i++) {
      const ang = i * 2.39996;
      const rad = Math.sqrt(i + 0.5) * 3.1;
      const cx = 200 + Math.cos(ang) * rad;
      const cy = 120 + Math.sin(ang) * rad;
      const isP = i % 2 === 0 && i / 2 < pCount;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="${isP ? '#ff7b9c' : '#a99bff'}" stroke="#17142b" stroke-width="0.8"/>`;
    }
    return out;
  };

  const draw = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(192,140,255,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:15px;font-weight:700;color:#f5f1fa;">Атом: ${escapeHtml(atom.name || atom.symbol)} (p⁺=${atom.protons}, n⁰=${atom.neutrons})</span>
          <div style="display:flex;gap:5px;">
            ${Object.keys(presets).map((k) => `<button data-at="${k}" class="syn-pill-btn ${atom.symbol === k ? 'active' : ''}">${k}</button>`).join('')}
          </div>
        </div>
        <svg viewBox="0 0 400 240" width="100%" style="display:block;">
          <g class="atom-orbits">
            ${atom.shells
              .map((_, idx) => {
                const isValence = idx === atom.shells.length - 1;
                return `<circle cx="200" cy="120" r="${38 + idx * 31}" fill="none" stroke="${isValence ? 'rgba(255,210,127,0.55)' : 'rgba(169,155,255,0.35)'}" stroke-width="1.8" stroke-dasharray="4 4"/>`;
              })
              .join('')}
          </g>
          ${drawNucleons(atom.protons, atom.neutrons)}
          <g class="atom-electrons"></g>
        </svg>
        <div style="display:flex;justify-content:center;gap:14px;font-size:12px;color:#d6cef0;">
          <span><span style="color:#ff7b9c;">●</span> Протоны (+)</span>
          <span><span style="color:#a99bff;">●</span> Нейтроны (0)</span>
          <span><span style="color:#ffd27f;">●</span> Валентные e⁻ (${atom.shells.join(', ')})</span>
        </div>
      </div>
    `;
    container.querySelectorAll('[data-at]').forEach((b) => {
      b.addEventListener('click', () => {
        atom = presets[b.getAttribute('data-at')];
        draw();
      });
    });
  };
  draw();

  runRaf((t) => {
    const elG = container.querySelector('.atom-electrons');
    if (!elG) return;
    let html = '';
    atom.shells.forEach((count, sIdx) => {
      const r = 38 + sIdx * 31;
      const isValence = sIdx === atom.shells.length - 1;
      const speed = (1.6 - sIdx * 0.35) * (sIdx % 2 === 0 ? 1 : -1);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + t * speed;
        const x = 200 + Math.cos(a) * r;
        const y = 120 + Math.sin(a) * r;
        html += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${isValence ? '#ffd27f' : '#7ef9e0'}" stroke="#ffffff" stroke-width="1.2"/>`;
      }
    });
    elG.innerHTML = html;
  });
}

/* ============================================================
   ХИМИЯ: 2. Периодическая таблица — карточка элемента
   ============================================================ */
function renderPeriodicElementTemplate(container, data) {
  const presets = [
    { symbol: 'H', number: 1, mass: '1,008', name: 'Водород', config: '1s¹', period: 1, group: 'IA' },
    { symbol: 'C', number: 6, mass: '12,011', name: 'Углерод', config: '1s² 2s² 2p²', period: 2, group: 'IVA' },
    { symbol: 'O', number: 8, mass: '15,999', name: 'Кислород', config: '1s² 2s² 2p⁴', period: 2, group: 'VIA' },
    { symbol: 'Na', number: 11, mass: '22,990', name: 'Натрий', config: '[Ne] 3s¹', period: 3, group: 'IA' },
    { symbol: 'Fe', number: 26, mass: '55,845', name: 'Железо', config: '[Ar] 3d⁶ 4s²', period: 4, group: 'VIIIB' }
  ];

  let el = data?.symbol ? { ...presets[2], ...data } : presets[2];

  const draw = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:18px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(192,140,255,0.28);">
        <div style="display:flex;justify-content:center;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${presets.map((p) => `<button data-el="${p.symbol}" class="syn-pill-btn ${el.symbol === p.symbol ? 'active' : ''}">${p.symbol}</button>`).join('')}
        </div>
        <div class="syn-slide-up" style="max-width:250px;margin:0 auto;padding:20px;border-radius:20px;background:linear-gradient(145deg,#392f68,#251e45);border:2px solid #c08cff;box-shadow:0 14px 30px rgba(13,10,28,0.45);">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:24px;font-weight:800;color:#7ef9e0;">${escapeHtml(String(el.number))}</span>
            <span style="font-size:14px;color:#ffd27f;font-weight:600;">${escapeHtml(String(el.mass))}</span>
          </div>
          <div style="font-size:64px;font-weight:800;text-align:center;color:#f5f1fa;line-height:1.1;margin:6px 0;">${escapeHtml(el.symbol)}</div>
          <div style="font-size:19px;font-weight:700;text-align:center;color:#e6dff2;">${escapeHtml(el.name)}</div>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.12);font-size:12.5px;color:#cfc7eb;text-align:center;">
            Период ${el.period || '—'} · Группа ${el.group || '—'}<br>
            <span style="color:#7ef9e0;">${escapeHtml(el.config || '')}</span>
          </div>
        </div>
      </div>
    `;
    container.querySelectorAll('[data-el]').forEach((b) => {
      b.addEventListener('click', () => {
        el = presets.find((p) => p.symbol === b.getAttribute('data-el'));
        draw();
      });
    });
  };
  draw();
}

/* ============================================================
   ХИМИЯ: 3. Химические реакции (столкновение -> продукт)
   ============================================================ */
function renderReactionTemplate(container, data, runRaf) {
  const reactions = {
    water: { eq: '2H₂ + O₂ → 2H₂O', label: 'Синтез воды' },
    co2: { eq: 'C + O₂ → CO₂', label: 'Горение углерода' },
    hcl: { eq: 'H₂ + Cl₂ → 2HCl', label: 'Синтез HCl' }
  };
  let curRx = data?.equation?.includes('CO') ? 'co2' : data?.equation?.includes('HCl') ? 'hcl' : 'water';

  const renderShell = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(192,140,255,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:15px;font-weight:700;color:#7ef9e0;">${reactions[curRx].eq}</span>
          <div style="display:flex;gap:5px;">
            ${Object.entries(reactions)
              .map(([k, r]) => `<button data-rx="${k}" class="syn-pill-btn ${curRx === k ? 'active' : ''}">${r.label}</button>`)
              .join('')}
          </div>
        </div>
        <svg viewBox="0 0 420 200" width="100%" style="display:block;">
          <circle class="rx-flash" cx="210" cy="100" r="38" fill="#ffd27f" opacity="0"/>
          <g class="rx-stage"></g>
        </svg>
        <div class="rx-phase" style="text-align:center;font-size:13px;color:#d6cef0;">Реагенты сближаются...</div>
      </div>
    `;
    container.querySelectorAll('[data-rx]').forEach((b) => {
      b.addEventListener('click', () => {
        curRx = b.getAttribute('data-rx');
        renderShell();
      });
    });
  };
  renderShell();

  runRaf((t) => {
    const stage = container.querySelector('.rx-stage');
    const flash = container.querySelector('.rx-flash');
    const phase = container.querySelector('.rx-phase');
    if (!stage || !flash || !phase) return;

    const cycle = (t * 0.25) % 1;
    if (cycle < 0.42) {
      const p = cycle / 0.42;
      const hx = 70 + p * 104;
      const ox = 340 - p * 104;
      flash.setAttribute('opacity', '0');
      phase.textContent = '1. Молекулы реагентов сближаются для столкновения';
      if (curRx === 'water') {
        stage.innerHTML = `
          <g transform="translate(${hx.toFixed(1)}, 68)"><circle cx="-8" cy="0" r="10" fill="#7ef9e0"/><circle cx="8" cy="0" r="10" fill="#7ef9e0"/></g>
          <g transform="translate(${hx.toFixed(1)}, 132)"><circle cx="-8" cy="0" r="10" fill="#7ef9e0"/><circle cx="8" cy="0" r="10" fill="#7ef9e0"/></g>
          <g transform="translate(${ox.toFixed(1)}, 100)"><circle cx="-13" cy="0" r="15" fill="#ff8fab"/><circle cx="13" cy="0" r="15" fill="#ff8fab"/></g>
        `;
      } else if (curRx === 'co2') {
        stage.innerHTML = `
          <circle cx="${hx.toFixed(1)}" cy="100" r="17" fill="#a99bff" stroke="#fff" stroke-width="1.5"/>
          <g transform="translate(${ox.toFixed(1)}, 100)"><circle cx="-13" cy="0" r="15" fill="#ff8fab"/><circle cx="13" cy="0" r="15" fill="#ff8fab"/></g>
        `;
      } else {
        stage.innerHTML = `
          <g transform="translate(${hx.toFixed(1)}, 100)"><circle cx="-8" cy="0" r="10" fill="#7ef9e0"/><circle cx="8" cy="0" r="10" fill="#7ef9e0"/></g>
          <g transform="translate(${ox.toFixed(1)}, 100)"><circle cx="-14" cy="0" r="16" fill="#a3e635"/><circle cx="14" cy="0" r="16" fill="#a3e635"/></g>
        `;
      }
    } else if (cycle < 0.56) {
      const p = (cycle - 0.42) / 0.14;
      flash.setAttribute('opacity', Math.sin(p * Math.PI).toFixed(2));
      flash.setAttribute('r', (30 + p * 28).toFixed(1));
      phase.textContent = '2. Разрыв старых связей и перестройка атомов!';
    } else {
      const p = (cycle - 0.56) / 0.44;
      flash.setAttribute('opacity', '0');
      const offset = p * 70;
      phase.textContent = `3. Образовался продукт реакции (${reactions[curRx].eq})`;
      if (curRx === 'water') {
        stage.innerHTML = `
          <g transform="translate(${(210 - offset).toFixed(1)}, 78)">
            <circle cx="0" cy="0" r="15" fill="#ff8fab"/>
            <circle cx="-16" cy="11" r="9.5" fill="#7ef9e0"/><circle cx="16" cy="11" r="9.5" fill="#7ef9e0"/>
          </g>
          <g transform="translate(${(210 + offset).toFixed(1)}, 126)">
            <circle cx="0" cy="0" r="15" fill="#ff8fab"/>
            <circle cx="-16" cy="11" r="9.5" fill="#7ef9e0"/><circle cx="16" cy="11" r="9.5" fill="#7ef9e0"/>
          </g>
        `;
      } else if (curRx === 'co2') {
        stage.innerHTML = `
          <g transform="translate(210, 100)">
            <circle cx="-27" cy="0" r="14" fill="#ff8fab"/>
            <circle cx="0" cy="0" r="17" fill="#a99bff" stroke="#fff" stroke-width="1.5"/>
            <circle cx="27" cy="0" r="14" fill="#ff8fab"/>
          </g>
        `;
      } else {
        stage.innerHTML = `
          <g transform="translate(${(210 - offset).toFixed(1)}, 100)">
            <circle cx="-8" cy="0" r="16" fill="#a3e635"/><circle cx="11" cy="0" r="9.5" fill="#7ef9e0"/>
          </g>
          <g transform="translate(${(210 + offset).toFixed(1)}, 100)">
            <circle cx="-8" cy="0" r="16" fill="#a3e635"/><circle cx="11" cy="0" r="9.5" fill="#7ef9e0"/>
          </g>
        `;
      }
    }
  });
}

/* ============================================================
   ХИМИЯ: 4. Формы молекул (3D-вращение H2O, CO2, CH4)
   ============================================================ */
function renderMoleculeShapeTemplate(container, data, runRaf) {
  const molecules = {
    H2O: {
      title: 'H₂O — уголковая (104.5°)',
      atoms: [
        { x: 0, y: 0, z: 0, r: 22, c: '#ff8fab', lbl: 'O' },
        { x: -46, y: 34, z: 12, r: 14, c: '#7ef9e0', lbl: 'H' },
        { x: 46, y: 34, z: -12, r: 14, c: '#7ef9e0', lbl: 'H' }
      ],
      bonds: [[0, 1], [0, 2]]
    },
    CO2: {
      title: 'CO₂ — линейная (180°)',
      atoms: [
        { x: 0, y: 0, z: 0, r: 20, c: '#a99bff', lbl: 'C' },
        { x: -62, y: 0, z: 0, r: 18, c: '#ff8fab', lbl: 'O' },
        { x: 62, y: 0, z: 0, r: 18, c: '#ff8fab', lbl: 'O' }
      ],
      bonds: [[0, 1], [0, 2]]
    },
    CH4: {
      title: 'CH₄ — тетраэдр (109.5°)',
      atoms: [
        { x: 0, y: 0, z: 0, r: 20, c: '#a99bff', lbl: 'C' },
        { x: 0, y: -58, z: 0, r: 13, c: '#7ef9e0', lbl: 'H' },
        { x: 54, y: 24, z: 22, r: 13, c: '#7ef9e0', lbl: 'H' },
        { x: -48, y: 24, z: 32, r: 13, c: '#7ef9e0', lbl: 'H' },
        { x: -6, y: 24, z: -52, r: 13, c: '#7ef9e0', lbl: 'H' }
      ],
      bonds: [[0, 1], [0, 2], [0, 3], [0, 4]]
    }
  };

  let cur = molecules[data?.molecule] ? data.molecule : 'H2O';

  const draw = () => {
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(192,140,255,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:15px;font-weight:700;color:#f5f1fa;">${molecules[cur].title}</span>
          <div style="display:flex;gap:5px;">
            ${Object.keys(molecules).map((k) => `<button data-mol="${k}" class="syn-pill-btn ${cur === k ? 'active' : ''}">${k}</button>`).join('')}
          </div>
        </div>
        <svg viewBox="0 0 380 220" width="100%" style="display:block;">
          <g class="mol-3d"></g>
        </svg>
      </div>
    `;
    container.querySelectorAll('[data-mol]').forEach((b) => {
      b.addEventListener('click', () => {
        cur = b.getAttribute('data-mol');
        draw();
      });
    });
  };
  draw();

  runRaf((t) => {
    const g = container.querySelector('.mol-3d');
    if (!g) return;
    const m = molecules[cur];
    const ay = t * 0.9;
    const ax = 0.25 + Math.sin(t * 0.6) * 0.18;

    const proj = m.atoms.map((a, idx) => {
      const x1 = a.x * Math.cos(ay) - a.z * Math.sin(ay);
      const z1 = a.x * Math.sin(ay) + a.z * Math.cos(ay);
      const y2 = a.y * Math.cos(ax) - z1 * Math.sin(ax);
      const z2 = a.y * Math.sin(ax) + z1 * Math.cos(ax);
      const scale = 280 / (280 + z2);
      return {
        idx,
        sx: 190 + x1 * scale,
        sy: 112 + y2 * scale,
        z: z2,
        r: a.r * scale,
        c: a.c,
        lbl: a.lbl
      };
    });

    const parts = [];
    for (const [i, j] of m.bonds) {
      parts.push({
        z: (proj[i].z + proj[j].z) / 2 + 1,
        svg: `<line x1="${proj[i].sx.toFixed(1)}" y1="${proj[i].sy.toFixed(1)}" x2="${proj[j].sx.toFixed(1)}" y2="${proj[j].sy.toFixed(1)}" stroke="#e6dff2" stroke-width="5" stroke-linecap="round" opacity="0.72"/>`
      });
    }
    for (const p of proj) {
      parts.push({
        z: p.z,
        svg: `<g><circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.c}" stroke="#fff" stroke-width="1.5"/><text x="${p.sx.toFixed(1)}" y="${(p.sy + 4).toFixed(1)}" text-anchor="middle" fill="#17142b" font-size="11.5" font-weight="800">${p.lbl}</text></g>`
      });
    }

    parts.sort((a, b) => b.z - a.z);
    g.innerHTML = parts.map((p) => p.svg).join('');
  });
}

/* ============================================================
   ХИМИЯ: 5. Растворы и массовая доля (стакан + формула в KaTeX)
   ============================================================ */
function renderSolutionMixTemplate(container, data, runRaf) {
  let solute = Number(data?.soluteMass || 20);
  const water = Number(data?.waterMass || 180);

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(192,140,255,0.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:15px;font-weight:700;color:#f5f1fa;">Раствор соли в воде (${water} г воды)</span>
        <span class="sol-pct" style="font-size:14px;font-weight:700;color:#7ef9e0;"></span>
      </div>
      <svg viewBox="0 0 380 185" width="100%" style="display:block;">
        <!-- Стакан -->
        <path class="sol-liquid" d="M 118 65 L 262 65 L 254 162 Q 252 168 244 168 L 136 168 Q 128 168 126 162 Z" fill="rgba(93,230,255,0.28)"/>
        <path d="M 110 34 L 126 162 Q 128 169 136 169 L 244 169 Q 252 169 254 162 L 270 34" fill="none" stroke="#e6dff2" stroke-width="3.2" stroke-linecap="round"/>
        <g class="sol-ions"></g>
      </svg>
      <label style="display:block;margin-top:6px;font-size:12.5px;color:#d6cef0;">
        Масса соли (m_в): <strong class="sol-mv"></strong> г
        <input class="sol-slider" type="range" min="5" max="90" step="5" value="${solute}" style="width:100%;accent-color:#7ef9e0;">
      </label>
      <div class="sol-katex" style="margin-top:10px;text-align:center;color:#f5f1fa;font-size:18px;"></div>
    </div>
  `;

  const liquid = container.querySelector('.sol-liquid');
  const ions = container.querySelector('.sol-ions');
  const pctEl = container.querySelector('.sol-pct');
  const mvEl = container.querySelector('.sol-mv');
  const katexEl = container.querySelector('.sol-katex');

  const update = () => {
    const total = solute + water;
    const w = (solute / total) * 100;
    mvEl.textContent = solute;
    pctEl.textContent = `ω = ${w.toFixed(1)}%`;
    const alpha = Math.min(0.75, 0.18 + (w / 40) * 0.55);
    liquid.setAttribute('fill', `rgba(126,249,224,${alpha.toFixed(2)})`);
    mountFormulaInto(
      katexEl,
      `\\omega = \\frac{m_{\\text{в}}}{m_{\\text{р}}} \\cdot 100\\% = \\frac{${solute}}{${total}} \\cdot 100\\% \\approx ${w.toFixed(1)}\\%`,
      false
    );
  };

  container.querySelector('.sol-slider').addEventListener('input', (e) => {
    solute = Number(e.target.value);
    update();
  });
  update();

  runRaf((t) => {
    const count = Math.min(26, Math.round(solute / 3.5) + 4);
    let html = '';
    for (let i = 0; i < count; i++) {
      const ix = 138 + ((i * 37) % 104) + Math.sin(t * 1.8 + i) * 7;
      const iy = 80 + ((i * 29) % 76) + Math.cos(t * 1.5 + i * 2) * 6;
      const isNa = i % 2 === 0;
      html += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="4" fill="${isNa ? '#ffd27f' : '#c08cff'}" opacity="0.88"/>`;
    }
    ions.innerHTML = html;
  });
}

/* ============================================================
   ИСТОРИЯ: 1-5. Облик и одежда по векам + поиск Wikimedia
   ============================================================ */
const ERAS_DATA = {
  medieval: {
    title: 'Средневековье (X–XIV вв.)',
    query: 'medieval tunic costume manuscript',
    parts: [
      { id: 'cloak', label: 'Плащ-мантия', desc: 'Длинный шерстяной плащ с застёжкой-фибулой защищал от ветра и дождя.' },
      { id: 'tunic', label: 'Туника (котта)', desc: 'Свободная верхняя одежда до колен или в пол, подпоясанная кожаным ремнём.' },
      { id: 'camisa', label: 'Камиза (нижняя рубаха)', desc: 'Просторная льняная рубаха светлого оттенка, носилась прямо на теле.' }
    ],
    svg: `
      <circle cx="150" cy="48" r="16" fill="#f3dcc7"/>
      <path data-part="camisa" d="M 128 70 L 172 70 L 176 196 L 124 196 Z" fill="#f5f1fa" stroke="#d8cef0"/>
      <path data-part="tunic" d="M 122 72 Q 150 66 178 72 L 194 166 L 106 166 Z" fill="#7a5496" stroke="#c08cff" stroke-width="2"/>
      <rect x="122" y="114" width="56" height="8" rx="3" fill="#ffd27f"/>
      <path data-part="cloak" d="M 124 70 L 92 178 L 116 178 L 136 86 Z" fill="#4f6d9e" opacity="0.88"/>
      <path data-part="cloak" d="M 176 70 L 208 178 L 184 178 L 164 86 Z" fill="#4f6d9e" opacity="0.88"/>
    `
  },
  renaissance: {
    title: 'Возрождение (XV–XVI вв.)',
    query: 'renaissance doublet costume 16th century',
    parts: [
      { id: 'beret', label: 'Берет с ронделем', desc: 'Бархатный берет с круглым украшением или брошью-ронделем.' },
      { id: 'pourpoint', label: 'Пурпуэн', desc: 'Приталенный жакет с пышными набивными плечами и прорезями на рукавах.' },
      { id: 'hose', label: 'Шоссы', desc: 'Обтягивающие чулки-штаны ярких контрастных цветов.' }
    ],
    svg: `
      <circle cx="150" cy="52" r="15" fill="#f3dcc7"/>
      <path data-part="beret" d="M 124 42 Q 150 22 180 42 Q 150 48 124 42 Z" fill="#9c3d68" stroke="#ffb3c1" stroke-width="1.5"/>
      <circle data-part="beret" cx="164" cy="36" r="5" fill="#ffd27f"/>
      <path data-part="pourpoint" d="M 118 74 L 182 74 L 172 132 L 128 132 Z" fill="#b84a62" stroke="#ffd27f" stroke-width="2"/>
      <ellipse data-part="pourpoint" cx="114" cy="88" rx="14" ry="18" fill="#d96b82" stroke="#ffd27f"/>
      <ellipse data-part="pourpoint" cx="186" cy="88" rx="14" ry="18" fill="#d96b82" stroke="#ffd27f"/>
      <path data-part="hose" d="M 132 132 L 146 132 L 144 202 L 130 202 Z" fill="#635399"/>
      <path data-part="hose" d="M 154 132 L 168 132 L 170 202 L 156 202 Z" fill="#ffd27f" opacity="0.85"/>
    `
  },
  baroque: {
    title: 'Барокко и Рококо (XVII–XVIII вв.)',
    query: '18th century baroque rococo coat dress',
    parts: [
      { id: 'wig', label: 'Напудренный парик', desc: 'Высокий завитой парик был символом высокого статуса при дворе.' },
      { id: 'kamzol', label: 'Камзол', desc: 'Длинный приталенный кафтан с золотой вышивкой и широкими обшлагами.' },
      { id: 'robe', label: 'Роба на каркасе-панье', desc: 'Пышная юбка, растянутая в стороны на жёстких обручах из китового уса.' }
    ],
    svg: `
      <path data-part="wig" d="M 126 54 Q 124 28 150 28 Q 176 28 174 54 Q 182 68 170 72 L 130 72 Q 118 68 126 54 Z" fill="#efeaf8"/>
      <circle cx="150" cy="52" r="13" fill="#f3dcc7"/>
      <path data-part="kamzol" d="M 130 70 L 170 70 L 174 114 L 126 114 Z" fill="#6898c9" stroke="#ffd27f" stroke-width="1.8"/>
      <path data-part="robe" d="M 128 112 L 172 112 Q 214 132 212 198 L 88 198 Q 86 132 128 112 Z" fill="#a86eb8" stroke="#ffb3c1" stroke-width="2"/>
      <path d="M 140 112 L 160 112 L 166 198 L 134 198 Z" fill="#fff5e6" opacity="0.82"/>
    `
  },
  nineteenth: {
    title: 'XIX век: ампир, кринолин и фрак',
    query: '19th century tailcoat crinoline fashion',
    parts: [
      { id: 'tophat', label: 'Цилиндр и фрак', desc: 'Строгий чёрный фрак с белой манишкой и высоким цилиндром.' },
      { id: 'crinoline', label: 'Кринолин', desc: 'Широкая колоколообразная юбка середины XIX века на лёгком стальном каркасе.' }
    ],
    svg: `
      <!-- Мужской силуэт (фрак + цилиндр) -->
      <g transform="translate(-40,0)">
        <rect data-part="tophat" x="136" y="16" width="28" height="22" rx="3" fill="#231e3d" stroke="#8cb8ff"/>
        <line data-part="tophat" x1="128" y1="38" x2="172" y2="38" stroke="#8cb8ff" stroke-width="3"/>
        <circle cx="150" cy="52" r="12" fill="#f3dcc7"/>
        <path data-part="tophat" d="M 132 68 L 168 68 L 166 122 L 134 122 Z" fill="#231e3d" stroke="#8cb8ff" stroke-width="1.8"/>
        <path d="M 145 68 L 155 68 L 150 96 Z" fill="#ffffff"/>
        <rect x="136" y="122" width="12" height="72" fill="#3b355c"/>
        <rect x="152" y="122" width="12" height="72" fill="#3b355c"/>
      </g>
      <!-- Женский силуэт (кринолин) -->
      <g transform="translate(56,0)">
        <circle cx="150" cy="52" r="12" fill="#f3dcc7"/>
        <path data-part="crinoline" d="M 138 68 L 162 68 L 158 108 L 142 108 Z" fill="#5e7ca6"/>
        <path data-part="crinoline" d="M 142 108 L 158 108 Q 204 148 200 198 L 100 198 Q 96 148 142 108 Z" fill="#7798c4" stroke="#d6e6ff" stroke-width="2"/>
      </g>
    `
  },
  twentieth: {
    title: 'XX век: освобождение силуэта',
    query: '1920s 1960s fashion costume museum',
    parts: [
      { id: 'straight', label: 'Прямой свободный крой', desc: 'Отказ от жёстких корсетов и кринолинов, удобная длина платьев и юбок.' },
      { id: 'suit', label: 'Городской костюм и трикотаж', desc: 'Практичные пиджаки, брюки, свитеры и джинсы вошли в повседневную моду.' }
    ],
    svg: `
      <circle cx="150" cy="50" r="14" fill="#f3dcc7"/>
      <path d="M 135 42 Q 150 28 165 42" fill="#2c2547" stroke="#2c2547" stroke-width="4"/>
      <path data-part="straight" d="M 128 70 L 172 70 L 176 154 L 124 154 Z" fill="#7ef9e0" fill-opacity="0.78" stroke="#b8fff1" stroke-width="2"/>
      <rect data-part="suit" x="135" y="154" width="10" height="44" fill="#f3dcc7"/>
      <rect data-part="suit" x="155" y="154" width="10" height="44" fill="#f3dcc7"/>
      <rect x="130" y="112" width="40" height="6" rx="3" fill="#ffd27f"/>
    `
  }
};

function renderClothingCenturyTemplate(container, data, callbacks) {
  let eraKey = ERAS_DATA[data?.era] ? data.era : 'medieval';

  const draw = () => {
    const era = ERAS_DATA[eraKey];
    container.innerHTML = `
      <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(255,210,127,0.28);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:15px;font-weight:700;color:#ffd27f;">${era.title}</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[
              ['medieval', 'X–XIV'],
              ['renaissance', 'XV–XVI'],
              ['baroque', 'XVII–XVIII'],
              ['nineteenth', 'XIX'],
              ['twentieth', 'XX']
            ]
              .map(([k, lbl]) => `<button data-era="${k}" class="syn-pill-btn ${eraKey === k ? 'active' : ''}">${lbl}</button>`)
              .join('')}
          </div>
        </div>

        <svg viewBox="0 0 300 212" width="100%" style="max-height:220px;display:block;margin:0 auto;">
          <ellipse cx="150" cy="202" rx="85" ry="7" fill="rgba(0,0,0,0.32)"/>
          ${era.svg}
        </svg>

        <div class="era-tip" style="margin-top:8px;padding:9px 12px;border-radius:12px;background:rgba(20,17,38,0.6);font-size:13px;color:#e6dff2;">
          Наведи на деталь костюма, чтобы узнать её роль и ткани эпохи, или найди реальные экспонаты!
        </div>

        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${era.parts.map((p) => `<span style="font-size:11.5px;padding:3px 9px;border-radius:999px;background:rgba(255,210,127,0.14);color:#ffd27f;">${p.label}</span>`).join('')}
          </div>
          ${
            callbacks?.onSearchHistoryImages
              ? `<button class="era-wiki-btn syn-pill-btn active">Найти реальные фото (Wikimedia)</button>`
              : ''
          }
        </div>
      </div>
    `;

    container.querySelectorAll('[data-era]').forEach((b) => {
      b.addEventListener('click', () => {
        eraKey = b.getAttribute('data-era');
        draw();
      });
    });

    const tip = container.querySelector('.era-tip');
    container.querySelectorAll('[data-part]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('mouseenter', () => {
        const partId = el.getAttribute('data-part');
        const found = era.parts.find((p) => p.id === partId);
        if (found && tip) {
          tip.innerHTML = `<strong style="color:#ffd27f;">${found.label}:</strong> ${found.desc}`;
        }
      });
    });

    const wikiBtn = container.querySelector('.era-wiki-btn');
    if (wikiBtn) {
      wikiBtn.addEventListener('click', () => {
        callbacks.onSearchHistoryImages(era.query, era.title);
      });
    }
  };
  draw();
}

/* ============================================================
   ИСТОРИЯ: Сравнение соседних эпох (compare_eras)
   ============================================================ */
function renderCompareErasTemplate(container, data) {
  const leftKey = ERAS_DATA[data?.leftEra] ? data.leftEra : 'nineteenth';
  const rightKey = ERAS_DATA[data?.rightEra] ? data.rightEra : 'twentieth';
  const left = ERAS_DATA[leftKey];
  const right = ERAS_DATA[rightKey];

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(255,210,127,0.28);">
      <div style="font-size:15px;font-weight:700;color:#ffd27f;margin-bottom:10px;text-align:center;">Сравнение эпох рядом</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="padding:10px;border-radius:14px;background:rgba(20,17,38,0.55);text-align:center;">
          <div style="font-size:12.5px;font-weight:700;color:#c08cff;margin-bottom:4px;">${left.title}</div>
          <svg viewBox="0 0 300 212" width="100%" style="max-height:170px;">${left.svg}</svg>
          <div style="font-size:11.5px;color:#d6cef0;margin-top:4px;">${left.parts.map((p) => p.label).join(' · ')}</div>
        </div>
        <div style="padding:10px;border-radius:14px;background:rgba(20,17,38,0.55);text-align:center;">
          <div style="font-size:12.5px;font-weight:700;color:#7ef9e0;margin-bottom:4px;">${right.title}</div>
          <svg viewBox="0 0 300 212" width="100%" style="max-height:170px;">${right.svg}</svg>
          <div style="font-size:11.5px;color:#d6cef0;margin-top:4px;">${right.parts.map((p) => p.label).join(' · ')}</div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   ИСТОРИЯ (бонус): Шкала по векам (timeline)
   ============================================================ */
function renderTimelineTemplate(container, data) {
  const events = Array.isArray(data?.events)
    ? data.events
    : [
        { era: 'X–XIV вв.', label: 'Туника, камиза, плащ' },
        { era: 'XV–XVI вв.', label: 'Пурпуэн, берет-рондель' },
        { era: 'XVII–XVIII вв.', label: 'Камзол, парик, роба' },
        { era: 'XIX век', label: 'Фрак, цилиндр, кринолин' },
        { era: 'XX век', label: 'Удобный крой и джинсы' }
      ];

  container.innerHTML = `
    <div class="syn-card-anim" style="padding:16px;border-radius:18px;background:rgba(36,30,63,0.68);border:1px solid rgba(255,210,127,0.28);">
      <div style="font-size:15px;font-weight:700;color:#ffd27f;margin-bottom:12px;">Шкала времени: эволюция одежды</div>
      <div style="display:grid;gap:10px;position:relative;padding-left:20px;border-left:2px solid rgba(126,249,224,0.4);">
        ${events
          .map(
            (ev, idx) => `
          <div class="syn-slide-up" style="animation-delay:${idx * 120}ms;padding:10px 14px;border-radius:12px;background:rgba(20,17,38,0.55);position:relative;">
            <span style="position:absolute;left:-27px;top:14px;width:12px;height:12px;border-radius:999px;background:#ffd27f;border:2px solid #19162d;"></span>
            <strong style="color:#7ef9e0;font-size:13px;">${escapeHtml(ev.era)}</strong>
            <div style="color:#f5f1fa;font-size:13.5px;margin-top:2px;">${escapeHtml(ev.label)}</div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;
}

/* ============================================================
   ИСТОРИЯ (бонус): Блок-схема причин -> следствий (cause_effect)
   ============================================================ */
function renderCauseEffectTemplate(container, data) {
  const diagramData = data?.elements
    ? data
    : {
        title: 'Как промышленность изменила одежду в XIX–XX вв.',
        elements: [
          { type: 'box', x: 20, y: 24, w: 165, h: 52, text: 'Ткацкие станки', delay: 0 },
          { type: 'box', x: 20, y: 108, w: 165, h: 52, text: 'Швейная машина', delay: 150 },
          { type: 'arrow', from: [185, 50], to: [255, 85], label: 'быстрее', delay: 250 },
          { type: 'arrow', from: [185, 134], to: [255, 98], label: 'дешевле', delay: 350 },
          { type: 'box', x: 260, y: 66, w: 185, h: 56, text: 'Массовая городская мода', delay: 450 }
        ]
      };
  renderDiagramShow(container, diagramData);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
