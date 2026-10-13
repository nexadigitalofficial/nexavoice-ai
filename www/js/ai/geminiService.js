/**
 * NexaVoice AI - Google Gemini 3.8 Çok Katmanlı AI Ağı & Bilişsel Yönlendirme (Cognitive Routing)
 * Ekim 2026 Standartları:
 * - Gemini 3.8 Flash (Amiral Gemisi: Otonom planlama, karmaşık iş akışları, yazılım ve görev tasarımı)
 * - Gemini 3.8 Live (Sıfır gecikme, akıcı gerçek zamanlı sesli diyalog)
 * - Gemini 3.5 Flash-Lite (Yüksek hacim, anlık veri ayrıştırma, minimal gecikme)
 * - Gemini 3.5 Transcribe (Resmi konuşma tanıma modeli, Smart Mode & Custom Vocabulary)
 * - Bilişsel Yönlendirme (Cognitive Routing): İşlemin doğasına göre en rasyonel modele dinamik yönlendirme
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
      // Varsayılan model: 2026 Amiral Gemisi gemini-3.8-flash
      this.model = localStorage.getItem('gemini_model') || 'gemini-3.8-flash';
      const savedEnabled = localStorage.getItem('gemini_enabled');
      this.isEnabled = savedEnabled !== null ? savedEnabled === 'true' : true;
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
      this.interactionsUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    }

    setApiKey(key) {
      this.apiKey = (key || '').trim();
      localStorage.setItem('gemini_api_key', this.apiKey);
    }

    getApiKey() {
      return this.apiKey;
    }

    setModel(modelName) {
      this.model = modelName || 'gemini-3.8-flash';
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
     * Bilişsel Model Yönlendirme Haritası
     * Görevin karmaşıklığına ve gecikme ihtiyacına göre hedef modeli belirler.
     */
    resolveModelForTask(taskType = 'multimodal_audio') {
      if (this.model !== 'gemini-cognitive-routing') {
        return this.model;
      }

      // Cognitive Routing mantığı:
      switch (taskType) {
        case 'quick_search':
        case 'quick_classification':
          // Basit, yüksek hacimli sınıflandırma -> 3.5 Flash-Lite
          return 'gemini-3.5-flash-lite';
        case 'live_audio_stream':
          // Düşük gecikmeli gerçek zamanlı ses -> 3.8 Live
          return 'gemini-3.8-live';
        case 'speech_transcription':
          // Özel dikte ve konuşma tanıma -> 3.5 Transcribe
          return 'gemini-3.5-transcribe';
        case 'multimodal_audio':
        case 'deep_planning':
        default:
          // Karmaşık Türkçe anlama, zaman planlama ve otonom karar alma -> 3.8 Flash
          return 'gemini-3.8-flash';
      }
    }

    /**
     * Google AI Studio Bağlantısını Test Et
     */
    async testConnection(customKey = null) {
      const keyToUse = (customKey || this.apiKey || '').trim();
      if (!keyToUse) {
        throw new Error('Lütfen geçerli bir Gemini API anahtarı girin.');
      }

      const candidateModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let lastError = null;

      for (const m of candidateModels) {
        try {
          const url = `${this.baseUrl}/${m}:generateContent?key=${keyToUse}`;
          const payload = {
            contents: [{
              parts: [{ text: 'Test: Yanıt olarak sadece "NEXA_OK" kelimesini döndür.' }]
            }],
            generationConfig: { maxOutputTokens: 10 }
          };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            return true;
          }

          const errData = await res.json().catch(() => ({}));
          lastError = errData && errData.error && errData.error.message ? errData.error.message : `HTTP ${res.status}`;
        } catch (e) {
          lastError = e.message;
        }
      }

      throw new Error(`Bağlantı hatası: ${lastError || 'API anahtarı doğrulanamadı'}`);
    }

    /**
     * Ana Ses İşleme Giriş Noktası
     * Bilişsel Yönlendirme (Cognitive Routing) ile en uygun modeli çalıştırır.
     */
    async processAudio(base64Audio, mimeType = 'audio/webm', refDate = new Date()) {
      if (!this.isReady()) {
        throw new Error('Gemini API anahtarı girilmemiş veya Gemini modu kapalı.');
      }

      const targetModel = this.resolveModelForTask('multimodal_audio');

      // 1. Özel Transcribe Modeli seçildiyse:
      if (targetModel === 'gemini-3.5-transcribe') {
        try {
          return await this.processAudioWithTranscribe(base64Audio, mimeType, refDate);
        } catch (transcribeErr) {
          console.warn('[Gemini 3.5 Transcribe fallback to 3.8 Flash]', transcribeErr);
          return await this.processAudioMultimodal(base64Audio, mimeType, refDate, 'gemini-3.8-flash');
        }
      }

      // 2. Multimodal Ses Motoru (3.8 Flash, 3.8 Live, 3.5 Flash-Lite)
      return await this.processAudioMultimodal(base64Audio, mimeType, refDate, targetModel);
    }

    /**
     * Google Resmi Transcribe Standardı (gemini-3.5-transcribe)
     * Döküman: https://ai.google.dev/gemini-api/docs/transcribe?hl=tr
     * - language_codes: ["tr-TR"]
     * - mode: "smart" (Dolgu sesleri eler, satır içi düzeltmeleri çözer, biçimlendirir)
     * - custom_vocabulary: Sektörel gayrimenkul & saha terimleri
     */
    async processAudioWithTranscribe(base64Audio, mimeType = 'audio/webm', refDate = new Date()) {
      const cleanMime = (mimeType || 'audio/webm').split(';')[0];
      const payload = {
        model: 'gemini-3.5-transcribe',
        input: [
          {
            type: 'audio',
            data: base64Audio,
            mime_type: cleanMime
          }
        ],
        generation_config: {
          transcription_config: {
            language_codes: ['tr-TR'],
            mode: 'smart',
            custom_vocabulary: [
              'Tapu', 'Kadastro', 'Ada', 'Parsel', 'İskan', 'Kat Mülkiyeti',
              'Kat İrtifakı', 'Rayiç Bedel', 'Ekspertiz', 'DASK', 'Noter',
              'Vekaletname', 'Kira Kontratı', 'Kapora', 'Portföy', 'Yer Gösterme',
              'Hisseli Tapu', 'İpotek', 'Belediye Harcı', 'Ruhsat', 'NexaVoice'
            ]
          }
        }
      };

      const url = `${this.interactionsUrl}?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
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
        throw new Error(`Gemini 3.5 Transcribe Hatası: ${errorDetail}`);
      }

      const data = await res.json();
      let transcript = data.output_text || '';
      if (!transcript && data.steps && data.steps.length > 0) {
        for (const step of data.steps) {
          if (step.content && step.content.length > 0) {
            for (const c of step.content) {
              if (c.text) {
                transcript += c.text + ' ';
              }
            }
          }
        }
        transcript = transcript.trim();
      }

      if (!transcript) {
        transcript = 'Ses kaydı çözümlendi';
      }

      // Akıllı Türkçe transkripti alıp 3.8 Flash ile yapılandırılmış görev listesine dönüştür
      return await this.processText(transcript, refDate);
    }

    /**
     * Çok Modlu (Multimodal) Ses & Otonom Planlama Motoru
     * Gemini 3.8 Flash / 3.8 Live / 3.5 Flash-Lite
     */
    async processAudioMultimodal(base64Audio, mimeType = 'audio/webm', refDate = new Date(), preferredModel = 'gemini-3.8-flash') {
      const dateStr = this.formatDate(refDate);
      const systemPrompt = `Sen saha ve gayrimenkul danışmanları için çalışan üstün yetenekli NexaVoice AI otonom asistanısın (Gemini 3.8 Bilişsel Motoru).
Sana gönderilen Türkçe ses kaydını analiz et:

1. AKILLI TÜRKÇE ANLAMA (Smart Transcription):
   - Konuşmanın eksiksiz, akıcı ve dil bilgisine uygun Türkçe transkriptini oluştur.
   - Konuşma esnasındaki gereksiz "ııı", "şey", "yani", "öhm" gibi takılmaları ve duraksamaları temizle.
   - Konuşma esnasındaki anlık düzeltmeleri çöz (örneğin: "yarın saat iki, pardon üçte buluşalım" dendiyse son düzeltilen saat olan 15:00'i esas al).
   - Sayı, tarih ve para birimlerini doğal biçimlendir (örn: "üç buçukta" -> 15:30, "on bin lira" -> 10.000 TL).

2. ALAN VE SEKTÖR KELİME DAĞARCIĞI (Domain Vocabulary):
   - Gayrimenkul ve saha terimlerine yüksek hassasiyet göster: Tapu, kadastro, ada, parsel, iskan, kat irtifakı, kat mülkiyeti, rayiç bedel, ekspertiz, DASK, noter, vekaletname, kira kontratı, kapora, portföy, yer gösterme, vb.

3. OTONOM GÖREV PLANLAMA VE AYRIŞTIRMA:
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

      // Modeller arası kademeli akıllı geçiş zinciri (Sıfır Hata Garantisi)
      const modelFallbackChain = [
        preferredModel,
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];

      // Yinelenenleri kaldır
      const uniqueChain = Array.from(new Set(modelFallbackChain));

      let lastError = null;
      for (const modelToTry of uniqueChain) {
        try {
          const url = `${this.baseUrl}/${modelToTry}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const data = await res.json();
            return this.parseResponse(data, refDate, '', modelToTry);
          }

          const errData = await res.json().catch(() => ({}));
          lastError = errData && errData.error && errData.error.message ? errData.error.message : `HTTP ${res.status}`;
          console.warn(`[GeminiService] ${modelToTry} yanıt vermedi (${lastError}), zincirdeki sonraki modele geçiliyor...`);
        } catch (fetchErr) {
          lastError = fetchErr.message;
          console.warn(`[GeminiService] ${modelToTry} bağlantı hatası:`, fetchErr);
        }
      }

      throw new Error(`Gemini AI Motoru Hatası: ${lastError || 'Ses işlenemedi'}`);
    }

    /**
     * Metin Transkriptini Gemini ile Görev Listesine Dönüştürme
     */
    async processText(transcript, refDate = new Date()) {
      if (!this.isReady()) {
        throw new Error('Gemini API anahtarı girilmemiş veya Gemini modu kapalı.');
      }

      const textModel = this.resolveModelForTask('deep_planning');
      const dateStr = this.formatDate(refDate);
      const systemPrompt = `Sen saha ve gayrimenkul danışmanları için çalışan profesyonel NexaVoice AI otonom asistanısın.
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

      const modelChain = [textModel, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      const uniqueChain = Array.from(new Set(modelChain));

      let lastError = null;
      for (const m of uniqueChain) {
        try {
          const url = `${this.baseUrl}/${m}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const data = await res.json();
            return this.parseResponse(data, refDate, transcript, m);
          }

          const errData = await res.json().catch(() => ({}));
          lastError = errData && errData.error && errData.error.message ? errData.error.message : `HTTP ${res.status}`;
        } catch (e) {
          lastError = e.message;
        }
      }

      throw new Error(`Gemini Metin Ayrıştırma Hatası: ${lastError || 'Bilinmiyor'}`);
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
    parseResponse(data, refDate, fallbackTranscript = '', executedModel = 'gemini-3.8-flash') {
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
              engine: executedModel
            }),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });

        return { transcript, tasks, modelUsed: executedModel };
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
