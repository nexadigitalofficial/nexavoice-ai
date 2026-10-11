/**
 * Türkçe NLP Motoru Orkestratörü (NLP Engine)
 * Tüm kural dosyalarını yükler, transkripti parçalar, parser'ı çalıştırır
 * ve veritabanına kaydedilmeye hazır Görev Nesneleri üretir.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Normalizer = require('./normalizer');
    const Tokenizer = require('./tokenizer');
    const Parser = require('./parser');
    module.exports = factory(Normalizer, Tokenizer, Parser);
  } else {
    root.NlpEngine = factory(root.Normalizer, root.Tokenizer, root.Parser);
  }
})(typeof self !== 'undefined' ? self : this, function (Normalizer, Tokenizer, Parser) {
  'use strict';

  function generateId() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  }

  class NlpEngine {
    constructor() {
      this.rules = {
        categories: [],
        temporal: {},
        numbers: {},
        priorities: {},
        entities: {}
      };
      this.parser = new Parser(this.rules);
      this.isInitialized = false;
    }

    /**
     * Kural dosyalarını yükleme (Web fetch veya Node require)
     */
    async init(customRules = null) {
      if (customRules) {
        this.rules = customRules;
        this.parser = new Parser(this.rules);
        this.isInitialized = true;
        return true;
      }

      if (typeof window !== 'undefined' && window.fetch) {
        try {
          const [catRes, tempRes, numRes, prioRes, entRes] = await Promise.all([
            fetch('./rules/categories.json').then(r => r.json()).catch(() => ({ categories: [] })),
            fetch('./rules/temporal.json').then(r => r.json()).catch(() => ({})),
            fetch('./rules/numbers.json').then(r => r.json()).catch(() => ({})),
            fetch('./rules/priorities.json').then(r => r.json()).catch(() => ({})),
            fetch('./rules/entities.json').then(r => r.json()).catch(() => ({}))
          ]);

          this.rules = {
            categories: catRes.categories || [],
            temporal: tempRes || {},
            numbers: numRes || {},
            priorities: prioRes || {},
            entities: entRes || {}
          };
          this.parser = new Parser(this.rules);
          this.isInitialized = true;
          return true;
        } catch (err) {
          console.warn('[NlpEngine] Kurallar fetch edilemedi, yerleşik fallback kullanılıyor', err);
        }
      }

      this.parser = new Parser(this.rules);
      this.isInitialized = true;
      return true;
    }

    /**
     * Ham ses metnini (transcript) alıp yapılandırılmış görev listesine dönüştürür.
     */
    processTranscript(transcript, audioPath = null, refDate = new Date()) {
      if (!transcript || typeof transcript !== 'string') {
        return [];
      }

      const clauses = Tokenizer.splitIntoClauses(transcript);
      const tasks = [];
      const nowIso = new Date().toISOString();

      for (const clause of clauses) {
        if (!clause || clause.trim().length < 2) continue;

        const parsed = this.parser.parseClause(clause, refDate);
        const task = {
          id: generateId(),
          title: parsed.title,
          raw_text: parsed.raw_text,
          category: parsed.category,
          category_id: parsed.category_id,
          due_date: parsed.due_date,
          due_time: parsed.due_time,
          is_time_estimated: parsed.is_time_estimated ? 1 : 0,
          priority: parsed.priority,
          person: parsed.person,
          place: parsed.place,
          tags_json: JSON.stringify(parsed.tags),
          confidence_json: JSON.stringify(parsed.confidence),
          status: 'pending',
          audio_path: audioPath,
          created_at: nowIso,
          updated_at: nowIso
        };

        tasks.push(task);
      }

      return tasks;
    }
  }

  return NlpEngine;
});
