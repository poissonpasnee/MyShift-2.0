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
    document.documentElement.setAttribute("data-bg", state.settings.darkBgVariant || "ardoise");
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
    pager.style.animation = "none";
    void pager.offsetWidth;
    pager.style.animation = "";
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
    drawer.classList.remove("hidden");
    drawer.classList.add("open");
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("visible");
    setTimeout(() => {
      overlay.classList.add("hidden");
      drawer.classList.add("hidden");
    }, 200);
  }
  overlay.addEventListener("click", closeDrawer);

  // ---------------------------------------------------------------------
  // Day click / long-press
  // ---------------------------------------------------------------------
  function applyPaint(dateStr, status) {
    const existing = Storage.getEntry(dateStr);
    Storage.saveEntry(dateStr, status, existing ? existing.ctype : null, existing ? existing.note : null, existing ? existing.tolls : {});
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
    openDialog("dialog-edit-day");
  }

  function applyEditDay() {
    if (!state.editingDate) return;
    const dialog = document.getElementById("dialog-edit-day");
    const status = dialog.dataset.status;
    const ctype = dialog.dataset.ctype || null;
    const note = document.getElementById("edit-day-note").value.trim();
    Storage.saveEntry(state.editingDate, status, ctype, note || null, state.editingTolls || {});
    state.editingDate = null;
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

  async function maybeRunAutoBackup() {
    if (!state.settings.autoBackupEnabled) return;
    const today = todayStr();
    if (localStorage.getItem("myshift.lastAutoBackupDate") === today) return;
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `myshift-sauvegarde-auto-${today}.json`);
    localStorage.setItem("myshift.lastAutoBackupDate", today);
  }

  function exportJsonBackup() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const ym = todayStr().slice(0, 7);
    downloadBlob(blob, `myshift-sauvegarde-${ym}.json`);
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

    const totals = { jour: 0, nuit: 0, mn: 0, repos: 0, conges: 0, toll: 0, total: 0 };
    const rows = months.map((md, i) => {
      const s = md.stats;
      totals.jour += s.jour; totals.nuit += s.nuit; totals.mn += s.mn;
      totals.repos += s.repos; totals.conges += s.conges;
      totals.toll += md.toll; totals.total += md.total;
      return `<tr><td>${MONTHS_FR_SHORT[i]}</td><td>${s.jour}</td><td>${s.nuit}</td><td>${s.mn}</td><td>${s.repos}</td><td>${s.conges}</td><td>${formatEuro(md.toll)}</td><td>${formatEuro(md.total)}</td></tr>`;
    }).join("");

    document.getElementById("annual-stats-content").innerHTML = `
      ${bars}
      <table class="stat-table">
        <thead><tr><th>Mois</th><th>Jour</th><th>Nuit</th><th>MN</th><th>Repos</th><th>Congés</th><th>Péages</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td>${totals.jour}</td><td>${totals.nuit}</td><td>${totals.mn}</td><td>${totals.repos}</td><td>${totals.conges}</td><td>${formatEuro(totals.toll)}</td><td>${formatEuro(totals.total)}</td></tr></tfoot>
      </table>`;
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

    document.getElementById("set-darkTheme").checked = s.darkTheme;
    document.getElementById("set-colorPalette").textContent = Palettes.PALETTES.find((p) => p.id === s.colorPalette).label;
    document.getElementById("set-bg-row").classList.toggle("hidden", !s.darkTheme);
    document.getElementById("set-darkBgVariant").textContent = BG_VARIANTS.find((b) => b.id === s.darkBgVariant).label;
    document.getElementById("set-showWeekNumbers").checked = s.showWeekNumbers;
    document.getElementById("set-weekStartSunday").checked = s.weekStartSunday;
    document.querySelectorAll("#set-repos-weekdays .weekday-btn").forEach((btn) => {
      btn.classList.toggle("selected", (s.reposWeekdays || []).includes(Number(btn.dataset.dow)));
    });

    document.getElementById("set-exportNotes").checked = s.exportNotes;
    document.getElementById("set-exportToll").checked = s.exportToll;
    document.getElementById("set-exportBase").checked = s.exportBase;
    document.getElementById("set-congesLabel").textContent = s.congesLabel;

    document.getElementById("set-autoBackupEnabled").checked = !!s.autoBackupEnabled;
    document.getElementById("set-includeRatesInBackup").checked = s.includeRatesInBackup !== false;
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

  function openSettingsDialog() {
    renderSettingsValues();
    renderSettingsOverview();
    openDialog("dialog-settings");
  }

  document.getElementById("dialog-settings").addEventListener("click", (e) => {
    const catRow = e.target.closest(".settings-cat-row[data-open-settings]");
    if (catRow) openDialog("dialog-settings-" + catRow.dataset.openSettings);
  });

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
    if (e.target.closest("#btn-add-peage")) openPeageEditDialog(null);
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
    if (Storage.getEntry(today)) return; // déjà renseigné, pas besoin de rappel
    new Notification("MyShift", {
      body: "Ton poste d'aujourd'hui n'est pas encore renseigné.",
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
  maybeRunAutoBackup();
})();
