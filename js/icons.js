// Icônes SVG minimalistes (trait, 24x24), inline — pas de police externe à
// charger, tout fonctionne hors-ligne dans l'APK.
(function (global) {
  "use strict";

  const PATHS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.3A8 8 0 1 1 9.7 4a6.5 6.5 0 0 0 10.3 10.3z"/>',
    arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
    coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v2M12 2v2"/>',
    plane: '<path d="M3 12l18-8-8 18-2-8-8-2z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
    chartLine: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
    bed: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 18h18M3 18v2M21 18v2M7 9V6a1 1 0 0 1 1-1h3v4"/>',
    fileDownload: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
    fileUpload: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M9 4v16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    road: '<path d="M4 20 9 4h6l5 16M12 4v3M12 11v3M12 18v2"/>',
    palette: '<path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h2a3 3 0 0 0 0-6h-1a2 2 0 1 0 0-4"/><circle cx="7" cy="10" r="1"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="7" r="1"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    coins: '<circle cx="12" cy="12" r="8"/><path d="M12 6v2M12 16v2M9 9.5a3 3 0 0 1 5.2-1M14.8 15.5a3 3 0 0 1-5.2 1M9 10h4a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h4"/>'
  };

  function icon(name, size) {
    const d = PATHS[name] || "";
    const s = size || 20;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  global.Icons = { icon };
})(window);
