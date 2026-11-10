// Серверлес-функция Netlify для «Синапс» (/api/ask)
// 1. Ищет факты в проверенных источниках и российских образовательных платформах (search.js)
// 2. Проксирует запрос к Gemini Flash (основной) и DeepSeek (резерв, работает без VPN в РФ)
// Хранит API-ключи исключительно в переменных окружения: GEMINI_API_KEY и DEEPSEEK_API_KEY.

import {
  detectTemplateFromQuestion,
  searchVerifiedSources,
  synthesizeAnswerFromSources
} from '../search.js';

// Системный промпт строго задаёт тон, возрастную безопасность 12–17, прямой ответ сразу по сути и двухуровневую глубину
const SYSTEM_PROMPT = `Ты Синапс — добрый, тёплый школьный ассистент учителя для учеников 12–17 лет и их практических и исследовательских задач. Говори просто, живо, на 'ты'.
ВАЖНО: Начинай ответ СРАЗУ по сути вопроса! Запрещены вводные фразы вроде "Вот что я нашёл в источниках", "Согласно Википедии", "Я поискал в интернете". Отвечай сразу как умный голосовой помощник.
РЕЖИМЫ ГЛУБИНЫ:
1) На первый вопрос отвечай КОРОТКО и чётко по самой сути (1–3 предложения).
2) Если ученик просит рассказать подробнее, детальнее, по шагам или просит практический опыт — разложи тему глубже (4–6 предложений), объясни механизм, этапы или подскажи безопасное наблюдение/мини-исследование.
Предметы: биология (клетки, семена и их рост, органы человека, одноклеточные), физика (10–11), химия (8–9), история (облик и одежда людей по векам). Опирайся на переданные проверенные источники (БРЭ, РУВИКИ, Фоксфорд, InternetUrok, ЯКласс, РЭШ, Элементы, Arzamas, Культура.РФ, Википедия). Не выдумывай числа, даты, формулы. Если не уверен — 'уточни у учителя'. Отказывай в темах 18+, насилии, жестокости, политике, религии, наркотиках: 'Это вне урока. Спроси учителя или родителей'. Другие предметы и нешкольные темы — 'это вне моей специализации'.
Возвращай СТРОГО JSON:
{"answer":"...", "show":{"type":"formula"|"chart"|"diagram"|"template"|"image_query"|"none", "data":...}}
Если тема из списка готовых шаблонов (cell_animal, cell_plant, mitosis, amoeba, paramecium, digestion, blood_flow, photosynthesis, seed_structure, seed_growth, electric_circuit, free_body, motion_graph, wave_interference, lens_refraction, atom, periodic_element, reaction, molecule_shape, solution_mix, timeline, cause_effect, clothing_century, compare_eras) — верни type="template" и data.template="<имя>". Приоритет шаблона над собственной схемой.`;

// Серверная проверка на запрещённые для детей слова (18+, мат, насилие, алкоголь, наркотики, политика, религия)
const FORBIDDEN_PATTERNS = [
  /(^|[^а-яёa-z0-9])(порно|секс|эротик|интим|обнаж|голы[йх]|сись|ху[йяюе]|пизд|еб[ауио]|ёб|бля[дт]|сук[аи]|нах[уе]|мраз|муд[ао]|пидор|шлюх|nude|nsfw|porn|sex|erotic)/i,
  /(^|[^а-яёa-z0-9])(уби[йт]|кровь|расчлен|пытк|суицид|самоубий|террор|взрывчат|бомб[ау]|наркот|героин|кокаин|марихуан|водк|алкогол|пиво($|[^а-яё])|сигарет|вейп|бухло)/i,
  /(^|[^а-яёa-z0-9])(выбор[ыа]|парти[яи]|депутат|президент|оппозиц|митинг|санкци|религи|бог($|[^а-яё])|аллах|церков|мечет|икон[ауыой]|молитв|атеизм)/i
];

function containsForbiddenContent(text) {
  if (!text) return false;
  const source = typeof text === 'string' ? text : JSON.stringify(text);
  return FORBIDDEN_PATTERNS.some((re) => re.test(source));
}

// Максимальные настройки безопасности Gemini
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' }
];

// Безопасный разбор JSON из текста ответа модели
function parseModelJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty model response');
  }
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonSlice =
    firstBrace !== -1 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

  const parsed = JSON.parse(jsonSlice);
  return {
    answer:
      typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim()
        : 'Уточни у учителя этот момент, я постараюсь помочь с другим вопросом!',
    show:
      parsed.show && typeof parsed.show === 'object'
        ? {
            type: parsed.show.type || 'none',
            data: parsed.show.data ?? null
          }
        : { type: 'none', data: null }
  };
}

