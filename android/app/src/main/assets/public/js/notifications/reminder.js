/**
 * Sesli Görev Asistanı - Yerel Hatırlatıcı Bildirim Modülü
 * Capacitor LocalNotifications veya Standart Web Notification API
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReminderService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class ReminderService {
    constructor() {
      this.isNative = typeof window !== 'undefined' &&
                      window.Capacitor &&
                      window.Capacitor.isPluginAvailable &&
                      window.Capacitor.isPluginAvailable('LocalNotifications');

      this.localNotifications = this.isNative ? window.Capacitor.Plugins.LocalNotifications : null;
    }

    async requestPermission() {
      if (this.isNative && this.localNotifications) {
        try {
          const res = await this.localNotifications.requestPermissions();
          return res.display === 'granted';
        } catch (e) {
          console.warn('[ReminderService] Bildirim izni hatası:', e);
          return false;
        }
      } else if (typeof Notification !== 'undefined') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
      return false;
    }

    /**
     * Görev için hatırlatıcı ayarlar (Görev saatinden 15 dakika önce veya tam vaktinde)
     */
    async scheduleTaskReminder(task) {
      if (!task.due_date || !task.due_time) return false;

      try {
        const [year, month, day] = task.due_date.split('-').map(Number);
        const [hour, minute] = task.due_time.split(':').map(Number);
        const taskDateTime = new Date(year, month - 1, day, hour, minute);

        // Geçmiş tarihli ise bildirim kurma
        if (taskDateTime.getTime() <= Date.now()) {
          return false;
        }

        const notifId = Math.abs(this.hashCode(task.id));

        if (this.isNative && this.localNotifications) {
          await this.localNotifications.schedule({
            notifications: [
              {
                id: notifId,
                title: task.title || 'Görev Hatırlatması',
                body: `${task.category}: ${task.raw_text || task.title}`,
                schedule: { at: taskDateTime },
                sound: 'beep.wav',
                smallIcon: 'ic_launcher'
              }
            ]
          });
          return true;
        }
      } catch (err) {
        console.warn('[ReminderService] Hatırlatıcı kurulamadı:', err);
      }
      return false;
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }
  }

  return new ReminderService();
});
