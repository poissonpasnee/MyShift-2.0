// Local persistence layer — replaces Room (ShiftEntry/MonthlyBonus) + DataStore (PreferencesRepository).
(function (global) {
  "use strict";

  const KEY_ENTRIES = "myshift.entries";
  const KEY_BONUSES = "myshift.bonuses";
  const KEY_SETTINGS = "myshift.settings";
  const KEY_PEAGES = "myshift.peages";

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
    return Object.keys(map).map((date) => migrateEntryTolls(map[date]));
  }

  function migrateEntryTolls(entry) {
    if (!entry) return entry;
    if (entry.tolls) return entry;
    if (entry.tollCount > 0) {
      const peages = getPeages();
      if (peages.length > 0) {
        entry.tolls = { [peages[0].id]: entry.tollCount };
      }
    }
    return entry;
  }

  function getEntry(date) {
    return migrateEntryTolls(getEntriesMap()[date] || null);
  }

  function saveEntry(date, status, ctype, note, tolls) {
    const map = getEntriesMap();
    map[date] = {
      date: date,
      status: status,
      ctype: ctype || null,
      note: note || null,
      tolls: tolls || {}
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

  // -----------------------------------------------------------------
  // Péages multiples — chacun a un nom et un montant qui lui est propre.
  // Migration douce : si aucune liste n'existe encore mais qu'un ancien
  // montant unique (tollAmount) était configuré, on le reprend comme
  // premier péage pour ne rien perdre.
  // -----------------------------------------------------------------
  function getPeages() {
    const raw = localStorage.getItem(KEY_PEAGES);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* fallthrough to migration */ }
    }
    const legacyAmount = getSettings().tollAmount;
    const migrated = legacyAmount > 0
      ? [{ id: "peage-1", name: "Péage", amount: legacyAmount }]
      : [];
    writeJson(KEY_PEAGES, migrated);
    return migrated;
  }

  function savePeages(list) {
    writeJson(KEY_PEAGES, list);
  }

  function addPeage(name, amount) {
    const list = getPeages();
    const id = "peage-" + Date.now();
    list.push({ id, name, amount });
    savePeages(list);
    return id;
  }

  function updatePeage(id, name, amount) {
    const list = getPeages();
    const p = list.find((x) => x.id === id);
    if (p) {
      p.name = name;
      p.amount = amount;
      savePeages(list);
    }
  }

  function deletePeage(id) {
    savePeages(getPeages().filter((p) => p.id !== id));
  }

  // Compte + montant total des péages d'un jour, à partir de la liste
  // de péages actuelle (les prix ne sont pas historisés : un changement
  // de tarif s'applique rétroactivement à tous les jours, comme c'était
  // déjà le cas avec l'ancien montant unique).
  function tollTotalsForEntry(entry, peages) {
    const tolls = (entry && entry.tolls) || {};
    let count = 0, amount = 0;
    for (const p of peages) {
      const c = tolls[p.id] || 0;
      count += c;
      amount += c * p.amount;
    }
    return { count, amount };
  }

  function resetAll() {
    localStorage.removeItem(KEY_ENTRIES);
    localStorage.removeItem(KEY_BONUSES);
    localStorage.removeItem(KEY_SETTINGS);
  }

  // Full backup as a single JSON object — for manual export/import since
  // this app is local-only (no account, no cloud sync).
  function exportAll() {
    return {
      app: "myshift",
      version: 2,
      exportedAt: new Date().toISOString(),
      entries: getEntriesMap(),
      bonuses: getBonuses(),
      settings: getSettings(),
      peages: getPeages()
    };
  }

  function importAll(data) {
    if (!data || typeof data !== "object") throw new Error("Fichier invalide.");
    if (data.entries) writeJson(KEY_ENTRIES, data.entries);
    if (data.bonuses) writeJson(KEY_BONUSES, data.bonuses);
    if (data.settings) writeJson(KEY_SETTINGS, Object.assign({}, DEFAULT_SETTINGS, data.settings));
    if (Array.isArray(data.peages)) writeJson(KEY_PEAGES, data.peages);
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
    resetAll,
    exportAll,
    importAll,
    getPeages,
    savePeages,
    addPeage,
    updatePeage,
    deletePeage,
    tollTotalsForEntry
  };
})(window);
