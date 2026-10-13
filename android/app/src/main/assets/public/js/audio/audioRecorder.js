/**
 * NexaVoice AI - Tarayıcı & WebView Medya Ses Kaydedicisi (MediaRecorder)
 * - Yüksek kaliteli Opus / WebM ses sıkıştırma (Gemini uyumlu)
 * - Canlı ses seviyesi analizi (Web Audio API / AnalyserNode)
 * - Base64 kodlayıcı ve Blob yönetimi
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AudioRecorder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AudioRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.stream = null;
      this.audioChunks = [];
      this.startTime = 0;
      this.mimeType = 'audio/webm';
      this.audioContext = null;
      this.analyser = null;
      this.source = null;
      this.dataArray = null;
      this.isRecording = false;
    }

    /**
     * Cihazın desteklediği en iyi ses formatını seç
     */
    getSupportedMimeType() {
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg'
      ];

      if (typeof MediaRecorder === 'undefined') {
        return 'audio/webm';
      }

      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
          return t;
        }
      }
      return '';
    }

    /**
     * Kaydı Başlat
     */
    async start() {
      if (this.isRecording) return;

      this.audioChunks = [];
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      const chosenMime = this.getSupportedMimeType();

      const options = chosenMime ? { mimeType: chosenMime } : {};
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.mimeType = this.mediaRecorder.mimeType || chosenMime || 'audio/webm';

      // Canlı ses seviyesi için AudioContext
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          this.source = this.audioContext.createMediaStreamSource(this.stream);
          this.source.connect(this.analyser);
          this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
      } catch (e) {
        console.warn('[AudioRecorder] AudioContext başlatılamadı:', e);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.startTime = Date.now();
      this.isRecording = true;
      this.mediaRecorder.start(200); // 200 ms aralıklarla topla
    }

    /**
     * Anlık Ses Seviyesi (0.0 - 1.0 arası)
     */
    getAudioLevel() {
      if (!this.analyser || !this.dataArray || !this.isRecording) return 0;
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const avg = sum / this.dataArray.length;
      return Math.min(1.0, avg / 128.0);
    }

    /**
     * Kaydı Durdur ve Base64 + Blob Döndür
     */
    async stop() {
      if (!this.isRecording || !this.mediaRecorder) {
        return { blob: null, base64: null, mimeType: this.mimeType, durationMs: 0 };
      }

      return new Promise((resolve, reject) => {
        const durationMs = Date.now() - this.startTime;

        this.mediaRecorder.onstop = () => {
          this.isRecording = false;

          // Kaynakları temizle
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
          }
          if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
          }

          const blob = new Blob(this.audioChunks, { type: this.mimeType });
          const audioUrl = URL.createObjectURL(blob);

          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result || '';
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve({
              blob,
              base64,
              mimeType: this.mimeType.split(';')[0],
              durationMs,
              audioUrl
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        };

        this.mediaRecorder.stop();
      });
    }

    cancel() {
      this.isRecording = false;
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (_) {}
      }
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      this.audioChunks = [];
    }
  }

  return new AudioRecorder();
});
