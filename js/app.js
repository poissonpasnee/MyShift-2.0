(function () {
  "use strict";

  const STATUSES = ["jour", "nuit", "mn", "repos", "conges"];
  const STATUS_LABEL = { jour: "Jour", nuit: "Nuit", mn: "MN", repos: "Repos", conges: "Congés" };
  const STATUS_LABEL_LONG = { jour: "Jour", nuit: "Nuit", mn: "Montée", repos: "Repos", conges: "Congé" };
  const STATUS_LETTER = { jour: "J", nuit: "N", mn: "MN", repos: "R", conges: "C" };
  const STATUS_ICON = { jour: "sun", nuit: "moon", mn: "arrowUpRight", repos: "coffee", conges: "plane" };
  const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const MONTHS_FR_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

  // "Calendrier ferroviaire" app logo — id must match the activity-alias / drawable suffixes
  // in the native wrapper (see AndroidManifest.xml's <activity-alias> entries and
  // res/mipmap-anydpi-v26/ic_launcher_*.xml) so picking a color here can also flip the
  // home-screen launcher icon via AndroidBridge.chooseLauncherIconColor.
  const LOGO_COLORS = [
    { id: "mint", label: "Vert menthe", hex: "#10B981" },
    { id: "blue", label: "Bleu (original)", hex: "#3B82F6" },
    { id: "indigo", label: "Indigo", hex: "#6366F1" },
    { id: "violet", label: "Violet", hex: "#A855F7" },
    { id: "pink", label: "Rose", hex: "#EC4899" },
    { id: "orange", label: "Orange", hex: "#F97316" },
    { id: "yellow", label: "Jaune", hex: "#FACC15" },
    { id: "red", label: "Rouge", hex: "#EF4444" },
    { id: "cyan", label: "Cyan", hex: "#06B6D4" },
    { id: "gray", label: "Gris", hex: "#64748B" }
  ];

  // Same glyph as the native ic_launcher_foreground.xml (calendar + converging rails),
  // reproduced as inline SVG so it can be recolored freely for in-app use — the "today" cell
  // is tinted to match here (the shared Android drawable keeps it neutral to avoid needing
  // 10 separate foreground resources, a tradeoff that doesn't apply to inline SVG).
  function logoSvg(hex, size) {
    const s = size || 40;
    return `<svg width="${s}" height="${s}" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="108" height="108" rx="24" fill="${hex}"/>
      <path stroke="#1E293B" stroke-width="3.4" stroke-linecap="round" d="M18,90 L90,90"/>
      <path stroke="#1E293B" stroke-width="3.4" stroke-linecap="round" d="M24,82 L84,82"/>
      <path stroke="#1E293B" stroke-width="3.4" stroke-linecap="round" d="M29,74 L79,74"/>
      <path stroke="#1E293B" stroke-width="3.4" stroke-linecap="round" d="M35,66 L74,66"/>
      <path stroke="#1E293B" stroke-width="4.2" stroke-linecap="round" d="M14,96 L41,57"/>
      <path stroke="#1E293B" stroke-width="4.2" stroke-linecap="round" d="M94,96 L67,57"/>
      <path fill="#475569" d="M37,30 h5 a2.5,2.5 0 0 1 2.5,2.5 v8 a2.5,2.5 0 0 1 -2.5,2.5 h-5 a2.5,2.5 0 0 1 -2.5,-2.5 v-8 a2.5,2.5 0 0 1 2.5,-2.5 z"/>
      <path fill="#475569" d="M64,30 h5 a2.5,2.5 0 0 1 2.5,2.5 v8 a2.5,2.5 0 0 1 -2.5,2.5 h-5 a2.5,2.5 0 0 1 -2.5,-2.5 v-8 a2.5,2.5 0 0 1 2.5,-2.5 z"/>
      <path fill="#FFFFFF" d="M27,38 h54 a6,6 0 0 1 6,6 v34 a6,6 0 0 1 -6,6 h-54 a6,6 0 0 1 -6,-6 v-34 a6,6 0 0 1 6,-6 z"/>
      <path fill="#CBD5E1" d="M27,38 h54 a6,6 0 0 1 6,6 v5 h-66 v-5 a6,6 0 0 1 6,-6 z"/>
      <path fill="#E2E8F0" d="M33,53 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M44,53 h8 v8 h-8 z"/>
      <path fill="${hex}" d="M55,53 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M66,53 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M33,64 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M44,64 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M55,64 h8 v8 h-8 z"/>
      <path fill="#E2E8F0" d="M66,64 h8 v8 h-8 z"/>
    </svg>`;
  }
  function logoColorInfo(id) {
    return LOGO_COLORS.find((c) => c.id === id) || LOGO_COLORS[1];
  }

  // ---------------------------------------------------------------------
  // Date / YearMonth helpers
  // ---------------------------------------------------------------------
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dstr(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function ymKey(y, m) { return `${y}-${pad2(m)}`; }
  function todayStr() {
    const t = new Date();
    return dstr(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  function ymOf(dateStr) {
    const [y, m] = dateStr.split("-").map(Number);
    return { y, m };
  }
  function ymAdd(ym, delta) {
    let idx = (ym.y * 12 + (ym.m - 1)) + delta;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return { y, m };
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function monthLabel(ym) { return `${MONTHS_FR[ym.m - 1]} ${ym.y}`; }
  function formatEuro(v) {
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + " €";
  }
  function dstr_addDays(dateStr, delta) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    return dstr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  // Start of the calendar week containing dateStr — Sunday if Réglages > Calendrier >
  // "Début de semaine dimanche" is on, Monday otherwise (e.g. weekStartSunday=true on
  // 2026-09-08 (mardi) returns 2026-09-06, a Sunday; weekStartSunday=false returns
  // 2026-09-07, the Monday).
  function weekStartOf(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=dimanche..6=samedi
    const delta = state.settings.weekStartSunday ? -dow : (dow === 0 ? -6 : 1 - dow);
    return dstr_addDays(dateStr, delta);
  }
  function weekRangeLabel(weekStart) {
    const end = dstr_addDays(weekStart, 6);
    const [, m1, d1] = weekStart.split("-").map(Number);
    const [, m2, d2] = end.split("-").map(Number);
    const short = (m) => MONTHS_FR[m - 1].slice(0, 4).toLowerCase();
    return m1 === m2 ? `${d1} - ${d2} ${short(m1)}` : `${d1} ${short(m1)} - ${d2} ${short(m2)}`;
  }

  // ---------------------------------------------------------------------
  // Global state
  // ---------------------------------------------------------------------
  const state = {
    settings: Storage.getSettings(),
    currentMonth: ymOf(todayStr()),
    currentWeekStart: null,
    selectedDate: todayStr(),
    paintStatus: null,
    editingDate: null,
    xlsxMode: "monthly",
    xlsxMonth: null,
    xlsxYear: null,
    xlsxCustomStart: null,
    xlsxCustomEnd: null,
    pickerYear: null
  };
  state.currentWeekStart = weekStartOf(todayStr());

  function shiftColors() {
    const base = Palettes.shiftColors(state.settings.colorPalette, state.settings.darkTheme);
    const custom = state.settings.customStatusColors || {};
    const colors = Object.assign({}, base);
    STATUSES.forEach((status) => { if (custom[status]) colors[status] = custom[status]; });
    return colors;
  }

  // Short vibration for paint/long-press feedback — no-ops if the setting is off or the
  // WebView doesn't expose navigator.vibrate (manifest grants VIBRATE for this specifically).
  function haptic(ms) {
    if (state.settings.hapticFeedback && navigator.vibrate) navigator.vibrate(ms || 10);
  }

  // ---------------------------------------------------------------------
  // Native reminder bridge (Reminders.kt / ReminderReceiver in the Android wrapper) — a
  // plain WebView Notification only fires while this page is open, so the actual daily
  // alarm lives in native code via AlarmManager. These two calls are how it stays in sync
  // with the "Rappels quotidiens" setting and with whether today's shift is filled in,
  // since only this page can read either from localStorage. No-ops outside the wrapper
  // (e.g. testing in a desktop browser), where window.AndroidBridge doesn't exist.
  // ---------------------------------------------------------------------
  function syncReminderConfigToNative() {
    if (window.AndroidBridge && window.AndroidBridge.setReminderConfig) {
      window.AndroidBridge.setReminderConfig(!!state.settings.reminderEnabled, state.settings.reminderHour);
    }
  }
  function syncTodayFilledToNative() {
    if (window.AndroidBridge && window.AndroidBridge.setTodayFilled) {
      window.AndroidBridge.setTodayFilled(!!Storage.getEntry(todayStr()));
    }
  }
  function syncQuickRepliesToNative() {
    if (window.AndroidBridge && window.AndroidBridge.setQuickReplies) {
      window.AndroidBridge.setQuickReplies(JSON.stringify(state.settings.quickReplies || []));
    }
  }

  // Called by MainActivity.kt once the WebView has (re)loaded, if a notification quick-reply
  // action was tapped while the app wasn't open — the native side can't touch localStorage
  // directly, so it just remembers the choice and asks the page to apply it on next load.
  window.applyPendingQuickReply = function (status, toll) {
    const peages = Storage.getPeages();
    const tolls = (toll > 0 && peages[0]) ? { [peages[0].id]: toll } : {};
    const existing = Storage.getEntry(todayStr());
    Storage.saveEntry(todayStr(), status, null, null, tolls, existing && existing.photoUri, existing && existing.audioUri);
    renderAll();
    showToast("Poste enregistré depuis la notification");
  };

  // Called by MainActivity.kt after the user picks a folder (Storage Access Framework) for
  // backups / XLSX exports / day media. setSetting() alone only touches localStorage — these
  // also refresh app.js's in-memory state.settings, otherwise the next unrelated settings
  // re-render would overwrite the just-picked folder's display with the stale prior value,
  // and (for media) the photo/note-vocale UI would stay gated as "not configured" forever.
  window.onBackupFolderChosen = function (folderName) {
    state.settings = Storage.setSetting("nativeBackupFolderName", folderName);
    renderSettingsValues();
  };
  window.onXlsxFolderChosen = function (folderName) {
    state.settings = Storage.setSetting("nativeXlsxFolderName", folderName);
    renderSettingsValues();
  };
  window.onMediaFolderChosen = function (folderName) {
    state.settings = Storage.setSetting("nativeMediaFolderName", folderName);
    renderSettingsValues();
    if (state.editingDate) renderEditDayMedia();
  };

  // ---------------------------------------------------------------------
  // Theme application
  // ---------------------------------------------------------------------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.darkTheme ? "dark" : "light");
    document.documentElement.setAttribute("data-bg", state.settings.darkBgVariant || "ardoise");
    const tones = Palettes.paletteTones(state.settings.colorPalette, state.settings.darkTheme);
    document.documentElement.style.setProperty("--color-primary", tones.primary);
    document.documentElement.style.setProperty("--color-on-primary", Palettes.contrastingTextColor(tones.primary));
    if (state.settings.customTextColor) {
      document.documentElement.style.setProperty("--on-surface", state.settings.customTextColor);
    } else {
      document.documentElement.style.removeProperty("--on-surface");
    }
  }

  // Every in-app spot the "Calendrier ferroviaire" logo appears — currently just the menu
  // footer, but centralized so a future placement only needs adding an id here.
  function renderLogo() {
    const hex = logoColorInfo(state.settings.logoColor).hex;
    const el = document.getElementById("drawer-footer-icon");
    if (el) el.innerHTML = logoSvg(hex, 56);
  }

  // ---------------------------------------------------------------------
  // Data helpers (mirrors monthData() in MyShiftApp.kt)
  // ---------------------------------------------------------------------
  function rateFor(status) {
    switch (status) {
      case "jour": return state.settings.rateJour;
      case "nuit": return state.settings.rateNuit;
      case "mn": return state.settings.rateMn;
      default: return 0;
    }
  }

  function monthData(ym) {
    const entries = Storage.getEntriesArray().filter((e) => {
      const eym = ymOf(e.date);
      return eym.y === ym.y && eym.m === ym.m;
    });
    const peages = Storage.getPeages();
    let total = state.settings.exportBase ? state.settings.salaryBase : 0;
    let toll = 0;
    const stats = { jour: 0, nuit: 0, mn: 0, repos: 0, conges: 0 };
    entries.forEach((e) => {
      total += rateFor(e.status);
      const t = Storage.tollTotalsForEntry(e, peages);
      toll += t.amount;
      if (stats[e.status] !== undefined) stats[e.status]++;
    });
    return { total, toll, stats, entries };
  }

  // ---------------------------------------------------------------------
  // Rendering: calendar + summary
  // ---------------------------------------------------------------------
  function buildDaysGrid(ym) {
    const first = new Date(ym.y, ym.m - 1, 1);
    const firstDow = state.settings.weekStartSunday
      ? first.getDay()
      : (first.getDay() + 6) % 7;
    const prevYm = ymAdd(ym, -1);
    const prevCount = daysInMonth(prevYm.y, prevYm.m);
    const days = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      days.push({ date: dstr(prevYm.y, prevYm.m, prevCount - i), otherMonth: true });
    }
    for (let d = 1; d <= daysInMonth(ym.y, ym.m); d++) {
      days.push({ date: dstr(ym.y, ym.m, d), otherMonth: false });
    }
    const nextYm = ymAdd(ym, 1);
    let nextDay = 1;
    while (days.length % 7 !== 0) {
      days.push({ date: dstr(nextYm.y, nextYm.m, nextDay), otherMonth: true });
      nextDay++;
    }
    return days;
  }

  function isoWeekNumber(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function mixWithSurfaceVariant(hex, ratio) {
    const base = state.settings.darkTheme ? { r: 0x28, g: 0x35, b: 0x48 } : { r: 0xE7, g: 0xE0, b: 0xEC };
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    const mr = Math.round(r * ratio + base.r * (1 - ratio));
    const mg = Math.round(g * ratio + base.g * (1 - ratio));
    const mb = Math.round(b * ratio + base.b * (1 - ratio));
    return "#" + [mr, mg, mb].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function dayCellHtml(cell, entriesMap, colors, peages) {
    const dateStr = cell.date;
    const entry = entriesMap[dateStr];
    const isSelected = !cell.otherMonth && dateStr === state.selectedDate;
    const isToday = dateStr === todayStr();
    let bg, textColor;
    if (entry) {
      const vivid = colors[entry.status];
      bg = mixWithSurfaceVariant(vivid, 0.24);
      textColor = Palettes.contrastingTextColor(bg);
    } else {
      bg = null;
      textColor = "var(--on-surface)";
    }
    const classes = ["day-cell"];
    if (isSelected) classes.push("selected");
    if (isToday) classes.push("today");
    if (cell.otherMonth) classes.push("other-month");
    const dayNum = Number(dateStr.split("-")[2]);
    let dots = "";
    if (entry && entry.note) dots += `<span class="day-note-dot" style="background:${textColor}"></span>`;
    if (entry) {
      const tollCount = Storage.tollTotalsForEntry(entry, peages).count;
      for (let i = 0; i < Math.min(tollCount, 3); i++) {
        dots += `<span class="day-note-dot" style="background:${colors.peage}"></span>`;
      }
    }
    const style = bg ? `background:${bg};color:${textColor};` : `color:${textColor};`;
    const dataAttr = cell.otherMonth ? "" : `data-date="${dateStr}"`;
    return `<button type="button" class="${classes.join(" ")}" style="${style}" ${dataAttr}>
      <span>${dayNum}</span>
      <span class="day-dots">${dots}</span>
    </button>`;
  }

  const WEEKDAY_ABBR = ["DI", "LU", "MA", "ME", "JE", "VE", "SA"];
  function renderWeekHeader(startDow, showWeek, paired) {
    const rowClass = showWeek ? "week-header with-week-numbers" : "week-header";
    let cells = showWeek ? `<div class="week-header-cell"></div>` : "";
    for (let i = 0; i < 7; i++) {
      const dow = (startDow + i) % 7;
      const label = paired
        ? `${WEEKDAY_ABBR[dow]}/${WEEKDAY_ABBR[(dow + 1) % 7]}`
        : WEEKDAY_ABBR[dow];
      cells += `<div class="week-header-cell">${label}</div>`;
    }
    return `<div class="${rowClass}">${cells}</div>`;
  }

  function renderCalendar(ym) {
    const entriesMap = Storage.getEntriesMap();
    const colors = shiftColors();
    const peages = Storage.getPeages();
    const days = buildDaysGrid(ym);
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

    const showWeek = state.settings.showWeekNumbers;
    const startDow = state.settings.weekStartSunday ? 0 : 1;
    let html = renderWeekHeader(startDow, showWeek, state.settings.weekStartSunday);
    rows.forEach((row) => {
      const rowClass = showWeek ? "calendar-row with-week-numbers" : "calendar-row";
      const weekCell = showWeek ? `<div class="week-number">${isoWeekNumber(row[0].date)}</div>` : "";
      html += `<div class="${rowClass}">${weekCell}${row.map((d) => dayCellHtml(d, entriesMap, colors, peages)).join("")}</div>`;
    });
    return html;
  }

  function renderSummaryCard(ym) {
    const { total, toll, stats } = monthData(ym);
    const bonus = Storage.getBonuses()[ymKey(ym.y, ym.m)] || 0;
    const colors = shiftColors();
    const selectedEntry = Storage.getEntry(state.selectedDate);
    const selectedInThisMonth = ymOf(state.selectedDate).y === ym.y && ymOf(state.selectedDate).m === ym.m;

    const statItems = STATUSES.map((status) => `
      <div class="stat-item">
        <div class="stat-top"><span>${Icons.icon(STATUS_ICON[status], 16)}</span><span>${STATUS_LABEL[status]}</span></div>
        <div class="stat-count" style="color:${colors[status]}">${stats[status] || 0}</div>
      </div>
    `).join("");

    const tollBlock = toll > 0 ? `
      <div class="summary-toll">
        <span class="label">Péages</span>
        <span class="value">${formatEuro(toll)}</span>
      </div>` : "";

    const clearBtn = (selectedInThisMonth && selectedEntry) ? `
      <button class="clear-day-btn" id="btn-clear-day">🗑️ Effacer les données du jour</button>
    ` : "";

    return `
      <div class="summary-card">
        <div class="summary-top">
          <div class="summary-icon">💶</div>
          <div class="summary-main">
            <div class="summary-label">Salaire estimé</div>
            <div class="summary-amount">${formatEuro(total + bonus)}</div>
            <button class="summary-bonus-link" id="btn-edit-bonus">${bonus > 0 ? `Prime exceptionnelle : ${Math.trunc(bonus)} €` : "Ajouter une prime"}</button>
          </div>
          ${tollBlock}
        </div>
        <div class="summary-divider"></div>
        <div class="summary-stats">${statItems}</div>
      </div>
      ${clearBtn}
    `;
  }

  function renderRingHeader(ym) {
    const { total, toll, entries } = monthData(ym);
    const bonus = Storage.getBonuses()[ymKey(ym.y, ym.m)] || 0;
    const realSalary = Storage.getRealSalaries()[ymKey(ym.y, ym.m)];
    const totalDays = daysInMonth(ym.y, ym.m);
    const filled = entries.length;
    const r = 21;
    const circ = 2 * Math.PI * r;
    const progress = totalDays > 0 ? Math.min(filled / totalDays, 1) : 0;
    const otherMode = state.settings.viewMode === "month" ? "week" : "month";
    const toggleIcon = otherMode === "month" ? "📊" : "📋";
    const toggleLabel = otherMode === "month" ? "Mois" : "Semaine";
    const realHtml = realSalary != null
      ? `<span class="ring-header-real">réel : ${formatEuro(realSalary)}</span>` : "";
    return `
      <div class="ring-header">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--outline-variant)" stroke-width="6"/>
          <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--color-primary)" stroke-width="6"
            stroke-dasharray="${(progress * circ).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"
            transform="rotate(-90 26 26)"/>
        </svg>
        <div class="ring-header-info">
          <div class="ring-header-sub">${monthLabel(ym)} · ${filled}/${totalDays} postes</div>
          <button type="button" class="ring-header-amount-btn" id="btn-edit-real-salary" data-ym="${ymKey(ym.y, ym.m)}">
            <span class="ring-header-amount">${formatEuro(total + bonus)}</span><span class="ring-header-brut">brut</span>${realHtml}
          </button>
        </div>
        <button class="ring-toggle-btn" id="btn-toggle-view">${toggleIcon} ${toggleLabel}</button>
      </div>`;
  }

  function dayRowHtml(dateStr) {
    const entry = Storage.getEntry(dateStr);
    const colors = shiftColors();
    const s = state.settings;
    const dow = new Date(...dateStr.split("-").map((v, i) => i === 1 ? Number(v) - 1 : Number(v))).getDay();
    const dowLabel = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"][dow];
    const dayNum = Number(dateStr.split("-")[2]);
    const isSelected = dateStr === state.selectedDate;
    const isToday = dateStr === todayStr();
    // Text is always plain black or white (contrastingTextColor), never the vivid status
    // hue — a colored letter on a colored tinted background is unreadable in some
    // combos, so only the row background carries the status color.
    let bg = "var(--surface-variant)", textColor = null, statusText = "Vide, à remplir", tollText = "";
    if (entry) {
      const vivid = colors[entry.status];
      bg = mixWithSurfaceVariant(vivid, entry.status === "repos" || entry.status === "conges" ? 0.14 : 0.22);
      textColor = Palettes.contrastingTextColor(bg);
      statusText = STATUS_LABEL_LONG[entry.status];
      if (entry.status === "jour") statusText += " · " + (s.horaireJour || "");
      if (entry.status === "nuit") statusText += " · " + (s.horaireNuit || "");
      const peages = Storage.getPeages();
      if (peages.length > 0 && (entry.status === "jour" || entry.status === "nuit" || entry.status === "mn")) {
        const tollCount = Storage.tollTotalsForEntry(entry, peages).count;
        tollText = tollCount > 0 ? `🛣️ Péage${tollCount > 1 ? " ×" + tollCount : ""}` : "🛣️ Pas de péage";
      }
    }
    const dowColor = textColor || "var(--on-surface-variant)";
    const numColor = textColor || "var(--on-surface)";
    const statusColor = textColor || "var(--on-surface-variant)";
    return `<div class="day-cell day-row${isSelected ? " selected" : ""}${isToday ? " today" : ""}" style="background:${bg}" data-date="${dateStr}">
      <div class="dow-num"><span class="dow" style="color:${dowColor}">${dowLabel}</span><span class="num${isToday ? " today-num" : ""}" style="color:${numColor}">${dayNum}</span></div>
      <div class="status-text" style="color:${statusColor}">${statusText}</div>
      ${tollText ? `<div class="toll-text" style="color:${statusColor}">${tollText}</div>` : ""}
    </div>`;
  }

  function renderWeekView() {
    const weekStart = state.currentWeekStart;
    const ym = ymOf(weekStart);
    document.getElementById("btn-month-label").textContent = weekRangeLabel(weekStart);
    const colors = shiftColors();
    const stats = { jour: 0, nuit: 0, mn: 0, repos: 0, conges: 0 };
    let rowsHtml = "";
    for (let i = 0; i < 7; i++) {
      const d = dstr_addDays(weekStart, i);
      const entry = Storage.getEntry(d);
      if (entry && stats[entry.status] !== undefined) stats[entry.status]++;
      rowsHtml += dayRowHtml(d);
    }
    const totalItems = STATUSES.map((status) => `
      <div class="week-total-item">
        <span class="week-total-count" style="color:${colors[status]}">${stats[status] || 0}</span>
        <span class="week-total-label">${STATUS_LETTER[status]}</span>
      </div>
    `).join("");
    const pager = document.getElementById("pager");
    pager.innerHTML = renderRingHeader(ym) +
      `<div class="week-list">${rowsHtml}</div>
      <div class="week-total-row">
        <span class="week-total-title">Total semaine</span>
        <div class="week-total-items">${totalItems}</div>
      </div>`;
  }

  function renderMonthGridView() {
    const ym = state.currentMonth;
    document.getElementById("btn-month-label").textContent = monthLabel(ym);
    const pager = document.getElementById("pager");
    pager.innerHTML = renderRingHeader(ym) + renderCalendar(ym) + renderSummaryCard(ym);
  }

  function renderMonth() {
    const pager = document.getElementById("pager");
    if (state.settings.viewMode === "month") renderMonthGridView();
    else renderWeekView();
    pager.style.animation = "none";
    void pager.offsetWidth;
    pager.style.animation = "";
    const isCurrentPeriod = state.settings.viewMode === "month"
      ? (state.currentMonth.y === ymOf(todayStr()).y && state.currentMonth.m === ymOf(todayStr()).m)
      : state.currentWeekStart === weekStartOf(todayStr());
    document.getElementById("btn-today").classList.toggle("invisible", isCurrentPeriod);
    syncTodayFilledToNative();
  }

  // ---------------------------------------------------------------------
  // Action grid + paint banner
  // ---------------------------------------------------------------------
  function renderActionGrid() {
    const colors = shiftColors();
    const grid = document.getElementById("action-grid");
    grid.innerHTML = STATUSES.map((status) => {
      const vivid = colors[status];
      const active = state.paintStatus === status;
      const bg = mixWithSurfaceVariant(vivid, active ? 0.34 : 0.2);
      const fg = Palettes.contrastingTextColor(bg);
      const ring = active ? `box-shadow:inset 0 0 0 2px ${vivid};` : "";
      return `<button type="button" class="action-btn${active ? " active" : ""}" style="background:${bg};color:${fg};${ring}" data-status="${status}">
        <span class="icon">${Icons.icon(STATUS_ICON[status], 22)}</span>
        <span class="label">${STATUS_LABEL_LONG[status]}</span>
      </button>`;
    }).join("");
  }

  function renderPaintBanner() {
    const banner = document.getElementById("paint-banner");
    if (state.paintStatus) {
      banner.classList.remove("hidden");
      document.getElementById("paint-banner-text").textContent =
        `Mode peinture : ${STATUS_LABEL_LONG[state.paintStatus]} — touchez les jours à remplir`;
    } else {
      banner.classList.add("hidden");
    }
  }

  function renderAll() {
    applyTheme();
    renderMonth();
    renderActionGrid();
    renderPaintBanner();
    renderLogo();
  }

  // ---------------------------------------------------------------------
  // Dialog plumbing
  // ---------------------------------------------------------------------
  function openDialog(id) { document.getElementById(id).classList.remove("hidden"); }
  function closeDialog(id) { document.getElementById(id).classList.add("hidden"); }
  function closeAllDialogs() {
    document.querySelectorAll(".dialog").forEach((d) => d.classList.add("hidden"));
  }

  document.querySelectorAll(".dialog").forEach((dialog) => {
    dialog.addEventListener("mousedown", (e) => {
      if (e.target === dialog) {
        if (dialog.id === "dialog-edit-day") applyEditDay();
        dialog.classList.add("hidden");
      }
    });
  });

  function showToast(msg, ms) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add("hidden"), ms || 2500);
  }

  // ---------------------------------------------------------------------
  // Drawer
  // ---------------------------------------------------------------------
  const drawer = document.getElementById("drawer");
  function openDrawer() {
    const ym = state.settings.viewMode === "month" ? state.currentMonth : ymOf(state.currentWeekStart);
    const { total, stats } = monthData(ym);
    const bonus = Storage.getBonuses()[ymKey(ym.y, ym.m)] || 0;
    const realSalary = Storage.getRealSalaries()[ymKey(ym.y, ym.m)];
    const worked = stats.jour + stats.nuit + stats.mn;
    document.getElementById("drawer-summary-month").textContent = monthLabel(ym);
    document.getElementById("drawer-summary-amount").textContent = formatEuro(total + bonus);
    document.getElementById("drawer-summary-real").textContent = realSalary != null ? `réel : ${formatEuro(realSalary)}` : "";
    document.getElementById("btn-drawer-edit-real-salary").dataset.ym = ymKey(ym.y, ym.m);
    document.getElementById("drawer-summary-details").textContent = `${worked} poste${worked > 1 ? "s" : ""}`;
    openDialog("drawer");
  }
  function closeDrawer() { closeDialog("drawer"); }
  document.getElementById("btn-drawer-edit-real-salary").addEventListener("click", (e) => {
    openRealSalaryDialog(ymFromKey(e.currentTarget.dataset.ym));
  });

  // ---------------------------------------------------------------------
  // Android hardware back button (called from MainActivity.kt's onBackPressed).
  // Closes whatever overlay is currently on top instead of exiting the app; returns
  // false when there's nothing open so native code can fall back to its own behavior
  // (double-press-to-exit on the calendar).
  // ---------------------------------------------------------------------
  window.handleAndroidBack = function () {
    const openOverlays = document.querySelectorAll(".dialog:not(.hidden)");
    const top = openOverlays[openOverlays.length - 1];
    if (!top) return false;
    if (top.id === "dialog-edit-day") applyEditDay();
    top.classList.add("hidden");
    if (/^dialog-settings-/.test(top.id)) renderSettingsOverview();
    return true;
  };

  // ---------------------------------------------------------------------
  // Day click / long-press
  // ---------------------------------------------------------------------
  function applyPaint(dateStr, status) {
    const existing = Storage.getEntry(dateStr);
    Storage.saveEntry(
      dateStr, status,
      existing ? existing.ctype : null, existing ? existing.note : null, existing ? existing.tolls : {},
      existing ? existing.photoUri : null, existing ? existing.audioUri : null
    );
    haptic(10);
  }

  function handleDayClick(dateStr) {
    state.selectedDate = dateStr;
    if (state.paintStatus) applyPaint(dateStr, state.paintStatus);
    renderMonth();
  }

  function renderEditDayTolls(tolls) {
    const peages = Storage.getPeages();
    const container = document.getElementById("edit-day-tolls");
    if (peages.length === 0) {
      container.innerHTML = `<p class="hint">Aucun péage configuré — ajoute-en un dans Réglages → Péages.</p>`;
      return;
    }
    container.innerHTML = peages.map((p) => {
      const current = tolls[p.id] || 0;
      const btns = [0, 1, 2].map((v) =>
        `<button data-value="${v}" class="segmented-btn${v === current ? " selected" : ""}">${v}</button>`
      ).join("");
      return `
        <div class="value-row">
          <span>${p.name}</span>
          <div class="segmented" data-peage-id="${p.id}" style="width:132px">${btns}</div>
        </div>`;
    }).join("");
  }

  // ---------------------------------------------------------------------
  // Day media (photo / voice note) — files live only in the user-chosen media folder
  // (see AndroidBridge.saveMediaFile), never in localStorage; only the filename is kept
  // in the entry, resolved back to a content:// URI via AndroidBridge.getMediaUri.
  // ---------------------------------------------------------------------
  function mediaFolderConfigured() {
    return !!(window.AndroidBridge && window.AndroidBridge.saveMediaFile && state.settings.nativeMediaFolderName);
  }

  function resetAudioPlayerUI() {
    const audioEl = document.getElementById("edit-day-audio-el");
    audioEl.pause();
    audioEl.currentTime = 0;
    document.getElementById("audio-play-btn").textContent = "▶️";
    document.getElementById("audio-progress-fill").style.width = "0%";
    document.getElementById("audio-time").textContent = "0:00";
  }

  function renderEditDayMedia() {
    const hasFolder = mediaFolderConfigured();
    document.getElementById("edit-day-media-nofolder-photo").classList.toggle("hidden", hasFolder);
    document.getElementById("edit-day-media-nofolder-audio").classList.toggle("hidden", hasFolder);
    document.getElementById("edit-day-media-photo").classList.toggle("hidden", !hasFolder);
    document.getElementById("edit-day-media-audio").classList.toggle("hidden", !hasFolder);
    if (!hasFolder) return;

    const photoEmpty = document.getElementById("edit-day-photo-empty");
    const photoPreview = document.getElementById("edit-day-photo-preview");
    if (state.editingPhotoUri) {
      document.getElementById("edit-day-photo-img").src = state.editingPhotoUri;
      photoEmpty.classList.add("hidden");
      photoPreview.classList.remove("hidden");
    } else {
      photoEmpty.classList.remove("hidden");
      photoPreview.classList.add("hidden");
    }

    const audioEmpty = document.getElementById("edit-day-audio-empty");
    const audioPlayer = document.getElementById("edit-day-audio-player");
    const audioEl = document.getElementById("edit-day-audio-el");
    resetAudioPlayerUI();
    if (state.editingAudioUri) {
      audioEl.src = state.editingAudioUri;
      audioEmpty.classList.add("hidden");
      audioPlayer.classList.remove("hidden");
    } else {
      audioEl.removeAttribute("src");
      audioEmpty.classList.remove("hidden");
      audioPlayer.classList.add("hidden");
    }
  }

  // Persists the media reference right away (the file itself is already written natively
  // by the time this runs) instead of waiting for "Appliquer" — losing the link because the
  // user just backed out of the dialog would orphan a file that's otherwise saved fine.
  function persistEditingMediaNow() {
    if (!state.editingDate) return;
    const dialog = document.getElementById("dialog-edit-day");
    const status = dialog.dataset.status;
    const ctype = dialog.dataset.ctype || null;
    const note = document.getElementById("edit-day-note").value.trim();
    Storage.saveEntry(state.editingDate, status, ctype, note || null, state.editingTolls || {}, state.editingPhotoUri, state.editingAudioUri);
    renderMonth();
  }

  // Shared by the live camera shutter and the gallery picker — both hand this a drawable
  // (a <video> frame or a loaded <img>) plus its natural size, and get back a downscaled
  // JPEG data URL. Capping the size here (not just relying on getUserMedia's own "ideal"
  // constraint, which cameras aren't required to honor, and gallery photos can be full-res)
  // keeps every saved photo comfortably under the WebView JS-bridge's ~1MB Binder ceiling.
  function drawableToJpegDataUrl(source, sourceWidth, sourceHeight, maxDim, quality) {
    let w = sourceWidth, h = sourceHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } else { w = Math.round((w * maxDim) / h); h = maxDim; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(source, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  }

  function savePhotoDataUrl(dataUrl) {
    if (!state.editingDate) return;
    const base64 = dataUrl.split(",")[1] || "";
    const filename = `${state.editingDate}-photo.jpg`;
    const uri = window.AndroidBridge.saveMediaFile(state.editingPhotoUri || "", filename, "image/jpeg", base64);
    if (!uri) { showToast("Échec de l'ajout de la photo"); return; }
    state.editingPhotoUri = uri;
    persistEditingMediaNow();
    renderEditDayMedia();
  }

  function saveAudioBlob(blob, mimeType) {
    if (!state.editingDate) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      const ext = mimeType.indexOf("ogg") >= 0 ? "ogg" : mimeType.indexOf("mp4") >= 0 ? "m4a" : "webm";
      const filename = `${state.editingDate}-audio.${ext}`;
      const uri = window.AndroidBridge.saveMediaFile(state.editingAudioUri || "", filename, mimeType, base64);
      if (!uri) { showToast("Échec de l'ajout de la note vocale"); return; }
      state.editingAudioUri = uri;
      persistEditingMediaNow();
      renderEditDayMedia();
    };
    reader.onerror = () => showToast("Échec de l'ajout de la note vocale");
    reader.readAsDataURL(blob);
  }

  // ---------------------------------------------------------------------
  // In-app camera (photo) — a live getUserMedia() preview inside MyShift itself, rather
  // than handing off to the phone's separate camera app. WebChromeClient.onPermissionRequest
  // in MainActivity.kt is what actually lets this succeed (it checks the OS-level CAMERA
  // permission requested at startup).
  // ---------------------------------------------------------------------
  let cameraStream = null;

  function openCameraCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Caméra non disponible sur cet appareil");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1600 } }, audio: false })
      .then((stream) => {
        cameraStream = stream;
        document.getElementById("camera-video").srcObject = stream;
        openDialog("dialog-camera");
      })
      .catch(() => showToast("Impossible d'accéder à l'appareil photo"));
  }
  function closeCameraCapture() {
    if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; }
    closeDialog("dialog-camera");
  }
  document.getElementById("btn-add-photo").addEventListener("click", openCameraCapture);
  document.getElementById("camera-cancel").addEventListener("click", closeCameraCapture);
  document.getElementById("camera-shutter").addEventListener("click", () => {
    const video = document.getElementById("camera-video");
    const dataUrl = drawableToJpegDataUrl(video, video.videoWidth, video.videoHeight, 1600, 0.85);
    closeCameraCapture();
    savePhotoDataUrl(dataUrl);
  });

  // Attaching an existing photo instead of taking a new one — reuses the same
  // onShowFileChooser bridge already in place for CSV/JSON import, so no new native code
  // is needed to open the system gallery/picker.
  document.getElementById("btn-pick-photo").addEventListener("click", () => {
    document.getElementById("gallery-photo-input").click();
  });
  document.getElementById("gallery-photo-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !state.editingDate) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        savePhotoDataUrl(drawableToJpegDataUrl(img, img.naturalWidth, img.naturalHeight, 1600, 0.82));
      };
      img.onerror = () => showToast("Impossible de lire cette image");
      img.src = reader.result;
    };
    reader.onerror = () => showToast("Impossible de lire cette image");
    reader.readAsDataURL(file);
  });

  // ---------------------------------------------------------------------
  // In-app voice-note recorder — MediaRecorder over a getUserMedia() mic stream, same
  // rationale as the camera above: stays inside MyShift instead of the system recorder.
  // ---------------------------------------------------------------------
  let voiceRecorder = null, voiceChunks = [], voiceStream = null, voiceTimerId = null, voiceStartedAt = 0;

  function startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("Enregistrement audio non disponible sur cet appareil");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        voiceStream = stream;
        voiceChunks = [];
        voiceRecorder = new MediaRecorder(stream);
        voiceRecorder.addEventListener("dataavailable", (e) => { if (e.data.size > 0) voiceChunks.push(e.data); });
        voiceRecorder.start();
        voiceStartedAt = Date.now();
        document.getElementById("voice-recorder-dot").classList.add("recording");
        document.getElementById("voice-recorder-toggle").textContent = "■ Arrêter";
        voiceTimerId = setInterval(() => {
          const s = Math.floor((Date.now() - voiceStartedAt) / 1000);
          document.getElementById("voice-recorder-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        }, 250);
      })
      .catch(() => showToast("Impossible d'accéder au micro"));
  }
  function stopVoiceRecording(shouldSave) {
    clearInterval(voiceTimerId);
    document.getElementById("voice-recorder-dot").classList.remove("recording");
    const recorder = voiceRecorder;
    voiceRecorder = null;
    if (!recorder) { closeDialog("dialog-voice-recorder"); return; }
    const mimeType = recorder.mimeType || "audio/webm";
    recorder.addEventListener("stop", () => {
      if (voiceStream) { voiceStream.getTracks().forEach((t) => t.stop()); voiceStream = null; }
      closeDialog("dialog-voice-recorder");
      if (shouldSave && voiceChunks.length > 0) saveAudioBlob(new Blob(voiceChunks, { type: mimeType }), mimeType);
    });
    if (recorder.state !== "inactive") recorder.stop();
  }
  document.getElementById("btn-add-audio").addEventListener("click", () => {
    document.getElementById("voice-recorder-time").textContent = "0:00";
    document.getElementById("voice-recorder-dot").classList.remove("recording");
    document.getElementById("voice-recorder-toggle").textContent = "● Enregistrer";
    openDialog("dialog-voice-recorder");
  });
  document.getElementById("voice-recorder-cancel").addEventListener("click", () => stopVoiceRecording(false));
  document.getElementById("voice-recorder-toggle").addEventListener("click", () => {
    if (voiceRecorder && voiceRecorder.state === "recording") stopVoiceRecording(true);
    else startVoiceRecording();
  });

  document.getElementById("btn-remove-photo").addEventListener("click", () => {
    if (!state.editingPhotoUri) return;
    if (window.AndroidBridge && window.AndroidBridge.deleteMediaFile) window.AndroidBridge.deleteMediaFile(state.editingPhotoUri);
    state.editingPhotoUri = null;
    persistEditingMediaNow();
    renderEditDayMedia();
  });
  document.getElementById("btn-remove-audio").addEventListener("click", () => {
    if (!state.editingAudioUri) return;
    if (window.AndroidBridge && window.AndroidBridge.deleteMediaFile) window.AndroidBridge.deleteMediaFile(state.editingAudioUri);
    state.editingAudioUri = null;
    persistEditingMediaNow();
    renderEditDayMedia();
  });

  document.getElementById("edit-day-photo-img").addEventListener("click", (e) => {
    document.getElementById("photo-viewer-img").src = e.target.src;
    openDialog("dialog-photo-viewer");
  });

  // Custom audio player — a bare <audio controls> looks out of place next to the rest of
  // the app's styling, so the real <audio> element stays hidden and this drives a small
  // play/pause + progress bar UI instead.
  (function setupAudioPlayer() {
    const audioEl = document.getElementById("edit-day-audio-el");
    const playBtn = document.getElementById("audio-play-btn");
    const fill = document.getElementById("audio-progress-fill");
    const timeLabel = document.getElementById("audio-time");
    const track = document.querySelector(".audio-progress");
    function formatTime(s) {
      if (!isFinite(s) || s < 0) return "0:00";
      const m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return `${m}:${String(sec).padStart(2, "0")}`;
    }
    playBtn.addEventListener("click", () => {
      if (audioEl.paused) audioEl.play(); else audioEl.pause();
    });
    audioEl.addEventListener("play", () => { playBtn.textContent = "⏸️"; });
    audioEl.addEventListener("pause", () => { playBtn.textContent = "▶️"; });
    audioEl.addEventListener("ended", () => {
      playBtn.textContent = "▶️";
      audioEl.currentTime = 0;
      fill.style.width = "0%";
      timeLabel.textContent = "0:00";
    });
    audioEl.addEventListener("timeupdate", () => {
      const pct = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
      fill.style.width = pct + "%";
      timeLabel.textContent = formatTime(audioEl.currentTime);
    });
    track.addEventListener("click", (e) => {
      if (!audioEl.duration) return;
      const rect = track.getBoundingClientRect();
      audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * audioEl.duration;
    });
  })();

  function openEditDialogForDate(dateStr) {
    state.editingDate = dateStr;
    const entry = Storage.getEntry(dateStr);
    const status = (entry && entry.status) || state.paintStatus || "jour";
    document.getElementById("edit-day-status").textContent = "Statut : " + STATUS_LABEL[status];
    document.getElementById("edit-day-note").value = (entry && entry.note) || "";
    document.getElementById("dialog-edit-day").dataset.status = status;
    document.getElementById("dialog-edit-day").dataset.ctype = (entry && entry.ctype) || "";
    state.editingTolls = Object.assign({}, (entry && entry.tolls) || {});
    renderEditDayTolls(state.editingTolls);
    state.editingPhotoUri = (entry && entry.photoUri) || null;
    state.editingAudioUri = (entry && entry.audioUri) || null;
    renderEditDayMedia();
    openDialog("dialog-edit-day");
  }

  function applyEditDay() {
    if (!state.editingDate) return;
    const dialog = document.getElementById("dialog-edit-day");
    const status = dialog.dataset.status;
    const ctype = dialog.dataset.ctype || null;
    const note = document.getElementById("edit-day-note").value.trim();
    Storage.saveEntry(state.editingDate, status, ctype, note || null, state.editingTolls || {}, state.editingPhotoUri, state.editingAudioUri);
    state.editingDate = null;
    document.getElementById("edit-day-audio-el").pause();
    renderMonth();
  }

  document.getElementById("edit-day-apply").addEventListener("click", () => {
    applyEditDay();
    closeDialog("dialog-edit-day");
  });
  document.getElementById("edit-day-tolls").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    const group = btn.closest(".segmented");
    const peageId = group.dataset.peageId;
    group.querySelectorAll(".segmented-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.editingTolls = state.editingTolls || {};
    state.editingTolls[peageId] = Number(btn.dataset.value);
  });

  // Pointer-based click / long-press on calendar cells (delegated on #pager)
  (function setupDayPointerHandling() {
    const pager = document.getElementById("pager");
    let timer = null;
    let longPressed = false;
    let startX = 0, startY = 0;
    let activeDate = null;

    pager.addEventListener("pointerdown", (e) => {
      const cell = e.target.closest(".day-cell[data-date]");
      if (!cell) return;
      activeDate = cell.dataset.date;
      longPressed = false;
      startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => {
        longPressed = true;
        haptic(20);
        openEditDialogForDate(activeDate);
      }, 480);
    });
    pager.addEventListener("pointermove", (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12) {
        clearTimeout(timer);
        timer = null;
      }
    });
    function endPress(e) {
      const cell = e.target.closest && e.target.closest(".day-cell[data-date]");
      const date = activeDate;
      clearTimeout(timer);
      timer = null;
      if (date && !longPressed && cell) handleDayClick(date);
      activeDate = null;
    }
    pager.addEventListener("pointerup", endPress);
    pager.addEventListener("pointercancel", () => { clearTimeout(timer); timer = null; activeDate = null; });
    pager.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".day-cell[data-date]")) e.preventDefault();
    });

    // Clear-day / bonus buttons (delegated, rendered dynamically)
    pager.addEventListener("click", (e) => {
      if (e.target.closest("#btn-clear-day")) {
        if (!state.settings.confirmClearDay || confirm("Effacer les données de ce jour ?")) {
          Storage.clearEntry(state.selectedDate);
          renderMonth();
        }
      }
      if (e.target.closest("#btn-edit-bonus")) {
        openBonusDialog();
      }
      const realSalaryBtn = e.target.closest("#btn-edit-real-salary");
      if (realSalaryBtn) {
        openRealSalaryDialog(ymFromKey(realSalaryBtn.dataset.ym));
      }
      if (e.target.closest("#btn-toggle-view")) {
        const next = state.settings.viewMode === "month" ? "week" : "month";
        if (next === "month") {
          state.currentMonth = ymOf(state.currentWeekStart);
        } else {
          const t = todayStr();
          const inCurrentMonth = ymOf(t).y === state.currentMonth.y && ymOf(t).m === state.currentMonth.m;
          state.currentWeekStart = weekStartOf(inCurrentMonth ? t : dstr(state.currentMonth.y, state.currentMonth.m, 1));
        }
        state.settings = Storage.setSetting("viewMode", next);
        renderMonth();
      }
    });

    // Swipe left/right on the page to change month
    let touchStartX = null;
    document.getElementById("page").addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    document.getElementById("page").addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 70) {
        if (state.settings.viewMode === "month") {
          state.currentMonth = ymAdd(state.currentMonth, dx > 0 ? -1 : 1);
        } else {
          state.currentWeekStart = dstr_addDays(state.currentWeekStart, dx > 0 ? -7 : 7);
        }
        renderMonth();
      }
    }, { passive: true });
  })();

  // ---------------------------------------------------------------------
  // Bonus dialog
  // ---------------------------------------------------------------------
  function openBonusDialog() {
    const ym = state.currentMonth;
    const bonuses = Storage.getBonuses();
    document.getElementById("bonus-title").textContent = `Prime pour ${monthLabel(ym)}`;
    document.getElementById("bonus-amount").value = bonuses[ymKey(ym.y, ym.m)] || "";
    openDialog("dialog-bonus");
  }
  document.getElementById("bonus-save").addEventListener("click", () => {
    const ym = state.currentMonth;
    const amount = parseFloat(document.getElementById("bonus-amount").value) || 0;
    Storage.saveBonus(ymKey(ym.y, ym.m), amount);
    closeDialog("dialog-bonus");
    renderMonth();
  });

  // ---------------------------------------------------------------------
  // Real salary dialog (salaire réellement perçu, vs. l'estimation calculée)
  // ---------------------------------------------------------------------
  function ymFromKey(key) {
    const [y, m] = key.split("-").map(Number);
    return { y, m };
  }
  function openRealSalaryDialog(ym) {
    state.realSalaryYm = ym;
    const existing = Storage.getRealSalaries()[ymKey(ym.y, ym.m)];
    document.getElementById("real-salary-title").textContent = `Salaire réel — ${monthLabel(ym)}`;
    document.getElementById("real-salary-amount").value = existing != null ? existing : "";
    openDialog("dialog-real-salary");
  }
  document.getElementById("real-salary-save").addEventListener("click", () => {
    const ym = state.realSalaryYm;
    const raw = document.getElementById("real-salary-amount").value.trim();
    const key = ymKey(ym.y, ym.m);
    if (raw === "") {
      Storage.clearRealSalary(key);
    } else {
      Storage.saveRealSalary(key, parseFloat(raw) || 0);
    }
    closeDialog("dialog-real-salary");
    renderMonth();
  });

  // ---------------------------------------------------------------------
  // Month/year picker (main nav)
  // ---------------------------------------------------------------------
  function renderMonthPickerGrid() {
    document.getElementById("picker-year-label").textContent = state.pickerYear;
    const grid = document.getElementById("picker-months-grid");
    grid.innerHTML = MONTHS_FR_SHORT.map((name, idx) => {
      const m = idx + 1;
      const selected = state.pickerYear === state.currentMonth.y && m === state.currentMonth.m;
      return `<button type="button" class="month-btn${selected ? " selected" : ""}" data-month="${m}">${name}</button>`;
    }).join("");
  }
  document.getElementById("btn-month-label").addEventListener("click", () => {
    state.pickerYear = state.currentMonth.y;
    renderMonthPickerGrid();
    openDialog("dialog-month-picker");
  });
  document.getElementById("picker-year-prev").addEventListener("click", () => { state.pickerYear--; renderMonthPickerGrid(); });
  document.getElementById("picker-year-next").addEventListener("click", () => { state.pickerYear++; renderMonthPickerGrid(); });
  document.getElementById("picker-months-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".month-btn");
    if (!btn) return;
    state.currentMonth = { y: state.pickerYear, m: Number(btn.dataset.month) };
    state.currentWeekStart = weekStartOf(dstr(state.currentMonth.y, state.currentMonth.m, 1));
    closeDialog("dialog-month-picker");
    renderMonth();
  });

  // ---------------------------------------------------------------------
  // Top bar navigation
  // ---------------------------------------------------------------------
  document.getElementById("btn-menu").addEventListener("click", openDrawer);
  document.getElementById("btn-prev-month").addEventListener("click", () => {
    if (state.settings.viewMode === "month") {
      state.currentMonth = ymAdd(state.currentMonth, -1);
    } else {
      state.currentWeekStart = dstr_addDays(state.currentWeekStart, -7);
    }
    renderMonth();
  });
  document.getElementById("btn-next-month").addEventListener("click", () => {
    if (state.settings.viewMode === "month") {
      state.currentMonth = ymAdd(state.currentMonth, 1);
    } else {
      state.currentWeekStart = dstr_addDays(state.currentWeekStart, 7);
    }
    renderMonth();
  });
  document.getElementById("btn-today").addEventListener("click", () => {
    state.currentMonth = ymOf(todayStr());
    state.currentWeekStart = weekStartOf(todayStr());
    renderMonth();
  });

  // ---------------------------------------------------------------------
  // Action grid interactions (paint mode)
  // ---------------------------------------------------------------------
  document.getElementById("action-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".action-btn");
    if (!btn) return;
    const status = btn.dataset.status;
    state.paintStatus = state.paintStatus === status ? null : status;
    renderActionGrid();
    renderPaintBanner();
  });
  document.getElementById("btn-paint-stop").addEventListener("click", () => {
    state.paintStatus = null;
    renderActionGrid();
    renderPaintBanner();
  });

  // ---------------------------------------------------------------------
  // Global data-action delegation (drawer + secondary buttons + close buttons)
  // ---------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    switch (action) {
      case "close-dialog":
        closeAllDialogs();
        break;
      case "close-drawer":
        closeDrawer();
        break;
      case "close-settings-sub":
        btn.closest(".dialog").classList.add("hidden");
        renderSettingsOverview();
        break;
      case "open-settings":
        closeDrawer();
        openSettingsDialog();
        break;
      case "import-csv":
        closeDrawer();
        document.getElementById("csv-file-input").click();
        break;
      case "export-csv":
        closeDrawer();
        exportCsv();
        break;
      case "open-export-xlsx":
        closeDrawer();
        openXlsxDialog();
        break;
      case "apply-repos-series":
        closeDrawer();
        applyReposSeries();
        break;
      case "open-annual-stats":
        closeDrawer();
        openAnnualStatsDialog();
        break;
    }
  });

  // ---------------------------------------------------------------------
  // CSV import / export (mirrors MyShiftApp.kt exactly)
  // ---------------------------------------------------------------------
  document.getElementById("csv-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result).split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
        if (lines.length >= 2) {
          const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
          const peagesIdx = header.indexOf("peages");
          const tollIdx = header.indexOf("toll");
          for (const line of lines.slice(1)) {
            try {
              const cols = line.split(",");
              const dateStr = (cols[0] || "").trim();
              if (!dateStr) continue;
              const status = (cols[1] || "").trim();
              const ctype = (cols[2] || "").trim() || null;
              const note = (cols[3] || "").trim() || null;
              let tollCount = 0;
              if (peagesIdx >= 0) {
                tollCount = parseInt((cols[peagesIdx] || "").trim(), 10) || 0;
              } else if (tollIdx >= 0) {
                const v = (cols[tollIdx] || "").trim();
                tollCount = (v === "1" || v.toLowerCase() === "true") ? 1 : 0;
              }
              tollCount = Math.max(0, tollCount);
              let tolls = {};
              if (tollCount > 0) {
                let peages = Storage.getPeages();
                if (peages.length === 0) {
                  Storage.addPeage("Péage", 0);
                  peages = Storage.getPeages();
                }
                tolls = { [peages[0].id]: tollCount };
              }
              Storage.saveEntry(dateStr, status, ctype, note, tolls);
            } catch (err) { /* skip bad line */ }
          }
          showToast("Import terminé");
        } else {
          showToast("Fichier vide");
        }
      } catch (err) {
        showToast("Import impossible");
      }
      renderMonth();
    };
    reader.onerror = () => showToast("Import impossible");
    reader.readAsText(file, "utf-8");
  });

  // Inside the Android wrapper, a plain WebView has no download manager for blob: URLs — an
  // <a download> click on one silently does nothing. AndroidDownload.saveBase64 (from
  // MainActivity.kt) writes the file into the device's Téléchargements folder instead.
  // Falls back to the normal browser download for a plain PWA/desktop testing context.
  function downloadBlob(blob, filename) {
    if (window.AndroidDownload && window.AndroidDownload.saveBase64) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(",")[1] || "";
        window.AndroidDownload.saveBase64(filename, blob.type || "application/octet-stream", base64);
      };
      reader.onerror = () => showToast("Échec de l'enregistrement du fichier");
      reader.readAsDataURL(blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // XLSX exports go through AndroidBridge.saveXlsx instead of downloadBlob's
  // AndroidDownload.saveBase64 — native decides whether a custom destination folder is
  // configured (Réglages > Données > Export XLSX, e.g. a folder synced by kDrive) and
  // writes there, falling back to Téléchargements when none is set.
  function downloadXlsxBlob(blob, filename) {
    if (window.AndroidBridge && window.AndroidBridge.saveXlsx) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(",")[1] || "";
        window.AndroidBridge.saveXlsx(filename, blob.type || "application/octet-stream", base64);
      };
      reader.onerror = () => showToast("Échec de l'enregistrement du fichier");
      reader.readAsDataURL(blob);
      return;
    }
    downloadBlob(blob, filename);
  }

  async function maybeRunAutoBackup() {
    if (!state.settings.autoBackupEnabled) return;
    const today = todayStr();
    if (localStorage.getItem("myshift.lastAutoBackupDate") === today) return;
    localStorage.setItem("myshift.lastAutoBackupDate", today);
    try {
      const data = Storage.exportAll();
      const entryCount = Object.keys(data.entries || {}).length;
      if (entryCount === 0) {
        throw new Error("Aucune donnée à sauvegarder (calendrier vide) — sauvegarde annulée par sécurité");
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      downloadBlob(blob, `myshift-sauvegarde-auto-${today}.json`);
      localStorage.setItem("myshift.lastBackupSuccessDate", today);
      localStorage.setItem("myshift.lastBackupEntryCount", String(entryCount));
      localStorage.removeItem("myshift.lastBackupError");
    } catch (err) {
      localStorage.setItem("myshift.lastBackupError", (err && err.message) || "Erreur inconnue");
    }
  }

  function getBackupStatus() {
    const lastSuccess = localStorage.getItem("myshift.lastBackupSuccessDate");
    const error = localStorage.getItem("myshift.lastBackupError");
    const entryCount = localStorage.getItem("myshift.lastBackupEntryCount");
    let daysSince = null;
    if (lastSuccess) {
      const ms = new Date(todayStr()).getTime() - new Date(lastSuccess).getTime();
      daysSince = Math.round(ms / 86400000);
    }
    return { lastSuccess, error, entryCount, daysSince };
  }

  function exportJsonBackup() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const ym = todayStr().slice(0, 7);
    downloadBlob(blob, `myshift-sauvegarde-${ym}.json`);
    const entryCount = Object.keys(data.entries || {}).length;
    localStorage.setItem("myshift.lastBackupSuccessDate", todayStr());
    localStorage.setItem("myshift.lastBackupEntryCount", String(entryCount));
    localStorage.removeItem("myshift.lastBackupError");
    showToast("Sauvegarde exportée");
  }

  function importJsonBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!confirm("Remplacer les données actuelles par cette sauvegarde ?")) return;
        Storage.importAll(data);
        state.settings = Storage.getSettings();
        applyTheme();
        renderSettingsValues();
        renderAll();
        showToast("Sauvegarde importée");
      } catch (e) {
        showToast("Fichier de sauvegarde invalide");
      }
    };
    reader.readAsText(file);
  }

  // Ajoute tollCount/tollMontant (agrégés tous péages confondus) sur une
  // copie de chaque entrée — utilisé par l'export CSV et XLSX qui ne
  // connaissent pas le détail par péage, seulement le total du jour.
  function withTollTotals(entries) {
    const peages = Storage.getPeages();
    return entries.map((e) => {
      const t = Storage.tollTotalsForEntry(e, peages);
      return Object.assign({}, e, { tollCount: t.count, tollMontant: t.amount });
    });
  }

  function exportCsv() {
    const s = state.settings;
    const entries = withTollTotals(Storage.getEntriesArray()).sort((a, b) => a.date.localeCompare(b.date));
    const headers = ["date", "status", "ctype"];
    if (s.exportNotes) headers.push("note");
    if (s.exportToll) { headers.push("peages"); headers.push("montant_peages"); }
    if (s.exportBase) headers.push("salaryBase");
    const lines = [headers.join(",")];
    entries.forEach((e) => {
      const parts = [e.date, e.status, e.ctype || ""];
      if (s.exportNotes) parts.push((e.note || "").replace(/,/g, " "));
      if (s.exportToll) {
        parts.push(String(e.tollCount));
        parts.push(String(e.tollMontant));
      }
      if (s.exportBase) parts.push(String(s.salaryBase));
      lines.push(parts.join(","));
    });
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "myshift_export.csv");
  }

  // ---------------------------------------------------------------------
  // XLSX export dialog
  // ---------------------------------------------------------------------
  function xlsxConfig() {
    const s = state.settings;
    return {
      entries: withTollTotals(Storage.getEntriesArray()),
      monthlyBonuses: Storage.getBonuses(),
      realSalaries: Storage.getRealSalaries(),
      peages: Storage.getPeages(),
      salaryBase: s.salaryBase,
      rateJour: s.rateJour,
      rateNuit: s.rateNuit,
      rateMn: s.rateMn,
      tollAmount: s.tollAmount
    };
  }

  function renderXlsxPickers() {
    document.getElementById("xlsx-year-label").textContent = state.xlsxMonth.y;
    document.getElementById("xlsx-month-label").textContent = MONTHS_FR[state.xlsxMonth.m - 1];
    document.getElementById("xlsx-annual-year-label").textContent = state.xlsxYear;
  }

  function openXlsxDialog() {
    state.xlsxMode = "monthly";
    state.xlsxMonth = Object.assign({}, state.currentMonth);
    state.xlsxYear = state.currentMonth.y;
    if (!state.xlsxCustomStart) {
      state.xlsxCustomStart = dstr(state.currentMonth.y, state.currentMonth.m, 1);
      state.xlsxCustomEnd = todayStr();
    }
    document.getElementById("xlsx-custom-start").value = state.xlsxCustomStart;
    document.getElementById("xlsx-custom-end").value = state.xlsxCustomEnd;
    document.querySelectorAll("#xlsx-mode .segmented-btn").forEach((b) => b.classList.toggle("selected", b.dataset.value === "monthly"));
    document.getElementById("xlsx-monthly-pickers").classList.remove("hidden");
    document.getElementById("xlsx-annual-picker").classList.add("hidden");
    document.getElementById("xlsx-custom-pickers").classList.add("hidden");
    document.getElementById("xlsx-status").textContent = "";
    renderXlsxPickers();
    openDialog("dialog-export-xlsx");
  }

  document.getElementById("xlsx-mode").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    state.xlsxMode = btn.dataset.value;
    document.querySelectorAll("#xlsx-mode .segmented-btn").forEach((b) => b.classList.toggle("selected", b === btn));
    document.getElementById("xlsx-monthly-pickers").classList.toggle("hidden", state.xlsxMode !== "monthly");
    document.getElementById("xlsx-annual-picker").classList.toggle("hidden", state.xlsxMode !== "annual");
    document.getElementById("xlsx-custom-pickers").classList.toggle("hidden", state.xlsxMode !== "custom");
  });
  document.getElementById("xlsx-year-prev").addEventListener("click", () => { state.xlsxMonth.y--; renderXlsxPickers(); });
  document.getElementById("xlsx-year-next").addEventListener("click", () => { state.xlsxMonth.y++; renderXlsxPickers(); });
  document.getElementById("xlsx-month-prev").addEventListener("click", () => { state.xlsxMonth = ymAdd(state.xlsxMonth, -1); renderXlsxPickers(); });
  document.getElementById("xlsx-month-next").addEventListener("click", () => { state.xlsxMonth = ymAdd(state.xlsxMonth, 1); renderXlsxPickers(); });
  document.getElementById("xlsx-annual-year-prev").addEventListener("click", () => { state.xlsxYear--; renderXlsxPickers(); });
  document.getElementById("xlsx-annual-year-next").addEventListener("click", () => { state.xlsxYear++; renderXlsxPickers(); });
  document.getElementById("xlsx-custom-start").addEventListener("change", (e) => { state.xlsxCustomStart = e.target.value; });
  document.getElementById("xlsx-custom-end").addEventListener("change", (e) => { state.xlsxCustomEnd = e.target.value; });

  document.getElementById("xlsx-export-btn").addEventListener("click", () => {
    const statusEl = document.getElementById("xlsx-status");
    if (state.xlsxMode === "custom" && (!state.xlsxCustomStart || !state.xlsxCustomEnd || state.xlsxCustomStart > state.xlsxCustomEnd)) {
      statusEl.textContent = "Choisis une période valide (date de début avant la date de fin).";
      return;
    }
    statusEl.textContent = "Génération en cours...";
    setTimeout(() => {
      try {
        const config = xlsxConfig();
        if (state.xlsxMode === "monthly") {
          const blob = XlsxExport.buildMonthly(state.xlsxMonth.y, state.xlsxMonth.m, config);
          downloadXlsxBlob(blob, `MyShift_Releve_${ymKey(state.xlsxMonth.y, state.xlsxMonth.m)}.xlsx`);
        } else if (state.xlsxMode === "annual") {
          const blob = XlsxExport.buildAnnual(state.xlsxYear, config);
          downloadXlsxBlob(blob, `MyShift_Releve_${state.xlsxYear}.xlsx`);
        } else {
          const blob = XlsxExport.buildCustomRange(state.xlsxCustomStart, state.xlsxCustomEnd, config);
          downloadXlsxBlob(blob, `MyShift_Releve_${state.xlsxCustomStart}_au_${state.xlsxCustomEnd}.xlsx`);
        }
        statusEl.textContent = "";
        closeDialog("dialog-export-xlsx");
      } catch (err) {
        statusEl.textContent = "Erreur : " + err.message;
      }
    }, 30);
  });

  function applyReposSeries() {
    const weekdays = state.settings.reposWeekdays || [];
    if (weekdays.length === 0) {
      showToast("Choisis d'abord des jours dans Réglages → Repos récurrents");
      return;
    }
    const ym = state.currentMonth;
    const count = daysInMonth(ym.y, ym.m);
    let filled = 0;
    for (let d = 1; d <= count; d++) {
      const dateStr = dstr(ym.y, ym.m, d);
      const dow = new Date(ym.y, ym.m - 1, d).getDay();
      if (weekdays.includes(dow) && !Storage.getEntry(dateStr)) {
        Storage.saveEntry(dateStr, "repos", null, null, {});
        filled++;
      }
    }
    renderMonth();
    showToast(filled > 0 ? `${filled} jour(s) de repos ajoutés` : "Rien à ajouter, déjà rempli");
  }

  // ---------------------------------------------------------------------
  // Annual stats dialog
  // ---------------------------------------------------------------------
  function renderAnnualStats(year) {
    document.getElementById("annual-stats-year-label").textContent = String(year);
    const colors = shiftColors();
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(monthData({ y: year, m }));
    const maxDays = 31;
    const bars = months.map((md, i) => {
      const s = md.stats;
      const seg = (count, color) => count > 0 ? `<div class="stat-bar-seg" style="width:${(count / maxDays) * 100}%;background:${color}"></div>` : "";
      return `<div class="stat-bar-row">
        <span class="stat-bar-label">${MONTHS_FR_SHORT[i]}</span>
        <div class="stat-bar-track">${seg(s.jour, colors.jour)}${seg(s.nuit, colors.nuit)}${seg(s.mn, colors.mn)}${seg(s.repos, colors.repos)}${seg(s.conges, colors.conges)}</div>
      </div>`;
    }).join("");

    const realSalaries = Storage.getRealSalaries();
    const totals = { jour: 0, nuit: 0, mn: 0, repos: 0, conges: 0, toll: 0, total: 0, real: 0, realCount: 0 };
    const rows = months.map((md, i) => {
      const s = md.stats;
      totals.jour += s.jour; totals.nuit += s.nuit; totals.mn += s.mn;
      totals.repos += s.repos; totals.conges += s.conges;
      totals.toll += md.toll; totals.total += md.total;
      const real = realSalaries[ymKey(year, i + 1)];
      if (real != null) { totals.real += real; totals.realCount++; }
      const realCell = real != null ? formatEuro(real) : "—";
      return `<tr><td>${MONTHS_FR_SHORT[i]}</td><td>${s.jour}</td><td>${s.nuit}</td><td>${s.mn}</td><td>${s.repos}</td><td>${s.conges}</td><td>${formatEuro(md.toll)}</td><td>${formatEuro(md.total)}</td><td>${realCell}</td></tr>`;
    }).join("");
    const totalRealCell = totals.realCount > 0 ? formatEuro(totals.real) : "—";

    document.getElementById("annual-stats-content").innerHTML = `
      ${bars}
      <div class="stat-table-scroll">
        <table class="stat-table">
          <thead><tr><th>Mois</th><th>Jour</th><th>Nuit</th><th>MN</th><th>Repos</th><th>Congés</th><th>Péages</th><th>Estimé</th><th>Réel</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Total</td><td>${totals.jour}</td><td>${totals.nuit}</td><td>${totals.mn}</td><td>${totals.repos}</td><td>${totals.conges}</td><td>${formatEuro(totals.toll)}</td><td>${formatEuro(totals.total)}</td><td>${totalRealCell}</td></tr></tfoot>
        </table>
      </div>`;
  }

  function openAnnualStatsDialog() {
    state.annualStatsYear = Number(todayStr().slice(0, 4));
    renderAnnualStats(state.annualStatsYear);
    openDialog("dialog-annual-stats");
  }

  document.getElementById("annual-stats-year-prev").addEventListener("click", () => {
    state.annualStatsYear--;
    renderAnnualStats(state.annualStatsYear);
  });
  document.getElementById("annual-stats-year-next").addEventListener("click", () => {
    state.annualStatsYear++;
    renderAnnualStats(state.annualStatsYear);
  });

  // ---------------------------------------------------------------------
  // Settings dialog
  // ---------------------------------------------------------------------
  function renderPeagesList() {
    const peages = Storage.getPeages();
    const container = document.getElementById("set-peages-list");
    if (peages.length === 0) {
      container.innerHTML = `<div class="info-row"><span class="muted">Aucun péage configuré</span></div>`;
      return;
    }
    container.innerHTML = peages.map((p) => `
      <div class="value-row" data-peage-id="${p.id}">
        <span>${p.name}</span><span class="value">${formatEuro(Storage.peageAmountAt(p, todayStr()))}</span>
      </div>`).join("");
  }

  function renderSettingsValues() {
    const s = state.settings;
    document.getElementById("set-salaryBase").textContent = formatEuro(s.salaryBase);
    document.getElementById("set-rateJour").textContent = formatEuro(s.rateJour);
    document.getElementById("set-rateNuit").textContent = formatEuro(s.rateNuit);
    document.getElementById("set-rateMn").textContent = formatEuro(s.rateMn);
    document.getElementById("set-annual-estimate-row").classList.toggle("hidden", !(s.salaryBase > 0));
    document.getElementById("set-annual-estimate").textContent = Math.round(s.salaryBase * 12) + " €";
    renderPeagesList();

    document.getElementById("set-reminderEnabled").checked = s.reminderEnabled;
    document.getElementById("set-reminderHour-row").classList.toggle("hidden", !s.reminderEnabled);
    document.getElementById("set-reminderHour").textContent = s.reminderHour;
    renderQuickRepliesRows();

    document.getElementById("set-darkTheme").checked = s.darkTheme;
    document.getElementById("set-colorPalette").textContent = Palettes.PALETTES.find((p) => p.id === s.colorPalette).label;
    document.getElementById("set-bg-row").classList.toggle("hidden", !s.darkTheme);
    document.getElementById("set-darkBgVariant").textContent = BG_VARIANTS.find((b) => b.id === s.darkBgVariant).label;
    document.getElementById("set-logoColor").textContent = logoColorInfo(s.logoColor).label;
    document.getElementById("set-showWeekNumbers").checked = s.showWeekNumbers;
    document.getElementById("set-weekStartSunday").checked = s.weekStartSunday;
    document.getElementById("set-hapticFeedback").checked = s.hapticFeedback;
    document.getElementById("set-confirmClearDay").checked = s.confirmClearDay;
    renderStatusColorRows();
    document.getElementById("set-customTextColor").value =
      s.customTextColor || getComputedStyle(document.documentElement).getPropertyValue("--on-surface").trim() || "#ffffff";
    document.getElementById("btn-reset-text-color").classList.toggle("hidden", !s.customTextColor);
    document.getElementById("set-horaireJour").textContent = s.horaireJour;
    document.getElementById("set-horaireNuit").textContent = s.horaireNuit;
    document.querySelectorAll("#set-repos-weekdays .weekday-btn").forEach((btn) => {
      btn.classList.toggle("selected", (s.reposWeekdays || []).includes(Number(btn.dataset.dow)));
    });

    document.getElementById("set-exportNotes").checked = s.exportNotes;
    document.getElementById("set-exportToll").checked = s.exportToll;
    document.getElementById("set-exportBase").checked = s.exportBase;
    document.getElementById("set-congesLabel").textContent = s.congesLabel;

    document.getElementById("set-autoBackupEnabled").checked = !!s.autoBackupEnabled;
    document.getElementById("set-includeRatesInBackup").checked = s.includeRatesInBackup !== false;
    const nativeBridge = window.AndroidBridge && window.AndroidBridge.chooseBackupFolder;
    document.getElementById("btn-choose-backup-folder-native").classList.toggle("hidden", !nativeBridge);
    if (nativeBridge) {
      document.getElementById("set-native-backup-folder").textContent = s.nativeBackupFolderName || "Non choisi";
    }
    const nativeXlsxBridge = window.AndroidBridge && window.AndroidBridge.chooseXlsxFolder;
    document.getElementById("btn-choose-xlsx-folder-native").classList.toggle("hidden", !nativeXlsxBridge);
    if (nativeXlsxBridge) {
      document.getElementById("set-native-xlsx-folder").textContent = s.nativeXlsxFolderName || "Téléchargements (par défaut)";
      document.getElementById("btn-reset-xlsx-folder").classList.toggle("hidden", !s.nativeXlsxFolderName);
    }
    const nativeMediaBridge = window.AndroidBridge && window.AndroidBridge.chooseMediaFolder;
    document.getElementById("btn-choose-media-folder-native").classList.toggle("hidden", !nativeMediaBridge);
    if (nativeMediaBridge) {
      document.getElementById("set-native-media-folder").textContent = s.nativeMediaFolderName || "Non configuré";
      document.getElementById("btn-reset-media-folder").classList.toggle("hidden", !s.nativeMediaFolderName);
    }
  }

  function renderSettingsOverview() {
    const s = state.settings;
    const peages = Storage.getPeages();
    document.getElementById("cat-value-peages").textContent =
      peages.length === 0 ? "Aucun" : peages.length + (peages.length > 1 ? " péages" : " péage");
    document.getElementById("cat-value-apparence").textContent =
      Palettes.PALETTES.find((p) => p.id === s.colorPalette).label;
    document.getElementById("cat-value-notifications").textContent =
      s.reminderEnabled ? s.reminderHour : "Désactivées";
  }

  function renderStatusColorRows() {
    const container = document.getElementById("set-status-colors");
    if (!container) return;
    const base = Palettes.shiftColors(state.settings.colorPalette, state.settings.darkTheme);
    const custom = state.settings.customStatusColors || {};
    container.innerHTML = STATUSES.map((status) => {
      const hex = custom[status] || base[status];
      const isCustom = !!custom[status];
      return `
        <div class="value-row status-color-row">
          <span>${Icons.icon(STATUS_ICON[status], 16)} ${STATUS_LABEL_LONG[status]}</span>
          <div class="status-color-controls">
            <button type="button" class="icon-btn small status-color-reset${isCustom ? "" : " hidden"}" data-status="${status}" aria-label="Réinitialiser">↺</button>
            <input type="color" class="status-color-input" data-status="${status}" value="${hex}">
          </div>
        </div>`;
    }).join("");
  }

  function renderQuickRepliesRows() {
    const container = document.getElementById("set-quick-replies");
    if (!container) return;
    const list = state.settings.quickReplies || [];
    const peages = Storage.getPeages();
    container.innerHTML = list.map((qr, idx) => {
      const statusBtns = STATUSES.map((s) =>
        `<button type="button" class="segmented-btn${qr.status === s ? " selected" : ""}" data-idx="${idx}" data-field="status" data-value="${s}">${STATUS_LETTER[s]}</button>`
      ).join("");
      const showToll = peages.length > 0 && (qr.status === "jour" || qr.status === "nuit" || qr.status === "mn");
      const tollRow = showToll ? `
          <div class="segmented" data-quick-row="toll">
            ${[0, 1, 2].map((v) =>
              `<button type="button" class="segmented-btn${(qr.toll || 0) === v ? " selected" : ""}" data-idx="${idx}" data-field="toll" data-value="${v}">${v} péage${v !== 1 ? "s" : ""}</button>`
            ).join("")}
          </div>` : "";
      return `
        <div class="value-row quick-reply-row">
          <span class="muted">Réponse rapide ${idx + 1}</span>
          <div class="segmented" data-quick-row="status">${statusBtns}</div>
          ${tollRow}
        </div>`;
    }).join("");
  }

  function openSettingsDialog() {
    renderSettingsValues();
    renderSettingsOverview();
    openDialog("dialog-settings");
  }

  document.getElementById("dialog-settings").addEventListener("click", (e) => {
    const catRow = e.target.closest(".settings-cat-row[data-open-settings]");
    if (catRow) {
      openDialog("dialog-settings-" + catRow.dataset.openSettings);
      if (catRow.dataset.openSettings === "donnees") renderBackupStatusBanner();
    }
  });

  function renderBackupStatusBanner() {
    const banner = document.getElementById("backup-status-banner");
    const status = getBackupStatus();
    if (status.error) {
      banner.className = "backup-status-banner error";
      banner.textContent = `Dernière sauvegarde échouée : ${status.error}`;
    } else if (!status.lastSuccess) {
      banner.className = "backup-status-banner warn";
      banner.textContent = "Aucune sauvegarde effectuée pour l'instant";
    } else if (state.settings.autoBackupEnabled && status.daysSince > 2) {
      banner.className = "backup-status-banner warn";
      banner.textContent = `Dernière sauvegarde réussie il y a ${status.daysSince} jours — vérifie que la sauvegarde auto fonctionne`;
    } else {
      banner.className = "backup-status-banner ok";
      const when = status.daysSince === 0 ? "aujourd'hui" : status.daysSince === 1 ? "hier" : `il y a ${status.daysSince} jours`;
      banner.textContent = `Dernière sauvegarde réussie ${when} (${status.entryCount} jours enregistrés)`;
    }
  }

  function renderPeageHistory(peage) {
    const container = document.getElementById("peage-edit-history");
    if (!peage || peage.history.length <= 1) { container.innerHTML = ""; return; }
    const rows = peage.history.slice().reverse().map((h) =>
      `<div class="info-row"><span class="muted">à partir du ${h.from.split("-").reverse().join("/")}</span><span class="value">${formatEuro(h.amount)}</span></div>`
    ).join("");
    container.innerHTML = `<div class="field-label">Historique des tarifs</div>${rows}`;
  }

  function openPeageEditDialog(peageId) {
    const dialog = document.getElementById("dialog-peage-edit");
    dialog.dataset.peageId = peageId || "";
    const deleteBtn = document.getElementById("peage-edit-delete");
    if (peageId) {
      const p = Storage.getPeages().find((x) => x.id === peageId);
      document.getElementById("peage-edit-title").textContent = "Modifier le péage";
      document.getElementById("peage-edit-name").value = p ? p.name : "";
      document.getElementById("peage-edit-amount").value = p ? Storage.peageAmountAt(p, todayStr()) : "";
      renderPeageHistory(p);
      deleteBtn.classList.remove("hidden");
    } else {
      document.getElementById("peage-edit-title").textContent = "Nouveau péage";
      document.getElementById("peage-edit-name").value = "";
      document.getElementById("peage-edit-amount").value = "";
      document.getElementById("peage-edit-history").innerHTML = "";
      deleteBtn.classList.add("hidden");
    }
    openDialog("dialog-peage-edit");
  }

  document.getElementById("peage-edit-save").addEventListener("click", () => {
    const dialog = document.getElementById("dialog-peage-edit");
    const name = document.getElementById("peage-edit-name").value.trim();
    const amount = parseFloat(document.getElementById("peage-edit-amount").value) || 0;
    if (!name) return showToast("Donne un nom à ce péage");
    const peageId = dialog.dataset.peageId;
    if (peageId) {
      Storage.renamePeage(peageId, name);
      const current = Storage.getPeages().find((x) => x.id === peageId);
      if (Storage.peageAmountAt(current, todayStr()) !== amount) {
        Storage.setPeageAmount(peageId, amount);
      }
    } else {
      Storage.addPeage(name, amount, "2000-01-01");
    }
    closeDialog("dialog-peage-edit");
    renderPeagesList();
    renderAll();
  });

  document.getElementById("peage-edit-delete").addEventListener("click", () => {
    const dialog = document.getElementById("dialog-peage-edit");
    if (dialog.dataset.peageId && confirm("Supprimer ce péage ?")) {
      Storage.deletePeage(dialog.dataset.peageId);
      closeDialog("dialog-peage-edit");
      renderPeagesList();
      renderAll();
    }
  });

  document.addEventListener("click", (e) => {
    const row = e.target.closest(".value-row[data-edit]");
    if (row && row.id !== "set-palette-row") {
      openGenericEdit(row.dataset.edit, row.dataset.label, row.dataset.type);
    }
    if (e.target.closest("#set-palette-row")) openPaletteDialog();
    if (e.target.closest("#set-bg-row")) openBgDialog();
    if (e.target.closest("#set-logo-color-row")) openLogoColorDialog();
    if (e.target.closest("#btn-add-peage")) openPeageEditDialog(null);
    if (e.target.closest("#btn-choose-backup-folder-native")) {
      if (window.AndroidBridge && window.AndroidBridge.chooseBackupFolder) {
        window.AndroidBridge.chooseBackupFolder();
      }
    }
    if (e.target.closest("#btn-reset-xlsx-folder")) {
      // Reset takes priority over the row's own "choose a folder" click below it.
      if (window.AndroidBridge && window.AndroidBridge.clearXlsxFolder) {
        window.AndroidBridge.clearXlsxFolder();
        state.settings = Storage.setSetting("nativeXlsxFolderName", null);
        renderSettingsValues();
      }
    } else if (e.target.closest("#btn-choose-xlsx-folder-native")) {
      if (window.AndroidBridge && window.AndroidBridge.chooseXlsxFolder) {
        window.AndroidBridge.chooseXlsxFolder();
      }
    }
    if (e.target.closest("#btn-reset-media-folder")) {
      if (window.AndroidBridge && window.AndroidBridge.clearMediaFolder) {
        window.AndroidBridge.clearMediaFolder();
        state.settings = Storage.setSetting("nativeMediaFolderName", null);
        renderSettingsValues();
        if (state.editingDate) renderEditDayMedia();
      }
    } else if (e.target.closest("#btn-choose-media-folder-native")) {
      if (window.AndroidBridge && window.AndroidBridge.chooseMediaFolder) {
        window.AndroidBridge.chooseMediaFolder();
      }
    }
    const dowBtn = e.target.closest("#set-repos-weekdays .weekday-btn");
    if (dowBtn) {
      const dow = Number(dowBtn.dataset.dow);
      const current = state.settings.reposWeekdays || [];
      const next = current.includes(dow) ? current.filter((d) => d !== dow) : current.concat(dow);
      state.settings = Storage.setSetting("reposWeekdays", next);
      renderSettingsValues();
    }
    const peageRow = e.target.closest("#set-peages-list .value-row[data-peage-id]");
    if (peageRow) openPeageEditDialog(peageRow.dataset.peageId);
    const quickBtn = e.target.closest("#set-quick-replies .segmented-btn");
    if (quickBtn) {
      const idx = Number(quickBtn.dataset.idx);
      const field = quickBtn.dataset.field;
      const value = field === "toll" ? Number(quickBtn.dataset.value) : quickBtn.dataset.value;
      const list = (state.settings.quickReplies || []).map((qr) => Object.assign({}, qr));
      list[idx] = Object.assign({}, list[idx], { [field]: value });
      if (field === "status" && value !== "jour" && value !== "nuit" && value !== "mn") list[idx].toll = 0;
      state.settings = Storage.setSetting("quickReplies", list);
      renderQuickRepliesRows();
      syncQuickRepliesToNative();
    }
    if (e.target.closest("#btn-reset-text-color")) {
      state.settings = Storage.setSetting("customTextColor", null);
      renderSettingsValues();
      renderAll();
    }
    const colorReset = e.target.closest(".status-color-reset");
    if (colorReset) {
      const custom = Object.assign({}, state.settings.customStatusColors || {});
      delete custom[colorReset.dataset.status];
      state.settings = Storage.setSetting("customStatusColors", custom);
      renderStatusColorRows();
      renderAll();
    }
    if (e.target.closest('[data-action="export-json"]')) exportJsonBackup();
    if (e.target.closest('[data-action="import-json"]')) document.getElementById("json-file-input").click();
    if (e.target.closest("#btn-reset-data")) {
      if (confirm("Réinitialiser toutes les données locales (poste, réglages, primes) ? Cette action est irréversible.")) {
        Storage.resetAll();
        location.reload();
      }
    }
  });

  document.getElementById("json-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importJsonBackup(file);
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "set-autoBackupEnabled") {
      state.settings = Storage.setSetting("autoBackupEnabled", e.target.checked);
      if (e.target.checked) maybeRunAutoBackup();
      return;
    }
    if (e.target.id === "set-includeRatesInBackup") {
      state.settings = Storage.setSetting("includeRatesInBackup", e.target.checked);
      return;
    }
    if (e.target.id === "set-customTextColor") {
      state.settings = Storage.setSetting("customTextColor", e.target.value);
      renderSettingsValues();
      renderAll();
      return;
    }
    if (e.target.classList.contains("status-color-input")) {
      const custom = Object.assign({}, state.settings.customStatusColors || {}, { [e.target.dataset.status]: e.target.value });
      state.settings = Storage.setSetting("customStatusColors", custom);
      renderStatusColorRows();
      renderAll();
      return;
    }
    const map = {
      "set-reminderEnabled": "reminderEnabled",
      "set-darkTheme": "darkTheme",
      "set-showWeekNumbers": "showWeekNumbers",
      "set-weekStartSunday": "weekStartSunday",
      "set-hapticFeedback": "hapticFeedback",
      "set-confirmClearDay": "confirmClearDay",
      "set-exportNotes": "exportNotes",
      "set-exportToll": "exportToll",
      "set-exportBase": "exportBase"
    };
    const key = map[e.target.id];
    if (!key) return;
    state.settings = Storage.setSetting(key, e.target.checked);
    if (key === "reminderEnabled" && e.target.checked) requestNotificationPermission();
    if (key === "reminderEnabled") syncReminderConfigToNative();
    // Realign the currently displayed week immediately instead of waiting for the next
    // navigation — otherwise the row order stays stale until prev/next/today is tapped.
    if (key === "weekStartSunday") state.currentWeekStart = weekStartOf(state.currentWeekStart);
    // renderAll() first: it calls applyTheme(), which renderSettingsValues() depends on to
    // read the current --on-surface value for the "Couleur du texte" swatch preview when no
    // custom color is set — otherwise a dark/light toggle shows the swatch a step behind.
    renderAll();
    renderSettingsValues();
  });

  function openGenericEdit(key, label, type) {
    document.getElementById("generic-edit-title").textContent = label;
    const input = document.getElementById("generic-edit-input");
    input.value = state.settings[key];
    input.type = type === "number" ? "number" : "text";
    if (type === "number") input.step = "0.01";
    openDialog("dialog-generic-edit");
    document.getElementById("generic-edit-save").onclick = () => {
      let value = input.value;
      if (type === "number") {
        const n = parseFloat(value);
        if (!isNaN(n)) value = n; else return closeDialog("dialog-generic-edit");
      } else if (key === "reminderHour") {
        if (!/^\d{2}:\d{2}$/.test(value)) return closeDialog("dialog-generic-edit");
      }
      state.settings = Storage.setSetting(key, value);
      if (key === "reminderHour") syncReminderConfigToNative();
      closeDialog("dialog-generic-edit");
      renderSettingsValues();
      renderAll();
    };
  }

  const BG_VARIANTS = [
    { id: "ardoise", label: "Ardoise", swatch: "#0F172A" },
    { id: "oled", label: "Noir OLED", swatch: "#000000" },
    { id: "gris", label: "Gris chaud", swatch: "#1C1B1F" }
  ];

  function openBgDialog() {
    const list = document.getElementById("bg-list");
    list.innerHTML = BG_VARIANTS.map((b) => {
      const isCurrent = b.id === state.settings.darkBgVariant;
      return `<div class="palette-option" data-id="${b.id}">
        <div class="palette-swatch" style="background:${b.swatch};border:1px solid var(--outline-variant)"></div>
        <div class="name">${b.label}</div>
        ${isCurrent ? '<div class="check">✓</div>' : ""}
      </div>`;
    }).join("");
    openDialog("dialog-bg");
  }
  document.getElementById("bg-list").addEventListener("click", (e) => {
    const opt = e.target.closest(".palette-option");
    if (!opt) return;
    state.settings = Storage.setSetting("darkBgVariant", opt.dataset.id);
    closeDialog("dialog-bg");
    renderSettingsValues();
    renderAll();
  });

  function openPaletteDialog() {
    const list = document.getElementById("palette-list");
    list.innerHTML = Palettes.PALETTES.map((p) => {
      const tones = Palettes.paletteTones(p.id, state.settings.darkTheme);
      const isCurrent = p.id === state.settings.colorPalette;
      return `<div class="palette-option" data-id="${p.id}">
        <div class="palette-swatch" style="background:${tones.primary}"></div>
        <div class="name">${p.label}</div>
        ${isCurrent ? '<div class="check">✓</div>' : ""}
      </div>`;
    }).join("");
    openDialog("dialog-palette");
  }
  document.getElementById("palette-list").addEventListener("click", (e) => {
    const opt = e.target.closest(".palette-option");
    if (!opt) return;
    state.settings = Storage.setSetting("colorPalette", opt.dataset.id);
    closeDialog("dialog-palette");
    renderSettingsValues();
    renderAll();
  });

  function openLogoColorDialog() {
    const list = document.getElementById("logo-color-list");
    list.innerHTML = LOGO_COLORS.map((c) => {
      const isCurrent = c.id === state.settings.logoColor;
      return `<div class="palette-option" data-id="${c.id}">
        <div class="logo-swatch">${logoSvg(c.hex, 32)}</div>
        <div class="name">${c.label}</div>
        ${isCurrent ? '<div class="check">✓</div>' : ""}
      </div>`;
    }).join("");
    openDialog("dialog-logo-color");
  }
  document.getElementById("logo-color-list").addEventListener("click", (e) => {
    const opt = e.target.closest(".palette-option");
    if (!opt) return;
    state.settings = Storage.setSetting("logoColor", opt.dataset.id);
    if (window.AndroidBridge && window.AndroidBridge.chooseLauncherIconColor) {
      window.AndroidBridge.chooseLauncherIconColor(opt.dataset.id);
    }
    closeDialog("dialog-logo-color");
    renderSettingsValues();
    renderAll();
  });

  // ---------------------------------------------------------------------
  // Reminder notifications (best-effort, only while the app tab is open)
  // ---------------------------------------------------------------------
  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
  // Android Chrome/WebView refuses `new Notification(...)` called directly from page
  // script ("Illegal constructor") — it only allows notifications shown through a
  // Service Worker registration. That's why the reminder used to silently do nothing
  // on phones even though the setting showed "enabled". Falls back to the plain
  // constructor for browsers where no service worker is registered (e.g. desktop
  // Safari, or file:// during local testing).
  function showAppNotification(title, options) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.showNotification(title, options);
        else try { new Notification(title, options); } catch (e) { /* ignore */ }
      }).catch(() => { try { new Notification(title, options); } catch (e) { /* ignore */ } });
    } else {
      try { new Notification(title, options); } catch (e) { /* ignore */ }
    }
  }
  function reminderTick() {
    // Inside the Android wrapper, Reminders.kt/ReminderReceiver own the daily reminder via
    // AlarmManager so it still fires with the app closed — this page-only fallback would
    // just produce a duplicate notification on top of it, so step aside when that bridge
    // is present.
    if (window.AndroidBridge && window.AndroidBridge.setReminderConfig) return;
    const s = state.settings;
    if (!s.reminderEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const hhmm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    // ">=" rather than "===": the app only checks while it's open (no background
    // execution here), so if it happens to be closed at the exact reminder minute —
    // very likely on a phone — an exact-match check would miss the reminder for the
    // whole day. Comparing "at or after" means opening the app any time later that
    // day still catches up on today's reminder.
    if (hhmm < s.reminderHour) return;
    const today = todayStr();
    if (localStorage.getItem("myshift.lastReminderDate") === today) return;
    localStorage.setItem("myshift.lastReminderDate", today);
    if (Storage.getEntry(today)) return; // déjà renseigné, pas besoin de rappel
    showAppNotification("MyShift", {
      body: "Ton poste d'aujourd'hui n'est pas encore renseigné.",
      icon: "icons/icon-192.png"
    });
  }
  setInterval(reminderTick, 30000);
  reminderTick();
  if (state.settings.reminderEnabled) requestNotificationPermission();
  syncReminderConfigToNative();
  syncQuickRepliesToNative();

  // ---------------------------------------------------------------------
  // Service worker registration
  // ---------------------------------------------------------------------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  renderAll();
  maybeRunAutoBackup();
})();
