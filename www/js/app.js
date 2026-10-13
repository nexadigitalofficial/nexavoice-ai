/**
 * Sesli Görev Asistanı - Ana Uygulama Mantığı ve UI Kontrolcüsü
 * %100 Offline, Sıfır Dış Bağımlılık
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // --- REFERANSLAR ---
  const btnTalk = document.getElementById('btnTalk');
  const micWrapper = document.getElementById('micWrapper');
  const micLabel = document.getElementById('micLabel');
  const liveTranscript = document.getElementById('liveTranscript');
  const recordingTimer = document.getElementById('recordingTimer');
  const timerText = document.getElementById('timerText');
  const waveformCanvas = document.getElementById('waveformCanvas');
  const taskFeed = document.getElementById('taskFeed');
  const searchInput = document.getElementById('searchInput');
  const btnVoiceSearch = document.getElementById('btnVoiceSearch');
  const undoSnackbar = document.getElementById('undoSnackbar');
  const undoText = document.getElementById('undoText');
  const btnUndo = document.getElementById('btnUndo');

  // Modallar
  const settingsModal = document.getElementById('settingsModal');
  const exportModal = document.getElementById('exportModal');
  const editModal = document.getElementById('editModal');
  const btnSettingsModal = document.getElementById('btnSettingsModal');
  const btnExportModal = document.getElementById('btnExportModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCloseExport = document.getElementById('btnCloseExport');
  const btnCloseEdit = document.getElementById('btnCloseEdit');

  // Ayarlar
  const settingVibration = document.getElementById('settingVibration');
  const settingAutoSilence = document.getElementById('settingAutoSilence');
  const settingHoldMode = document.getElementById('settingHoldMode');
  const settingDarkTheme = document.getElementById('settingDarkTheme');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // Gemini AI Ayarları ve Başlık Etiketi
  const headerEngineTag = document.getElementById('headerEngineTag');
  const settingGeminiEnabled = document.getElementById('settingGeminiEnabled');
  const geminiConfigPanel = document.getElementById('geminiConfigPanel');
  const inputGeminiKey = document.getElementById('inputGeminiKey');
  const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');
  const btnTestGeminiKey = document.getElementById('btnTestGeminiKey');
  const geminiTestStatus = document.getElementById('geminiTestStatus');
  const selectGeminiModel = document.getElementById('selectGeminiModel');

  // Dışa Aktarma
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportJson = document.getElementById('btnExportJson');
  const importJsonInput = document.getElementById('importJsonInput');

  // Görev Düzenleme Formu
  const editTaskId = document.getElementById('editTaskId');
  const editTitle = document.getElementById('editTitle');
  const editDate = document.getElementById('editDate');
  const editTime = document.getElementById('editTime');
  const editPerson = document.getElementById('editPerson');
  const editPlace = document.getElementById('editPlace');
  const editCategory = document.getElementById('editCategory');
  const btnSaveTask = document.getElementById('btnSaveTask');

  // Sekmeler
  const tabButtons = document.querySelectorAll('.tab-button');
  const badgeToday = document.getElementById('badgeToday');
  const badgeTomorrow = document.getElementById('badgeTomorrow');
  const badgeWeek = document.getElementById('badgeWeek');
  const badgeCompleted = document.getElementById('badgeCompleted');

  // --- DURUM DEĞİŞKENLERİ ---
  let currentTab = 'today';
  let isRecording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let lastCreatedTasks = [];
  let undoTimeout = null;
  let isVoiceSearching = false;
  let audioPlayer = null;

  // Ayarların Yüklenmesi
  const userSettings = {
    vibration: localStorage.getItem('vibration') !== 'false',
    autoSilence: localStorage.getItem('autoSilence') !== 'false',
    holdMode: localStorage.getItem('holdMode') === 'true',
    darkTheme: localStorage.getItem('darkTheme') !== 'false'
  };

  // Ayarları UI'a yansıt
  settingVibration.checked = userSettings.vibration;
  settingAutoSilence.checked = userSettings.autoSilence;
  settingHoldMode.checked = userSettings.holdMode;
  settingDarkTheme.checked = userSettings.darkTheme;
  document.documentElement.setAttribute('data-theme', userSettings.darkTheme ? 'dark' : 'light');

  // --- GEMINI AI & MOTOR YÖNETİMİ ---
  function isGeminiActive() {
    return Boolean(window.GeminiService && GeminiService.isReady());
  }

  function updateEngineUI() {
    const active = isGeminiActive();
    if (active) {
      if (headerEngineTag) {
        headerEngineTag.textContent = 'Gemini AI Aktif ⚡';
        headerEngineTag.style.color = '#38BDF8';
        headerEngineTag.classList.add('engine-active-glow');
      }
      if (geminiConfigPanel) geminiConfigPanel.style.opacity = '1';
    } else {
      if (headerEngineTag) {
        headerEngineTag.textContent = '%100 Çevrimdışı (Vosk)';
        headerEngineTag.style.color = 'var(--accent-emerald)';
        headerEngineTag.classList.remove('engine-active-glow');
      }
      if (geminiConfigPanel) {
        geminiConfigPanel.style.opacity = (settingGeminiEnabled && settingGeminiEnabled.checked) ? '1' : '0.5';
      }
    }
  }

  if (window.GeminiService) {
    if (inputGeminiKey) inputGeminiKey.value = GeminiService.getApiKey();
    if (selectGeminiModel) selectGeminiModel.value = GeminiService.getModel();
    if (settingGeminiEnabled) settingGeminiEnabled.checked = GeminiService.isEnabled;
  }
  updateEngineUI();

  if (btnToggleKeyVisibility && inputGeminiKey) {
    btnToggleKeyVisibility.addEventListener('click', () => {
      if (inputGeminiKey.type === 'password') {
        inputGeminiKey.type = 'text';
        btnToggleKeyVisibility.textContent = '🔒';
      } else {
        inputGeminiKey.type = 'password';
        btnToggleKeyVisibility.textContent = '👁';
      }
    });
  }

  if (btnTestGeminiKey && inputGeminiKey) {
    btnTestGeminiKey.addEventListener('click', async () => {
      const key = inputGeminiKey.value.trim();
      if (!key) {
        geminiTestStatus.innerHTML = '<span style="color: #EF4444;">Lütfen bir API anahtarı girin.</span>';
        return;
      }
      geminiTestStatus.innerHTML = '<span style="color: #38BDF8;">Bağlantı test ediliyor...</span>';
      try {
        GeminiService.setApiKey(key);
        if (selectGeminiModel) GeminiService.setModel(selectGeminiModel.value);
        await GeminiService.testConnection(key);
        geminiTestStatus.innerHTML = '<span style="color: #10B981; font-weight: 600;">✓ Başarılı! Gemini API bağlandı.</span>';
        updateEngineUI();
      } catch (err) {
        geminiTestStatus.innerHTML = `<span style="color: #EF4444;">✕ Hata: ${escapeHtml(err.message)}</span>`;
      }
    });
  }

  if (settingGeminiEnabled) {
    settingGeminiEnabled.addEventListener('change', () => {
      if (window.GeminiService) GeminiService.setEnabled(settingGeminiEnabled.checked);
      updateEngineUI();
    });
  }

  // Web Speech API ile canlı anlık önizleme (Gemini kaydı sırasında opsiyonel)
  let interimSpeechRecognizer = null;

  function startInterimRecognizer() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      interimSpeechRecognizer = new SpeechRec();
      interimSpeechRecognizer.lang = 'tr-TR';
      interimSpeechRecognizer.continuous = true;
      interimSpeechRecognizer.interimResults = true;
      interimSpeechRecognizer.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          interim += event.results[i][0].transcript;
        }
        if (interim && isRecording) {
          liveTranscript.textContent = `"${interim}"`;
        }
      };
      interimSpeechRecognizer.onerror = () => {};
      interimSpeechRecognizer.start();
    } catch (_) {}
  }

  function stopInterimRecognizer() {
    if (interimSpeechRecognizer) {
      try { interimSpeechRecognizer.stop(); } catch (_) {}
      interimSpeechRecognizer = null;
    }
  }

  // --- MOTORLARIN BAŞLATILMASI ---
  const nlp = new NlpEngine();
  await Promise.all([
    AppDatabase.init(),
    nlp.init(),
    VoiceManager.init()
  ]);

  VoiceManager.autoSilenceStopEnabled = userSettings.autoSilence;

  // İlk açılışta mikrofon iznini iste (kullanıcı konuş butonuna bastığında beklemesin)
  if (VoiceManager.isNative) {
    setTimeout(() => {
      VoiceManager.requestAudioPermission().catch(() => {});
    }, 400);
  }

  // Titreşim Yardımcısı
  function triggerHaptic(duration = 60) {
    if (!userSettings.vibration) return;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        window.Capacitor.Plugins.Haptics.vibrate({ duration });
      } else if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {}
  }

  // --- SES DALGASI GÖRSELLEŞTİRİCİSİ (CANVAS) ---
  const canvasCtx = waveformCanvas.getContext('2d');
  let wavePhase = 0;

  function drawWaveform() {
    canvasCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    const midY = height / 2;

    if (!isRecording) {
      // Düz çizgi (Bekleme)
      canvasCtx.beginPath();
      canvasCtx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
      canvasCtx.lineWidth = 2;
      canvasCtx.moveTo(0, midY);
      canvasCtx.lineTo(width, midY);
      canvasCtx.stroke();
    } else {
      // Canlı Nabız Dalgası
      canvasCtx.beginPath();
      const useGemini = isGeminiActive();
      canvasCtx.strokeStyle = useGemini ? '#38BDF8' : '#10B981';
      canvasCtx.lineWidth = 3;

      let baseAmp = 12;
      if (useGemini && window.AudioRecorder) {
        const audioLevel = AudioRecorder.getAudioLevel();
        baseAmp = 6 + (audioLevel * 30);
      }

      for (let x = 0; x < width; x++) {
        const amplitude = baseAmp * Math.sin((x * 0.05) + wavePhase) * Math.sin(x * 0.02);
        const y = midY + amplitude;
        if (x === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
      }
      canvasCtx.stroke();
      wavePhase += 0.15;
    }

    requestAnimationFrame(drawWaveform);
  }
  drawWaveform();

  // --- SÜRE SAYACI ---
  function startTimer() {
    timerSeconds = 0;
    timerText.textContent = '00:00';
    recordingTimer.classList.add('active');
    timerInterval = setInterval(() => {
      timerSeconds++;
      const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
      const s = String(timerSeconds % 60).padStart(2, '0');
      timerText.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recordingTimer.classList.remove('active');
  }

  // --- SES ETKİLEŞİM DÖNGÜSÜ ---
  async function startRecording() {
    if (isRecording) return;
    const useGemini = isGeminiActive();

    // Çevrimdışı Vosk modunda model henüz hazır değilse uyar
    if (!useGemini && !VoiceManager.isModelLoaded) {
      liveTranscript.textContent = 'Çevrimdışı dil modeli hazırlanıyor, lütfen 2-3 saniye bekleyin...';
      triggerHaptic(40);
      return;
    }

    try {
      triggerHaptic(80);
      isRecording = true;
      micWrapper.classList.add('listening');
      micLabel.textContent = 'DURDUR';
      liveTranscript.classList.add('active');
      liveTranscript.textContent = useGemini ? 'Dinleniyor (Gemini AI)... Konuşun...' : 'Dinleniyor... Konuşun...';
      startTimer();

      if (useGemini) {
        await AudioRecorder.start();
        startInterimRecognizer();
      } else {
        await VoiceManager.startListening();
      }
    } catch (err) {
      console.error('[App] Kayıt başlatılamadı:', err);
      stopRecordingUI();
      const errDetail = err && (err.message || (typeof err === 'string' ? err : JSON.stringify(err))) ? (err.message || err) : 'Mikrofon başlatılamadı. İzin verildiğinden emin olun.';
      alert(errDetail);
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    triggerHaptic(80);
    stopTimer();
    micWrapper.classList.remove('listening');
    micWrapper.classList.add('processing');

    const useGemini = isGeminiActive();

    if (useGemini) {
      micLabel.textContent = 'YAPAY ZEKA...';
      liveTranscript.textContent = 'Gemini AI sesi analiz ediyor ve organize ediyor...';
      stopInterimRecognizer();

      try {
        const audioResult = await AudioRecorder.stop();

        if (!audioResult.base64 || audioResult.durationMs < 400) {
          stopRecordingUI();
          liveTranscript.textContent = 'Ses kaydı çok kısa veya algılanamadı.';
          return;
        }

        const { transcript, tasks } = await GeminiService.processAudio(
          audioResult.base64,
          audioResult.mimeType
        );

        await handleCreatedTasks(tasks, transcript, audioResult.audioUrl, audioResult.durationMs);
      } catch (err) {
        console.error('[Gemini İşleme Hatası]', err);
        liveTranscript.textContent = 'Gemini Hatası: ' + (err.message || 'Yanıt alınamadı');
        alert('Gemini Hatası: ' + err.message + '\nİnternet bağlantınızı veya API anahtarınızı kontrol edin.');
      } finally {
        stopRecordingUI();
      }
    } else {
      micLabel.textContent = 'İŞLENİYOR';
      liveTranscript.textContent = 'Anlaşılıyor ve organize ediliyor...';
      await VoiceManager.stopListening();
    }
  }

  function stopRecordingUI() {
    isRecording = false;
    stopTimer();
    micWrapper.classList.remove('listening', 'processing');
    micLabel.textContent = (isGeminiActive() || VoiceManager.isModelLoaded) ? 'KONUŞ' : 'YÜKLENİYOR...';
    liveTranscript.classList.remove('active');
  }

  async function handleCreatedTasks(newTasks, transcript, audioPath, durationMs = 0) {
    if (isVoiceSearching) {
      isVoiceSearching = false;
      searchInput.value = transcript;
      renderCurrentFeed();
      liveTranscript.textContent = `Arama yapıldı: "${transcript}"`;
      return;
    }

    if (!transcript || transcript.trim().length < 2) {
      liveTranscript.textContent = 'Hiçbir konuşma algılanmadı. Lütfen tekrar deneyin.';
      return;
    }

    liveTranscript.textContent = `Tamamlandı: "${transcript}"`;

    if (!newTasks || newTasks.length === 0) {
      liveTranscript.textContent = `"${transcript}" - Metinden görev çıkarılamadı.`;
      return;
    }

    // 1. Ham ses kaydını sakla
    await AppDatabase.addRecording({
      id: 'rec_' + Date.now().toString(36),
      audio_path: audioPath || '',
      duration_ms: durationMs || (timerSeconds * 1000),
      transcript: transcript,
      created_at: new Date().toISOString()
    });

    // 2. Veritabanına kaydet
    await AppDatabase.addTasks(newTasks);
    lastCreatedTasks = newTasks;

    // 3. Yerel bildirimleri planla
    for (const task of newTasks) {
      ReminderService.scheduleTaskReminder(task);
    }

    // 4. Ekranı yenile ve Geri Al Snackbar'ını göster
    await refreshFeedAndBadges();
    const engineName = isGeminiActive() ? 'Gemini AI' : 'Vosk';
    showUndoSnackbar(`${newTasks.length} yeni görev organize edildi (${engineName}).`);
  }

  // Model Durumu Bildirimi
  VoiceManager.onModelStatusCallback = (status, message) => {
    if (status === 'loading') {
      if (!isGeminiActive()) {
        micLabel.textContent = 'YÜKLENİYOR...';
        micWrapper.classList.add('processing');
      }
      liveTranscript.textContent = message;
    } else if (status === 'ready') {
      if (!isGeminiActive()) {
        micLabel.textContent = 'KONUŞ';
        micWrapper.classList.remove('processing');
      }
      liveTranscript.textContent = 'Model hazır! Konuşmak için butona dokunun.';
      const statusText = document.getElementById('modelStatusText');
      if (statusText) statusText.textContent = 'Durum: Yüklü ve Hazır (~45 MB)';
    } else if (status === 'error') {
      if (!isGeminiActive()) {
        micLabel.textContent = 'HATA';
      }
      liveTranscript.textContent = message;
    }
  };

  // VoiceManager Geri Çağrıları
  VoiceManager.onPartialResultCallback = (partialText) => {
    if (!partialText) return;
    liveTranscript.textContent = `"${partialText}"`;
  };

  VoiceManager.onFinalResultCallback = async (transcript, audioPath) => {
    stopRecordingUI();
    if (!transcript || transcript.trim().length < 2) {
      liveTranscript.textContent = 'Hiçbir konuşma algılanmadı. Lütfen tekrar deneyin.';
      return;
    }
    // Türkçe NLP Motoru ile görevleri çıkar (<50ms)
    const newTasks = nlp.processTranscript(transcript, audioPath);
    await handleCreatedTasks(newTasks, transcript, audioPath, timerSeconds * 1000);
  };

  VoiceManager.onErrorCallback = (err) => {
    stopRecordingUI();
    console.error('[VoiceManager Error]', err);
    liveTranscript.textContent = 'Hata oluştu: ' + (err || 'Bilinmiyor');
  };

  // Buton Etkileşim Dinleyicisi
  if (userSettings.holdMode) {
    // Basılı Tut Modu
    btnTalk.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startRecording();
    });
    btnTalk.addEventListener('pointerup', (e) => {
      e.preventDefault();
      stopRecording();
    });
  } else {
    // Dokun-Aç / Dokun-Kapat (Toggle)
    btnTalk.addEventListener('click', () => {
      if (!isRecording) startRecording();
      else stopRecording();
    });
  }

  // --- GERİ AL SNACKBAR ---
  function showUndoSnackbar(text) {
    if (undoTimeout) clearTimeout(undoTimeout);
    undoText.textContent = text;
    undoSnackbar.classList.add('show');

    undoTimeout = setTimeout(() => {
      undoSnackbar.classList.remove('show');
      lastCreatedTasks = [];
    }, 6000);
  }

  btnUndo.addEventListener('click', async () => {
    if (lastCreatedTasks.length > 0) {
      for (const t of lastCreatedTasks) {
        await AppDatabase.deleteTask(t.id);
      }
      lastCreatedTasks = [];
      undoSnackbar.classList.remove('show');
      triggerHaptic(40);
      await refreshFeedAndBadges();
    }
  });

  // --- GÖREV LİSTESİ VE KART GÖRÜNÜMÜ ---
  const CATEGORY_COLORS = {
    'Görüşme': '#3B82F6',
    'Randevu': '#8B5CF6',
    'Arama': '#10B981',
    'Gezi / Yer Gösterme': '#F59E0B',
    'Evrak / Tapu': '#EC4899',
    'Takip': '#06B6D4',
    'Kişisel': '#6366F1',
    'Genel': '#64748B'
  };

  async function renderCurrentFeed() {
    const query = searchInput.value.trim();
    let tasks = [];

    if (query) {
      tasks = await AppDatabase.searchTasks(query);
    } else {
      tasks = await AppDatabase.getTasksByFilter(currentTab);
    }

    if (tasks.length === 0) {
      taskFeed.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <p>${query ? 'Aramanıza uygun görev bulunamadı.' : 'Bu sekmede henüz görev yok.<br>Büyük butona basıp konuşun!'}</p>
        </div>
      `;
      return;
    }

    taskFeed.innerHTML = '';
    tasks.forEach(task => {
      const cardEl = createTaskCardElement(task);
      taskFeed.appendChild(cardEl);
    });
  }

  function createTaskCardElement(task) {
    const wrapper = document.createElement('div');
    wrapper.className = 'task-card-wrapper';

    const catColor = CATEGORY_COLORS[task.category] || '#64748B';
    const isCompleted = task.status === 'completed';

    wrapper.innerHTML = `
      <div class="swipe-action-background right-action">✓ Tamamla</div>
      <div class="swipe-action-background left-action">Sil ✕</div>
      <div class="task-card" data-id="${task.id}" style="${isCompleted ? 'opacity: 0.65;' : ''}">
        <div class="task-header">
          <h3 class="task-title" style="${isCompleted ? 'text-decoration: line-through;' : ''}">${escapeHtml(task.title)}</h3>
          <span class="task-category-pill" style="background-color: ${catColor};">
            ${escapeHtml(task.category)}
          </span>
        </div>

        <p class="task-raw-text">"${escapeHtml(task.raw_text)}"</p>

        <div class="task-meta-row">
          ${task.due_time ? `
            <span class="meta-badge ${task.is_time_estimated ? 'estimated' : ''}">
              🕒 ${task.due_time} ${task.is_time_estimated ? '(Tahmini)' : ''}
            </span>
          ` : ''}

          ${task.due_date ? `
            <span class="meta-badge">
              📅 ${task.due_date}
            </span>
          ` : ''}

          ${task.priority === 'high' ? `
            <span class="meta-badge priority-high">
              ⚡ Acil
            </span>
          ` : ''}

          ${task.person ? `
            <span class="meta-badge person">
              👤 ${escapeHtml(task.person)}
            </span>
          ` : ''}

          ${task.place ? `
            <span class="meta-badge place">
              📍 ${escapeHtml(task.place)}
            </span>
          ` : ''}

          ${task.audio_path ? `
            <button class="btn-play-audio" data-audio="${escapeHtml(task.audio_path)}" title="Sesi Dinle">
              ▶
            </button>
          ` : ''}
        </div>
      </div>
    `;

    const card = wrapper.querySelector('.task-card');

    // Dokunarak Düzenleme
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-play-audio')) return;
      openEditModal(task);
    });

    // Ses Dinleme
    const btnPlay = wrapper.querySelector('.btn-play-audio');
    if (btnPlay) {
      btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        playAudio(task.audio_path);
      });
    }

    // Dokunmatik Kaydırma (Swipe-to-Complete / Swipe-to-Delete)
    setupSwipeGesture(wrapper, card, task);

    return wrapper;
  }

  function setupSwipeGesture(wrapper, card, task) {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isSwiping = true;
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      currentX = e.touches[0].clientX - startX;
      // Yalnızca yatay hareket
      if (Math.abs(currentX) > 10) {
        card.style.transform = `translateX(${currentX}px)`;
      }
    }, { passive: true });

    card.addEventListener('touchend', async () => {
      if (!isSwiping) return;
      isSwiping = false;

      // Sağa kaydırma (Tamamla) > 100px
      if (currentX > 100) {
        triggerHaptic(50);
        card.style.transform = 'translateX(100%)';
        setTimeout(async () => {
          task.status = task.status === 'completed' ? 'pending' : 'completed';
          await AppDatabase.updateTask(task);
          await refreshFeedAndBadges();
        }, 150);
      }
      // Sola kaydırma (Sil) < -100px
      else if (currentX < -100) {
        triggerHaptic(80);
        card.style.transform = 'translateX(-100%)';
        setTimeout(async () => {
          await AppDatabase.deleteTask(task.id);
          await refreshFeedAndBadges();
        }, 150);
      }
      // Eşik geçilmediyse geri yaylan
      else {
        card.style.transform = 'translateX(0px)';
      }
    });
  }

  function playAudio(path) {
    if (!path) return;
    try {
      if (audioPlayer) {
        audioPlayer.pause();
      }
      audioPlayer = new Audio(path);
      audioPlayer.play().catch(e => console.warn('Ses oynatılamadı:', e));
    } catch (e) {
      console.warn('Audio nesnesi açılamadı:', e);
    }
  }

  // --- SEKME DEĞİŞİMİ VE ROZETLER ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      renderCurrentFeed();
    });
  });

  async function refreshFeedAndBadges() {
    const [tToday, tTomorrow, tWeek, tComp] = await Promise.all([
      AppDatabase.getTasksByFilter('today'),
      AppDatabase.getTasksByFilter('tomorrow'),
      AppDatabase.getTasksByFilter('week'),
      AppDatabase.getTasksByFilter('completed')
    ]);

    badgeToday.textContent = tToday.length;
    badgeTomorrow.textContent = tTomorrow.length;
    badgeWeek.textContent = tWeek.length;
    badgeCompleted.textContent = tComp.length;

    await renderCurrentFeed();
  }

  // --- ARAMA İŞLEMLERİ ---
  searchInput.addEventListener('input', () => {
    renderCurrentFeed();
  });

  btnVoiceSearch.addEventListener('click', () => {
    isVoiceSearching = true;
    startRecording();
  });

  // --- DÜZENLEME MODALI ---
  function openEditModal(task) {
    editTaskId.value = task.id;
    editTitle.value = task.title || '';
    editDate.value = task.due_date || '';
    editTime.value = task.due_time || '';
    editPerson.value = task.person || '';
    editPlace.value = task.place || '';
    editCategory.value = task.category || 'Genel';
    editModal.classList.add('open');
  }

  btnCloseEdit.addEventListener('click', () => editModal.classList.remove('open'));

  btnSaveTask.addEventListener('click', async () => {
    const id = editTaskId.value;
    const task = await AppDatabase.getTask(id);
    if (task) {
      task.title = editTitle.value.trim();
      task.due_date = editDate.value;
      task.due_time = editTime.value;
      task.person = editPerson.value.trim() || null;
      task.place = editPlace.value.trim() || null;
      task.category = editCategory.value;
      task.is_time_estimated = 0; // Manuel düzenlendiği için artık kesin

      await AppDatabase.updateTask(task);
      editModal.classList.remove('open');
      await refreshFeedAndBadges();
      triggerHaptic(40);
    }
  });

  // --- AYARLAR MODALI ---
  btnSettingsModal.addEventListener('click', () => settingsModal.classList.add('open'));
  btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('open'));

  btnSaveSettings.addEventListener('click', () => {
    userSettings.vibration = settingVibration.checked;
    userSettings.autoSilence = settingAutoSilence.checked;
    userSettings.holdMode = settingHoldMode.checked;
    userSettings.darkTheme = settingDarkTheme.checked;

    localStorage.setItem('vibration', userSettings.vibration);
    localStorage.setItem('autoSilence', userSettings.autoSilence);
    localStorage.setItem('holdMode', userSettings.holdMode);
    localStorage.setItem('darkTheme', userSettings.darkTheme);

    if (window.GeminiService) {
      if (inputGeminiKey) GeminiService.setApiKey(inputGeminiKey.value.trim());
      if (selectGeminiModel) GeminiService.setModel(selectGeminiModel.value);
      if (settingGeminiEnabled) GeminiService.setEnabled(settingGeminiEnabled.checked);
    }
    updateEngineUI();

    VoiceManager.autoSilenceStopEnabled = userSettings.autoSilence;
    document.documentElement.setAttribute('data-theme', userSettings.darkTheme ? 'dark' : 'light');

    settingsModal.classList.remove('open');
  });

  // --- DIŞA AKTAR VE YEDEKLEME ---
  btnExportModal.addEventListener('click', () => exportModal.classList.add('open'));
  btnCloseExport.addEventListener('click', () => exportModal.classList.remove('open'));

  btnExportCsv.addEventListener('click', async () => {
    const csvContent = await AppDatabase.exportDataCsv();
    downloadFile(csvContent, `gorevler_${getTodayStr()}.csv`, 'text/csv;charset=utf-8;');
  });

  btnExportJson.addEventListener('click', async () => {
    const jsonContent = await AppDatabase.exportDataJson();
    downloadFile(jsonContent, `yedek_sesli_notlar_${getTodayStr()}.json`, 'application/json');
  });

  importJsonInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await AppDatabase.importDataJson(event.target.result);
        exportModal.classList.remove('open');
        await refreshFeedAndBadges();
        alert('Yedek başarıyla geri yüklendi!');
      } catch (err) {
        alert('Geçersiz yedek dosyası: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // --- YARDIMCI METOTLAR ---
  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function getTodayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Başlangıç Yüklemesi
  await refreshFeedAndBadges();
});
