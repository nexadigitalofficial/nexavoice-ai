/**
 * Türkçe Görev Cümle Bölücü (Clause Splitter & Tokenizer)
 * Tek bir uzun ses kaydını mantıksal bağımsız görev cümlelerine böler.
 * Unicode/Türkçe karakter uyumlu sınır algılama.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Normalizer = require('./normalizer');
    module.exports = factory(Normalizer);
  } else {
    root.Tokenizer = factory(root.Normalizer);
  }
})(typeof self !== 'undefined' ? self : this, function (Normalizer) {
  'use strict';

  // Zaman belirteçleri olan 'sonra' ifadelerini (öğleden sonra, yarım saat sonra) korumak için placeholder
  function protectTemporalSonra(text) {
    let s = text;
    // Unicode uyumlu değişim (Türkçe ö, ı, ü harfleri ile \b kullanılmaz)
    s = s.replace(/(^|[^a-z0-9çğıöşü])(öğleden|ogleden)\s+sonra(?=$|[^a-z0-9çğıöşü])/gi, '$1$2__SONRA__');
    s = s.replace(/(^|[^a-z0-9çğıöşü])(yarım|yarim)\s+saat\s+sonra(?=$|[^a-z0-9çğıöşü])/gi, '$1$2 saat__SONRA__');
    s = s.replace(/(^|[^a-z0-9çğıöşü])(\d+)\s+saat\s+sonra(?=$|[^a-z0-9çğıöşü])/gi, '$1$2 saat__SONRA__');
    s = s.replace(/(^|[^a-z0-9çğıöşü])(bir|iki|üç|uc|dört|dort|beş|bes)\s+saat\s+sonra(?=$|[^a-z0-9çğıöşü])/gi, '$1$2 saat__SONRA__');
    return s;
  }

  function unprotectTemporalSonra(text) {
    return text.replace(/__SONRA__/g, ' sonra');
  }

  const CONJUNCTION_SPLITTERS = [
    /\s+ve\s+daha\s+sonra\s+/gi,
    /\s+daha\s+sonra\s+/gi,
    /\s+ondan\s+sonra\s+/gi,
    /\s+bir\s+de\s+şunu\s+/gi,
    /\s+bir\s+de\s+/gi,
    /\s+ayrıca\s+/gi,
    /\s+ardından\s+/gi,
    /\s+peşinden\s+/gi,
    /\s+sonra\s+/gi,
    /\s+ve\s+/gi
  ];

  const ACTION_VERBS = [
    'ara', 'arayalım', 'ararsın', 'ara sor', 'telefon et',
    'görüş', 'görüşelim', 'konuş',
    'git', 'gidelim', 'uğra',
    'imzala', 'imzalatalım',
    'öde', 'yatır',
    'teslim et', 'gönder', 'ilet',
    'göster', 'gezdir', 'incele', 'bak'
  ];

  const TASK_START_KEYWORDS = [
    'bugün', 'yarın', 'öbür gün', 'haftaya', 'pazartesi', 'salı', 'çarşamba',
    'perşembe', 'cuma', 'cumartesi', 'pazar', 'saat', 'akşam', 'sabah', 'öğlen',
    'noter', 'tapu', 'belediye', 'villa', 'daire', 'arsa', 'ofis', 'ahmet', 'mehmet'
  ];

  function cleanClause(text) {
    if (!text) return '';
    let cleaned = unprotectTemporalSonra(text).trim();
    cleaned = cleaned.replace(/^[,;.\-!?\s]+/, '');
    cleaned = cleaned.replace(/[,;.\-!?\s]+$/, '');
    cleaned = cleaned.replace(/^(ve|sonra|ayrıca|bir de|ardından)\s+/i, '');
    cleaned = cleaned.replace(/\s+(ve|sonra|ayrıca|bir de|ardından)$/i, '');
    return cleaned.trim();
  }

  function splitIntoClauses(rawTranscript) {
    if (!rawTranscript || typeof rawTranscript !== 'string') return [];
    let text = rawTranscript.trim();
    if (!text) return [];

    text = protectTemporalSonra(text);

    // Adım 1: Noktalama işaretlerine göre böl
    let initialSegments = text.split(/[,;\n.!?]+/).map(s => s.trim()).filter(Boolean);

    let secondPass = [];
    // Adım 2: Bağlaçlara göre böl
    for (const segment of initialSegments) {
      let subSegments = [segment];

      for (const pattern of CONJUNCTION_SPLITTERS) {
        let temp = [];
        for (const item of subSegments) {
          const parts = item.split(pattern);
          temp.push(...parts);
        }
        subSegments = temp;
      }

      secondPass.push(...subSegments);
    }

    // Adım 3: Eylem bitişi + yeni zaman/kişi başlangıcı kontrolü
    let finalClauses = [];
    for (const item of secondPass) {
      const cleaned = cleanClause(item);
      if (!cleaned) continue;

      const words = cleaned.split(/\s+/);
      let splitIdx = -1;

      for (let i = 0; i < words.length - 1; i++) {
        const wLower = Normalizer.toLowerTr(words[i]);
        const nextLower = Normalizer.toLowerTr(words[i + 1]);

        if (ACTION_VERBS.includes(wLower) && TASK_START_KEYWORDS.includes(nextLower)) {
          splitIdx = i + 1;
          break;
        }
      }

      if (splitIdx > 0 && splitIdx < words.length) {
        const p1 = cleanClause(words.slice(0, splitIdx).join(' '));
        const p2 = cleanClause(words.slice(splitIdx).join(' '));
        if (p1) finalClauses.push(p1);
        if (p2) finalClauses.push(p2);
      } else {
        finalClauses.push(cleaned);
      }
    }

    return finalClauses.filter(clause => clause.length >= 2);
  }

  return {
    splitIntoClauses,
    cleanClause
  };
});
