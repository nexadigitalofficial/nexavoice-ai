/**
 * NexaVoice AI - Google Gemini API Entegrasyonu
 * Resmi Google AI Studio REST v1beta generateContent standardı
 * - Çok formatlı ses (Audio WebM/WAV/MP3) -> Yapılandırılmış JSON Görev Listesi
 * - responseSchema & responseMimeType garantili JSON çıktısı
 * - Otomatik hata yakalama ve akıllı tarih eşleme
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GeminiService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class GeminiService {
    constructor() {
      this.apiKey = localStorage.getItem('gemini_api_key') || '';
      this.model = localStorage.getItem('gemini_model') || 'gemini-1.5-flash';
      // Varsayılan olarak API anahtarı varsa Gemini açık
      const savedEnabled = localStorage.getItem('gemini_enabled');
      this.isEnabled = savedEnabled !== null ? savedEnabled === 'true' : true;
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    setApiKey(key) {
      this.apiKey = (key || '').trim();
      localStorage.setItem('gemini_api_key', this.apiKey);
    }

    getApiKey() {
      return this.apiKey;
    }

    setModel(modelName) {
      this.model = modelName || 'gemini-1.5-flash';
      localStorage.setItem('gemini_model', this.model);
    }

    getModel() {
      return this.model;
    }

    setEnabled(enabled) {
      this.isEnabled = Boolean(enabled);
      localStorage.setItem('gemini_enabled', this.isEnabled ? 'true' : 'false');
    }

    isReady() {
      return Boolean(this.isEnabled && this.apiKey && this.apiKey.length > 10);
    }

    /**
     * Google AI Studio Bağlantısını Test Et
     */
    async testConnection(customKey = null) {
      const keyToUse = (customKey || this.apiKey || '').trim();
      if (!keyToUse) {
        throw new Error('Lütfen geçerli bir Gemini API anahtarı girin.');
      }

      const url = `${this.baseUrl}/${this.model}:generateContent?key=${keyToUse}`;
      const payload = {
        contents: [{
          parts: [{ text: 'Test: Yanıt olarak sadece "NEXA_OK" kelimesini döndür.' }]
        }],
        generationConfig: {
          maxOutputTokens: 10
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error && errData.error.message) {
            errorDetail = errData.error.message;
          }
        } catch (_) {}
        throw new Error(`Bağlantı hatası: ${errorDetail}`);
      }

      const data = await res.json();
      return true;
    }

    /**
     * Ses Kaydını (Base64) Doğrudan Gemini'ye Gönderip Görev Listesi Çıkarma
     */
    async processAudio(base64Audio, mimeType = 'audio/webm', refDate = new Date()) {
      if (!this.isReady()) {
        throw new Error('Gemini API anahtarı girilmemiş veya Gemini modu kapalı.');
      }

      const dateStr = this.formatDate(refDate);
      const systemPrompt = `Sen saha ve gayrimenkul danışmanları için çalışan üstün yetenekli NexaVoice AI asistanısın.
Sana gönderilen Türkçe ses kaydını Google "Smart Transcription" prensipleriyle analiz et:

1. AKILLI TÜRKÇE TRANSKRİPSİYON (Smart Transcription):
   - Konuşmanın eksiksiz, pürüzsüz ve dil bilgisine uygun Türkçe metnini oluştur (büyük/küçük harf, noktalama).
   - "ııı", "şey", "yani", "öhm", "hımm" gibi takılma ve dolgu seslerini akıllıca temizle.
   - Konuşma sırasındaki düzeltmeleri çöz (örneğin: "yarın saat iki, pardon üçte buluşalım" dendiyse son düzeltilen zaman olan 15:00'i esas al).
   - Sayı, tarih ve para birimlerini doğal biçimlendir (örn: "üç buçukta" -> 15:30, "on bin lira" -> 10.000 TL).

2. ALAN VE SEKTÖR KELİME DAĞARCIĞI (Domain Vocabulary):
   - Gayrimenkul ve saha terimlerine yüksek hassasiyet göster: Tapu, kadastro, ada, parsel, iskan, kat irtifakı, kat mülkiyeti, rayiç bedel, ekspertiz, DASK, noter, vekaletname, kira kontratı, kapora, portföy, yer gösterme, vb.

3. GÖREVLERİ AYRIŞTIRMA VE ORGANİZE ETME:
   - Konuşmadaki tüm bağımsız eylemleri ayrı görevlere böl ("ve", "sonra", "bir de", "ayrıca" gibi bağlaçları ayrıştır).
   - Her görev için eylem odaklı kısa bir başlık üret (örn: "Ahmet Bey ile Tapuda Buluş").
   - Kategori: 'Görüşme', 'Randevu', 'Arama', 'Gezi / Yer Gösterme', 'Evrak / Tapu', 'Takip', 'Kişisel', 'Genel'.
   - Tarih (YYYY-MM-DD): Bugünün tarihi referansı ${dateStr} üzerinden göreceli günleri (yarın, cuma, haftaya salı) doğru hesapla.
   - Saat (HH:mm): Kesin saat verilmişse onu yaz (örn: 14:30). Sadece "öğleden sonra", "akşamüstü" gibi belirsiz saatler için is_time_estimated=true yap.
   - Muhatap kişi (unvanıyla birlikte: "Ahmet Bey", "Mimar Selin Hanım") ve Mekan (villa, tapu dairesi, noter, ofis).

Referans Bugünün Tarihi: ${dateStr}.
Çıktıyı kesinlikle belirtilen JSON şemasına harfiyen uygun şekilde ver.`;

      const cleanMime = (mimeType || 'audio/webm').split(';')[0];
      const payload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          parts: [
            { text: `Lütfen bu Türkçe ses kaydını dinle, görevlere ayır ve JSON listesi olarak üret. Bugünün tarihi: ${dateStr}` },
            {
              inlineData: {
                mimeType: cleanMime,
                data: base64Audio
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: this.getTaskSchema()
        }
      };

      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error && errData.error.message) {
            errorDetail = errData.error.message;
          }
        } catch (_) {}
        throw new Error(`Gemini API Hatası: ${errorDetail}`);
      }

      const data = await res.json();
      return this.parseResponse(data, refDate);
    }

    /**
     * Metin Transkriptini Gemini'ye Gönderip Görev Listesi Çıkarma
     */
    async processText(transcript, refDate = new Date()) {
      if (!this.isReady()) {
        throw new Error('Gemini API anahtarı girilmemiş veya Gemini modu kapalı.');
      }

      const dateStr = this.formatDate(refDate);
      const systemPrompt = `Sen saha ve gayrimenkul danışmanları için çalışan profesyonel NexaVoice AI asistanısın.
Kullanıcının Türkçe sesli notunu analiz et. Tüm bağımsız görevleri tespit et ve JSON şemasına uygun liste olarak üret.
Referans Bugünün Tarihi: ${dateStr}.`;

      const payload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          parts: [{ text: `Kullanıcı Notu: "${transcript}"` }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: this.getTaskSchema()
        }
      };

      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error && errData.error.message) {
            errorDetail = errData.error.message;
          }
        } catch (_) {}
        throw new Error(`Gemini API Hatası: ${errorDetail}`);
      }

      const data = await res.json();
      return this.parseResponse(data, refDate, transcript);
    }

    /**
     * Google Resmi JSON Şema Tanımı
     */
    getTaskSchema() {
      return {
        type: 'OBJECT',
        properties: {
          transcript: {
            type: 'STRING',
            description: 'Ses kaydının düzgün, noktalamalı Türkçe transkripti'
          },
          tasks: {
            type: 'ARRAY',
            description: 'Konuşmadan çıkarılan bağımsız görevler',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'Kısa ve eylem odaklı başlık (örn: Villa Görüşmesi Yap)' },
                raw_text: { type: 'STRING', description: 'Görevin ilgili cümle parçası' },
                category: {
                  type: 'STRING',
                  enum: ['Görüşme', 'Randevu', 'Arama', 'Gezi / Yer Gösterme', 'Evrak / Tapu', 'Takip', 'Kişisel', 'Genel']
                },
                due_date: { type: 'STRING', description: 'YYYY-MM-DD formatında tarih (örn: 2026-10-14)' },
                due_time: { type: 'STRING', description: 'HH:mm formatında saat (örn: 15:30)' },
                is_time_estimated: { type: 'BOOLEAN', description: 'Saat kesin değil de tahmin edilmişse true' },
                priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
                person: { type: 'STRING', description: 'Muhatap kişi adı ve unvanı (örn: Ahmet Bey) veya null' },
                place: { type: 'STRING', description: 'Mekan adı (örn: Tapu Dairesi, Villa) veya null' },
                tags: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                }
              },
              required: ['title', 'category', 'due_date', 'due_time', 'priority']
            }
          }
        },
        required: ['transcript', 'tasks']
      };
    }

    /**
     * Gemini JSON Çıktısını Nexa Görev Formatına Dönüştürme
     */
    parseResponse(data, refDate, fallbackTranscript = '') {
      try {
        const candidate = data.candidates && data.candidates[0];
        const textPart = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
        const rawJson = textPart ? textPart.text : '{}';
        const parsed = JSON.parse(rawJson);

        const transcript = parsed.transcript || fallbackTranscript || 'Ses kaydı işlendi';
        const rawTasks = parsed.tasks || [];

        const tasks = rawTasks.map((t, idx) => {
          return {
            id: 'task_' + Date.now() + '_' + idx,
            title: t.title || 'Yeni Görev',
            raw_text: t.raw_text || transcript,
            category: t.category || 'Genel',
            due_date: t.due_date || this.formatDate(refDate),
            due_time: t.due_time || '14:00',
            is_time_estimated: typeof t.is_time_estimated === 'boolean' ? t.is_time_estimated : true,
            priority: t.priority || 'medium',
            person: t.person || null,
            place: t.place || null,
            tags_json: JSON.stringify(t.tags || []),
            confidence_json: JSON.stringify({
              category: 0.99,
              date: 0.99,
              time: 0.99,
              overall: 0.99,
              engine: 'gemini-ai'
            }),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });

        return { transcript, tasks };
      } catch (err) {
        console.error('[GeminiService] JSON ayrıştırma hatası:', err);
        throw new Error('Gemini yanıtı görev formatına dönüştürülemedi: ' + err.message);
      }
    }

    formatDate(d) {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }

  return new GeminiService();
});
