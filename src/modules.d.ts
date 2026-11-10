// Декларации типов для корневых ES-модулей «Синапса»

declare module '*/avatar.js' {
  export class SynapseAvatar {
    constructor(container: HTMLElement, options?: { state?: string; subject?: string });
    setState(state: string): void;
    setSubject(subjectId: string): void;
    setVoiceAmplitude(amp: number): void;
    reactToVoice(direction?: number): void;
    turnToSound(balance: number): void;
    start(): void;
    destroy(): void;
  }
}

declare module '*/voice.js' {
  export class SynapseVoice {
    supported: boolean;
    voices: SpeechSynthesisVoice[];
    selectedVoiceName: string;
    userRate: number;
    speaking: boolean;
    refreshVoices(): SpeechSynthesisVoice[];
    onVoicesChange(cb: (voices: SpeechSynthesisVoice[], selected: string) => void): () => void;
    onAmplitude(cb: (amp: number) => void): () => void;
    setRate(rate: number): void;
    stop(): void;
    speak(text: string, callbacks?: { onStart?: () => void; onEnd?: () => void }): Promise<void>;
    isEcho(recognized: string): boolean;
  }
  export function speechify(text: string): string;
}

declare module '*/search.js' {
  export interface VerifiedSource {
    title: string;
    url: string;
    snippet: string;
    sourceName: string;
    badge: string;
  }
  export const TRUSTED_EDU_DOMAINS: Array<{
    domain: string;
    name: string;
    badge: string;
    priority: number;
  }>;
  export function searchVerifiedSources(
    question: string,
    options?: { subject?: string; maxResults?: number }
  ): Promise<VerifiedSource[]>;
  export function classifyFollowUpIntent(question: string): 'stop' | 'detail' | 'practice' | 'new';
  export function detectTemplateFromQuestion(question: string): { type: string; data: unknown };
  export function synthesizeAnswerFromSources(
    question: string,
    sources: VerifiedSource[],
    options?: { detailMode?: boolean; practiceMode?: boolean }
  ): string | null;
}

declare module '*/ai.js' {
  import type { VerifiedSource } from '*/search.js';
  export interface SubjectTopic {
    id: string;
    title: string;
    subtitle: string;
    template: string;
    data: Record<string, unknown>;
    answer: string;
    details?: string;
    practice?: string;
  }
  export interface SubjectInfo {
    id: string;
    name: string;
    grade: string;
    badgeIcon: string;
    accent: string;
    topics: SubjectTopic[];
    bonusTopics: SubjectTopic[];
  }
  export const SUBJECT_CATALOG: Record<string, SubjectInfo>;
  export const SUPPORTED_TEMPLATES: Set<string>;
  export function moderateUserInput(text: string): { allowed: boolean; reason?: string; reply?: string };
  export function isShowDataSafe(show: unknown): boolean;
  export function askSynapse(
    question: string,
    options?: {
      subjectName?: string;
      useDeepSeek?: boolean;
      useWebSearch?: boolean;
      detailMode?: boolean;
      practiceMode?: boolean;
      previousQuestion?: string;
      previousAnswer?: string;
      signal?: AbortSignal | null;
    }
  ): Promise<{
    ok: boolean;
    moderated?: boolean;
    blocked?: boolean;
    provider?: string;
    answer?: string;
    show?: { type: string; data: unknown };
    sources?: VerifiedSource[];
    fallbackAnswer?: string | null;
    fallbackShow?: { type: string; data: unknown } | null;
    errorType?: string;
    message?: string;
  }>;
}

declare module '*/animations.js' {
  export interface AnimationHandle {
    destroy(): void;
  }
  export function renderFormulaShow(container: HTMLElement, data: unknown): Promise<AnimationHandle>;
  export function renderChartShow(container: HTMLElement, data: unknown): Promise<AnimationHandle>;
  export function renderDiagramShow(container: HTMLElement, data: unknown): AnimationHandle;
  export function renderTemplateShow(
    container: HTMLElement,
    templateName: string,
    data?: Record<string, unknown>,
    callbacks?: { onSearchHistoryImages?: (query: string, title?: string) => void }
  ): AnimationHandle;
}

declare module '*/history-images.js' {
  export interface HistoryImageItem {
    title: string;
    url: string;
    fullUrl: string;
    description: string;
    source: string;
  }
  export function searchHistoryImages(query: string, limit?: number): Promise<HistoryImageItem[]>;
  export function isSafeHistoricalImage(item: HistoryImageItem): boolean;
  export const ERA_IMAGE_QUERIES: Record<string, string>;
}

declare module '*/app.js' {
  export const WAKE_WORD_REGEXES: RegExp[];
  export const STATUS_LABELS: Record<string, string>;
  export function matchWakeTrigger(text: string): { matched: boolean; tail: string };
  export function isStopPhrase(text: string): boolean;
  export function registerServiceWorker(): void;
  export class SpeechController {
    supported: boolean;
    running: boolean;
    mode: string;
    assistantBusy: boolean;
    constructor(options: {
      onLog?: (line: string) => void;
      onWake?: (info: { hasInlineQuestion: boolean }) => void;
      onInterrupt?: () => void;
      onQuestion?: (q: string) => void;
      onStateHint?: (state: string) => void;
      onError?: (err: string) => void;
      onRecordTick?: (sec: number) => void;
      isEcho?: (text: string) => boolean;
    });
    setAssistantBusy(busy: boolean): void;
    startPassive(): boolean;
    startRecord10Sec(): boolean;
    stop(): void;
  }
}

declare module '*/sound-direction.js' {
  export class SoundDirection {
    active: boolean;
    stereo: boolean;
    balance: number;
    start(): Promise<boolean>;
    getBalance(): number;
    stop(): void;
  }
}
