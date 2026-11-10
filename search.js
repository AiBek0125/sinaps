// Модуль поиска по проверенным источникам и российским образовательным платформам (0 руб, без API-ключей и без VPN)
// Работает как на сервере (Node.js / Netlify Functions), так и в браузере (CORS для РУВИКИ и Википедии).

// Белый список проверенных образовательных и научно-популярных доменов для школьников 12–17 лет
export const TRUSTED_EDU_DOMAINS = [
  { domain: 'bigenc.ru', name: 'Большая российская энциклопедия', badge: 'БРЭ', priority: 100 },
  { domain: 'old.bigenc.ru', name: 'Большая российская энциклопедия', badge: 'БРЭ', priority: 98 },
  { domain: 'ru.ruwiki.ru', name: 'РУВИКИ (Российская энциклопедия)', badge: 'РУВИКИ', priority: 96 },
  { domain: 'ruwiki.ru', name: 'РУВИКИ', badge: 'РУВИКИ', priority: 95 },
  { domain: 'foxford.ru', name: 'Фоксфорд.Учебник', badge: 'Фоксфорд', priority: 94 },
  { domain: 'interneturok.ru', name: 'InternetUrok (школьные уроки)', badge: 'InternetUrok', priority: 94 },
  { domain: 'yaklass.ru', name: 'ЯКласс (теория по предметам)', badge: 'ЯКласс', priority: 93 },
  { domain: 'resh.edu.ru', name: 'Российская электронная школа', badge: 'РЭШ', priority: 93 },
  { domain: 'skysmart.ru', name: 'Skysmart Учебник', badge: 'Skysmart', priority: 90 },
  { domain: 'urok.1sept.ru', name: 'Первое сентября', badge: '1 Сентября', priority: 88 },
  { domain: '1sept.ru', name: 'Первое сентября', badge: '1 Сентября', priority: 88 },
  { domain: 'uchi.ru', name: 'Учи.ру', badge: 'Учи.ру', priority: 87 },
  { domain: 'fipi.ru', name: 'ФИПИ', badge: 'ФИПИ', priority: 87 },
  { domain: 'elementy.ru', name: 'Элементы большой науки', badge: 'Элементы', priority: 89 },
  { domain: 'biomolecula.ru', name: 'Биомолекула', badge: 'Биомолекула', priority: 86 },
  { domain: 'postnauka.org', name: 'ПостНаука', badge: 'ПостНаука', priority: 86 },
  { domain: 'postnauka.ru', name: 'ПостНаука', badge: 'ПостНаука', priority: 86 },
  { domain: 'arzamas.academy', name: 'Arzamas (история и культура)', badge: 'Arzamas', priority: 88 },
  { domain: 'culture.ru', name: 'Культура.РФ', badge: 'Культура.РФ', priority: 88 },
  { domain: 'histrf.ru', name: 'История.РФ', badge: 'История.РФ', priority: 87 },
  { domain: 'gramota.ru', name: 'Грамота.ру', badge: 'Грамота.ру', priority: 85 },
  { domain: 'nplus1.ru', name: 'N+1', badge: 'N+1', priority: 82 },
  { domain: 'nkj.ru', name: 'Наука и жизнь', badge: 'Наука и жизнь', priority: 84 },
  { domain: 'ru.wikibooks.org', name: 'Викиучебник', badge: 'Викиучебник', priority: 82 },
  { domain: 'ru.wikipedia.org', name: 'Русская Википедия', badge: 'Википедия', priority: 80 }
];

// Безопасная проверка на запрещённый контент в заголовках/сниппетах результатов поиска
const SEARCH_SAFETY_BLACKLIST = [
  /(^|[^а-яёa-z0-9])(порно|секс|эротик|интим|обнаж|голы[йх]|сись|ху[йяюе]|пизд|еб[ауио]|ёб|бля[дт]|сук[аи]|муд[ао]|пидор|шлюх|nude|nsfw|porn|erotic)/i,
  /(^|[^а-яёa-z0-9])(наркот|героин|кокаин|марихуан|суицид|самоубий|террор|взрывчат)/i
];

export function isSnippetSafe(text) {
  if (!text) return true;
  return !SEARCH_SAFETY_BLACKLIST.some((re) => re.test(String(text)));
}

