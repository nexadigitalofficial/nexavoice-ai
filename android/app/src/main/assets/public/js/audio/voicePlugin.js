/**
 * Vosk Native Plugin Köprüsü ve Ses Algılama Yöneticisi
 * - Android Capacitor ortamında yerel 'VoskVoicePlugin' çağırır.
 * - Tarayıcı / PWA test ortamında Web Speech veya Simülasyon fallback'i sağlar.
 * - Sessizlik algılama (Silence Detector: 3 sn sessizlikte otomatik durdurma)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VoiceManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class VoiceManager {
    constructor() {
      this.isNative = typeof window !== 'undefined' &&
                      window.Capacitor &&
                      window.Capacitor.isPluginAvailable &&
                      window.Capacitor.isPluginAvailable('VoskVoicePlugin');

      this.nativePlugin = this.isNative ? window.Capacitor.Plugins.VoskVoicePlugin : null;
      this.isListening = false;
      this.isModelLoaded = false;
      this.silenceTimeout = null;
      this.silenceDurationMs = 3000;
      this.autoSilenceStopEnabled = true;

      this.onPartialResultCallback = null;
      this.onFinalResultCallback = null;
      this.onErrorCallback = null;
      this.onStateChangeCallback = null;
      this.onModelStatusCallback = null;

      this.currentTranscript = '';
      this.audioPath = null;
    }

    async init() {
      if (this.isNative && this.nativePlugin) {
        try {
          if (this.onModelStatusCallback) {
            this.onModelStatusCallback('loading', 'Dil modeli hazırlanıyor (ilk açılış kurulumu)...');
          }

          // Native eventleri dinle
          this.nativePlugin.addListener('onModelLoaded', (data) => {
            this.isModelLoaded = true;
            console.log('[VoiceManager] onModelLoaded eventi alındı');
            if (this.onModelStatusCallback) {
              this.onModelStatusCallback('ready', 'Model hazır (%100 Çevrimdışı)');
            }
          });

          this.nativePlugin.addListener('onPartialResult', (data) => {
            this.resetSilenceTimer();
            if (this.onPartialResultCallback) {
              this.onPartialResultCallback(data.partial);
            }
          });

          this.nativePlugin.addListener('onFinalResult', (data) => {
            this.currentTranscript = data.finalText || '';
            if (this.onFinalResultCallback) {
              this.onFinalResultCallback(this.currentTranscript, this.audioPath);
            }
          });

          this.nativePlugin.addListener('onError', (data) => {
            if (this.onErrorCallback) {
              this.onErrorCallback(data.error);
            }
          });

          this.nativePlugin.addListener('onStateChange', (data) => {
            if (this.onStateChangeCallback) {
              this.onStateChangeCallback(data.state);
            }
          });

          // Modeli başlat
          const status = await this.nativePlugin.initModel();
          console.log('[VoiceManager] Native Vosk Modeli Başlatıldı:', status);
          if (status && (status.status === 'ready' || status.status === 'already_loaded' || status.success)) {
            this.isModelLoaded = true;
            if (this.onModelStatusCallback) {
              this.onModelStatusCallback('ready', 'Model hazır (%100 Çevrimdışı)');
            }
          }

          // Çift kontrol: isModelReady
          try {
            const check = await this.nativePlugin.isModelReady();
            if (check && check.ready) {
              this.isModelLoaded = true;
              if (this.onModelStatusCallback) {
                this.onModelStatusCallback('ready', 'Model hazır (%100 Çevrimdışı)');
              }
            }
          } catch (e) {
            console.warn('[VoiceManager] isModelReady hatası:', e);
          }

          return true;
        } catch (err) {
          console.error('[VoiceManager] Native model başlatılamadı:', err);
          if (this.onModelStatusCallback) {
            this.onModelStatusCallback('error', 'Model yükleme hatası: ' + (err.message || err));
          }
          return false;
        }
      } else {
        console.warn('[VoiceManager] Native Vosk mevcut değil. Tarayıcı fallback modu devrede.');
        this.isModelLoaded = true;
        if (this.onModelStatusCallback) {
          this.onModelStatusCallback('ready', 'Web Modu Hazır');
        }
        return true;
      }
    }

    async requestAudioPermission() {
      if (this.isNative && this.nativePlugin) {
        try {
          const res = await this.nativePlugin.requestAudioPermission();
          return !!(res && res.granted);
        } catch (e) {
          console.warn('[VoiceManager] İzin isteme hatası:', e);
          return false;
        }
      }
      return true;
    }

    resetSilenceTimer() {
      if (!this.autoSilenceStopEnabled || !this.isListening) return;

      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
      }

      this.silenceTimeout = setTimeout(() => {
        if (this.isListening) {
          console.log('[VoiceManager] 3 sn sessizlik algılandı, otomatik durduruluyor...');
          this.stopListening();
        }
      }, this.silenceDurationMs);
    }

    clearSilenceTimer() {
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
    }

    async startListening() {
      if (this.isListening) return;

      this.currentTranscript = '';
      this.audioPath = null;

      if (this.isNative && this.nativePlugin) {
        try {
          this.isListening = true;
          if (this.onStateChangeCallback) {
            this.onStateChangeCallback('listening');
          }
          this.resetSilenceTimer();

          const res = await this.nativePlugin.startListening();
          this.audioPath = (res && res.audioPath) || null;
          return res;
        } catch (err) {
          this.isListening = false;
          this.clearSilenceTimer();
          if (this.onStateChangeCallback) {
            this.onStateChangeCallback('idle');
          }
          throw err;
        }
      } else {
        // Tarayıcı ortamı
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          }
        } catch (mediaErr) {
          console.warn('[VoiceManager] Tarayıcı mikrofon izni hatası:', mediaErr);
          throw new Error('Tarayıcı mikrofon izni verilmedi: ' + mediaErr.message);
        }

        this.isListening = true;
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('listening');
        }
        this.resetSilenceTimer();
        this.startWebSpeechFallback();
      }
    }

    async stopListening() {
      if (!this.isListening) return;

      this.clearSilenceTimer();
      this.isListening = false;

      if (this.onStateChangeCallback) {
        this.onStateChangeCallback('processing');
      }

      if (this.isNative && this.nativePlugin) {
        try {
          const res = await this.nativePlugin.stopListening();
          const transcript = (res && res.transcript) || this.currentTranscript;
          if (this.onFinalResultCallback) {
            this.onFinalResultCallback(transcript, (res && res.audioPath) || this.audioPath);
          }
          return res;
        } catch (err) {
          console.error('[VoiceManager] Native durdurma hatası:', err);
          if (this.onErrorCallback) this.onErrorCallback(err);
        }
      } else {
        this.stopWebSpeechFallback();
      }
    }

    // --- WEB / DESKTOP FALLBACK ---
    startWebSpeechFallback() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.webRecognizer = new SpeechRecognition();
        this.webRecognizer.lang = 'tr-TR';
        this.webRecognizer.interimResults = true;
        this.webRecognizer.continuous = true;

        this.webRecognizer.onresult = (event) => {
          this.resetSilenceTimer();
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              this.currentTranscript += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const display = (this.currentTranscript + interim).trim();
          if (this.onPartialResultCallback) {
            this.onPartialResultCallback(display);
          }
        };

        this.webRecognizer.onerror = (event) => {
          console.warn('[VoiceManager] WebSpeech hatası:', event.error);
        };

        try {
          this.webRecognizer.start();
        } catch (e) {
          console.warn('[VoiceManager] WebSpeech başlatılamadı:', e);
        }
      } else {
        console.log('[VoiceManager] Web Speech API bu tarayıcıda desteklenmiyor.');
      }
    }

    stopWebSpeechFallback() {
      if (this.webRecognizer) {
        try {
          this.webRecognizer.stop();
        } catch (e) {}
        this.webRecognizer = null;
      }

      const transcript = this.currentTranscript.trim();
      if (this.onFinalResultCallback) {
        this.onFinalResultCallback(transcript, null);
      }
    }
  }

  return new VoiceManager();
});
