/**
 * Türkçe Kural Tabanlı Anlamsal Çözümleyici (Parser) - Unicode Sınır Korumalı Sürüm
 * Görev cümlesinden Tarih, Saat, Kategori, Öncelik, Kişi, Mekan ve Başlık çıkarır.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Normalizer = require('./normalizer');
    module.exports = factory(Normalizer);
  } else {
    root.Parser = factory(root.Normalizer);
  }
})(typeof self !== 'undefined' ? self : this, function (Normalizer) {
  'use strict';

  function pad(num) {
    return String(num).padStart(2, '0');
  }

  function formatDateIso(dateObj) {
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function trWordRegex(word) {
    return new RegExp('(?:^|[^a-z0-9çğıöşü])' + escapeRegExp(word) + '(?=$|[^a-z0-9çğıöşü])', 'i');
  }

  class TaskParser {
    constructor(rules = {}) {
      this.categoriesRule = rules.categories || [];
      this.temporalRule = rules.temporal || {};
      this.numbersRule = rules.numbers || {};
      this.prioritiesRule = rules.priorities || {};
      this.entitiesRule = rules.entities || {};
    }

    /**
     * Tarih Çıkarımı
     */
    extractDate(clause, refDate = new Date()) {
      const lower = Normalizer.toLowerTr(clause);
      let targetDate = new Date(refDate);
      let detected = false;
      let isEstimated = false;
      let matchedText = '';

      // 1. Bağıl günler (bugün, yarın, öbür gün)
      const relDays = this.temporalRule.relative_days || {
        'bugün': 0, 'bugun': 0, 'bu gün': 0,
        'yarın': 1, 'yarin': 1,
        'öbür gün': 2, 'obur gun': 2, 'yarından sonra': 2
      };

      for (const [key, offset] of Object.entries(relDays)) {
        if (trWordRegex(key).test(lower)) {
          targetDate.setDate(targetDate.getDate() + offset);
          detected = true;
          isEstimated = false;
          matchedText = key;
          break;
        }
      }

      // 2. Haftanın günleri (Pazartesi, Salı, ...)
      if (!detected) {
        const weekdays = this.temporalRule.weekdays || {
          'pazartesi': 1, 'salı': 2, 'çarşamba': 3, 'perşembe': 4,
          'cuma': 5, 'cumartesi': 6, 'pazar': 7
        };

        const isNextWeek = /(?:^|[^a-z0-9çğıöşü])(haftaya|gelecek hafta|önümüzdeki hafta)(?=$|[^a-z0-9çğıöşü])/i.test(lower);

        for (const [dayName, dayIndex] of Object.entries(weekdays)) {
          if (trWordRegex(dayName).test(lower)) {
            const currentDayIndex = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
            let diff = dayIndex - currentDayIndex;
            if (diff <= 0) diff += 7;
            if (isNextWeek && diff < 7) diff += 7;

            targetDate.setDate(targetDate.getDate() + diff);
            detected = true;
            matchedText = (isNextWeek ? 'haftaya ' : '') + dayName;
            break;
          }
        }
      }

      // 3. Ayın günü ifadeleri: "ayın 15'i", "ayın 5'inde", "15 ekim"
      if (!detected) {
        const dayOfMonthMatch = lower.match(/ayın\s+(\d{1,2})('?([iea]|nde|nda|si|sı))?/i);
        if (dayOfMonthMatch) {
          const dayNum = parseInt(dayOfMonthMatch[1], 10);
          if (dayNum >= 1 && dayNum <= 31) {
            targetDate.setDate(dayNum);
            if (targetDate < refDate) {
              targetDate.setMonth(targetDate.getMonth() + 1);
            }
            detected = true;
            matchedText = dayOfMonthMatch[0];
          }
        }
      }

      // 4. Spesifik gün/ay: "15 ekim", "2 kasım"
      if (!detected) {
        const months = this.temporalRule.months || {
          'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4, 'mayıs': 5, 'haziran': 6,
          'temmuz': 7, 'ağustos': 8, 'eylül': 9, 'ekim': 10, 'kasım': 11, 'aralık': 12
        };

        for (const [mName, mIdx] of Object.entries(months)) {
          const mRegex = new RegExp(`(\\d{1,2})\\s+${mName}`, 'i');
          const mMatch = lower.match(mRegex);
          if (mMatch) {
            const dayNum = parseInt(mMatch[1], 10);
            targetDate.setMonth(mIdx - 1);
            targetDate.setDate(dayNum);
            detected = true;
            matchedText = mMatch[0];
            break;
          }
        }
      }

      // Varsayılan: Eğer tarih belirtilmediyse "bugün" kabul edilir
      if (!detected) {
        detected = true;
        isEstimated = true;
        matchedText = 'bugün';
      }

      return {
        dateStr: formatDateIso(targetDate),
        isEstimated,
        matchedText,
        confidence: isEstimated ? 0.6 : 0.95
      };
    }

    /**
     * Saat Çıkarımı (Türkçe Ek ve Kalıp Toleranslı)
     */
    extractTime(clause, refDate = new Date()) {
      let lower = Normalizer.toLowerTr(clause);
      lower = Normalizer.normalizeClockPhrases(lower);

      // 1. Sayısal Saat formatı: 15:30, 09:00, 14.30, 17:00
      const exactTimeMatch = lower.match(/(?:^|[^a-z0-9çğıöşü])([01]?\d|2[0-3])[:.]([0-5]\d)(?=$|[^a-z0-9çğıöşü])/i);
      if (exactTimeMatch) {
        const hour = pad(parseInt(exactTimeMatch[1], 10));
        const min = pad(parseInt(exactTimeMatch[2], 10));
        return {
          dueTime: `${hour}:${min}`,
          isEstimated: false,
          confidence: 1.0,
          matchedText: exactTimeMatch[0].trim()
        };
      }

      // 2. "saat üçte", "saat onda", "saat on birde"
      const clockWordMatch = lower.match(/saat\s+(\d{1,2})('?([dt][ea]|de|da|e|a))?/i);
      if (clockWordMatch) {
        let hour = parseInt(clockWordMatch[1], 10);
        if (hour >= 1 && hour <= 6) {
          hour += 12;
        }
        return {
          dueTime: `${pad(hour)}:00`,
          isEstimated: false,
          confidence: 0.95,
          matchedText: clockWordMatch[0]
        };
      }

      // 3. Bağıl süre: "yarım saat sonra", "1 saat sonra"
      if (/yarım\s+saat\s+sonra|yarim\s+saat\s+sonra/i.test(lower)) {
        const future = new Date(refDate.getTime() + 30 * 60000);
        return {
          dueTime: `${pad(future.getHours())}:${pad(future.getMinutes())}`,
          isEstimated: false,
          confidence: 0.95,
          matchedText: 'yarım saat sonra'
        };
      }

      if (/bir\s+saat\s+sonra|1\s+saat\s+sonra/i.test(lower)) {
        const future = new Date(refDate.getTime() + 60 * 60000);
        return {
          dueTime: `${pad(future.getHours())}:${pad(future.getMinutes())}`,
          isEstimated: false,
          confidence: 0.95,
          matchedText: '1 saat sonra'
        };
      }

      // 4. Gün bölümleri (Unicode uyumlu)
      const daypartPatterns = [
        { regex: /(?:^|[^a-z0-9çğıöşü])(öğleden sonra|ogleden sonra)(?=$|[^a-z0-9çğıöşü])/i, time: '14:30', est: true },
        { regex: /(?:^|[^a-z0-9çğıöşü])(öğle yemeğinde|öğle yemeği|ogle yemeginde|öğlen|öğle|ogle)(?=$|[^a-z0-9çğıöşü])/i, time: '12:30', est: true },
        { regex: /(?:^|[^a-z0-9çğıöşü])(sabah|sabaha|sabahleyin|erkenden)(?=$|[^a-z0-9çğıöşü])/i, time: '09:00', est: true },
        { regex: /(?:^|[^a-z0-9çğıöşü])(akşam|akşama|aksam|aksama|akşamleyin)(?=$|[^a-z0-9çğıöşü])/i, time: '19:00', est: true },
        { regex: /(?:^|[^a-z0-9çğıöşü])(ikindi|ikindiye)(?=$|[^a-z0-9çğıöşü])/i, time: '16:30', est: true },
        { regex: /(?:^|[^a-z0-9çğıöşü])(gece|geceleyin)(?=$|[^a-z0-9çğıöşü])/i, time: '21:30', est: true }
      ];

      for (const dp of daypartPatterns) {
        if (dp.regex.test(lower)) {
          return {
            dueTime: dp.time,
            isEstimated: dp.est,
            confidence: 0.75,
            matchedText: dp.regex.source
          };
        }
      }

      // Varsayılan saat
      return {
        dueTime: '14:00',
        isEstimated: true,
        confidence: 0.35,
        matchedText: null
      };
    }

    /**
     * Kategori Sınıflandırma (Morfolojik Kök + Fonetik Toleranslı)
     */
    extractCategory(clause) {
      const lower = Normalizer.toLowerTr(clause);
      const tokens = lower.split(/\s+/);
      const stemmedTokens = tokens.map(t => Normalizer.stripTurkishSuffixes(t.replace(/['’].*$/, '')));
      const categories = this.categoriesRule.length ? this.categoriesRule : [];

      let bestCat = 'genel';
      let bestName = 'Genel';
      let maxScore = 0;

      for (const cat of categories) {
        let score = 0;
        for (const kw of cat.keywords) {
          const kwLow = Normalizer.toLowerTr(kw);
          if (lower.includes(kwLow)) {
            const wordCount = kwLow.split(/\s+/).length;
            score += 4.0 * wordCount;
          } else if (kwLow.indexOf(' ') === -1) {
            // Tek kelimelik terimlerde morfolojik kök ve fonetik toleransı
            for (let i = 0; i < tokens.length; i++) {
              if (stemmedTokens[i] === kwLow) {
                score += 3.5;
                break;
              } else if (Normalizer.turkishPhoneticSimilarity(tokens[i], kwLow) >= 0.85) {
                score += 2.5;
                break;
              }
            }
          }
        }

        if (score > maxScore) {
          maxScore = score;
          bestCat = cat.id;
          bestName = cat.name;
        }
      }

      return {
        categoryId: bestCat,
        categoryName: bestName,
        confidence: maxScore > 0 ? Math.min(1.0, 0.6 + maxScore * 0.1) : 0.4
      };
    }

    /**
     * Öncelik Tespiti
     */
    extractPriority(clause, isDueToday = false) {
      const lower = Normalizer.toLowerTr(clause);
      const highKeywords = [
        'acil', 'acilen', 'hemen', 'mutlaka', 'çok önemli', 'cok onemli',
        'önemli', 'onemli', 'sakın unutma', 'sakin unutma', 'ilk iş', 'ilk is',
        'derhal', 'kritik', 'ivedi'
      ];
      const lowKeywords = [
        'fırsat bulursan', 'firsat bulursan', 'acelesi yok', 'zamanın olunca',
        'zamanin olunca', 'bir ara', 'sonra da olur', 'müsait olunca', 'musait olunca'
      ];

      for (const kw of highKeywords) {
        if (lower.includes(kw)) {
          return { priority: 'high', label: 'Yüksek', confidence: 0.95 };
        }
      }

      for (const kw of lowKeywords) {
        if (lower.includes(kw)) {
          return { priority: 'low', label: 'Düşük', confidence: 0.9 };
        }
      }

      return {
        priority: 'medium',
        label: 'Orta',
        confidence: 0.7
      };
    }

    /**
     * Kişi Çıkarımı
     */
    extractPerson(clause) {
      const honorificMatch = clause.match(/(?:(Avukat|Mimar|Mühendis|Usta|Doktor)\s+)?([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s+(Bey|Hanım)(?:'?[a-zçğıöşü]{1,4})?/i);
      if (honorificMatch) {
        const title = honorificMatch[1] ? Normalizer.capitalizeTr(honorificMatch[1]) + ' ' : '';
        const name = Normalizer.capitalizeTr(honorificMatch[2]);
        const honorific = Normalizer.capitalizeTr(honorificMatch[3]);
        return {
          person: `${title}${name} ${honorific}`.trim(),
          confidence: 0.96
        };
      }

      const commonNames = this.entitiesRule.common_names || [
        'ahmet', 'mehmet', 'ali', 'mustafa', 'ayşe', 'fatma', 'emine', 'zeynep'
      ];
      const words = clause.split(/\s+/);
      for (const w of words) {
        const cleanW = w.replace(/['’].*$/, '').toLowerCase();
        if (commonNames.includes(cleanW)) {
          return {
            person: Normalizer.capitalizeTr(cleanW),
            confidence: 0.8
          };
        }
      }

      return { person: null, confidence: 0.0 };
    }

    /**
     * Mekan / Yer Çıkarımı (Unicode ve Hal Eki Destekli)
     */
    extractPlace(clause) {
      const lower = Normalizer.toLowerTr(clause);
      const placeStems = [
        { stem: 'tapu dairesi', label: 'Tapu Dairesi' },
        { stem: 'vergi dairesi', label: 'Vergi Dairesi' },
        { stem: 'şantiye', label: 'Şantiye' },
        { stem: 'santiye', label: 'Şantiye' },
        { stem: 'belediye', label: 'Belediye' },
        { stem: 'kadastro', label: 'Kadastro' },
        { stem: 'noter', label: 'Noter' },
        { stem: 'banka', label: 'Banka' },
        { stem: 'plaza', label: 'Plaza' },
        { stem: 'ofis', label: 'Ofis' },
        { stem: 'villa', label: 'Villa' },
        { stem: 'daire', label: 'Daire' },
        { stem: 'arsa', label: 'Arsa' },
        { stem: 'tarla', label: 'Tarla' },
        { stem: 'tapu', label: 'Tapu' },
        { stem: 'site', label: 'Site' }
      ];

      for (const item of placeStems) {
        const regex = new RegExp('(?:^|[^a-z0-9çğıöşü])' + escapeRegExp(item.stem) + '(?:\'?([dt][ea]|den|dan|[yt][ea]|e|a|nin|nın|in|ın|si|sı|ne|nde|nden|leri|ları))?(?=$|[^a-z0-9çğıöşü])', 'i');
        if (regex.test(lower)) {
          return {
            place: item.label,
            confidence: 0.92
          };
        }
      }

      return { place: null, confidence: 0.0 };
    }

    /**
     * Eylem Odaklı, Kısa Başlık Üretimi
     */
    generateTitle(clause, category, person, place) {
      let clean = clause.trim();

      const filterWords = [
        'bugün', 'bugun', 'yarın', 'yarin', 'öbür gün', 'obur gun', 'haftaya', 
        'saat', 'üçte', 'üç buçukta', 'akşam', 'aksam', 'sabah', 'öğlen', 'oglen', 
        'gece', 'var', 'lazım', 'gerek', 'bir de', 'ayrıca', 'sonra', 'acilen', 
        'acil', 'mutlaka', 'çok önemli', 'yapılacak', 'edilecek'
      ];

      const tokens = clean.split(/\s+/);
      const filteredTokens = tokens.filter(t => {
        const tLow = Normalizer.toLowerTr(t).replace(/[.,;:!?]/g, '');
        return !filterWords.includes(tLow) && !/^\d{1,2}[:.]\d{2}$/.test(tLow);
      });

      let candidateTitle = filteredTokens.join(' ').replace(/[.,;:!?]$/, '').trim();

      if (candidateTitle.length < 3) {
        if (person && category.id === 'arama') {
          return `${person}'i Ara`;
        }
        if (place) {
          return `${place} ${category.name}`;
        }
        return `${category.name} Görevi`;
      }

      return Normalizer.toTitleCaseTr(candidateTitle);
    }

    /**
     * Tek Bir Cümleyi Parse Et
     */
    parseClause(clause, refDate = new Date()) {
      const dateRes = this.extractDate(clause, refDate);
      const timeRes = this.extractTime(clause, refDate);
      const catRes = this.extractCategory(clause);
      const isToday = dateRes.dateStr === formatDateIso(refDate);
      const prioRes = this.extractPriority(clause, isToday);
      const personRes = this.extractPerson(clause);
      const placeRes = this.extractPlace(clause);

      const title = this.generateTitle(
        clause,
        { id: catRes.categoryId, name: catRes.categoryName },
        personRes.person,
        placeRes.place
      );

      const tags = [];
      if (catRes.categoryId !== 'genel') tags.push(catRes.categoryId);
      if (placeRes.place) tags.push(Normalizer.toLowerTr(placeRes.place));
      if (prioRes.priority === 'high') tags.push('acil');

      const overallConfidence = parseFloat((
        (dateRes.confidence * 0.25) +
        (timeRes.confidence * 0.25) +
        (catRes.confidence * 0.30) +
        (prioRes.confidence * 0.20)
      ).toFixed(2));

      return {
        title,
        raw_text: clause,
        category: catRes.categoryName,
        category_id: catRes.categoryId,
        due_date: dateRes.dateStr,
        due_time: timeRes.dueTime,
        is_date_estimated: dateRes.isEstimated,
        is_time_estimated: timeRes.isEstimated,
        priority: prioRes.priority,
        person: personRes.person,
        place: placeRes.place,
        tags,
        confidence: {
          overall: overallConfidence,
          date: dateRes.confidence,
          time: timeRes.confidence,
          category: catRes.confidence,
          priority: prioRes.confidence
        }
      };
    }
  }

  return TaskParser;
});
