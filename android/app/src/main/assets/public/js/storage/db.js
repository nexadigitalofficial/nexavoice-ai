/**
 * Sesli Görev Asistanı - Yerel IndexedDB Veritabanı Modülü
 * %100 Offline, Sıfır Dış Bağımlılık
 * Şema:
 *   tasks(id, title, raw_text, category, due_date, due_time, is_time_estimated, priority,
 *         person, place, tags_json, confidence_json, status, audio_path, created_at, updated_at)
 *   recordings(id, audio_path, duration_ms, transcript, created_at)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppDatabase = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'SesliGorevDB';
  const DB_VERSION = 1;

  class AppDatabase {
    constructor() {
      this.db = null;
    }

    async init() {
      if (this.db) return this.db;

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // tasks Store
          if (!db.objectStoreNames.contains('tasks')) {
            const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
            taskStore.createIndex('status', 'status', { unique: false });
            taskStore.createIndex('due_date', 'due_date', { unique: false });
            taskStore.createIndex('category', 'category', { unique: false });
            taskStore.createIndex('created_at', 'created_at', { unique: false });
          }

          // recordings Store
          if (!db.objectStoreNames.contains('recordings')) {
            const recStore = db.createObjectStore('recordings', { keyPath: 'id' });
            recStore.createIndex('created_at', 'created_at', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('[AppDatabase] IndexedDB açılamadı:', event.target.error);
          reject(event.target.error);
        };
      });
    }

    // --- TASK METODLARI ---

    async addTask(task) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.put(task);
        req.onsuccess = () => resolve(task);
        req.onerror = () => reject(req.error);
      });
    }

    async addTasks(taskList) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        for (const t of taskList) {
          store.put(t);
        }
        tx.oncomplete = () => resolve(taskList);
        tx.onerror = () => reject(tx.error);
      });
    }

    async getTask(id) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tasks'], 'readonly');
        const store = tx.objectStore('tasks');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async getAllTasks() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tasks'], 'readonly');
        const store = tx.objectStore('tasks');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async updateTask(task) {
      await this.init();
      task.updated_at = new Date().toISOString();
      return this.addTask(task);
    }

    async deleteTask(id) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }

    // --- RECORDING METODLARI ---

    async addRecording(recording) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['recordings'], 'readwrite');
        const store = tx.objectStore('recordings');
        const req = store.put(recording);
        req.onsuccess = () => resolve(recording);
        req.onerror = () => reject(req.error);
      });
    }

    async getAllRecordings() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['recordings'], 'readonly');
        const store = tx.objectStore('recordings');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    // --- FİLTRELEME VE ARAMA ---

    async getTasksByFilter(filterType = 'today', referenceDate = new Date()) {
      const allTasks = await this.getAllTasks();

      const pad = n => String(n).padStart(2, '0');
      const formatIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const todayStr = formatIso(referenceDate);

      const tomorrow = new Date(referenceDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatIso(tomorrow);

      const weekEnd = new Date(referenceDate);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = formatIso(weekEnd);

      return allTasks.filter(task => {
        if (filterType === 'completed') {
          return task.status === 'completed';
        }

        // Tamamlanmamış görevler
        if (task.status === 'completed') return false;

        if (filterType === 'today') {
          return task.due_date === todayStr || (!task.due_date);
        } else if (filterType === 'tomorrow') {
          return task.due_date === tomorrowStr;
        } else if (filterType === 'week') {
          return task.due_date >= todayStr && task.due_date <= weekEndStr;
        }
        return true;
      }).sort((a, b) => {
        // Öncelik ve saat sıralaması
        const prioOrder = { high: 1, medium: 2, low: 3 };
        const pDiff = (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
        if (pDiff !== 0) return pDiff;
        return (a.due_time || '23:59').localeCompare(b.due_time || '23:59');
      });
    }

    async searchTasks(query) {
      if (!query || !query.trim()) {
        return this.getAllTasks();
      }
      const q = query.trim().toLowerCase();
      const all = await this.getAllTasks();

      return all.filter(t => {
        const inTitle = (t.title || '').toLowerCase().includes(q);
        const inRaw = (t.raw_text || '').toLowerCase().includes(q);
        const inPerson = (t.person || '').toLowerCase().includes(q);
        const inPlace = (t.place || '').toLowerCase().includes(q);
        const inCat = (t.category || '').toLowerCase().includes(q);
        const inTags = (t.tags_json || '').toLowerCase().includes(q);
        return inTitle || inRaw || inPerson || inPlace || inCat || inTags;
      });
    }

    // --- YEDEKLEME VE DIŞA AKTARMA ---

    async exportDataJson() {
      const [tasks, recordings] = await Promise.all([
        this.getAllTasks(),
        this.getAllRecordings()
      ]);

      const backup = {
        app: 'Sesli Görev Asistanı',
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks,
        recordings
      };

      return JSON.stringify(backup, null, 2);
    }

    async exportDataCsv() {
      const tasks = await this.getAllTasks();
      const headers = [
        'ID', 'Başlık', 'Kategori', 'Tarih', 'Saat', 'Tahmini Saat',
        'Öncelik', 'Kişi', 'Mekan', 'Durum', 'Oluşturulma'
      ];

      const rows = tasks.map(t => [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        t.due_date || '',
        t.due_time || '',
        t.is_time_estimated ? 'Evet' : 'Hayır',
        t.priority || 'medium',
        `"${(t.person || '').replace(/"/g, '""')}"`,
        `"${(t.place || '').replace(/"/g, '""')}"`,
        t.status || 'pending',
        t.created_at || ''
      ]);

      // UTF-8 BOM for Excel Türkçe karakter uyumu (\uFEFF)
      return '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    }

    async importDataJson(jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        if (data.tasks && Array.isArray(data.tasks)) {
          await this.addTasks(data.tasks);
        }
        if (data.recordings && Array.isArray(data.recordings)) {
          for (const rec of data.recordings) {
            await this.addRecording(rec);
          }
        }
        return true;
      } catch (err) {
        console.error('[AppDatabase] Import hatası:', err);
        throw err;
      }
    }
  }

  return new AppDatabase();
});
