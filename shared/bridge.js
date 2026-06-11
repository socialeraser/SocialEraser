/**
 * X-Eraser Transport layer (placeholder for Phase 1)
 *
 * SOURCE OF TRUTH — edit this file only.
 * Run `npm run sync` to copy to www/.
 *
 * Phase 1 will wire injector progress/events through this module
 * for both Chrome extension (XEraserPanel) and Capacitor (XEraserNative).
 */
(function() {
  'use strict';

  if (window.XEraserTransport) return;

  window.XEraserTransport = {
    notifyProgress(stats) {
      const panel = window.XEraserPanel;
      if (panel && panel.setProgress) {
        panel.setProgress(stats);
      }
    },

    notifyComplete(stats) {
      const panel = window.XEraserPanel;
      if (panel && panel.setComplete) {
        panel.setComplete(stats);
      }
    },

    notifyRunning(taskLabel) {
      const panel = window.XEraserPanel;
      if (panel && panel.setRunning) {
        panel.setRunning(taskLabel);
      }
    },

    notifyError(message) {
      const panel = window.XEraserPanel;
      if (panel && panel.setError) {
        panel.setError(message);
      }
    },

    notifyLog(type, message, data) {
      if (window.XEraserNative && window.XEraserNative.postMessage) {
        window.XEraserNative.postMessage(JSON.stringify({
          source: 'XEraser-Injector',
          type,
          message,
          data: data || null
        }));
      }
    }
  };
})();