// Проверка принадлежности URL к белому списку проверенных образовательных платформ
export function matchTrustedDomain(rawUrl) {
  if (!rawUrl) return null;
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    for (const entry of TRUSTED_EDU_DOMAINS) {
      if (hostname === entry.domain || hostname.endsWith(`.${entry.domain}`)) {
        return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Преобразование HTML-сущностей и тегов в чистый текст
function cleanText(raw) {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch с коротким таймаутом, чтобы поиск не замедлял ответ
async function fetchTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Очистка вопроса от разговорных слов («расскажи про», «что такое», «как работает») для точного поиска
export function buildSearchKeywords(question) {
  return String(question || '')
    .replace(/[?!.,;:«»"']+/g, ' ')
    .replace(/^(сина[пб]с|привет|расскажи|объясни|подскажи|что такое|кто такой|кто такая|как работает|почему|зачем|когда|какая|какой)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || String(question || '').trim();
}

// 1. Поиск через открытый MediaWiki API Русской Википедии (работает без VPN и с CORS origin=*)
export async function searchRuWikipedia(query, limit = 2) {
  const cleanQ = buildSearchKeywords(query);
  if (!cleanQ) return [];

  const url =
    'https://ru.wikipedia.org/w/api.php' +
    `?action=query` +
    `&generator=search` +
    `&gsrsearch=${encodeURIComponent(cleanQ)}` +
    `&gsrlimit=${limit}` +
    `&prop=extracts|info` +
    `&inprop=url` +
    `&exintro=1` +
    `&explaintext=1` +
    `&exsentences=8` +
    `&format=json` +
    `&origin=*`;

  try {
    const res = await fetchTimeout(url, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {}).sort(
      (a, b) => (a.index ?? 99) - (b.index ?? 99)
    );

    const out = [];
    for (const p of pages) {
      const extract = cleanText(p.extract || '');
      const title = cleanText(p.title || '');
      const pageUrl = p.fullurl || `https://ru.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      if (!extract || !isSnippetSafe(title + ' ' + extract)) continue;
      // Пропускаем страницы неоднозначностей
      if (extract.includes('может означать:') && extract.length < 180) continue;

      out.push({
        title,
        url: pageUrl,
        snippet: extract.slice(0, 900),
        sourceName: 'Русская Википедия',
        badge: 'Википедия',
        priority: 80
      });
    }
    return out;
  } catch {
    return [];
  }
}

// 2. Поиск через открытый API РУВИКИ (ru.ruwiki.ru — российская энциклопедия, работает без VPN)
export async function searchRuWiki(query, limit = 2) {
  const cleanQ = buildSearchKeywords(query);
  if (!cleanQ) return [];

  const searchUrl =
    'https://ru.ruwiki.ru/w/api.php' +
    `?action=query` +
    `&list=search` +
    `&srsearch=${encodeURIComponent(cleanQ)}` +
    `&srlimit=${limit}` +
    `&utf8=1` +
    `&format=json` +
    `&origin=*`;

  try {
    const res = await fetchTimeout(searchUrl, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.query?.search || [];
    if (!items.length) return [];

    // Запрашиваем вводный фрагмент (extracts) для найденных заголовков
    const titles = items.map((it) => it.title).slice(0, limit).join('|');
    const extractUrl =
      'https://ru.ruwiki.ru/w/api.php' +
      `?action=query` +
      `&prop=extracts|info` +
      `&inprop=url` +
      `&exintro=1` +
      `&explaintext=1` +
      `&exsentences=8` +
      `&titles=${encodeURIComponent(titles)}` +
      `&format=json` +
      `&origin=*`;

    let pagesMap = {};
    try {
      const exRes = await fetchTimeout(extractUrl, { headers: { Accept: 'application/json' } });
      if (exRes.ok) {
        const exData = await exRes.json();
        pagesMap = exData?.query?.pages || {};
      }
    } catch {
      // Используем сниппеты из search, если extracts недоступен
    }

    const pagesList = Object.values(pagesMap);
    const out = [];
    for (const item of items) {
      const title = cleanText(item.title || '');
      const matchedPage = pagesList.find((p) => p.title === item.title);
      const snippet = cleanText(matchedPage?.extract || item.snippet || '');
      const pageUrl =
        matchedPage?.fullurl ||
        `https://ru.ruwiki.ru/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      if (!snippet || !isSnippetSafe(title + ' ' + snippet)) continue;

      out.push({
        title,
        url: pageUrl,
        snippet: snippet.slice(0, 900),
        sourceName: 'РУВИКИ (Российская энциклопедия)',
        badge: 'РУВИКИ',
        priority: 96
      });
    }
    return out;
  } catch {
    return [];
  }
}

// Декодирование реального URL из редиректа DuckDuckGo (/l/?uddg=...)
export function decodeDuckDuckGoHref(href) {
  if (!href) return '';
  try {
    const normalized = href.startsWith('//') ? `https:${href}` : href.startsWith('/') ? `https://duckduckgo.com${href}` : href;
    const u = new URL(normalized);
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : normalized;
  } catch {
    return href;
  }
}

// Парсер HTML-выдачи DuckDuckGo (без сторонних зависимостей, работает в Node.js)
export function parseDuckDuckGoHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const lower = html.toLowerCase();
  if (lower.includes('anomaly.js') || lower.includes('bots use duckduckgo')) {
    return [];
  }

  const results = [];
  // Ищем все заголовки результатов (result__a), независимо от порядка атрибутов class и href
  const anchorRegex = /<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  const anchors = [];
  let m;
  while ((m = anchorRegex.exec(html)) !== null) {
    const hrefMatch = m[1].match(/href="([^"]+)"/i);
    if (hrefMatch) {
      anchors.push({
        href: hrefMatch[1],
        title: cleanText(m[2]),
        endIdx: m.index + m[0].length,
        startIdx: m.index
      });
    }
  }

  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i];
    const nextStart = anchors[i + 1] ? anchors[i + 1].startIdx : Math.min(html.length, cur.endIdx + 1200);
    const segment = html.slice(cur.endIdx, nextStart);
    const snipMatch = segment.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);

    const realUrl = decodeDuckDuckGoHref(cur.href);
    const title = cur.title;
    const snippet = cleanText(snipMatch ? snipMatch[1] : '');
    const trusted = matchTrustedDomain(realUrl);

    if (!trusted) continue;
    if (!title || !isSnippetSafe(`${title} ${snippet}`)) continue;

    results.push({
      title,
      url: realUrl,
      snippet: snippet.slice(0, 380),
      sourceName: trusted.name,
      badge: trusted.badge,
      priority: trusted.priority
    });

    if (results.length >= 6) break;
  }

  return results;
}

// 3. Серверный поиск именно по российским образовательным платформам (Фоксфорд, ЯКласс, InternetUrok, БРЭ, РЭШ, Арзамас, Культура.РФ, Элементы)
export async function searchRussianEduPlatforms(query, subject = '') {
  // Только на сервере (в браузере html.duckduckgo.com не отдаёт CORS)
  if (typeof window !== 'undefined') return [];

  const keywords = buildSearchKeywords(query);
  if (!keywords) return [];

  // Подбираем приоритетные домены в зависимости от предмета
  let siteFilter =
    'site:bigenc.ru OR site:foxford.ru OR site:interneturok.ru OR site:yaklass.ru OR site:resh.edu.ru OR site:skysmart.ru';
  if (/истори/i.test(subject)) {
    siteFilter =
      'site:bigenc.ru OR site:arzamas.academy OR site:culture.ru OR site:histrf.ru OR site:foxford.ru OR site:interneturok.ru';
  } else if (/биолог|физик|хим/i.test(subject)) {
    siteFilter =
      'site:foxford.ru OR site:interneturok.ru OR site:yaklass.ru OR site:bigenc.ru OR site:elementy.ru OR site:resh.edu.ru';
  }

  const fullQuery = `${keywords} (${siteFilter})`;

  try {
    const res = await fetchTimeout(
      'https://html.duckduckgo.com/html/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        body: new URLSearchParams({ q: fullQuery, kl: 'ru-ru' }).toString()
      },
      4500
    );

    if (!res.ok) return [];
    const html = await res.text();
    return parseDuckDuckGoHtml(html);
  } catch {
    return [];
  }
}

// Объединённый поиск по проверенным российским и образовательным источникам
export async function searchVerifiedSources(question, { subject = '', maxResults = 4 } = {}) {
  const [ruwikiRes, ddgEduRes, wikiRes] = await Promise.all([
    searchRuWiki(question, 2),
    searchRussianEduPlatforms(question, subject),
    searchRuWikipedia(question, 2)
  ]);

  const combined = [...ddgEduRes, ...ruwikiRes, ...wikiRes];
  const seenUrls = new Set();
  const seenTitles = new Set();
  const deduped = [];

  // Сортируем по приоритету доверия (БРЭ, РУВИКИ, Фоксфорд, InternetUrok, ЯКласс, РЭШ, Википедия)
  combined.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const item of combined) {
    const normTitle = item.title.toLowerCase();
    if (seenUrls.has(item.url) || seenTitles.has(normTitle)) continue;
    seenUrls.add(item.url);
    seenTitles.add(normTitle);
    deduped.push({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      sourceName: item.sourceName,
      badge: item.badge
    });
    if (deduped.length >= maxResults) break;
  }

  return deduped;
}

