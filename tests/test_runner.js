/**
 * Node.js Türkçe NLP Test Çalıştırıcısı (Test Runner)
 * 32 test senaryosunu kurallar üzerinde koşturur ve doğruluk oranını raporlar.
 */

const fs = require('fs');
const path = require('path');

const Normalizer = require('../www/js/nlp/normalizer');
const Tokenizer = require('../www/js/nlp/tokenizer');
const Parser = require('../www/js/nlp/parser');
const NlpEngine = require('../www/js/nlp/nlpEngine');

function loadRules() {
  const categories = JSON.parse(fs.readFileSync(path.join(__dirname, '../rules/categories.json'), 'utf-8')).categories;
  const temporal = JSON.parse(fs.readFileSync(path.join(__dirname, '../rules/temporal.json'), 'utf-8'));
  const numbers = JSON.parse(fs.readFileSync(path.join(__dirname, '../rules/numbers.json'), 'utf-8'));
  const priorities = JSON.parse(fs.readFileSync(path.join(__dirname, '../rules/priorities.json'), 'utf-8'));
  const entities = JSON.parse(fs.readFileSync(path.join(__dirname, '../rules/entities.json'), 'utf-8'));

  return { categories, temporal, numbers, priorities, entities };
}

async function runTests() {
  console.log('====================================================');
  console.log('   SESLİ GÖREV ASİSTANI - TÜRKÇE NLP TEST KOŞUCUSU   ');
  console.log('====================================================\n');

  const rules = loadRules();
  const engine = new NlpEngine();
  await engine.init(rules);

  const testCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'nlp_test_cases.json'), 'utf-8'));
  const fixedRefDate = new Date(2026, 9, 11, 10, 0, 0); // 11 Ekim 2026 Pazar

  let passedCases = 0;
  let totalTasksExpected = 0;
  let totalTasksGenerated = 0;
  const startTime = Date.now();

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    const generatedTasks = engine.processTranscript(tc.input, null, fixedRefDate);
    totalTasksExpected += tc.expected_task_count;
    totalTasksGenerated += generatedTasks.length;

    let casePassed = true;
    const errors = [];

    // Görev sayısı kontrolü
    if (generatedTasks.length !== tc.expected_task_count) {
      casePassed = false;
      errors.push(`Görev sayısı uyuşmuyor: Beklenen=${tc.expected_task_count}, Üretilen=${generatedTasks.length}`);
    }

    // Her beklenen görev için alan kontrolleri
    for (let tIdx = 0; tIdx < Math.min(generatedTasks.length, tc.tasks.length); tIdx++) {
      const exp = tc.tasks[tIdx];
      const act = generatedTasks[tIdx];

      if (exp.category && exp.category !== act.category) {
        casePassed = false;
        errors.push(`[G${tIdx + 1}] Kategori uyuşmuyor: Beklenen="${exp.category}", Gelen="${act.category}"`);
      }

      if (exp.due_time && exp.due_time !== act.due_time) {
        casePassed = false;
        errors.push(`[G${tIdx + 1}] Saat uyuşmuyor: Beklenen="${exp.due_time}", Gelen="${act.due_time}"`);
      }

      if (exp.priority && exp.priority !== act.priority) {
        casePassed = false;
        errors.push(`[G${tIdx + 1}] Öncelik uyuşmuyor: Beklenen="${exp.priority}", Gelen="${act.priority}"`);
      }

      if (exp.person && (!act.person || !act.person.toLowerCase().includes(exp.person.toLowerCase()))) {
        casePassed = false;
        errors.push(`[G${tIdx + 1}] Kişi uyuşmuyor: Beklenen="${exp.person}", Gelen="${act.person}"`);
      }

      if (exp.place && (!act.place || !act.place.toLowerCase().includes(exp.place.toLowerCase()))) {
        casePassed = false;
        errors.push(`[G${tIdx + 1}] Mekan uyuşmuyor: Beklenen="${exp.place}", Gelen="${act.place}"`);
      }
    }

    if (casePassed) {
      passedCases++;
      console.log(`[PASS] ${tc.id}: "${tc.input}" -> ${generatedTasks.length} görev OK`);
    } else {
      console.log(`[FAIL] ${tc.id}: "${tc.input}"`);
      for (const err of errors) {
        console.log(`       -> Hata: ${err}`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const passRate = ((passedCases / testCases.length) * 100).toFixed(1);

  console.log('\n---------------- TEST SONUÇLARI ----------------');
  console.log(`Toplam Test Senaryosu : ${testCases.length}`);
  console.log(`Başarılı Senaryo     : ${passedCases}`);
  console.log(`Başarı Oranı          : %${passRate}`);
  console.log(`Toplam Üretilen Görev: ${totalTasksGenerated} (Beklenen: ${totalTasksExpected})`);
  console.log(`Test Koşu Süresi      : ${durationMs} ms`);
  console.log('------------------------------------------------\n');

  if (passedCases === testCases.length) {
    console.log('>>> TÜM TÜRKÇE NLP TESTLERİ BAŞARIYLA GEÇTİ! <<<');
    process.exit(0);
  } else {
    console.warn(`>>> ${testCases.length - passedCases} TEST BAŞARISIZ OLDU. <<<`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});
