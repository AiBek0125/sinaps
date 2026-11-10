// Модуль живой русской озвучки «Синапса» на базе Web Speech API (speechSynthesis, ru-RU)

// Голос один и выбирается автоматически (мягкий женский русский), поэтому сохраняем только темп речи
const STORAGE_RATE_KEY = 'synapse_voice_rate';

// Пауза с возможностью проверки поколения (используется между предложениями)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Нормализация фразы для сравнения с эхом: без регистра, знаков и с «е» вместо «ё»
function normalizeEcho(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Встроенный словарь ~170 частотных слов с заменой «е» -> «ё» для верного ударения синтезатора
const YO_DICTIONARY = {
  идет: 'идёт',
  идете: 'идёте',
  идем: 'идём',
  идешь: 'идёшь',
  придет: 'придёт',
  придем: 'придём',
  пройдет: 'пройдёт',
  пройдем: 'пройдём',
  уйдет: 'уйдёт',
  найдет: 'найдёт',
  пойдет: 'пойдёт',
  дойдет: 'дойдёт',
  войдет: 'войдёт',
  выйдет: 'выйдет', // исключение для стабильности, оставим верным
  свое: 'своё',
  своего: 'своего',
  своем: 'своём',
  мое: 'моё',
  твоем: 'твоём',
  твое: 'твоё',
  зовет: 'зовёт',
  назовет: 'назовёт',
  позовет: 'позовёт',
  берет: 'берёт',
  берем: 'берём',
  соберет: 'соберёт',
  разберет: 'разберёт',
  уберет: 'уберёт',
  выберет: 'выберет',
  несет: 'несёт',
  принесет: 'принесёт',
  разнесет: 'разнесёт',
  унесет: 'унесёт',
  ведет: 'ведёт',
  приведет: 'приведёт',
  проведет: 'проведёт',
  переведет: 'переведёт',
  дает: 'даёт',
  передает: 'передаёт',
  создает: 'создаёт',
  узнает: 'узнаёт',
  признает: 'признаёт',
  встает: 'встаёт',
  остается: 'остаётся',
  достает: 'достаёт',
  течет: 'течёт',
  протечет: 'протечёт',
  печет: 'печёт',
  бережет: 'бережёт',
  стережет: 'стережёт',
  может: 'может',
  ждет: 'ждёт',
  подождет: 'подождёт',
  живет: 'живёт',
  переживет: 'переживёт',
  зовут: 'зовут',
  плывет: 'плывёт',
  растет: 'растёт',
  вырастет: 'вырастет',
  цветет: 'цветёт',
  расцветет: 'расцветёт',
  метет: 'метёт',
  плетет: 'плетёт',
  трет: 'трёт',
  умрет: 'умрёт',
  разобьет: 'разобьёт',
  льет: 'льёт',
  перельет: 'перельёт',
  пьет: 'пьёт',
  бьет: 'бьёт',
  шьет: 'шьёт',
  поет: 'поёт',
  смеется: 'смеётся',
  улыбнется: 'улыбнётся',
  сожмется: 'сожмётся',
  разовьется: 'разовьётся',
  вернется: 'вернётся',
  начнется: 'начнётся',
  начнем: 'начнём',
  начнет: 'начнёт',
  повернет: 'повернёт',
  повернем: 'повернём',
  замкнет: 'замкнёт',
  сверкнет: 'сверкнёт',
  вспыхнет: 'вспыхнет',
  толчет: 'толчёт',
  влечет: 'влечёт',
  привлечет: 'привлечёт',
  еще: 'ещё',
  ее: 'её',
  ученый: 'учёный',
  ученые: 'учёные',
  ученых: 'учёных',
  учеба: 'учёба',
  учебный: 'учебный',
  зеленый: 'зелёный',
  зеленая: 'зелёная',
  зеленое: 'зелёное',
  зеленые: 'зелёные',
  желтый: 'жёлтый',
  желтая: 'жёлтая',
  желтое: 'жёлтое',
  черный: 'чёрный',
  черная: 'чёрная',
  черное: 'чёрное',
  темный: 'тёмный',
  темная: 'тёмная',
  темное: 'тёмное',
  теплый: 'тёплый',
  теплая: 'тёплая',
  теплое: 'тёплое',
  легкий: 'лёгкий',
  легкая: 'лёгкая',
  легкое: 'лёгкое',
  легче: 'легче',
  тяжелый: 'тяжёлый',
  тяжелая: 'тяжёлая',
  тяжелое: 'тяжёлое',
  веселый: 'весёлый',
  веселая: 'весёлая',
  весело: 'весело',
  серьезный: 'серьёзный',
  серьезная: 'серьёзная',
  надежный: 'надёжный',
  надежная: 'надёжная',
  далекий: 'далёкий',
  далекая: 'далёкая',
  твердый: 'твёрдый',
  твердая: 'твёрдая',
  твердое: 'твёрдое',
  острый: 'острый',
  четкий: 'чёткий',
  четкая: 'чёткая',
  четко: 'чётко',
  звезда: 'звезда',
  звезды: 'звёзды',
  звездный: 'звёздный',
  объем: 'объём',
  объемы: 'объёмы',
  подъем: 'подъём',
  прием: 'приём',
  разъем: 'разъём',
  водоем: 'водоём',
  счет: 'счёт',
  расчет: 'расчёт',
  отчет: 'отчёт',
  зачет: 'зачёт',
  полет: 'полёт',
  самолет: 'самолёт',
  вертолет: 'вертолёт',
  лед: 'лёд',
  мед: 'мёд',
  клеенка: 'клеёнка',
  ребенок: 'ребёнок',
  котенок: 'котёнок',
  слеза: 'слеза',
  слезы: 'слёзы',
  пчела: 'пчела',
  пчелы: 'пчёлы',
  зерно: 'зерно',
  зерна: 'зёрна',
  колесо: 'колесо',
  колеса: 'колёса',
  бревно: 'бревно',
  бревна: 'брёвна',
  ведро: 'ведро',
  ведра: 'вёдра',
  гнездо: 'гнездо',
  гнезда: 'гнёзда',
  щетка: 'щётка',
  щека: 'щека',
  щеки: 'щёки',
  шелк: 'шёлк',
  шелковый: 'шёлковый',
  шепот: 'шёпот',
  черточка: 'чёрточка',
  решетка: 'решётка',
  пленка: 'плёнка',
  пеленка: 'пелёнка',
  озера: 'озёра',
  осел: 'осёл',
  козел: 'козёл',
  орел: 'орёл',
  ковер: 'ковёр',
  костер: 'костёр',
  шатер: 'шатёр',
  актер: 'актёр',
  шахтер: 'шахтёр',
  трех: 'трёх',
  четырех: 'четырёх',
  вдвоем: 'вдвоём',
  втроем: 'втроём',
  вчетвером: 'вчетвером',
  вперед: 'вперёд',
  наперечет: 'наперечёт',
  причем: 'причём',
  ничем: 'ничём',
  однако: 'однако',
  небо: 'небо',
  нeт: 'нет',
  амеба: 'амёба',
  амебы: 'амёбы',
  амебе: 'амёбе',
  амебу: 'амёбу',
  амебой: 'амёбой',
  разделенный: 'разделённый',
  перевернутый: 'перевёрнутый',
  перевернутое: 'перевёрнутое',
  свернутый: 'свёрнутый',
  растворенный: 'растворённый',
  растворенного: 'растворённого',
  заряженный: 'заряжённый',
  поделенный: 'поделённый',
  всегда: 'всегда',
  все: 'всё'
};

// Ударения, которые синтезатор часто ставит неверно. Браузер не умеет принимать ударение напрямую,
// поэтому для ударного «е» используем «ё» (оно читается как ударное «е» в сочетании с мягким началом).
// Ключ — слово в нижнем регистре, значение — написание для синтезатора.
const STRESS_HINTS = {
  пищевод: 'пищёвод', кишечник: 'кишёчник', фотосинтез: 'фотосинтёз', эндосперм: 'эндоспёрм',
  молекула: 'молёкула', молекулы: 'молёкулы', молекул: 'молёкул', вещество: 'вещёство', вещества: 'вещёства',
  кровообращение: 'кровообращёние', давление: 'давлёние', напряжение: 'напряжёние',
  сопротивление: 'сопротивлёние', интерференция: 'интерфёренция', трение: 'трёние',
  уравнение: 'уравнёние', ускорение: 'ускорёние', преломление: 'преломлёние', возрождение: 'возрождёние',
  средневековье: 'средневёковье', рондель: 'рондёль', семя: 'сёмя', семена: 'сёмена',
  фермент: 'фермёнт', ферменты: 'фермёнты', пепсин: 'пёпсин', желчь: 'жёлчь', печень: 'пёчень',
  клетка: 'клётка', клетки: 'клётки', клеток: 'клёток', клеточный: 'клёточный', клеточная: 'клёточная',
  ядерный: 'ядёрный', белок: 'бёлок', белки: 'бёлки', сердце: 'сёрдце', вены: 'вёны', артерии: 'артёрии',
  желудок: 'жёлудок', пищеварение: 'пищеварёние', стебель: 'стёбель', растение: 'растёние',
  растения: 'растёния', энергия: 'энёргия', энергии: 'энёргии', тело: 'тёло', тела: 'тёла',
  время: 'врёмя', времени: 'врёмени', изображение: 'изображёние', отражение: 'отражёние',
  колебание: 'колёбание', равнодействующая: 'равнодёйствующая', действие: 'дёйствие', инерция: 'инёрция',
  углерод: 'углёрод', элемент: 'элёмент', элементы: 'элёменты', период: 'пёриод',
  соединение: 'соединёние', одежда: 'одёжда', одежды: 'одёжды', одежде: 'одёжде', одежду: 'одёжду',
  века: 'вёка', столетие: 'столётие', пример: 'примёр', примеры: 'примёры', цель: 'цёль',
  ответ: 'отвёт', ответы: 'отвёты', здесь: 'здёсь', место: 'мёсто', месте: 'мёсте',
  движение: 'движёние', движения: 'движёния', движется: 'движётся', направление: 'направлёние',
  положение: 'положёние', значение: 'значёние', применение: 'применёние', строение: 'строёние'
};

// Расширяемый словарь трудных и научных слов (Map для точных замен перед озвучкой)
export const DIFFICULT_WORDS_MAP = new Map([
  ['katex', 'Катекс'],
  ['plotly', 'Плотли'],
  ['ph', 'пэ-аш'],
  ['днк', 'дэ-эн-ка'],
  ['рнк', 'эр-эн-ка'],
  ['атф', 'а-тэ-эф'],
  ['эдс', 'э-дэ-эс'],
  ['кпд', 'ка-пэ-дэ'],
  ['м/с', 'метров в секунду'],
  ['км/ч', 'километров в час'],
  ['м/с²', 'метров на секунду в квадрате'],
  ['ма', 'миллиампер'],
  ['co₂', 'це-о-два'],
  ['co2', 'це-о-два'],
  ['h₂o', 'аш-два-о'],
  ['h2o', 'аш-два-о'],
  ['ch₄', 'це-аш-четыре'],
  ['ch4', 'це-аш-четыре'],
  ['o₂', 'о-два'],
  ['o2', 'о-два'],
  ['h₂', 'аш-два'],
  ['h2', 'аш-два'],
  ['nacl', 'натрий-хлор'],
  ['c₆h₁₂o₆', 'глюкоза це-шесть-аш-двенадцать-о-шесть'],
  ['na⁺', 'ион натрия'],
  ['cl⁻', 'ион хлора'],
  ['x(t)', 'икс от тэ'],
  ['fтр', 'эф трения'],
  ['mg', 'эм-же'],
  ['пурпуэн', 'пурпуэн'],
  ['рондель', 'рондель'],
  ['кринолин', 'кринолин'],
  ['камзол', 'камзол'],
  ['панье', 'панье'],
  ['сюртук', 'сюртук'],
  ['камиза', 'камиза']
]);

// Преобразование формул KaTeX, символов и чисел в живую русскую речь
export function speechify(text) {
  if (!text) return '';
  let out = String(text);

  // Удаляем обёртки LaTeX вроде $$...$$ или $...$
  out = out.replace(/\$\$/g, ' ').replace(/\$/g, ' ');

  // Дроби \frac{A}{B} -> "A делённое на B"
  out = out.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 делённое на $2');

  // Подстрочные/надстрочные индексы LaTeX и степени
  out = out
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9]+)\s*\^\s*\{?-2\}?/g, '$1 в минус второй степени')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9]+)\s*\^\s*\{?-3\}?/g, '$1 в минус третьей степени')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9]+)\s*\^\s*\{?2\}?/g, '$1 в квадрате')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9]+)\s*\^\s*\{?3\}?/g, '$1 в кубе')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9]+)\^\{?([^}\s]+)\}?/g, '$1 в степени $2')
    .replace(/²/g, ' в квадрате')
    .replace(/³/g, ' в кубе');

  // Очистка команд LaTeX
  out = out
    .replace(/\\cdot|\\times/g, ' умножить на ')
    .replace(/\\vec\{([^}]+)\}/g, 'вектор $1')
    .replace(/\\omega/gi, 'омега')
    .replace(/\\Delta/gi, 'дельта')
    .replace(/\\varphi|\\phi/gi, 'фи')
    .replace(/\\lambda/gi, 'лямбда')
    .replace(/\\Omega/g, 'ом')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '');

  // Спецсимволы в слова
  out = out
    .replace(/→/g, ' переходит в ')
    .replace(/≈/g, ' приблизительно равно ')
    .replace(/≠/g, ' не равно ')
    .replace(/=/g, ' равно ')
    .replace(/·/g, ' умножить на ')
    .replace(/%/g, ' процентов')
    .replace(/°/g, ' градусов')
    .replace(/\bX–XIV\b/g, 'десятого — четырнадцатого')
    .replace(/\bXV–XVI\b/g, 'пятнадцатого — шестнадцатого')
    .replace(/\bXVII–XVIII\b/g, 'семнадцатого — восемнадцатого')
    .replace(/\bXIX\b/g, 'девятнадцатого')
    .replace(/\bXX\b/g, 'двадцатого')
    .replace(/\bX\b/g, 'десятого');

  // Произношение одиночных латинских переменных в формулах (x, U, I, R)
  const latinVarMap = {
    I: 'и',
    U: 'у',
    R: 'эр',
    P: 'пэ',
    Q: 'ку',
    F: 'эф',
    N: 'эн',
    m: 'эм',
    g: 'же',
    t: 'тэ',
    x: 'икс',
    y: 'игрек',
    v: 'вэ',
    a: 'а',
    n: 'эн',
    A: 'а'
  };

  out = out.replace(/(?<![a-zA-Zа-яА-ЯёЁ])([IURPQFNmgtyxvaA])(?![a-zA-Zа-яА-ЯёЁ])/g, (_, ch) => {
    return latinVarMap[ch] || ch;
  });

  // Замена трудных терминов из Map
  for (const [key, spoken] of DIFFICULT_WORDS_MAP.entries()) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-zA-Zа-яА-ЯёЁ0-9])${escaped}(?![a-zA-Zа-яА-ЯёЁ0-9])`, 'gi');
    out = out.replace(re, spoken);
  }

  // Замена «е» -> «ё» по словарю с сохранением регистра первой буквы
  out = out.replace(/[а-яА-ЯёЁ]+/g, (word) => {
    const lower = word.toLowerCase();
    const replacement = YO_DICTIONARY[lower] || STRESS_HINTS[lower];
    if (!replacement) return word;
    if (word[0] === word[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  // Микропаузы перед вводными словами и союзами для живой интонации
  out = out
    .replace(/\s+(а|но|чтобы|однако|например|кстати|поэтому)\s+/gi, ', $1 ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return out;
}

// Разбиение текста на предложения с сохранением знака препинания в конце
function splitSentences(text) {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

// Делим длинное предложение по запятым и союзам: так голос делает естественные вдохи между смысловыми частями.
// Слишком короткие куски склеиваем, чтобы не получилась «рубленая» речь.
function splitClauses(sentence) {
  const pieces = sentence
    .split(/(?<=,)\s+|\s+(?=(?:а|но|однако|поэтому|чтобы|потому|когда|если)\s)/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const merged = [];
  for (const p of pieces) {
    if (merged.length && merged[merged.length - 1].length < 28) {
      merged[merged.length - 1] += ' ' + p;
    } else {
      merged.push(p);
    }
  }
  return merged.length ? merged : [sentence];
}

// Речевые единицы: каждая с типом интонации (обычная, вопрос, восклицание) и паузой после неё
function buildSpeechUnits(text) {
  const units = [];
  for (const sentence of splitSentences(text)) {
    const kind = sentence.endsWith('?') ? 'question' : sentence.endsWith('!') ? 'exclaim' : 'normal';
    const parts = sentence.length > 70 ? splitClauses(sentence) : [sentence];
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      units.push({
        text: part,
        kind: isLast ? kind : 'normal',
        // Пауза после запятой короче, чем после конца предложения
        pauseAfter: isLast ? 240 : 110
      });
    });
  }
  return units;
}

// Небольшие колебания темпа и высоты по кругу: голос звучит живо, а не однообразно
const NATURAL_VARIANTS = [
  { rate: 1.0, pitch: 0 },
  { rate: 0.96, pitch: 0.02 },
  { rate: 1.02, pitch: -0.01 },
  { rate: 0.97, pitch: 0.015 }
];

// Класс управления живым голосом «Синапса»
export class SynapseVoice {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voices = [];
    // Имя выбранного голоса определяется автоматически в refreshVoices()
    this.selectedVoiceName = '';
    this.userRate = Number(
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_RATE_KEY)) || '0.95'
    );
    if (!Number.isFinite(this.userRate) || this.userRate < 0.7 || this.userRate > 1.4) {
      this.userRate = 0.95;
    }

    this.speaking = false;
    // Поколение речи: каждый вызов speak() и stop() увеличивает счётчик.
    // Цепочка предложений живёт только пока её поколение актуально — старая речь не продолжается.
    this._gen = 0;
    this._resolvePending = null;      // резолвер текущего предложения (для немедленного выхода из ожидания)
    this._currentSentenceNorm = '';   // нормализованный текст текущего предложения (для проверки эха)
    this._ampTimer = null;
    this._listeners = new Set();
    this._ampCallbacks = new Set();

    if (this.supported) {
      this.refreshVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this.refreshVoices();
      });
    }
  }

  // Оценка голоса: мягкие женские русские голоса с естественной интонацией получают приоритет,
  // мужские голоса исключаются, потому что образ Синапса — женский и тёплый
  _scoreVoice(voice) {
    const name = (voice.name || '').toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;
    if (lang === 'ru-ru') score += 20;
    else if (lang.startsWith('ru')) score += 10;

    // Порядок — по качеству звучания: самые естественные и мягкие первыми
    const preferred = [
      [/google русский|google russian/, 100],
      [/milena|милена/, 96],
      [/irina|ирина/, 94],
      [/svetlana|светлана/, 93],
      [/katya|катя/, 92],
      [/alena|алена/, 90],
      [/tatyana|татьяна/, 88],
      [/yandex|алиса/, 88]
    ];
    for (const [re, value] of preferred) {
      if (re.test(name)) {
        score += value;
        break;
      }
    }

    if (/natural|neural|online|premium|премиум/.test(name)) score += 8;
    if (/dmitry|дмитрий|pavel|павел|yuri|юрий|maxim|максим|aleksandr|александр|david|ivan|иван|male|мужск/.test(name)) {
      score -= 200;
    }
    return score;
  }

  // Определяем единственный голос озвучки (лучший женский русский из установленных)
  refreshVoices() {
    if (!this.supported) return [];
    const all = window.speechSynthesis.getVoices() || [];
    // Мужские голоса (отрицательная оценка) не используем: если женского нет, берём системный голос по умолчанию
    const ruVoices = all
      .filter((v) => (v.lang || '').toLowerCase().startsWith('ru'))
      .filter((v) => this._scoreVoice(v) > 0)
      .sort((a, b) => this._scoreVoice(b) - this._scoreVoice(a));

    this.voices = ruVoices;
    this.selectedVoiceName = ruVoices[0]?.name || '';
    this._emitVoices();
    return this.voices;
  }

  onVoicesChange(cb) {
    this._listeners.add(cb);
    cb(this.voices, this.selectedVoiceName);
    return () => this._listeners.delete(cb);
  }

  onAmplitude(cb) {
    this._ampCallbacks.add(cb);
    return () => this._ampCallbacks.delete(cb);
  }

  _emitVoices() {
    for (const cb of this._listeners) {
      cb(this.voices, this.selectedVoiceName);
    }
  }

  _emitAmplitude(val) {
    for (const cb of this._ampCallbacks) {
      cb(val);
    }
  }



  setRate(rate) {
    const clamped = Math.min(1.3, Math.max(0.8, Number(rate) || 1.0));
    this.userRate = clamped;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_RATE_KEY, String(clamped));
    }
  }

  // Немедленная остановка речи: новое поколение, cancel у браузера и выход из ожидания текущего предложения
  stop() {
    this._gen += 1;
    this.speaking = false;
    this._currentSentenceNorm = '';
    if (this._resolvePending) {
      const resolve = this._resolvePending;
      this._resolvePending = null;
      resolve();
    }
    this._stopMouthPulse();
    if (this.supported) {
      window.speechSynthesis.cancel();
    }
  }

  // Проверка «эха»: распознанная фраза совпадает с тем, что Синапс говорит прямо сейчас.
  // Одиночное слово («Синапс») эхом не считаем — его может сказать сам ученик.
  isEcho(recognized) {
    if (!this.speaking || !this._currentSentenceNorm) return false;
    const norm = normalizeEcho(recognized);
    if (!norm || norm.split(' ').length < 2) return false;
    return this._currentSentenceNorm.includes(norm);
  }

  // Плавная пульсация амплитуды речи для синхронизации анимации губ робота
  _startMouthPulse(boost = 0.7) {
    if (this._ampTimer) clearInterval(this._ampTimer);
    let phase = 0;
    this._ampTimer = setInterval(() => {
      phase += 0.55;
      const wave = 0.45 + 0.4 * Math.abs(Math.sin(phase)) + 0.15 * Math.cos(phase * 1.7);
      this._emitAmplitude(Math.min(1, wave * boost));
    }, 65);
  }

  _stopMouthPulse() {
    if (this._ampTimer) {
      clearInterval(this._ampTimer);
      this._ampTimer = null;
    }
    this._emitAmplitude(0);
  }

  // Озвучка текста по предложениям с живым тембром и паузами
  async speak(rawText, { onStart, onEnd } = {}) {
    // Новое поколение: предыдущая речь полностью отменяется
    this.stop();
    const myGen = this._gen;
    const alive = () => myGen === this._gen;

    const spokenText = speechify(rawText);
    if (!spokenText) {
      onEnd?.();
      return;
    }

    if (!this.supported) {
      onStart?.();
      this._startMouthPulse(0.6);
      await sleep(Math.min(3500, Math.max(1200, spokenText.length * 45)));
      if (!alive()) return;
      this._stopMouthPulse();
      onEnd?.();
      return;
    }

    this.speaking = true;
    onStart?.();

    // Chrome иногда «глотает» первую реплику сразу после cancel — короткая пауза
    await sleep(60);
    if (!alive()) return;

    const sentences = buildSpeechUnits(spokenText);
    const chosenVoice =
      this.voices.find((v) => v.name === this.selectedVoiceName) || this.voices[0] || null;

    for (let i = 0; i < sentences.length; i++) {
      if (!alive()) return;
      const unit = sentences[i];
      const sentence = unit.text;
      const isQuestion = unit.kind === 'question';
      const isExclaim = unit.kind === 'exclaim';
      const variant = NATURAL_VARIANTS[i % NATURAL_VARIANTS.length];

      await new Promise((resolve) => {
        if (!alive()) {
          resolve();
          return;
        }
        this._resolvePending = resolve;
        this._currentSentenceNorm = normalizeEcho(sentence);

        const utter = new SpeechSynthesisUtterance(sentence);
        utter.lang = 'ru-RU';
        if (chosenVoice) utter.voice = chosenVoice;

        // Мягкий женский темп: спокойнее обычного, вопрос чуть быстрее, восклицание — оживлённее
        const baseRate = isQuestion ? 0.97 : isExclaim ? 1.0 : 0.93;
        utter.rate = Math.min(1.3, Math.max(0.7, baseRate * variant.rate * this.userRate));

        // Мягкая интонация: высота чуть выше обычной, вопрос поднимается, точка опускается
        const basePitch = isQuestion ? 1.08 : isExclaim ? 1.05 : 1.02;
        utter.pitch = Math.min(1.2, Math.max(0.8, basePitch + variant.pitch));

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          this._resolvePending = null;
          this._stopMouthPulse();
          resolve();
        };

        utter.onstart = () => {
          this._startMouthPulse(isExclaim ? 0.95 : 0.78);
        };

        utter.onboundary = () => {
          // Подчёркиваем удары слогов при движении по словам
          this._emitAmplitude(0.88);
        };

        utter.onend = finish;
        utter.onerror = finish;

        // Защитный таймер на случай зависания speechSynthesis в браузере
        const guardMs = Math.max(4000, sentence.length * 160);
        const guard = setTimeout(finish, guardMs);

        const wrappedResolve = () => {
          clearTimeout(guard);
          finish();
        };
        utter.onend = wrappedResolve;
        utter.onerror = wrappedResolve;

        window.speechSynthesis.speak(utter);
      });

      if (!alive()) return;

      // Естественная микропауза между предложениями
      if (i < sentences.length - 1) {
        await sleep(unit.pauseAfter);
        if (!alive()) return;
      }
    }

    // Конец речи сообщаем только если это поколение ещё актуально
    if (!alive()) return;
    this.speaking = false;
    this._currentSentenceNorm = '';
    this._stopMouthPulse();
    onEnd?.();
  }
}