// Сопоставление вопроса готовому интерактивному шаблону (для мгновенного показа схемы даже без LLM)
export function detectTemplateFromQuestion(question) {
  const q = String(question || '').toLowerCase();
  if (/растительн.*клет|хлоропласт|вакуол|клеточн.*стенк/.test(q)) {
    return { type: 'template', data: { template: 'cell_plant' } };
  }
  if (/клетк|органоид|митохондр|ядро клет/.test(q)) {
    return { type: 'template', data: { template: 'cell_animal' } };
  }
  if (/митоз|делени.*клет|профаз|метафаз|анафаз|телофаз/.test(q)) {
    return { type: 'template', data: { template: 'mitosis' } };
  }
  if (/ам[её]б|ложнонож/.test(q)) {
    return { type: 'template', data: { template: 'amoeba' } };
  }
  if (/инфузори|туфельк|реснич/.test(q)) {
    return { type: 'template', data: { template: 'paramecium' } };
  }
  if (/пищевар|желудок|пищевод|кишечник/.test(q)) {
    return { type: 'template', data: { template: 'digestion' } };
  }
  if (/кров|сердц|эритроцит|круг.*кровообр/.test(q)) {
    return { type: 'template', data: { template: 'blood_flow' } };
  }
  if (/фотосинтез|хлорофилл/.test(q)) {
    return { type: 'template', data: { template: 'photosynthesis' } };
  }
  if (/рост сем|прорастани.*сем|проросток|всхожест|условия прорастания/.test(q)) {
    return { type: 'template', data: { template: 'seed_growth' } };
  }
  if (/строен.*сем|семядол|эндосперм|кожура сем|зародыш сем|однодольн|двудольн/.test(q)) {
    return { type: 'template', data: { template: 'seed_structure' } };
  }
  if (/закон ома|электрическ.*цеп|сила тока|сопротивлен|напряжен/.test(q)) {
    return { type: 'template', data: { template: 'electric_circuit', voltage: 12, resistance: 6 } };
  }
  if (/сил[аы] трен|свободн.*тел|реакц.*опор|сил[аы] тяжест/.test(q)) {
    return { type: 'template', data: { template: 'free_body' } };
  }
  if (/график.*движен|x\(t\)|равноускорен|равномерн.*движ/.test(q)) {
    return { type: 'template', data: { template: 'motion_graph' } };
  }
  if (/интерференц|волн/.test(q)) {
    return { type: 'template', data: { template: 'wave_interference' } };
  }
  if (/линз|преломлен|оптик|фокус.*линз/.test(q)) {
    return { type: 'template', data: { template: 'lens_refraction' } };
  }
  if (/строен.*атом|электрон.*орбит|протон|нейтрон/.test(q)) {
    return { type: 'template', data: { template: 'atom', symbol: 'C', name: 'Углерод', protons: 6, neutrons: 6, shells: [2, 4] } };
  }
  if (/менделеев|периодическ.*табл|атомн.*масс/.test(q)) {
    return { type: 'template', data: { template: 'periodic_element', symbol: 'O', number: 8, mass: '15,999', name: 'Кислород', config: '1s² 2s² 2p⁴', period: 2, group: 'VIA (16)' } };
  }
  if (/химическ.*реакц|уравнен.*реакц/.test(q)) {
    return { type: 'template', data: { template: 'reaction', equation: '2H₂ + O₂ → 2H₂O' } };
  }
  if (/форм.*молекул|тетраэдр|молекул.*вод/.test(q)) {
    return { type: 'template', data: { template: 'molecule_shape', molecule: 'H2O' } };
  }
  if (/раствор|массов.*дол|концентрац/.test(q)) {
    return { type: 'template', data: { template: 'solution_mix', soluteMass: 20, waterMass: 180 } };
  }
  if (/средневек|туник|камиз/.test(q)) {
    return { type: 'template', data: { template: 'clothing_century', era: 'medieval' } };
  }
  if (/возрожден|ренессанс|пурпуэн|рондел/.test(q)) {
    return { type: 'template', data: { template: 'clothing_century', era: 'renaissance' } };
  }
  if (/барокко|рококо|камзол|парик/.test(q)) {
    return { type: 'template', data: { template: 'clothing_century', era: 'baroque' } };
  }
  if (/xix|19 век|кринолин|фрак|сюртук/.test(q)) {
    return { type: 'template', data: { template: 'clothing_century', era: 'nineteenth' } };
  }
  if (/xx|20 век|сравнен.*эпох/.test(q)) {
    return { type: 'template', data: { template: 'compare_eras', leftEra: 'nineteenth', rightEra: 'twentieth' } };
  }
  return { type: 'none', data: null };
}

