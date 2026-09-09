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
    colorPalette: "amethyste",
    darkBgVariant: "ardoise",
    reposWeekdays: [],
    includeRatesInBackup: true,
    horaireJour: "7h-17h",
    horaireNuit: "21h30-6h",
    viewMode: "week"
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
  // Péages multiples — chacun a un nom et un historique de montants
  // datés (un changement de tarif n'affecte que les jours à partir de
  // sa date d'effet, les jours passés gardent l'ancien montant).
  // Migration douce : ancien format {id,name,amount} -> {id,name,history}.
  // Migration douce v1 : si aucune liste n'existe encore mais qu'un ancien
  // montant unique (tollAmount) était configuré, on le reprend.
  // -----------------------------------------------------------------
  function migratePeage(p) {
    if (p.history) return p;
    return { id: p.id, name: p.name, history: [{ from: "2000-01-01", amount: p.amount || 0 }] };
  }

  function getPeages() {
    const raw = localStorage.getItem(KEY_PEAGES);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(migratePeage);
      } catch (e) { /* fallthrough to migration */ }
    }
    const legacyAmount = getSettings().tollAmount;
    const migrated = legacyAmount > 0
      ? [{ id: "peage-1", name: "Péage", history: [{ from: "2000-01-01", amount: legacyAmount }] }]
      : [];
    writeJson(KEY_PEAGES, migrated);
    return migrated;
  }

  function savePeages(list) {
    writeJson(KEY_PEAGES, list);
  }

  // Ajoute une entrée d'historique datée (aujourd'hui par défaut) au lieu
  // d'écraser le montant — les jours déjà enregistrés avant cette date
  // gardent leur calcul avec l'ancien montant.
  function addPeage(name, amount, effectiveFrom) {
    const list = getPeages();
    const id = "peage-" + Date.now();
    list.push({ id, name, history: [{ from: effectiveFrom || "2000-01-01", amount }] });
    savePeages(list);
    return id;
  }

  function renamePeage(id, name) {
    const list = getPeages();
    const p = list.find((x) => x.id === id);
    if (p) { p.name = name; savePeages(list); }
  }

  function setPeageAmount(id, amount, effectiveFrom) {
    const list = getPeages();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const from = effectiveFrom || todayStrForStorage();
    const existingForDate = p.history.find((h) => h.from === from);
    if (existingForDate) {
      existingForDate.amount = amount;
    } else {
      p.history.push({ from, amount });
      p.history.sort((a, b) => a.from.localeCompare(b.from));
    }
    savePeages(list);
  }

  function todayStrForStorage() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function deletePeage(id) {
    savePeages(getPeages().filter((p) => p.id !== id));
  }

  // Montant en vigueur d'un péage à une date donnée (le dernier changement
  // dont la date d'effet est <= à la date demandée).
  function peageAmountAt(peage, dateStr) {
    let amount = peage.history[0] ? peage.history[0].amount : 0;
    for (const h of peage.history) {
      if (h.from <= dateStr) amount = h.amount; else break;
    }
    return amount;
  }

  // Compte + montant total des péages d'un jour, en tenant compte du
  // montant en vigueur à la date de l'entrée (historique de prix).
  function tollTotalsForEntry(entry, peages) {
    const tolls = (entry && entry.tolls) || {};
    let count = 0, amount = 0;
    for (const p of peages) {
      const c = tolls[p.id] || 0;
      count += c;
      amount += c * peageAmountAt(p, entry.date);
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
    const settings = getSettings();
    const includeRates = settings.includeRatesInBackup !== false;
    const exportedSettings = includeRates
      ? settings
      : Object.assign({}, settings, {
          salaryBase: null, rateJour: null, rateNuit: null, rateMn: null, tollAmount: null
        });
    const peages = getPeages();
    const exportedPeages = includeRates
      ? peages
      : peages.map((p) => ({ id: p.id, name: p.name, history: [] }));
    return {
      app: "myshift",
      version: 2,
      exportedAt: new Date().toISOString(),
      includesRates: includeRates,
      entries: getEntriesMap(),
      bonuses: includeRates ? getBonuses() : {},
      settings: exportedSettings,
      peages: exportedPeages
    };
  }

  // Point d'entrée pour le code natif Android (WebView bridge) : renvoie
  // la sauvegarde complète sous forme de texte JSON, prête à écrire dans
  // un fichier. Respecte le réglage "Inclure salaire et tarifs".
  global.getMyShiftBackupJson = function () {
    return JSON.stringify(exportAll(), null, 2);
  };

  // Appelé côté natif Android après que l'utilisateur a choisi un dossier
  // (Storage Access Framework), pour afficher son nom dans les réglages.
  global.onBackupFolderChosen = function (folderName) {
    setSetting("nativeBackupFolderName", folderName);
    const el = document.getElementById("set-native-backup-folder");
    if (el) el.textContent = folderName;
  };

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
    renamePeage,
    setPeageAmount,
    peageAmountAt,
    deletePeage,
    tollTotalsForEntry
  };
})(window);
