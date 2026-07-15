(function () {
  "use strict";

  const STATUSES = ["jour", "nuit", "mn", "repos", "conges"];
  const STATUS_LABEL = { jour: "Jour", nuit: "Nuit", mn: "MN", repos: "Repos", conges: "Congés" };
  const STATUS_LABEL_LONG = { jour: "Jour", nuit: "Nuit", mn: "Montée", repos: "Repos", conges: "Congé" };
  const STATUS_LETTER = { jour: "J", nuit: "N", mn: "MN", repos: "R", conges: "C" };
  const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const MONTHS_FR_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

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

  // ---------------------------------------------------------------------
  // Global state
  // ---------------------------------------------------------------------
  const state = {
    settings: Storage.getSettings(),
    currentMonth: ymOf(todayStr()),
    selectedDate: todayStr(),
    paintStatus: null,
    editingDate: null,
    xlsxMode: "monthly",
    xlsxMonth: null,
    xlsxYear: null,
    pickerYear: null
  };

  function shiftColors() {
    return Palettes.shiftColors(state.settings.colorPalette, state.settings.darkTheme);
  }

  // ---------------------------------------------------------------------
  // Theme application
  // ---------------------------------------------------------------------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.darkTheme ? "dark" : "light");
    const tones = Palettes.paletteTones(state.settings.colorPalette, state.settings.darkTheme);
    document.documentElement.style.setProperty("--color-primary", tones.primary);
    document.documentElement.style.setProperty("--color-on-primary", Palettes.contrastingTextColor(tones.primary));
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
    let total = state.settings.exportBase ? state.settings.salaryBase : 0;
    let toll = 0;
    const stats = { jour: 0, nuit: 0, mn: 0, repos: 0, conges: 0 };
    entries.forEach((e) => {
      total += rateFor(e.status);
      toll += e.tollCount * state.settings.tollAmount;
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
    const days = [];
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth(ym.y, ym.m); d++) days.push(dstr(ym.y, ym.m, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  function isoWeekNumber(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function dayCellHtml(dateStr, entriesMap, colors) {
    if (dateStr === null) return `<div class="day-cell empty"></div>`;
    const entry = entriesMap[dateStr];
    const isSelected = dateStr === state.selectedDate;
    const isToday = dateStr === todayStr();
    let bg, textColor;
    if (entry) {
      bg = colors[entry.status];
      textColor = Palettes.contrastingTextColor(bg);
    } else {
      bg = null;
      textColor = "var(--on-surface)";
    }
    const classes = ["day-cell"];
    if (isSelected) classes.push("selected");
    if (isToday) classes.push("today");
    const dayNum = Number(dateStr.split("-")[2]);
    let dots = "";
    if (entry && entry.note) dots += `<span class="day-note-dot" style="background:${textColor}"></span>`;
    if (entry && entry.tollCount > 0) {
      for (let i = 0; i < entry.tollCount; i++) {
        dots += `<span class="day-note-dot" style="background:${colors.peage}"></span>`;
      }
    }
    const style = bg ? `background:${bg};color:${textColor};` : `color:${textColor};`;
    return `<button type="button" class="${classes.join(" ")}" style="${style}" data-date="${dateStr}">
      <span>${dayNum}</span>
      <span class="day-dots">${dots}</span>
    </button>`;
  }

  function renderCalendar(ym) {
    const entriesMap = Storage.getEntriesMap();
    const colors = shiftColors();
    const days = buildDaysGrid(ym);
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

    const showWeek = state.settings.showWeekNumbers;
    let html = "";
    rows.forEach((row) => {
      const rowClass = showWeek ? "calendar-row with-week-numbers" : "calendar-row";
      let weekCell = "";
      if (showWeek) {
        const firstReal = row.find((d) => d !== null);
        weekCell = `<div class="week-number">${firstReal ? isoWeekNumber(firstReal) : ""}</div>`;
      }
      html += `<div class="${rowClass}">${weekCell}${row.map((d) => dayCellHtml(d, entriesMap, colors)).join("")}</div>`;
    });
    return html;
  }

  function renderSummaryCard(ym) {
    const { total, toll, stats } = monthData(ym);
    const bonus = Storage.getBonuses()[ymKey(ym.y, ym.m)] || 0;
    const colors = shiftColors();
    const selectedEntry = Storage.getEntry(state.selectedDate);
    const selectedInThisMonth = ymOf(state.selectedDate).y === ym.y && ymOf(state.selectedDate).m === ym.m;

    const statItems = [
      ["jour", "☀️"], ["nuit", "🌙"], ["mn", "⬆️"], ["repos", "☕"], ["conges", "✈️"]
    ].map(([status, icon]) => `
      <div class="stat-item">
        <div class="stat-top"><span>${icon}</span><span>${STATUS_LABEL[status]}</span></div>
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

  function renderMonth() {
    document.getElementById("btn-month-label").textContent = monthLabel(state.currentMonth);
    const pager = document.getElementById("pager");
    pager.innerHTML = renderCalendar(state.currentMonth) + renderSummaryCard(state.currentMonth);
  }

  // ---------------------------------------------------------------------
  // Action grid + paint banner
  // ---------------------------------------------------------------------
  function renderActionGrid() {
    const colors = shiftColors();
    const grid = document.getElementById("action-grid");
    grid.innerHTML = STATUSES.map((status) => {
      const bg = colors[status];
      const fg = Palettes.contrastingTextColor(bg);
      const active = state.paintStatus === status;
      return `<button type="button" class="action-btn${active ? " active" : ""}" style="background:${bg};color:${fg}" data-status="${status}">
        <span class="letter">${STATUS_LETTER[status]}</span>
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
  const overlay = document.getElementById("overlay");
  function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("visible");
    setTimeout(() => overlay.classList.add("hidden"), 200);
  }
  overlay.addEventListener("click", closeDrawer);

  // ---------------------------------------------------------------------
  // Day click / long-press
  // ---------------------------------------------------------------------
  function applyPaint(dateStr, status) {
    const existing = Storage.getEntry(dateStr);
    Storage.saveEntry(dateStr, status, existing ? existing.ctype : null, existing ? existing.note : null, existing ? existing.tollCount : 0);
  }

  function handleDayClick(dateStr) {
    state.selectedDate = dateStr;
    if (state.paintStatus) applyPaint(dateStr, state.paintStatus);
    renderMonth();
  }

  function openEditDialogForDate(dateStr) {
    state.editingDate = dateStr;
    const entry = Storage.getEntry(dateStr);
    const status = (entry && entry.status) || state.paintStatus || "jour";
    document.getElementById("edit-day-status").textContent = "Statut : " + STATUS_LABEL[status];
    document.getElementById("edit-day-note").value = (entry && entry.note) || "";
    document.getElementById("dialog-edit-day").dataset.status = status;
    document.getElementById("dialog-edit-day").dataset.ctype = (entry && entry.ctype) || "";
    const toll = (entry && entry.tollCount) || 0;
    document.querySelectorAll("#edit-day-toll .segmented-btn").forEach((btn) => {
      btn.classList.toggle("selected", Number(btn.dataset.value) === toll);
    });
    openDialog("dialog-edit-day");
  }

  function applyEditDay() {
    if (!state.editingDate) return;
    const dialog = document.getElementById("dialog-edit-day");
    const status = dialog.dataset.status;
    const ctype = dialog.dataset.ctype || null;
    const note = document.getElementById("edit-day-note").value.trim();
    const selectedBtn = document.querySelector("#edit-day-toll .segmented-btn.selected");
    const toll = selectedBtn ? Number(selectedBtn.dataset.value) : 0;
    Storage.saveEntry(state.editingDate, status, ctype, note || null, toll);
    state.editingDate = null;
    renderMonth();
  }

  document.getElementById("edit-day-apply").addEventListener("click", () => {
    applyEditDay();
    closeDialog("dialog-edit-day");
  });
  document.getElementById("edit-day-toll").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    document.querySelectorAll("#edit-day-toll .segmented-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
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
        Storage.clearEntry(state.selectedDate);
        renderMonth();
      }
      if (e.target.closest("#btn-edit-bonus")) {
        openBonusDialog();
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
        state.currentMonth = ymAdd(state.currentMonth, dx > 0 ? -1 : 1);
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
    closeDialog("dialog-month-picker");
    renderMonth();
  });

  // ---------------------------------------------------------------------
  // Top bar navigation
  // ---------------------------------------------------------------------
  document.getElementById("btn-menu").addEventListener("click", openDrawer);
  document.getElementById("btn-prev-month").addEventListener("click", () => {
    state.currentMonth = ymAdd(state.currentMonth, -1);
    renderMonth();
  });
  document.getElementById("btn-next-month").addEventListener("click", () => {
    state.currentMonth = ymAdd(state.currentMonth, 1);
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
      case "toggle-theme":
        state.settings = Storage.setSetting("darkTheme", !state.settings.darkTheme);
        renderAll();
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
              tollCount = Math.min(2, Math.max(0, tollCount));
              Storage.saveEntry(dateStr, status, ctype, note, tollCount);
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

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportCsv() {
    const s = state.settings;
    const entries = Storage.getEntriesArray().slice().sort((a, b) => a.date.localeCompare(b.date));
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
        parts.push(String(e.tollCount * s.tollAmount));
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
      entries: Storage.getEntriesArray(),
      monthlyBonuses: Storage.getBonuses(),
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
    document.querySelectorAll("#xlsx-mode .segmented-btn").forEach((b) => b.classList.toggle("selected", b.dataset.value === "monthly"));
    document.getElementById("xlsx-monthly-pickers").classList.remove("hidden");
    document.getElementById("xlsx-annual-picker").classList.add("hidden");
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
  });
  document.getElementById("xlsx-year-prev").addEventListener("click", () => { state.xlsxMonth.y--; renderXlsxPickers(); });
  document.getElementById("xlsx-year-next").addEventListener("click", () => { state.xlsxMonth.y++; renderXlsxPickers(); });
  document.getElementById("xlsx-month-prev").addEventListener("click", () => { state.xlsxMonth = ymAdd(state.xlsxMonth, -1); renderXlsxPickers(); });
  document.getElementById("xlsx-month-next").addEventListener("click", () => { state.xlsxMonth = ymAdd(state.xlsxMonth, 1); renderXlsxPickers(); });
  document.getElementById("xlsx-annual-year-prev").addEventListener("click", () => { state.xlsxYear--; renderXlsxPickers(); });
  document.getElementById("xlsx-annual-year-next").addEventListener("click", () => { state.xlsxYear++; renderXlsxPickers(); });

  document.getElementById("xlsx-export-btn").addEventListener("click", () => {
    const statusEl = document.getElementById("xlsx-status");
    statusEl.textContent = "Génération en cours...";
    setTimeout(() => {
      try {
        const config = xlsxConfig();
        if (state.xlsxMode === "monthly") {
          const blob = XlsxExport.buildMonthly(state.xlsxMonth.y, state.xlsxMonth.m, config);
          downloadBlob(blob, `MyShift_Releve_${ymKey(state.xlsxMonth.y, state.xlsxMonth.m)}.xlsx`);
        } else {
          const blob = XlsxExport.buildAnnual(state.xlsxYear, config);
          downloadBlob(blob, `MyShift_Releve_${state.xlsxYear}.xlsx`);
        }
        statusEl.textContent = "";
        closeDialog("dialog-export-xlsx");
      } catch (err) {
        statusEl.textContent = "Erreur : " + err.message;
      }
    }, 30);
  });

  // ---------------------------------------------------------------------
  // Settings dialog
  // ---------------------------------------------------------------------
  function renderSettingsValues() {
    const s = state.settings;
    document.getElementById("set-salaryBase").textContent = formatEuro(s.salaryBase);
    document.getElementById("set-rateJour").textContent = formatEuro(s.rateJour);
    document.getElementById("set-rateNuit").textContent = formatEuro(s.rateNuit);
    document.getElementById("set-rateMn").textContent = formatEuro(s.rateMn);
    document.getElementById("set-tollAmount").textContent = formatEuro(s.tollAmount);
    document.getElementById("set-annual-estimate-row").classList.toggle("hidden", !(s.salaryBase > 0));
    document.getElementById("set-annual-estimate").textContent = Math.round(s.salaryBase * 12) + " €";

    document.getElementById("set-reminderEnabled").checked = s.reminderEnabled;
    document.getElementById("set-reminderHour-row").classList.toggle("hidden", !s.reminderEnabled);
    document.getElementById("set-reminderHour-divider").classList.toggle("hidden", !s.reminderEnabled);
    document.getElementById("set-reminderHour").textContent = s.reminderHour;

    document.getElementById("set-darkTheme").checked = s.darkTheme;
    document.getElementById("set-colorPalette").textContent = Palettes.PALETTES.find((p) => p.id === s.colorPalette).label;
    document.getElementById("set-showWeekNumbers").checked = s.showWeekNumbers;
    document.getElementById("set-weekStartSunday").checked = s.weekStartSunday;

    document.getElementById("set-exportNotes").checked = s.exportNotes;
    document.getElementById("set-exportToll").checked = s.exportToll;
    document.getElementById("set-exportBase").checked = s.exportBase;
    document.getElementById("set-congesLabel").textContent = s.congesLabel;
  }

  function openSettingsDialog() {
    renderSettingsValues();
    openDialog("dialog-settings");
  }

  document.getElementById("dialog-settings").addEventListener("click", (e) => {
    const row = e.target.closest(".value-row[data-edit]");
    if (row && row.id !== "set-palette-row") {
      openGenericEdit(row.dataset.edit, row.dataset.label, row.dataset.type);
    }
    if (e.target.closest("#set-palette-row")) openPaletteDialog();
    if (e.target.closest("#btn-reset-data")) {
      if (confirm("Réinitialiser toutes les données locales (poste, réglages, primes) ? Cette action est irréversible.")) {
        Storage.resetAll();
        location.reload();
      }
    }
  });

  document.getElementById("dialog-settings").addEventListener("change", (e) => {
    const map = {
      "set-reminderEnabled": "reminderEnabled",
      "set-darkTheme": "darkTheme",
      "set-showWeekNumbers": "showWeekNumbers",
      "set-weekStartSunday": "weekStartSunday",
      "set-exportNotes": "exportNotes",
      "set-exportToll": "exportToll",
      "set-exportBase": "exportBase"
    };
    const key = map[e.target.id];
    if (!key) return;
    state.settings = Storage.setSetting(key, e.target.checked);
    if (key === "reminderEnabled" && e.target.checked) requestNotificationPermission();
    renderSettingsValues();
    renderAll();
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
      closeDialog("dialog-generic-edit");
      renderSettingsValues();
      renderAll();
    };
  }

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

  // ---------------------------------------------------------------------
  // Reminder notifications (best-effort, only while the app tab is open)
  // ---------------------------------------------------------------------
  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
  function reminderTick() {
    const s = state.settings;
    if (!s.reminderEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const hhmm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    if (hhmm !== s.reminderHour) return;
    const today = todayStr();
    if (localStorage.getItem("myshift.lastReminderDate") === today) return;
    localStorage.setItem("myshift.lastReminderDate", today);
    new Notification("MyShift", {
      body: "N'oubliez pas de renseigner votre poste du jour.",
      icon: "icons/icon-192.png"
    });
  }
  setInterval(reminderTick, 30000);

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
})();
