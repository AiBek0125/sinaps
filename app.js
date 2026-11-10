// Контроллер распознавания речи, кодового слова «Синапс» и регистрации PWA Service Worker
//
// Правила кодового слова:
// • «Синапс» в начале фразы прерывает речь и поиск в ЛЮБОЙ момент (по interim-результату, без ожидания final);
// • после прерывания робот переходит в режим «Слушаю…» и ждёт новый вопрос;
// • дедупликация 2 секунды касается только ОДИНАКОВОЙ фразы, поэтому быстрый «Синапс, стоп» не теряется;
// • хвост вопроса после кодового слова очищается от знаков препинания и сохраняет регистр исходного текста;
// • эхо собственной речи робота (его голос, попавший в микрофон) командой не считается.

// Начало фразы: знаки препинания и необязательное «окей» перед кодовым словом
export const WAKE_WORD_REGEXES = [
  /^[\s,.!?;:«»"'—–-]*(?:окей[\s,.!?;:-]+)?сина[пб]с(?![а-яё])/i,
  /^[\s,.!?;:«»"'—–-]*(?:окей[\s,.!?;:-]+)?с[иеё]на[пб]с(?![а-яё])/i,
  /^[\s,.!?;:«»"'—–-]*(?:окей[\s,.!?;:-]+)?сына[пб]с(?![а-яё])/i
];

// Слова-команды остановки (стоят в начале фразы)
const STOP_WORDS_RE = /^(?:стоп|хватит|тихо|молчи|подожди|пауза|остановись|прекрати)(?![а-яё])/i;
const LEAD_PUNCT_RE = /^[\s,.!?;:«»"'—–-]+/;

// Статусы состояния «Синапса» для верхней панели
export const STATUS_LABELS = {
  sleep: "💤 Синапс дремлет. Скажи 'Синапс'",
  listen: '👂 Слушаю...',
  think: '🤔 Думаю...',
  talk: '😊 Говорю...',
  show: '✨ Показываю...'
};

// Ключ для сравнения фраз: без регистра, без знаков, ё → е
function normalizeKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Проверка кодового слова и выделение вопроса, который произнесён в той же фразе.
// Хвост берётся из исходного текста: регистр и ё сохраняются, лишние знаки в начале убираются.
export function matchWakeTrigger(text) {
  const raw = String(text || '').trim();
  for (const re of WAKE_WORD_REGEXES) {
    const m = raw.match(re);
    if (m) {
      const tail = raw.slice(m[0].length).replace(LEAD_PUNCT_RE, '').trim();
      return { matched: true, tail };
    }
  }
  return { matched: false, tail: '' };
}

// Является ли фраза командой остановки
export function isStopPhrase(text) {
  const clean = String(text || '').trim().replace(LEAD_PUNCT_RE, '');
  return STOP_WORDS_RE.test(clean);
}

function formatTimeStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Контроллер голосового ввода: постоянное слушание, стоп-слово и запись 10 секунд
export class SpeechController {
  constructor({ onLog, onWake, onInterrupt, onQuestion, onStateHint, onError, onRecordTick, isEcho } = {}) {
    const SR =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    this.supported = Boolean(SR);
    this.SR = SR;
    this.recognition = null;
    this.running = false;
    this.mode = 'idle'; // idle | passive (ждём «Синапс») | command (ждём вопрос) | record10
    // Синапс сейчас ищет или говорит: кодовое слово прерывает его мгновенно
    this.assistantBusy = false;

    this._interimStreak = 0;   // подряд идущие interim с кодовым словом (режим passive)
    this._lastWakeKey = '';    // ключ последней обработанной фразы-триггера
    this._lastWakeAt = 0;
    this._commandTimer = null;
    this._recordTimer = null;
    this._recordSecondsLeft = 0;
    this._lastInterimChunk = '';

    this.onLog = onLog || (() => {});
    this.onWake = onWake || (() => {});
    this.onInterrupt = onInterrupt || (() => {});
    this.onQuestion = onQuestion || (() => {});
    this.onStateHint = onStateHint || (() => {});
    this.onError = onError || (() => {});
    this.onRecordTick = onRecordTick || (() => {});
    // Проверка «эха»: распознанный текст совпадает с тем, что сейчас говорит робот
    this.isEcho = isEcho || (() => false);
  }

  // Сообщаем контроллеру, ищет или говорит Синапс (для мгновенного прерывания)
  setAssistantBusy(busy) {
    this.assistantBusy = Boolean(busy);
  }

  _logLine(kind, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    this.onLog(`[${formatTimeStamp()}] [${kind}] ${clean}`);
  }

  // Постоянное прослушивание (кнопка «Разрешить микрофон»)
  startPassive() {
    if (!this.supported) {
      this.onError('Браузер не поддерживает распознавание речи. Используй «Задать текстом».');
      return false;
    }
    this._stopRecordTimer();
    this._clearCommandTimer();
    this.mode = 'passive';
    this._interimStreak = 0;
    this._startRecognitionLoop();
    return true;
  }

  // Запись вопроса 10 секунд (кнопка «Записать 10 сек»)
  startRecord10Sec() {
    if (!this.supported) {
      this.onError('Распознавание речи недоступно в этом браузере. Используй «Задать текстом».');
      return false;
    }
    this._stopRecordTimer();
    this._clearCommandTimer();
    this.mode = 'record10';
    this._lastInterimChunk = '';
    this._recordSecondsLeft = 10;
    this.onRecordTick(10);
    this.onStateHint('listen');
    this._startRecognitionLoop();

    this._recordTimer = setInterval(() => {
      this._recordSecondsLeft -= 1;
      this.onRecordTick(this._recordSecondsLeft);

      if (this._recordSecondsLeft <= 0) {
        this._stopRecordTimer();
        const chunk = this._lastInterimChunk.trim();
        this._lastInterimChunk = '';
        if (this.mode === 'record10') {
          this._finishRecord(chunk);
        }
      }
    }, 1000);

    return true;
  }

  // Полная остановка микрофона
  stop() {
    this._stopRecordTimer();
    this._clearCommandTimer();
    this.running = false;
    this.mode = 'idle';
    this.assistantBusy = false;
    this._interimStreak = 0;
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
  }

  _stopRecordTimer() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer);
      this._recordTimer = null;
    }
    this.onRecordTick(0);
  }

  _clearCommandTimer() {
    if (this._commandTimer) {
      clearTimeout(this._commandTimer);
      this._commandTimer = null;
    }
  }

  // Режим «Слушаю…» выключается сам через 10 секунд тишины
  _armCommandTimer() {
    this._clearCommandTimer();
    this._commandTimer = setTimeout(() => {
      this._commandTimer = null;
      if (this.mode === 'command') {
        this.mode = 'passive';
        this.onStateHint('sleep');
      }
    }, 10000);
  }

  _startRecognitionLoop() {
    if (this.recognition && this.running) return;
    const rec = new this.SR();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = (res[0]?.transcript || '').trim();
        if (!transcript) continue;

        if (res.isFinal) {
          this._logLine('final', transcript);
          this._handleFinal(transcript);
        } else {
          this._logLine('interim', transcript);
          this._handleInterim(transcript);
        }
      }
    };

    rec.onerror = (event) => {
      const code = event?.error || 'unknown';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.running = false;
        this.mode = 'idle';
        this._stopRecordTimer();
        this.onError('Доступ к микрофону запрещён. Разреши микрофон в браузере или задай вопрос текстом.');
      }
    };

    rec.onend = () => {
      this.recognition = null;
      if (this.running && this.mode !== 'idle') {
        // Мягкий перезапуск непрерывного распознавания
        setTimeout(() => {
          if (this.running && this.mode !== 'idle') {
            this._startRecognitionLoop();
          }
        }, 250);
      }
    };

    try {
      this.running = true;
      this.recognition = rec;
      rec.start();
    } catch {
      this.running = false;
      this.onError('Не удалось запустить микрофон. Попробуй «Задать текстом».');
    }
  }

  // ---------- Обработка распознанного текста ----------

  // Промежуточный результат: здесь стоп-слово срабатывает быстрее всего
  _handleInterim(text) {
    if (this.mode === 'record10') {
      this._lastInterimChunk = text;
      return;
    }

    // Собственная речь робота, попавшая в микрофон, не является командой
    if (this.isEcho(text)) return;

    const trig = matchWakeTrigger(text);

    // Синапс ищет или говорит: кодовое слово прерывает его в любой момент
    if (this.assistantBusy) {
      if (trig.matched) {
        if (isStopPhrase(trig.tail)) {
          this._stopAndSleep();
        } else if (!this._isDuplicateWake(text)) {
          this._wakeAndListen();
        }
      }
      return;
    }

    if (this.mode !== 'passive') return;

    // Ожидание кодового слова: два подряд interim с ним или финальный результат
    if (trig.matched) {
      this._interimStreak += 1;
      if (this._interimStreak >= 2) {
        this._interimStreak = 0;
        if (this._isDuplicateWake(text)) return;
        this._wakeAndListen();
      }
    } else {
      this._interimStreak = 0;
    }
  }

  // Финальный результат фразы
  _handleFinal(text) {
    if (this.mode === 'record10') {
      this._stopRecordTimer();
      this._lastInterimChunk = '';
      this._finishRecord(text);
      return;
    }

    if (this.isEcho(text)) return;

    const trig = matchWakeTrigger(text);

    if (trig.matched) {
      // «Синапс, как работает митоз» — кодовое слово и вопрос в одной фразе
      if (trig.tail) {
        if (isStopPhrase(trig.tail)) {
          this._stopAndSleep();
          return;
        }
        this._dispatchQuestion(trig.tail, true);
        return;
      }

      // Только кодовое слово: если его уже обработал interim, повтор пропускаем
      if (this._isDuplicateWake(text)) return;
      this._wakeAndListen();
      return;
    }

    // После кодового слова ученик говорит вопрос без повтора «Синапс»
    if (this.mode === 'command') {
      if (isStopPhrase(text)) {
        this._stopAndSleep();
        return;
      }
      this._dispatchQuestion(text, false);
    }
    // В пассивном режиме фразы без кодового слова игнорируются
  }

  // Итог записи 10 секунд: кодовое слово и команды обрабатываются так же, как в потоке
  _finishRecord(text) {
    const trig = matchWakeTrigger(text);
    const question = trig.matched ? trig.tail : String(text || '').trim();
    this.mode = this.running ? 'passive' : 'idle';
    if (!question) {
      this.onStateHint('sleep');
      return;
    }
    if (isStopPhrase(question)) {
      this._stopAndSleep();
      return;
    }
    this._dispatchQuestion(question, trig.matched);
  }

  // Передаём вопрос приложению; если Синапс занят, сначала прерываем его
  _dispatchQuestion(question, withWake) {
    const q = String(question || '').trim();
    if (!q) return;
    this._clearCommandTimer();
    this._interimStreak = 0;
    this._interruptIfBusy();
    this.mode = 'passive';
    if (withWake) this.onWake({ hasInlineQuestion: true });
    this.onQuestion(q);
  }

  // Кодовое слово без вопроса: прерываем речь и слушаем
  _wakeAndListen() {
    this._interruptIfBusy();
    this._interimStreak = 0;
    this.mode = 'command';
    this._armCommandTimer();
    this.onWake({ hasInlineQuestion: false });
    this.onStateHint('listen');
  }

  // Стоп-слово: прерываем всё и переходим в дремоту
  _stopAndSleep() {
    this._clearCommandTimer();
    this._interimStreak = 0;
    this.mode = 'passive';
    this.assistantBusy = false;
    this.onInterrupt();
    this.onStateHint('sleep');
  }

  _interruptIfBusy() {
    if (!this.assistantBusy) return;
    this.assistantBusy = false;
    this.onInterrupt();
  }

  // Дедупликация только одинаковой фразы за 2 секунды: другие фразы всегда проходят
  _isDuplicateWake(text) {
    const key = normalizeKey(text);
    const now = Date.now();
    if (key === this._lastWakeKey && now - this._lastWakeAt < 2000) {
      return true;
    }
    this._lastWakeKey = key;
    this._lastWakeAt = now;
    return false;
  }
}

// Регистрация Service Worker для офлайн-работы и установки PWA
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // В режиме dev без HTTPS или в песочнице SW может быть недоступен — не блокируем приложение
    });
  });
}