// Определение уточняющего намерения ученика (подробнее, практика или команда остановки)
export function classifyFollowUpIntent(question) {
  const q = String(question || '').toLowerCase().trim();
  if (/^(стоп|хватит|тихо|молчи|подожди|пауза|остановись|прекрати)(?:$|\s|!|\.)/.test(q)) {
    return 'stop';
  }
  if (
    /^(подробнее|детальнее|дальше|продолжай|ещё|еще|разложи|объясни глубже|по шагам|что дальше|а подробнее)/.test(
      q
    ) ||
    /(расскажи подробнее|можно подробнее|разложи по шагам|объясни детальнее|более детально|расскажи дальше)/.test(
      q
    )
  ) {
    return 'detail';
  }
  if (
    /^(практика|опыт|эксперимент|исследование|как проверить|на практике)/.test(q) ||
    /(практическ.*задач|провести опыт|дай опыт|на практике|как исследовать|мини-эксперимент|попробовать дома)/.test(
      q
    )
  ) {
    return 'practice';
  }
  return 'new';
}

// Очистка энциклопедической строки от громоздких этимологических вставок (чтобы речь звучала естественно)
function polishEncyclopediaSentence(sentence) {
  return String(sentence || '')
    .replace(/\((?:от|лат\.|др\.-греч\.|греч\.|англ\.|фр\.|нем\.)[^)]{4,80}\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Сборка прямого ответа из проверенных источников БЕЗ канцелярских вступлений (сразу суть!)
export function synthesizeAnswerFromSources(
  question,
  sources,
  { detailMode = false, practiceMode = false } = {}
) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  const allSentences = [];
  for (const src of sources) {
    const parts = String(src.snippet || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => polishEncyclopediaSentence(s))
      .filter((s) => s.length > 18);
    for (const p of parts) {
      if (!allSentences.some((existing) => existing.slice(0, 35) === p.slice(0, 35))) {
        allSentences.push(p);
      }
    }
  }

  if (allSentences.length === 0) {
    return polishEncyclopediaSentence(sources[0].snippet).slice(0, 260);
  }

  if (practiceMode) {
    const core = allSentences.slice(0, 2).join(' ');
    return `Для практической работы по теме выдели главный признак или величину из определения, зафиксируй наблюдения и сравни результат с теорией. ${core}`;
  }

  if (detailMode) {
    // Для подробного ответа берём следующие предложения, которые ещё не были сказаны в коротком резюме
    const deeper = allSentences.slice(2, 6);
    if (deeper.length > 0) {
      return deeper.join(' ');
    }
    return allSentences.slice(0, 4).join(' ');
  }

  // Первый ответ: коротко, ясно и сразу по сути (1–2 предложения)
  return allSentences.slice(0, 2).join(' ');
}
