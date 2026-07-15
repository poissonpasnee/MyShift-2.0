// Local persistence layer — replaces Room (ShiftEntry/MonthlyBonus) + DataStore (PreferencesRepository).
(function (global) {
  "use strict";

  const KEY_ENTRIES = "myshift.entries";
  const KEY_BONUSES = "myshift.bonuses";
  const KEY_SETTINGS = "myshift.settings";

  const DEFAULT_SETTINGS = {
    darkTheme: true,
    salaryBase: 0,
    rateJour: 0,
    rateNuit: 0,
    rateMn: 0,
    tollAmount: 0,
    exportNotes: true,
    exportToll: true,
    exportBase: true,
    weekStartSunday: true,
    congesLabel: "CONGÉS",
    reminderEnabled: true,
    reminderHour: "20:00",
    showWeekNumbers: false,
    colorPalette: "amethyste"
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, readJson(KEY_SETTINGS, {}));
  }

  function setSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    writeJson(KEY_SETTINGS, settings);
    return settings;
  }

  function getEntriesMap() {
    return readJson(KEY_ENTRIES, {});
  }

  function getEntriesArray() {
    const map = getEntriesMap();
    return Object.keys(map).map((date) => map[date]);
  }

  function getEntry(date) {
    return getEntriesMap()[date] || null;
  }

  function saveEntry(date, status, ctype, note, tollCount) {
    const map = getEntriesMap();
    map[date] = {
      date: date,
      status: status,
      ctype: ctype || null,
      note: note || null,
      tollCount: tollCount || 0
    };
    writeJson(KEY_ENTRIES, map);
  }

  function clearEntry(date) {
    const map = getEntriesMap();
    delete map[date];
    writeJson(KEY_ENTRIES, map);
  }

  function replaceAllEntries(map) {
    writeJson(KEY_ENTRIES, map);
  }

  function getBonuses() {
    return readJson(KEY_BONUSES, {});
  }

  function saveBonus(month, amount) {
    const map = getBonuses();
    map[month] = amount;
    writeJson(KEY_BONUSES, map);
  }

  function resetAll() {
    localStorage.removeItem(KEY_ENTRIES);
    localStorage.removeItem(KEY_BONUSES);
    localStorage.removeItem(KEY_SETTINGS);
  }

  global.Storage = {
    DEFAULT_SETTINGS,
    getSettings,
    setSetting,
    getEntriesMap,
    getEntriesArray,
    getEntry,
    saveEntry,
    clearEntry,
    replaceAllEntries,
    getBonuses,
    saveBonus,
    resetAll
  };
})(window);
