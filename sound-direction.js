// Определение стороны, откуда пришёл голос ученика, для поворота головы робота «Синапс»
// Использует стерео-микрофон: сравнивает громкость левого и правого каналов.
// Если микрофон моно (как у большинства ноутбуков), возвращает 0 — робот смотрит прямо на ученика.

export class SoundDirection {
  constructor() {
    this.active = false;   // поток с микрофона запущен
    this.stereo = false;   // микрофон отдаёт два канала
    this.balance = 0;      // -1 = звук слева, 0 = по центру, +1 = справа (сглаженное)

    this._history = [];    // последние значения баланса (≈0.6 с)
    this._stream = null;
    this._ctx = null;
    this._timer = null;
    this._aL = null;
    this._aR = null;
    this._bufL = null;
    this._bufR = null;
  }

  // Запуск прослушивания каналов (вызывается после «Разрешить микрофон»)
  async start() {
    if (this.active) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;

    try {
      // Отключаем обработку, которая «выравнивает» стерео в моно
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const channels = stream.getAudioTracks()[0]?.getSettings?.().channelCount || 1;
      this.stereo = channels >= 2;

      const aL = ctx.createAnalyser();
      const aR = ctx.createAnalyser();
      aL.fftSize = 1024;
      aR.fftSize = 1024;

      if (this.stereo) {
        // Разделяем стерео: канал 0 — левый, канал 1 — правый
        const splitter = ctx.createChannelSplitter(2);
        source.connect(splitter);
        splitter.connect(aL, 0);
        splitter.connect(aR, 1);
      } else {
        // Моно: оба анализатора видят один и тот же сигнал → баланс всегда 0
        source.connect(aL);
        source.connect(aR);
      }

      if (ctx.state === 'suspended') await ctx.resume();

      this._stream = stream;
      this._ctx = ctx;
      this._aL = aL;
      this._aR = aR;
      this._bufL = new Float32Array(aL.fftSize);
      this._bufR = new Float32Array(aR.fftSize);
      this.active = true;

      this._timer = setInterval(() => this._sample(), 100);
      return true;
    } catch {
      // Нет разрешения или устройства — работаем без направления
      return false;
    }
  }

  // Громкость (RMS) сигнала в буфере анализатора
  _rms(analyser, buf) {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  // Один замер: баланс левого/правого канала, сглаженный за последние ~0.6 с
  _sample() {
    const l = this._rms(this._aL, this._bufL);
    const r = this._rms(this._aR, this._bufR);
    const total = l + r;
    // Тихо — считаем, что звук спереди (по центру)
    const raw = total < 0.004 ? 0 : (r - l) / total;

    this._history.push(raw);
    if (this._history.length > 6) this._history.shift();
    this.balance = this._history.reduce((a, b) => a + b, 0) / this._history.length;
  }

  // Текущая сторона звука для поворота головы
  getBalance() {
    return Math.max(-1, Math.min(1, this.balance));
  }

  // Остановка микрофона и освобождение ресурсов
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    this._aL = null;
    this._aR = null;
    this._history = [];
    this.balance = 0;
    this.active = false;
    this.stereo = false;
  }
}