// Fetch с таймаутом 8 секунд
async function fetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Форматирование найденных проверенных источников в контекст для LLM
function formatSourcesForPrompt(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const lines = sources.map(
    (s, i) => `${i + 1}. [${s.sourceName}] ${s.title}: ${s.snippet}`
  );
  return `\n\n[ПРОВЕРЕННЫЕ ИСТОЧНИКИ ИЗ ИНТЕРНЕТА]\n${lines.join('\n')}`;
}

function buildUserMessage({
  question,
  subject,
  sources,
  detailMode,
  practiceMode,
  previousQuestion,
  previousAnswer
}) {
  const contextBlock = formatSourcesForPrompt(sources);
  let modeHint = 'Режим ответа: КРАТКО по сути (1–3 предложения, без вводных слов).';
  if (practiceMode) {
    modeHint =
      'Режим ответа: ПРАКТИКА И ИССЛЕДОВАНИЕ — предложи понятную практическую задачу, эксперимент или алгоритм наблюдения для школьника (3–5 предложений).';
  } else if (detailMode) {
    modeHint =
      'Режим ответа: ПОДРОБНЫЙ РАЗБОР — разложи тему глубже и по шагам, не повторяя дословно прошлый короткий ответ (4–6 предложений).';
  }

  const historyBlock =
    previousQuestion && (detailMode || practiceMode)
      ? `\nПредыдущая тема: "${previousQuestion}"\nПредыдущий краткий ответ: "${previousAnswer || ''}"\n`
      : '\n';

  return (
    (subject ? `Текущий выбранный предмет: ${subject}.\n` : '') +
    `${modeHint}${historyBlock}Запрос ученика: ${question}${contextBlock}`
  );
}

