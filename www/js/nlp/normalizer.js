/**
 * Türkçe Metin Normalizasyon ve Bulanık Eşleştirme Modülü
 * - Dotted/dotless I ve Türkçe karakter desteği
 * - Levenshtein mesafesi ile ses tanıma hatası toleransı
 * - Türkçe yazılı sayıları sayısal değerlere dönüştürme
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Normalizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TURKISH_LOWER_MAP = {
    'I': 'ı', 'İ': 'i', 'Ş': 'ş', 'Ğ': 'ğ', 'Ü': 'ü', 'Ö': 'ö', 'Ç': 'ç'
  };

  const TURKISH_UPPER_MAP = {
    'ı': 'I', 'i': 'İ', 'ş': 'Ş', 'ğ': 'Ğ', 'ü': 'Ü', 'ö': 'Ö', 'ç': 'Ç'
  };

  const ASCII_MAP = {
    'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'ı': 'i',
    'Ş': 's', 'Ğ': 'g', 'Ü': 'u', 'Ö': 'o', 'Ç': 'c', 'İ': 'i', 'I': 'i'
  };

  function toLowerTr(text) {
    if (!text) return '';
    return text.replace(/[IİŞĞÜÖÇ]/g, ch => TURKISH_LOWER_MAP[ch] || ch).toLowerCase();
  }

  function toUpperTr(text) {
    if (!text) return '';
    return text.replace(/[ıişğüöç]/g, ch => TURKISH_UPPER_MAP[ch] || ch).toUpperCase();
  }

  function capitalizeTr(text) {
    if (!text) return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    const firstChar = trimmed[0];
    const upperFirst = TURKISH_UPPER_MAP[firstChar] || firstChar.toUpperCase();
    return upperFirst + toLowerTr(trimmed.slice(1));
  }

  function toTitleCaseTr(text) {
    if (!text) return '';
    return text.split(/\s+/).map(word => capitalizeTr(word)).join(' ');
  }

  function toAscii(text) {
    if (!text) return '';
    return text.replace(/[şğüöçıŞĞÜÖÇİI]/g, ch => ASCII_MAP[ch] || ch);
  }

  /**
   * Levenshtein Mesafesi hesaplama (O(M*N) bellek optimizasyonlu)
   */
  function levenshtein(s1, s2) {
    const a = toLowerTr(s1 || '');
    const b = toLowerTr(s2 || '');
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prevRow = new Array(b.length + 1);
    let currRow = new Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      currRow[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,      // silme
          currRow[j - 1] + 1,  // ekleme
          prevRow[j - 1] + cost // değiştirme
        );
      }
      for (let j = 0; j <= b.length; j++) {
        prevRow[j] = currRow[j];
      }
    }
    return prevRow[b.length];
  }

  /**
   * Bulanık Eşleşme Skoru (0.0 - 1.0)
   */
  function fuzzySimilarity(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const dist = levenshtein(s1, s2);
    return Math.max(0, 1 - dist / maxLen);
  }

  function isFuzzyMatch(word, target, threshold = 0.75) {
    if (!word || !target) return false;
    const wLow = toLowerTr(word);
    const tLow = toLowerTr(target);
    if (wLow === tLow) return true;
    if (toAscii(wLow) === toAscii(tLow)) return true;
    return fuzzySimilarity(wLow, tLow) >= threshold;
  }

  /**
   * Türkçe Sayı Kelimeleri Tablosu
   */
  const NUMBER_WORDS = {
    'sıfır': 0, 'sifir': 0,
    'bir': 1, 'tek': 1,
    'iki': 2,
    'üç': 3, 'uc': 3,
    'dört': 4, 'dort': 4,
    'beş': 5, 'bes': 5,
    'altı': 6, 'alti': 6,
    'yedi': 7,
    'sekiz': 8,
    'dokuz': 9,
    'on': 10,
    'yirmi': 20,
    'otuz': 30,
    'kırk': 40, 'kirk': 40,
    'elli': 50,
    'altmış': 60, 'altmis': 60,
    'yetmiş': 70, 'yetmis': 70,
    'seksen': 80,
    'doksan': 90,
    'yüz': 100, 'yuz': 100,
    'bin': 1000
  };

  /**
   * "on beş", "yirmi üç", "üç yüz elli" gibi kelime gruplarını sayıya dönüştürür.
   */
  function parseSpokenNumber(text) {
    if (!text) return null;
    const tokens = toLowerTr(text).trim().split(/\s+/);
    let total = 0;
    let current = 0;
    let matchedAny = false;

    for (const token of tokens) {
      if (NUMBER_WORDS[token] !== undefined) {
        matchedAny = true;
        const val = NUMBER_WORDS[token];
        if (val === 100) {
          current = (current === 0 ? 1 : current) * 100;
        } else if (val === 1000) {
          current = (current === 0 ? 1 : current) * 1000;
          total += current;
          current = 0;
        } else {
          current += val;
        }
      } else {
        return matchedAny ? total + current : null;
      }
    }
    return matchedAny ? total + current : null;
  }

  /**
   * Türkçe Fonetik Karakter Değişim Maliyeti (Vosk / STT Hata Toleransı)
   */
  const PHONETIC_MAP = {
    'c': 'ç', 'ç': 'c',
    's': 'ş', 'ş': 's',
    'g': 'ğ', 'ğ': 'g',
    'i': 'ı', 'ı': 'i',
    'o': 'ö', 'ö': 'o',
    'u': 'ü', 'ü': 'u',
    'p': 'b', 'b': 'p',
    't': 'd', 'd': 't',
    'k': 'g', 'f': 'v', 'v': 'f'
  };

  function charCostTr(c1, c2) {
    if (c1 === c2) return 0;
    if (PHONETIC_MAP[c1] === c2) return 0.25;
    if (toAscii(c1) === toAscii(c2)) return 0.2;
    return 1.0;
  }

  /**
   * Türkçe Fonetik Ağırlıklı Levenshtein Mesafesi
   */
  function turkishPhoneticDistance(s1, s2) {
    const a = toLowerTr(s1 || '');
    const b = toLowerTr(s2 || '');
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = charCostTr(a[i - 1], b[j - 1]);
        curr[j] = Math.min(
          prev[j] + 1,       // silme
          curr[j - 1] + 1,   // ekleme
          prev[j - 1] + cost // fonetik değiştirme
        );
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function turkishPhoneticSimilarity(s1, s2) {
    const maxLen = Math.max((s1 || '').length, (s2 || '').length);
    if (maxLen === 0) return 1.0;
    const dist = turkishPhoneticDistance(s1, s2);
    return Math.max(0, 1 - dist / maxLen);
  }

  /**
   * Kural Tabanlı Türk Morfolojik Ek Sıyırıcı (Lightweight Lemmatizer)
   * Sondan eklemeli yapıda kökü koruyarak hal, iyelik ve çoğul eklerini temizler.
   */
  const COMMON_TR_SUFFIX_PATTERNS = [
    /(?:lerinden|larındaki|lerindeki|larınızdan|lerimizden)$/i,
    /(?:leriyle|larıyla|lerinin|larının|lerine|larına|lerinde|larında)$/i,
    /(?:sinden|sından|sindeki|sındaki| sindeki|sındakı)$/i,
    /(?:inizden|ınızdan|ümüzden|umuzdan)$/i,
    /(?:inden|ından|unden|ünden|ınde|inde|ünde|unda|ine|ına|une|üne|ini|ını|unu|ünü)$/i,
    /(?:siyle|sıyla|suyla|süyle|sine|sına|side|sıda|sini|sını)$/i,
    /(?:mizden|mızdan|müzden|muzdan|mize|mıza|müze|muza)$/i,
    /(?:([y])?(le|la))$/i,
    /(?:den|dan|ten|tan)$/i,
    /(?:de|da|te|ta)$/i,
    /(?:([y])?(e|a))$/i,
    /(?:([y])?(i|ı|u|ü))$/i,
    /(?:([n])?(in|ın|un|ün))$/i,
    /(?:ler|lar)$/i,
    /(?:([s])?(i|ı|u|ü))$/i,
    /(?:im|ım|um|üm|in|ın|un|ün)$/i
  ];

  function stripTurkishSuffixes(word, minRootLength = 3) {
    if (!word || word.length <= minRootLength) return word;
    let w = toLowerTr(word);
    for (const pattern of COMMON_TR_SUFFIX_PATTERNS) {
      const stripped = w.replace(pattern, '');
      if (stripped.length >= minRootLength && stripped !== w) {
        // Yumuşama geri dönüşümü (senet/senedi, borç/borcu, kapak/kapağı)
        let root = stripped;
        if (root.endsWith('ğ')) root = root.slice(0, -1) + 'k';
        else if (root.endsWith('b')) root = root.slice(0, -1) + 'p';
        else if (root.endsWith('c')) root = root.slice(0, -1) + 'ç';
        else if (root.endsWith('d')) root = root.slice(0, -1) + 't';
        return root;
      }
    }
    return w;
  }

  /**
   * Metin içerisindeki yazılı saat ifadelerini standartlaştırır.
   * Unicode sınır korumalı, "üç buçukta" -> "15:30", "çeyrek kala", vb.
   */
  function normalizeClockPhrases(text) {
    let s = text;
    const boundary = (pattern, rep) => {
      const r = new RegExp('(?:^|[^a-z0-9çğıöşü])' + pattern + '(?=$|[^a-z0-9çğıöşü])', 'gi');
      s = s.replace(r, (match) => {
        const lead = match[0].match(/[a-z0-9çğıöşü]/i) ? '' : match[0];
        const trail = match[match.length - 1].match(/[a-z0-9çğıöşü]/i) ? '' : match[match.length - 1];
        return lead + rep + trail;
      });
    };

    // Buçuklu ifadeler
    boundary('üç buçukta', '15:30 da');
    boundary('uc bucukta', '15:30 da');
    boundary('dört buçukta', '16:30 da');
    boundary('dort bucukta', '16:30 da');
    boundary('beş buçukta', '17:30 da');
    boundary('bes bucukta', '17:30 da');
    boundary('iki buçukta', '14:30 da');
    boundary('iki bucukta', '14:30 da');
    boundary('bir buçukta', '13:30 da');
    boundary('bir bucukta', '13:30 da');
    boundary('on buçukta', '10:30 da');
    boundary('on bir buçukta', '11:30 da');
    boundary('on iki buçukta', '12:30 da');

    // Saat tamlamaları
    boundary('saat üçte', 'saat 15:00');
    boundary('saat ucte', 'saat 15:00');
    boundary('saat dörtte', 'saat 16:00');
    boundary('saat dortte', 'saat 16:00');
    boundary('saat beşte', 'saat 17:00');
    boundary('saat beste', 'saat 17:00');
    boundary('saat altıda', 'saat 18:00');
    boundary('saat altida', 'saat 18:00');
    boundary('saat yedide', 'saat 19:00');
    boundary('saat sekizde', 'saat 20:00');
    boundary('saat dokuzda', 'saat 09:00');
    boundary('saat onda', 'saat 10:00');
    boundary('saat on birde', 'saat 11:00');
    boundary('saat on ikide', 'saat 12:00');
    boundary('saat birde', 'saat 13:00');
    boundary('saat ikide', 'saat 14:00');

    return s;
  }

  return {
    toLowerTr,
    toUpperTr,
    capitalizeTr,
    toTitleCaseTr,
    toAscii,
    levenshtein,
    fuzzySimilarity,
    isFuzzyMatch,
    turkishPhoneticDistance,
    turkishPhoneticSimilarity,
    stripTurkishSuffixes,
    parseSpokenNumber,
    normalizeClockPhrases,
    NUMBER_WORDS
  };
});
