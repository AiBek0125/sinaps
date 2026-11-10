import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SynapseAvatar } from '../avatar.js';
import { SynapseVoice } from '../voice.js';
import {
  SUBJECT_CATALOG,
  SUPPORTED_TEMPLATES,
  askSynapse,
  isShowDataSafe,
  type SubjectTopic
} from '../ai.js';
import {
  renderChartShow,
  renderDiagramShow,
  renderFormulaShow,
  renderTemplateShow
} from '../animations.js';
import { searchHistoryImages, type HistoryImageItem } from '../history-images.js';
import { classifyFollowUpIntent, type VerifiedSource } from '../search.js';
import { STATUS_LABELS, SpeechController, registerServiceWorker } from '../app.js';
import { SoundDirection } from '../sound-direction.js';

type AvatarState = 'sleep' | 'listen' | 'think' | 'talk' | 'show';
type SubjectId = 'biology' | 'physics' | 'chemistry' | 'history';

interface ShowPayload {
  type: string;
  data: any;
}

const STORAGE_USE_DEEPSEEK = 'synapse_use_deepseek';
const STORAGE_USE_WEB_SEARCH = 'synapse_use_web_search';
const STORAGE_FONT_SIZE = 'synapse_answer_font_size';

export default function App() {
  // Состояние интерфейса и урока
  const [subject, setSubject] = useState<SubjectId>('biology');
  const [avatarState, setAvatarState] = useState<AvatarState>('sleep');
  const [questionText, setQuestionText] = useState<string>('');
  const [answerText, setAnswerText] = useState<string>(
    'Привет! Задай любой вопрос по биологии, физике, химии или истории — я коротко объясню суть, покажу схему и помогу с подробным разбором или опытом.'
  );
  const [showPayload, setShowPayload] = useState<ShowPayload>({
    type: 'template',
    data: { template: 'cell_animal', mode: 'both' }
  });
  const [verifiedSources, setVerifiedSources] = useState<VerifiedSource[]>([]);
  const [activeContext, setActiveContext] = useState<{
    question: string;
    shortAnswer: string;
    details?: string;
    practice?: string;
    detailShown?: boolean;
  } | null>(null);

  // Сетевые, API и голосовые состояния
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [keyNotConfigured, setKeyNotConfigured] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [micActive, setMicActive] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);

  // Панели и модалки
  const [showTopicsMenu, setShowTopicsMenu] = useState<boolean>(false);
  const [showTextModal, setShowTextModal] = useState<boolean>(false);
  const [textDraft, setTextDraft] = useState<string>('');
  const [showParams, setShowParams] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [recognitionLogs, setRecognitionLogs] = useState<string[]>([]);

  // Настройки
  // Название автоматически выбранного женского голоса (показывается в настройках)
  const [voiceLabel, setVoiceLabel] = useState<string>('Загружаем голос...');
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [useDeepSeek, setUseDeepSeek] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_USE_DEEPSEEK) === 'true';
  });
  const [useWebSearch, setUseWebSearch] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return true;
    const saved = localStorage.getItem(STORAGE_USE_WEB_SEARCH);
    return saved === null ? true : saved === 'true';
  });
  const [answerFontSize, setAnswerFontSize] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return 28;
    const saved = Number(localStorage.getItem(STORAGE_FONT_SIZE));
    return Number.isFinite(saved) && saved >= 20 && saved <= 36 ? saved : 28;
  });

  // Карточки Wikimedia Commons для истории
  const [wikiImages, setWikiImages] = useState<HistoryImageItem[]>([]);
  const [wikiTitle, setWikiTitle] = useState<string>('');
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [activeWikiImage, setActiveWikiImage] = useState<HistoryImageItem | null>(null);

  // Ссылки на DOM и экземпляры контроллеров
  const avatarContainerRef = useRef<HTMLDivElement | null>(null);
  const showContainerRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const topicsRef = useRef<HTMLDivElement | null>(null);

  const avatarRef = useRef<SynapseAvatar | null>(null);
  const voiceRef = useRef<SynapseVoice | null>(null);
  const speechRef = useRef<SpeechController | null>(null);
  const showCleanupRef = useRef<{ destroy: () => void } | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const soundDirRef = useRef<SoundDirection | null>(null);

  const currentSubject = SUBJECT_CATALOG[subject] || SUBJECT_CATALOG.biology;

  // Синхронизация состояния аватара и флага занятости для мгновенного прерывания по кодовому слову «Синапс»
  const updateAvatarState = useCallback((next: AvatarState) => {
    setAvatarState(next);
    avatarRef.current?.setState(next);
    speechRef.current?.setAssistantBusy(next === 'think' || next === 'talk');
  }, []);

  // Мгновенная остановка текущего поиска и озвучки при произнесении кодового слова «Синапс»
  // Поколение запроса увеличивается: любой ответ, пришедший после этого, считается устаревшим и игнорируется.
  // Речь отменяется через voice.stop() (speechSynthesis.cancel), незавершённый запрос — через AbortController.
  const interruptCurrentWork = useCallback(() => {
    requestSeqRef.current += 1;
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    voiceRef.current?.stop();
    speechRef.current?.setAssistantBusy(false);
    setWikiLoading(false);
  }, []);

  // Логирование всей распознанной речи в <pre> с таймштампом
  const appendLog = useCallback((line: string) => {
    setRecognitionLogs((prev) => [...prev.slice(-79), line]);
  }, []);

  // Загрузка реальных исторических изображений из Wikimedia Commons
  const handleSearchHistoryImages = useCallback(async (query: string, title = 'Исторические изображения') => {
    const seq = requestSeqRef.current;
    setWikiLoading(true);
    setWikiTitle(title);
    setActiveWikiImage(null);
    const items = await searchHistoryImages(query, 3);
    // Если за это время ученик перебил Синапса, результат устарел — не показываем его
    if (seq !== requestSeqRef.current) return;
    setWikiImages(items);
    setWikiLoading(false);
  }, []);

  // Озвучка текста с плавной анимацией губ аватара и переходом в show/sleep
  const speakAndAnimate = useCallback(
    async (text: string, hasVisual: boolean) => {
      const voice = voiceRef.current;
      if (!voice) {
        updateAvatarState(hasVisual ? 'show' : 'sleep');
        return;
      }

      await voice.speak(text, {
        onStart: () => {
          updateAvatarState('talk');
        },
        onEnd: () => {
          if (hasVisual) {
            updateAvatarState('show');
          } else {
            updateAvatarState('sleep');
          }
        }
      });
    },
    [updateAvatarState]
  );

  // Обработка вопроса ученика (прямой ответ по сути + углубление подробнее / практика + отмена при перебивании)
  const processQuestion = useCallback(
    async (rawQuestion: string, forcedMode?: 'detail' | 'practice') => {
      const q = rawQuestion.trim();
      if (!q) return;

      const intent = forcedMode || classifyFollowUpIntent(q);

      // Команда остановки: просто останавливаемся и замираем
      if (intent === 'stop') {
        interruptCurrentWork();
        updateAvatarState('sleep');
        return;
      }

      // Прерываем любую предыдущую озвучку и запрос
      interruptCurrentWork();
      const mySeq = requestSeqRef.current;
      const abortCtrl = new AbortController();
      activeAbortRef.current = abortCtrl;

      const isFollowUp = (intent === 'detail' || intent === 'practice') && Boolean(activeContext);

      // Если уточняется уже открытая локальная/готовая тема и есть заготовленный разбор/практика — отдаём мгновенно!
      if (isFollowUp && activeContext) {
        if (intent === 'detail' && activeContext.details && !activeContext.detailShown) {
          setQuestionText(`${activeContext.question} → Подробнее`);
          setAnswerText(activeContext.details);
          setActiveContext({ ...activeContext, detailShown: true });
          await speakAndAnimate(activeContext.details, showPayload.type !== 'none');
          return;
        }
        if (intent === 'practice' && activeContext.practice) {
          setQuestionText(`${activeContext.question} → Практика`);
          setAnswerText(activeContext.practice);
          await speakAndAnimate(activeContext.practice, showPayload.type !== 'none');
          return;
        }
      }

      if (isFollowUp && activeContext) {
        setQuestionText(
          `${activeContext.question} → ${intent === 'practice' ? 'Практика' : 'Подробнее'}`
        );
      } else {
        setQuestionText(q);
        setVerifiedSources([]);
        setWikiImages([]);
        setActiveWikiImage(null);
      }

      setErrorBanner('');
      avatarRef.current?.reactToVoice(1);
      updateAvatarState('think');

      const res = await askSynapse(q, {
        subjectName: currentSubject.name,
        useDeepSeek,
        useWebSearch,
        detailMode: isFollowUp && intent === 'detail',
        practiceMode: isFollowUp && intent === 'practice',
        previousQuestion: isFollowUp && activeContext ? activeContext.question : '',
        previousAnswer: isFollowUp && activeContext ? activeContext.shortAnswer : '',
        signal: abortCtrl.signal
      });

      // Если ученик перебил кодовым словом «Синапс» во время поиска — выходим молча
      if (mySeq !== requestSeqRef.current || res.errorType === 'aborted') {
        return;
      }
      activeAbortRef.current = null;

      const foundSources = Array.isArray(res.sources) ? res.sources : [];
      if (foundSources.length > 0 || !isFollowUp) {
        setVerifiedSources(foundSources);
      }

      if (!res.ok) {
        if (res.errorType === 'key_not_configured') {
          setKeyNotConfigured(true);
          setErrorBanner('Ключ не настроен');

          if (res.fallbackAnswer) {
            const safeFallbackShow =
              res.fallbackShow && isShowDataSafe(res.fallbackShow)
                ? res.fallbackShow
                : { type: 'none', data: null };
            setAnswerText(res.fallbackAnswer);
            if (!isFollowUp) {
              setActiveContext({
                question: q,
                shortAnswer: res.fallbackAnswer,
                detailShown: false
              });
              setShowPayload(safeFallbackShow);
            } else {
              setActiveContext((prev) => (prev ? { ...prev, detailShown: true } : prev));
            }
            const hasVis = (isFollowUp ? showPayload.type : safeFallbackShow.type) !== 'none';
            await speakAndAnimate(res.fallbackAnswer, hasVis);
            return;
          }

          setAnswerText(
            'Ключ Gemini API пока не настроен на сервере. Открой «5 тем предмета» — все схемы и разборы работают без ключа и без интернета!'
          );
          updateAvatarState('sleep');
          return;
        }

        if (res.errorType === 'offline') {
          setErrorBanner('Нет интернета, но Синапс покажет темы из кэша');
          setAnswerText('Сейчас нет подключения к сети, но ты можешь выбрать любую тему из «5 тем предмета»!');
          updateAvatarState('sleep');
          return;
        }

        setErrorBanner(res.message || 'Ошибка ответа ИИ. Попробуй задать текстом.');
        setAnswerText(res.message || 'Связь с сервером прервалась. Нажми «Задать текстом» или выбери тему!');
        updateAvatarState('sleep');
        return;
      }

      setKeyNotConfigured(false);
      const reply = res.answer || 'Уточни у учителя этот момент!';
      setAnswerText(reply);

      if (!isFollowUp) {
        setActiveContext({
          question: q,
          shortAnswer: reply,
          detailShown: false
        });
      } else if (intent === 'detail') {
        setActiveContext((prev) => (prev ? { ...prev, detailShown: true } : prev));
      }

      const safeShow =
        res.show && isShowDataSafe(res.show) ? res.show : { type: 'none', data: null };

      if (!isFollowUp && safeShow.type === 'image_query') {
        if (subject === 'history') {
          const dataObj = safeShow.data as { query?: string } | null;
          const query =
            typeof safeShow.data === 'string'
              ? safeShow.data
              : dataObj?.query || q;
          setShowPayload({ type: 'image_query', data: { query } });
          handleSearchHistoryImages(query, 'Материалы Wikimedia Commons');
          await speakAndAnimate(reply, true);
          return;
        }
        setShowPayload({ type: 'none', data: null });
        await speakAndAnimate(reply, false);
        return;
      }

      // При углублении уже показанной схемы не затираем её на пустое место
      if (!isFollowUp || safeShow.type !== 'none') {
        setShowPayload(safeShow);
      }
      const hasVisual =
        (isFollowUp && safeShow.type === 'none' ? showPayload.type : safeShow.type) !== 'none';
      await speakAndAnimate(reply, hasVisual);
    },
    [
      activeContext,
      currentSubject.name,
      handleSearchHistoryImages,
      interruptCurrentWork,
      showPayload.type,
      speakAndAnimate,
      subject,
      updateAvatarState,
      useDeepSeek,
      useWebSearch
    ]
  );

  // Реф на актуальный processQuestion для SpeechController
  const processQuestionRef = useRef(processQuestion);
  processQuestionRef.current = processQuestion;

  // Инициализация аватара, голоса, распознавания речи и Service Worker
  useEffect(() => {
    registerServiceWorker();
    // Определитель стороны звука (включается вместе с микрофоном)
    soundDirRef.current = new SoundDirection();

    if (avatarContainerRef.current) {
      avatarRef.current = new SynapseAvatar(avatarContainerRef.current, {
        state: 'sleep',
        subject: 'biology'
      });
    }

    const voice = new SynapseVoice();
    voiceRef.current = voice;
    setVoiceRate(voice.userRate);

    const unsubVoices = voice.onVoicesChange((_list, sel) => {
      setVoiceLabel(sel ? `${sel} · мягкий женский` : 'Системный русский голос');
    });
    const unsubAmp = voice.onAmplitude((amp) => {
      avatarRef.current?.setVoiceAmplitude(amp);
    });

    const speech = new SpeechController({
      onLog: appendLog,
      // Собственная речь робота, попавшая в микрофон, не считается командой
      isEcho: (text: string) => voiceRef.current?.isEcho(text) ?? false,
      onInterrupt: () => {
        interruptCurrentWork();
      },
      onWake: () => {
        // Кодовое слово «Синапс»: обрываем речь и поиск, поворачиваем голову к звуку и переходим в «Слушаю…»
        interruptCurrentWork();
        const balance = soundDirRef.current?.getBalance() ?? 0;
        avatarRef.current?.turnToSound(balance);
        updateAvatarState('listen');
      },
      onQuestion: (q) => {
        processQuestionRef.current(q);
      },
      onStateHint: (st) => {
        updateAvatarState(st as AvatarState);
      },
      onError: (msg) => {
        setErrorBanner(msg);
        setMicActive(false);
        setRecordSeconds(0);
      },
      onRecordTick: (sec) => {
        setRecordSeconds(sec);
      }
    });
    speechRef.current = speech;
    setSpeechSupported(speech.supported);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsubVoices();
      unsubAmp();
      speech.stop();
      voice.stop();
      soundDirRef.current?.stop();
      avatarRef.current?.destroy();
    };
  }, [appendLog, updateAvatarState]);

  // Обновление бейджа предмета на голове аватара
  useEffect(() => {
    avatarRef.current?.setSubject(subject);
  }, [subject]);

  // Закрытие выпадающего списка «5 тем предмета» при клике вне его
  useEffect(() => {
    if (!showTopicsMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (topicsRef.current && !topicsRef.current.contains(e.target as Node)) {
        setShowTopicsMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showTopicsMenu]);

  // Отрисовка области показа справа при изменении showPayload
  useEffect(() => {
    const container = showContainerRef.current;
    if (!container) return;

    showCleanupRef.current?.destroy();
    showCleanupRef.current = null;

    if (!showPayload || showPayload.type === 'none') {
      container.innerHTML = `
        <div style="padding:36px 20px;border-radius:18px;border:1px dashed rgba(183,173,255,0.22);text-align:center;color:#b8afd8;">
          <div style="font-size:32px;margin-bottom:8px;">✨</div>
          <div style="font-size:15px;font-weight:600;color:#e6dff2;">Область показа урока</div>
          <div style="font-size:13px;margin-top:6px;">Задай вопрос или выбери тему из меню «5 тем предмета» — здесь оживёт схема, формула или график!</div>
        </div>
      `;
      return;
    }

    let cancelled = false;

    const mount = async () => {
      if (showPayload.type === 'formula') {
        const handle = await renderFormulaShow(container, showPayload.data);
        if (!cancelled) showCleanupRef.current = handle;
      } else if (showPayload.type === 'chart') {
        const handle = await renderChartShow(container, showPayload.data);
        if (!cancelled) showCleanupRef.current = handle;
      } else if (showPayload.type === 'diagram') {
        const handle = renderDiagramShow(container, showPayload.data);
        if (!cancelled) showCleanupRef.current = handle;
      } else if (showPayload.type === 'template') {
        const tplName =
          typeof showPayload.data === 'string'
            ? showPayload.data
            : showPayload.data?.template || '';
        if (SUPPORTED_TEMPLATES.has(tplName)) {
          const handle = renderTemplateShow(container, tplName, showPayload.data || {}, {
            onSearchHistoryImages: handleSearchHistoryImages
          });
          if (!cancelled) showCleanupRef.current = handle;
        } else {
          container.innerHTML = `<div style="padding:20px;color:#cfc7eb;">Интерактивный шаблон не найден.</div>`;
        }
      } else if (showPayload.type === 'image_query') {
        container.innerHTML = '';
      }
    };

    mount();
    return () => {
      cancelled = true;
      showCleanupRef.current?.destroy();
      showCleanupRef.current = null;
    };
  }, [handleSearchHistoryImages, showPayload]);

  // Запуск готовой темы из кнопки «5 тем предмета» БЕЗ обращения к ИИ (работает офлайн!)
  const handleSelectOfflineTopic = (topicId: string) => {
    const allTopics: SubjectTopic[] = [
      ...currentSubject.topics,
      ...(currentSubject.bonusTopics || [])
    ];
    const topic = allTopics.find((t) => t.id === topicId);
    if (!topic) return;

    interruptCurrentWork();
    setShowTopicsMenu(false);
    setErrorBanner('');
    setVerifiedSources([]);
    setWikiImages([]);
    setActiveWikiImage(null);
    setQuestionText(topic.title);
    setAnswerText(topic.answer);
    setActiveContext({
      question: topic.title,
      shortAnswer: topic.answer,
      details: topic.details,
      practice: topic.practice,
      detailShown: false
    });
    setShowPayload({
      type: 'template',
      data: { ...topic.data, template: topic.template }
    });
    speakAndAnimate(topic.answer, true);
  };

  // Переключение микрофона для триггера «Синапс»
  const handleToggleMic = () => {
    const speech = speechRef.current;
    if (!speech) return;
    if (micActive) {
      speech.stop();
      soundDirRef.current?.stop();
      setMicActive(false);
      updateAvatarState('sleep');
    } else {
      const ok = speech.startPassive();
      if (ok) {
        setMicActive(true);
        setErrorBanner('');
        // Стерео-микрофон для поворота головы к голосу (если устройство моно — робот смотрит прямо)
        void soundDirRef.current?.start();
      }
    }
  };

  // Запись вопроса напрямую 10 секунд
  const handleRecord10Sec = () => {
    const speech = speechRef.current;
    if (!speech) return;
    voiceRef.current?.stop();
    const ok = speech.startRecord10Sec();
    if (ok) {
      setErrorBanner('');
      avatarRef.current?.reactToVoice(1);
      void soundDirRef.current?.start();
    }
  };

  // Новый урок: мягкий сброс состояния
  const handleNewLesson = () => {
    interruptCurrentWork();
    setQuestionText('');
    setActiveContext(null);
    setErrorBanner('');
    setVerifiedSources([]);
    setWikiImages([]);
    setActiveWikiImage(null);
    setAnswerText(
      `Новый урок по предмету «${currentSubject.name}». Выбери тему или задай вопрос — я отвечу кратко и разложу детали по твоему запросу.`
    );
    setShowPayload({ type: 'none', data: null });
    updateAvatarState('sleep');
  };

  // Открыть модалку / строку «Задать текстом»
  const openTextAsk = () => {
    setShowTextModal(true);
    setTimeout(() => textInputRef.current?.focus(), 60);
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const q = textDraft.trim();
    if (!q) return;
    setTextDraft('');
    setShowTextModal(false);
    processQuestion(q);
  };

  const statusText = useMemo(() => {
    if (recordSeconds > 0) {
      return `👂 Слушаю напрямую... (${recordSeconds} сек)`;
    }
    return STATUS_LABELS[avatarState] || STATUS_LABELS.sleep;
  }, [avatarState, recordSeconds]);

  return (
    <div className="min-h-screen flex flex-col px-3 py-3 sm:px-5 sm:py-4 max-w-[1440px] mx-auto gap-3">
      {/* ВЕРХНЯЯ ПАНЕЛЬ: логотип, статус, выбор предмета и шестерёнка настроек */}
      <header className="syn-glass px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8c7aff] to-[#5eead4] flex items-center justify-center shadow-lg shadow-[#7c6be6]/25">
            <span className="text-xl" aria-hidden="true">🤖</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-[#f5f1fa]">Синапс</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#7ef9e0]/15 text-[#7ef9e0] border border-[#7ef9e0]/30">
                PWA 12–17
              </span>
            </div>
            <p className="text-sm text-[#d6cef0] font-medium" data-testid="status-text">
              {statusText}
            </p>
          </div>
        </div>

        {/* Переключатель 4 школьных предметов */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#161228]/60 p-1 rounded-2xl border border-white/10">
          {Object.values(SUBJECT_CATALOG).map((subj) => {
            const active = subj.id === subject;
            return (
              <button
                key={subj.id}
                type="button"
                onClick={() => setSubject(subj.id as SubjectId)}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#7ef9e0]/20 text-[#7ef9e0] border border-[#7ef9e0]/45 shadow-sm'
                    : 'text-[#cfc7eb] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {subj.name}
                <span className="hidden md:inline text-[11px] opacity-70 ml-1">({subj.grade})</span>
              </button>
            );
          })}
        </div>

        {/* Шестерёнка настроек */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Настройки"
          title="Настройки"
          className="p-2.5 rounded-xl bg-[#272047]/80 hover:bg-[#342b5c] border border-white/15 text-[#e6dff2] transition cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* БАННЕРЫ СОСТОЯНИЯ (Офлайн / Ключ 401 / Ошибка запроса) */}
      {!isOnline && (
        <div className="syn-glass px-4 py-2.5 border-[#ffd27f]/40 bg-[#ffd27f]/10 text-[#ffe6b3] text-sm flex items-center justify-between gap-2">
          <span>📡 Нет интернета, но Синапс покажет темы из кэша</span>
          <button
            type="button"
            onClick={() => setShowTopicsMenu(true)}
            className="px-3 py-1 rounded-lg bg-[#ffd27f]/20 hover:bg-[#ffd27f]/30 text-xs font-bold cursor-pointer"
          >
            Открыть 5 тем предмета
          </button>
        </div>
      )}

      {keyNotConfigured && (
        <div className="syn-glass px-4 py-2.5 border-[#ffb3c1]/45 bg-[#ffb3c1]/10 text-[#ffd6de] text-sm flex flex-wrap items-center justify-between gap-2">
          <span>🔑 <strong>Ключ не настроен</strong> — добавь GEMINI_API_KEY в переменные окружения Netlify (инструкция в README.md). Готовые темы предмета работают без ключа!</span>
          <button
            type="button"
            onClick={() => setKeyNotConfigured(false)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Скрыть
          </button>
        </div>
      )}

      {errorBanner && !keyNotConfigured && (
        <div className="syn-glass px-4 py-2.5 border-[#ffb3c1]/40 bg-[#ffb3c1]/10 text-[#ffd6de] text-sm flex flex-wrap items-center justify-between gap-2">
          <span>⚠️ {errorBanner}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openTextAsk}
              className="px-3 py-1 rounded-lg bg-[#7ef9e0]/20 hover:bg-[#7ef9e0]/30 text-[#7ef9e0] text-xs font-bold cursor-pointer"
            >
              Задать текстом
            </button>
            <button
              type="button"
              onClick={() => setErrorBanner('')}
              className="text-xs opacity-75 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ПАНЕЛЬ КНОПОК УПРАВЛЕНИЯ */}
      <div className="syn-glass px-3.5 py-2.5 flex flex-wrap items-center gap-2 relative z-20">
        <button
          type="button"
          onClick={handleToggleMic}
          disabled={!speechSupported}
          className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
            micActive
              ? 'bg-[#7ef9e0]/25 text-[#7ef9e0] border border-[#7ef9e0]/50 shadow-md shadow-[#7ef9e0]/10'
              : 'bg-[#2a224a] hover:bg-[#352b5c] text-[#f5f1fa] border border-white/10 disabled:opacity-45'
          }`}
        >
          <span>{micActive ? '🎙️ Микрофон включён' : '🎤 Разрешить микрофон'}</span>
        </button>

        <button
          type="button"
          onClick={handleRecord10Sec}
          disabled={!speechSupported || recordSeconds > 0}
          className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-[#2a224a] hover:bg-[#352b5c] text-[#ffd27f] border border-[#ffd27f]/25 transition cursor-pointer disabled:opacity-50"
        >
          {recordSeconds > 0 ? `⏺️ Запись: ${recordSeconds} с` : '⏺️ Записать 10 сек'}
        </button>

        <button
          type="button"
          onClick={openTextAsk}
          className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-[#2a224a] hover:bg-[#352b5c] text-[#f5f1fa] border border-white/10 transition cursor-pointer"
        >
          ⌨️ Задать текстом
        </button>

        {/* Выпадающий список «5 тем предмета» (работает офлайн без ИИ!) */}
        <div className="relative" ref={topicsRef}>
          <button
            type="button"
            onClick={() => setShowTopicsMenu((v) => !v)}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#7c6be6]/40 to-[#5eead4]/25 hover:from-[#7c6be6]/55 hover:to-[#5eead4]/40 text-[#f5f1fa] border border-[#7ef9e0]/40 transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>📚 5 тем предмета</span>
            <span className="text-xs opacity-80">{showTopicsMenu ? '▲' : '▼'}</span>
          </button>

          {showTopicsMenu && (
            <div className="absolute left-0 mt-2 w-80 sm:w-96 syn-glass p-2.5 z-40 shadow-2xl border-[#7ef9e0]/30">
              <div className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-[#7ef9e0] flex justify-between">
                <span>{currentSubject.name} ({currentSubject.grade})</span>
                <span className="text-[#ffd27f]">Офлайн</span>
              </div>
              <div className="mt-1 space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                {currentSubject.topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => handleSelectOfflineTopic(topic.id)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 transition cursor-pointer group"
                  >
                    <div className="text-sm font-semibold text-[#f5f1fa] group-hover:text-[#7ef9e0]">
                      {topic.title}
                    </div>
                    <div className="text-xs text-[#bdb4df] mt-0.5">{topic.subtitle}</div>
                  </button>
                ))}
                {(currentSubject.bonusTopics || []).map((bonus) => (
                  <button
                    key={bonus.id}
                    type="button"
                    onClick={() => handleSelectOfflineTopic(bonus.id)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-[#ffd27f]/10 hover:bg-[#ffd27f]/20 border border-[#ffd27f]/25 transition cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-[#ffd27f]">{bonus.title}</div>
                    <div className="text-xs text-[#e6d6b5] mt-0.5">{bonus.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleNewLesson}
          className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-[#2a224a] hover:bg-[#352b5c] text-[#e6dff2] border border-white/10 transition cursor-pointer"
        >
          🌱 Новый урок
        </button>

        <button
          type="button"
          onClick={() => setShowParams((v) => !v)}
          className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition cursor-pointer ml-auto ${
            showParams
              ? 'bg-[#a99bff]/25 border-[#a99bff]/50 text-[#e9e4ff]'
              : 'bg-[#2a224a] hover:bg-[#352b5c] border-white/10 text-[#cfc7eb]'
          }`}
        >
          🛠️ Показать параметры
        </button>
      </div>

      {/* ОСНОВНАЯ ТРЁХКОЛОНОЧНАЯ ОБЛАСТЬ: АВАТАР (слева 15-20%) | ОТВЕТ (центр) | ПОКАЗ (справа) */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 items-stretch">
        {/* СЛЕВА (15–20% ширины на десктопе): 3D-мультяшный робот Синапс */}
        <aside className="syn-glass lg:w-[19%] lg:min-w-[215px] p-4 flex flex-col items-center justify-between gap-3">
          <div className="w-full flex flex-col items-center">
            <div ref={avatarContainerRef} className="w-full flex justify-center" />
            <div className="mt-2 px-3 py-1 rounded-full bg-[#1a1533]/80 border border-white/10 text-xs font-semibold text-[#d6cef0] text-center">
              {currentSubject.name}
            </div>
          </div>

          <div className="w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={() => speakAndAnimate(answerText, showPayload.type !== 'none')}
              className="w-full py-2 px-3 rounded-xl bg-[#7ef9e0]/15 hover:bg-[#7ef9e0]/25 text-[#7ef9e0] text-xs font-bold border border-[#7ef9e0]/30 transition cursor-pointer"
            >
              🔊 Озвучить ответ
            </button>
            {avatarState === 'talk' && (
              <button
                type="button"
                onClick={() => {
                  voiceRef.current?.stop();
                  updateAvatarState(showPayload.type !== 'none' ? 'show' : 'sleep');
                }}
                className="w-full py-1.5 px-3 rounded-xl bg-[#ffb3c1]/15 hover:bg-[#ffb3c1]/25 text-[#ffb3c1] text-xs font-bold border border-[#ffb3c1]/30 transition cursor-pointer"
              >
                ⏹️ Остановить голос
              </button>
            )}
          </div>
        </aside>

        {/* ПО ЦЕНТРУ: Крупный ответ Синапса (по умолчанию 28px) + строка быстрого ввода */}
        <section className="syn-glass flex-1 lg:w-[40%] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            {questionText && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-[#18142e]/70 border border-white/10 text-sm text-[#c7bee8]">
                <span className="text-[#ffd27f] font-bold">Вопрос:</span>
                <span>{questionText}</span>
              </div>
            )}

            <div
              className="text-[#f5f1fa] leading-[1.42] font-semibold tracking-[-0.01em] transition-all"
              style={{ fontSize: `${answerFontSize}px` }}
            >
              {answerText}
            </div>

            {/* Кнопки углубления темы для практических и исследовательских задач школьников */}
            {activeContext && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => processQuestion('Расскажи подробнее', 'detail')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#a99bff]/15 hover:bg-[#a99bff]/28 border border-[#a99bff]/40 text-xs font-bold text-[#e6dff2] transition cursor-pointer"
                >
                  🔍 Расскажи подробнее
                </button>
                <button
                  type="button"
                  onClick={() => processQuestion('Дай практическое задание или опыт', 'practice')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#ffd27f]/15 hover:bg-[#ffd27f]/28 border border-[#ffd27f]/40 text-xs font-bold text-[#ffd27f] transition cursor-pointer"
                >
                  🧪 Практика / опыт
                </button>
                {(avatarState === 'talk' || avatarState === 'think') && (
                  <button
                    type="button"
                    onClick={() => {
                      interruptCurrentWork();
                      updateAvatarState('sleep');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#ffb3c1]/15 hover:bg-[#ffb3c1]/28 border border-[#ffb3c1]/40 text-xs font-bold text-[#ffb3c1] transition cursor-pointer"
                  >
                    ⏹️ Стоп
                  </button>
                )}
              </div>
            )}

            {/* Проверенные российские и образовательные источники из интернета */}
            {verifiedSources.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#7ef9e0] flex items-center gap-1.5">
                  <span>🌐 Проверенные источники</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {verifiedSources.map((src, idx) => (
                    <a
                      key={`${src.url}-${idx}`}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={src.snippet || src.sourceName}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#18142e]/85 hover:bg-[#2a224d] border border-[#7ef9e0]/25 hover:border-[#7ef9e0]/60 text-xs text-[#e6dff2] transition"
                    >
                      <span className="px-1.5 py-0.5 rounded-md bg-[#7ef9e0]/15 text-[#7ef9e0] font-bold">
                        {src.badge}
                      </span>
                      <span className="truncate max-w-[180px]">{src.title}</span>
                      <span className="opacity-65">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Быстрая текстовая форма внизу центральной колонки */}
          <form onSubmit={handleSubmitText} className="pt-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Спроси Синапса по биологии, физике, химии или истории..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#161228]/80 border border-white/15 focus:border-[#7ef9e0]/60 focus:outline-none text-sm text-[#f5f1fa] placeholder:text-[#8f85b8]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7ef9e0] to-[#63d2ff] text-[#17142b] text-sm font-extrabold hover:opacity-95 transition cursor-pointer"
            >
              Спросить
            </button>
          </form>
        </section>

        {/* СПРАВА: Область показа (анимации, формулы KaTeX, графики Plotly, диаграммы, фото истории) */}
        <section className="syn-glass flex-1 lg:w-[41%] p-4 sm:p-5 flex flex-col gap-3">
          <div ref={showContainerRef} className="w-full" />

          {/* Карточки реальных исторических изображений из Wikimedia Commons */}
          {(wikiLoading || wikiImages.length > 0) && (
            <div className="rounded-2xl bg-[#18142e]/70 border border-[#ffd27f]/25 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#ffd27f]">
                  🖼️ Wikimedia Commons: {wikiTitle}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWikiImages([]);
                    setActiveWikiImage(null);
                  }}
                  className="text-xs text-[#cfc7eb] hover:text-white cursor-pointer"
                >
                  Скрыть
                </button>
              </div>

              {wikiLoading && (
                <div className="text-sm text-[#cfc7eb] py-4 text-center">
                  Ищу безопасные исторические изображения...
                </div>
              )}

              {activeWikiImage && (
                <div className="rounded-2xl overflow-hidden bg-[#120f22] border border-white/15 shadow-xl p-2 space-y-2">
                  <img
                    src={activeWikiImage.fullUrl || activeWikiImage.url}
                    alt={activeWikiImage.title}
                    className="w-full max-h-64 object-contain rounded-xl bg-black/30"
                  />
                  <div className="px-1 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#f5f1fa]">{activeWikiImage.title}</div>
                      {activeWikiImage.description && (
                        <div className="text-xs text-[#bdb4df] mt-0.5">{activeWikiImage.description}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveWikiImage(null)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-[#f5f1fa] shrink-0 cursor-pointer"
                    >
                      К списку
                    </button>
                  </div>
                </div>
              )}

              {!wikiLoading && wikiImages.length > 0 && !activeWikiImage && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {wikiImages.map((img, idx) => (
                    <div
                      key={`${img.url}-${idx}`}
                      className="rounded-2xl overflow-hidden bg-[#221c3d] border border-white/10 shadow-lg flex flex-col justify-between"
                    >
                      <img
                        src={img.url}
                        alt={img.title}
                        loading="lazy"
                        className="w-full h-28 object-cover"
                      />
                      <div className="p-2 flex flex-col gap-1.5">
                        <div className="text-xs font-semibold text-[#e6dff2] line-clamp-2">
                          {img.title}
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveWikiImage(img)}
                          className="w-full py-1.5 rounded-xl bg-[#ffd27f]/20 hover:bg-[#ffd27f]/35 text-[#ffd27f] text-xs font-bold transition cursor-pointer"
                        >
                          Показать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!wikiLoading && wikiImages.length === 0 && (
                <div className="text-xs text-[#bdb4df] py-2 text-center">
                  Безопасные иллюстрации не найдены или нет сети.
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* ПАНЕЛЬ ПАРАМЕТРОВ И ЛОГА РАСПОЗНАВАНИЯ (<pre> с таймштампом) */}
      <section className={`syn-glass p-4 ${showParams ? 'block' : 'hidden'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-bold text-[#7ef9e0]">
            Лог распознавания речи (командное слово: «Синапс», final или 2× interim, пауза 2 сек)
          </div>
          <button
            type="button"
            onClick={() => setRecognitionLogs([])}
            className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[#e6dff2] cursor-pointer"
          >
            Очистить лог
          </button>
        </div>
        <pre
          data-testid="recognition-log"
          className="w-full max-h-44 overflow-y-auto rounded-xl bg-[#120f22]/90 border border-white/10 p-3 text-xs text-[#b8f7e6] font-mono whitespace-pre-wrap"
        >
          {recognitionLogs.length
            ? recognitionLogs.join('\n')
            : '[--:--:--] Журнал распознавания пуст. Нажми «Разрешить микрофон» и скажи «Синапс».'}
        </pre>
      </section>

      {/* МОДАЛКА «ЗАДАТЬ ТЕКСТОМ» */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitText}
            className="syn-glass w-full max-w-lg p-6 space-y-4 border-[#7ef9e0]/35"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#f5f1fa]">Задать вопрос Синапсу</h2>
              <button
                type="button"
                onClick={() => setShowTextModal(false)}
                className="text-sm text-[#bdb4df] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <input
              ref={textInputRef}
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Например: Как работает митоз?"
              className="w-full px-4 py-3 rounded-xl bg-[#161228] border border-white/20 focus:border-[#7ef9e0] focus:outline-none text-base text-[#f5f1fa]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTextModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-sm text-[#e6dff2] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#7ef9e0] text-[#17142b] text-sm font-extrabold cursor-pointer"
              >
                Отправить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* МОДАЛКА НАСТРОЕК (шестерёнка) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="syn-glass w-full max-w-md p-6 space-y-5 border-[#a99bff]/35">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#f5f1fa]">⚙️ Настройки Синапса</h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-sm text-[#bdb4df] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Голос Синапса один: мягкий женский, выбирается автоматически */}
            <div className="block space-y-1.5">
              <span className="text-sm font-semibold text-[#e6dff2]">Голос Синапса</span>
              <div className="w-full px-3 py-2.5 rounded-xl bg-[#161228] border border-white/20 text-sm text-[#f5f1fa]">
                {voiceLabel}
              </div>
            </div>

            {/* Темп речи */}
            <label className="block space-y-1.5">
              <div className="flex justify-between text-sm font-semibold text-[#e6dff2]">
                <span>Темп речи</span>
                <span className="text-[#7ef9e0]">{voiceRate.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.3"
                step="0.05"
                value={voiceRate}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setVoiceRate(r);
                  voiceRef.current?.setRate(r);
                }}
                className="w-full accent-[#7ef9e0]"
              />
            </label>

            {/* Размер шрифта ответа */}
            <label className="block space-y-1.5">
              <div className="flex justify-between text-sm font-semibold text-[#e6dff2]">
                <span>Размер шрифта ответа</span>
                <span className="text-[#ffd27f]">{answerFontSize} px</span>
              </div>
              <input
                type="range"
                min="20"
                max="36"
                step="2"
                value={answerFontSize}
                onChange={(e) => {
                  const sz = Number(e.target.value);
                  setAnswerFontSize(sz);
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_FONT_SIZE, String(sz));
                  }
                }}
                className="w-full accent-[#ffd27f]"
              />
            </label>

            {/* Поиск по проверенным образовательным платформам (включено по умолчанию) */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#161228]/70 border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseWebSearch(next);
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_USE_WEB_SEARCH, String(next));
                  }
                }}
                className="mt-1 w-4 h-4 accent-[#7ef9e0]"
              />
              <div>
                <div className="text-sm font-semibold text-[#f5f1fa]">Поиск в проверенных источниках</div>
                <div className="text-xs text-[#bdb4df] mt-0.5">
                  Перед ответом ищет факты в БРЭ, РУВИКИ, Фоксфорде, InternetUrok, ЯКласс, РЭШ, Культуре.РФ, Arzamas и Википедии (без VPN).
                </div>
              </div>
            </label>

            {/* Опциональный резерв DeepSeek (default OFF, ключ только в env DEEPSEEK_API_KEY) */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#161228]/70 border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={useDeepSeek}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseDeepSeek(next);
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_USE_DEEPSEEK, String(next));
                  }
                }}
                className="mt-1 w-4 h-4 accent-[#7ef9e0]"
              />
              <div>
                <div className="text-sm font-semibold text-[#f5f1fa]">Использовать DeepSeek (резерв без VPN)</div>
                <div className="text-xs text-[#bdb4df] mt-0.5">
                  По умолчанию выключено. Срабатывает при сбое/блокировке Gemini, если на сервере задан env DEEPSEEK_API_KEY.
                </div>
              </div>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 rounded-xl bg-[#7ef9e0] text-[#17142b] text-sm font-extrabold cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