// Запрос к Google Gemini Flash (с автофолбэком модели при 404)
async function callGemini({
  question,
  subject,
  sources,
  detailMode,
  practiceMode,
  previousQuestion,
  previousAnswer,
  apiKey,
  model = 'gemini-1.5-flash'
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const userMessage = buildUserMessage({
    question,
    subject,
    sources,
    detailMode,
    practiceMode,
    previousQuestion,
    previousAnswer
  });

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 750,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    8000
  );

  if (response.status === 401) {
    const err = new Error('Gemini API key unauthorized');
    err.statusCode = 401;
    throw err;
  }

  // 403 может означать как неверный ключ, так и региональную блокировку (без VPN)
  if (response.status === 403) {
    const txt = await response.text().catch(() => '');
    const err = new Error(`Gemini 403: ${txt.slice(0, 120)}`);
    err.statusCode = txt.toLowerCase().includes('location') ? 451 : 401;
    throw err;
  }

  if (response.status === 404 && model === 'gemini-1.5-flash') {
    return callGemini({
      question,
      subject,
      sources,
      detailMode,
      practiceMode,
      previousQuestion,
      previousAnswer,
      apiKey,
      model: 'gemini-2.5-flash'
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Gemini error ${response.status}: ${text.slice(0, 180)}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();

  if (data?.promptFeedback?.blockReason) {
    return { blocked: true, provider: 'gemini' };
  }

  const candidate = data?.candidates?.[0];
  if (
    !candidate ||
    candidate.finishReason === 'SAFETY' ||
    candidate.finishReason === 'PROHIBITED_CONTENT'
  ) {
    return { blocked: true, provider: 'gemini' };
  }

  const rawText = candidate?.content?.parts?.[0]?.text || '';
  const parsed = parseModelJson(rawText);
  return { blocked: false, provider: 'gemini', ...parsed };
}

// Запрос к резервному DeepSeek API (работает без VPN в России)
async function callDeepSeek({
  question,
  subject,
  sources,
  detailMode,
  practiceMode,
  previousQuestion,
  previousAnswer,
  apiKey
}) {
  const userMessage = buildUserMessage({
    question,
    subject,
    sources,
    detailMode,
    practiceMode,
    previousQuestion,
    previousAnswer
  });

  const response = await fetchWithTimeout(
    'https://api.deepseek.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.35,
        max_tokens: 750,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              SYSTEM_PROMPT +
              '\nДОПОЛНИТЕЛЬНОЕ ПРАВИЛО БЕЗОПАСНОСТИ: строго детский образовательный режим (12–17 лет). При малейшем намёке на 18+, жестокость, политику, религию, алкоголь или наркотики отвечай строго: {"answer":"Это вне урока. Спроси учителя или родителей","show":{"type":"none","data":null}}.'
          },
          { role: 'user', content: userMessage }
        ]
      })
    },
    8000
  );

  if (response.status === 401 || response.status === 403) {
    const err = new Error('DeepSeek API key unauthorized');
    err.statusCode = 401;
    throw err;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`DeepSeek error ${response.status}: ${text.slice(0, 180)}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content || '';
  const parsed = parseModelJson(rawText);
  return { blocked: false, provider: 'deepseek', ...parsed };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

// Основной обработчик Netlify Function v2 и Node-сервера
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed', message: 'Используй POST' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'Некорректный JSON' }, 400);
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const useDeepSeek = Boolean(body?.useDeepSeek);
  const useWebSearch = body?.useWebSearch !== false;
  const detailMode = Boolean(body?.detailMode);
  const practiceMode = Boolean(body?.practiceMode);
  const previousQuestion =
    typeof body?.previousQuestion === 'string' ? body.previousQuestion.trim() : '';
  const previousAnswer =
    typeof body?.previousAnswer === 'string' ? body.previousAnswer.trim() : '';

  if (!question) {
    return jsonResponse({ error: 'empty_question', message: 'Задай вопрос' }, 400);
  }

  // Жёсткая серверная модерация входящего вопроса
  if (containsForbiddenContent(question)) {
    return jsonResponse({
      answer: 'Это вне урока. Спроси учителя или родителей',
      show: { type: 'none', data: null },
      sources: [],
      moderated: true
    });
  }

  const effectiveSearchQuery =
    (detailMode || practiceMode) && previousQuestion ? previousQuestion : question;

  // Живой поиск по проверенным российским образовательным платформам и энциклопедиям
  let sources = [];
  if (useWebSearch) {
    try {
      sources = await searchVerifiedSources(effectiveSearchQuery, { subject, maxResults: 4 });
    } catch {
      sources = [];
    }
  }

  const fallbackAnswer = synthesizeAnswerFromSources(effectiveSearchQuery, sources, {
    detailMode,
    practiceMode
  });
  const fallbackShow = detectTemplateFromQuestion(effectiveSearchQuery);

  const geminiKey = process.env.GEMINI_API_KEY || '';
  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';

  // Если ключ не настроен — возвращаем 401 с сообщением и прикладываем найденные проверенные источники
  if (!geminiKey && !(useDeepSeek && deepseekKey) && !deepseekKey) {
    return jsonResponse(
      {
        error: 'key_not_configured',
        message: 'Ключ не настроен',
        sources,
        fallbackAnswer,
        fallbackShow
      },
      401
    );
  }

  let lastError = null;

  // 1. Основной провайдер: Google Gemini (с 1 ретраем), если не принудительно выбран DeepSeek
  if (geminiKey && !useDeepSeek) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callGemini({
          question,
          subject,
          sources,
          detailMode,
          practiceMode,
          previousQuestion,
          previousAnswer,
          apiKey: geminiKey
        });
        if (
          result.blocked ||
          containsForbiddenContent(result.answer) ||
          containsForbiddenContent(result.show)
        ) {
          return jsonResponse({
            blocked: true,
            answer: 'Не могу ответить на этот вопрос',
            show: { type: 'none', data: null },
            sources: []
          });
        }
        return jsonResponse({ ...result, sources }, 200);
      } catch (err) {
        lastError = err;
        if (err?.statusCode === 401 || err?.statusCode === 451) break;
      }
    }
  }

  // 2. Резерв DeepSeek (если включён чекбокс ИЛИ Gemini недоступен/заблокирован по региону без VPN)
  if ((useDeepSeek || !geminiKey || lastError) && deepseekKey) {
    try {
      const result = await callDeepSeek({
        question,
        subject,
        sources,
        detailMode,
        practiceMode,
        previousQuestion,
        previousAnswer,
        apiKey: deepseekKey
      });
      if (
        result.blocked ||
        containsForbiddenContent(result.answer) ||
        containsForbiddenContent(result.show)
      ) {
        return jsonResponse({
          blocked: true,
          answer: 'Не могу ответить на этот вопрос',
          show: { type: 'none', data: null },
          sources: []
        });
      }
      return jsonResponse({ ...result, sources }, 200);
    } catch (err) {
      lastError = err;
    }
  }

  // Если ключи заданы неверно и ни один провайдер не ответил — 401 или 502 с проверенными источниками
  if (lastError?.statusCode === 401) {
    return jsonResponse(
      {
        error: 'key_not_configured',
        message: 'Ключ не настроен',
        sources,
        fallbackAnswer,
        fallbackShow
      },
      401
    );
  }

  return jsonResponse(
    {
      error: 'provider_unavailable',
      message: 'Сервер ИИ временно не отвечает, но вот что нашлось в проверенных источниках.',
      sources,
      fallbackAnswer,
      fallbackShow
    },
    502
  );
}

export const config = {
  path: '/api/ask'
};
