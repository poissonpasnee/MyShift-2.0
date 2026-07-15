// XLSX generation — faithful JS port of XlsxExporter.kt (same dashboard design, same colors,
// same OOXML structure). No external dependencies: includes a minimal ZIP (stored/no-compression)
// writer with CRC-32, since browsers have no built-in zip API.
(function (global) {
  "use strict";

  // =====================================================================
  // Minimal ZIP writer (STORED method) + CRC32
  // =====================================================================
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  class ByteWriter {
    constructor() { this.chunks = []; this.length = 0; }
    push(uint8) { this.chunks.push(uint8); this.length += uint8.length; }
    u16(v) { this.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF])); }
    u32(v) { this.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF])); }
    toUint8Array() {
      const out = new Uint8Array(this.length);
      let offset = 0;
      for (const c of this.chunks) { out.set(c, offset); offset += c.length; }
      return out;
    }
  }

  function dosDateTime(date) {
    const dt = ((date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11)) & 0xFFFF;
    const dd = (date.getDate() | ((date.getMonth() + 1) << 5) | ((date.getFullYear() - 1980) << 9)) & 0xFFFF;
    return { dt, dd };
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const { dt, dd } = dosDateTime(new Date());
    const local = new ByteWriter();
    const central = new ByteWriter();

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const localOffset = local.length;

      local.u32(0x04034b50);
      local.u16(20);
      local.u16(0x0800);
      local.u16(0);
      local.u16(dt);
      local.u16(dd);
      local.u32(crc);
      local.u32(data.length);
      local.u32(data.length);
      local.u16(nameBytes.length);
      local.u16(0);
      local.push(nameBytes);
      local.push(data);

      central.u32(0x02014b50);
      central.u16(20);
      central.u16(20);
      central.u16(0x0800);
      central.u16(0);
      central.u16(dt);
      central.u16(dd);
      central.u32(crc);
      central.u32(data.length);
      central.u32(data.length);
      central.u16(nameBytes.length);
      central.u16(0);
      central.u16(0);
      central.u16(0);
      central.u16(0);
      central.u32(0);
      central.u32(localOffset);
      central.push(nameBytes);
    });

    const centralOffset = local.length;
    const eocd = new ByteWriter();
    eocd.u32(0x06054b50);
    eocd.u16(0);
    eocd.u16(0);
    eocd.u16(files.length);
    eocd.u16(files.length);
    eocd.u32(central.length);
    eocd.u32(centralOffset);
    eocd.u16(0);

    const total = new Uint8Array(local.length + central.length + eocd.length);
    total.set(local.toUint8Array(), 0);
    total.set(central.toUint8Array(), local.length);
    total.set(eocd.toUint8Array(), local.length + central.length);
    return new Blob([total], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // =====================================================================
  // Date / label helpers
  // =====================================================================
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayFr(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return cap(new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(d));
  }
  function monthLabel(y, m) {
    const d = new Date(y, m - 1, 1);
    return cap(new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(d));
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function ymKey(y, m) { return `${y}-${pad2(m)}`; }

  // =====================================================================
  // Salary / stats helpers (mirrors ExportConfig / monthStats in Kotlin)
  // =====================================================================
  function rateFor(status, config) {
    if (status === "jour") return config.rateJour;
    if (status === "nuit") return config.rateNuit;
    if (status === "mn") return config.rateMn;
    return 0;
  }
  function statusLabel(status) {
    switch (status) {
      case "jour": return "Jour";
      case "nuit": return "Nuit";
      case "mn": return "MN";
      case "repos": return "Repos";
      case "conges": return "Congés";
      default: return status;
    }
  }
  function entriesForMonth(entries, y, m) {
    return entries
      .filter((e) => {
        const [ey, em] = e.date.split("-").map(Number);
        return ey === y && em === m;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function monthStats(y, m, entries, config, bonus) {
    const tollCount = entries.reduce((s, e) => s + (e.tollCount || 0), 0);
    const tollMontant = tollCount * config.tollAmount;
    const shiftPrimes = entries.reduce((s, e) => s + rateFor(e.status, config), 0);
    const salary = config.salaryBase + shiftPrimes + tollMontant + bonus;
    const count = (status) => entries.filter((e) => e.status === status).length;
    return {
      label: monthLabel(y, m),
      jours: count("jour"), nuits: count("nuit"), mns: count("mn"),
      repos: count("repos"), conges: count("conges"),
      tollCount, tollMontant, shiftPrimes, bonus,
      salaryBase: config.salaryBase, salary
    };
  }
  function detailRows(entries, config) {
    return entries.map((e) => {
      const tollEarned = (e.tollCount || 0) * config.tollAmount;
      return {
        dayOfWeek: dayFr(e.date),
        date: e.date,
        type: statusLabel(e.status),
        status: e.status,
        label: e.ctype || "",
        note: e.note || "",
        salary: rateFor(e.status, config) + tollEarned
      };
    });
  }

  // =====================================================================
  // Styles (fonts / fills / cellXfs) — identical design to XlsxExporter.kt
  // =====================================================================
  const FONT_SPECS = [
    { bold: false, size: 11, color: "FF000000" }, // 0 regular
    { bold: true, size: 11, color: "FFFFFFFF" },  // 1 bold white
    { bold: true, size: 11, color: "FF1F2937" },  // 2 bold dark
    { bold: true, size: 20, color: "FFFFFFFF" },  // 3 bold white big
    { bold: true, size: 20, color: "FF1F2937" },  // 4 bold dark big
    { bold: true, size: 16, color: "FFFFFFFF" },  // 5 bold white title
    { bold: true, size: 11, color: "FF87D8BF" },  // 6 bold accent green
    { bold: true, size: 20, color: "FF87D8BF" },  // 7 bold accent green big
    { bold: true, size: 13, color: "FF1F2937" }   // 8 bold dark section
  ];

  const FILL_SPECS = [
    null, "GRAY125",
    "FF374151", // 2 header dark
    "FFE6C04D", // 3 Jour
    "FF5B4D8A", // 4 Nuit
    "FFE07AA4", // 5 MN
    "FF6B7280", // 6 Repos
    "FF2B3A37", // 7 Congés
    "FF7DDB9F", // 8 Péage / accent
    "FFF1F5F9"  // 9 total row bg
  ];

  const XF_SPECS = [
    [0, 0, 0, false],   // 0  DEFAULT
    [1, 2, 0, true],    // 1  HEADER
    [0, 0, 164, false], // 2  CURRENCY
    [2, 3, 0, true],    // 3  JOUR
    [2, 3, 164, true],  // 4  JOUR_CUR
    [1, 4, 0, true],    // 5  NUIT
    [1, 4, 164, true],  // 6  NUIT_CUR
    [2, 5, 0, true],    // 7  MN
    [2, 5, 164, true],  // 8  MN_CUR
    [1, 6, 0, true],    // 9  REPOS
    [1, 6, 164, true],  // 10 REPOS_CUR
    [6, 7, 0, true],    // 11 CONGES
    [6, 7, 164, true],  // 12 CONGES_CUR
    [2, 8, 0, true],    // 13 PEAGE
    [2, 8, 164, true],  // 14 PEAGE_CUR
    [2, 9, 0, true],    // 15 TOTAL
    [2, 9, 164, true],  // 16 TOTAL_CUR
    [5, 2, 0, true],    // 17 TITLE
    [3, 2, 0, true],    // 18 KPI_DARK
    [3, 2, 164, true],  // 19 KPI_DARK_CUR
    [4, 3, 0, true],    // 20 KPI_JOUR
    [3, 4, 0, true],    // 21 KPI_NUIT
    [4, 5, 0, true],    // 22 KPI_MN
    [3, 6, 0, true],    // 23 KPI_REPOS
    [7, 7, 0, true],    // 24 KPI_CONGES
    [4, 8, 0, true],    // 25 KPI_PEAGE
    [4, 8, 164, true],  // 26 KPI_PEAGE_CUR
    [2, 0, 0, false],   // 27 LABEL
    [8, 0, 0, true],    // 28 SECTION
    [2, 0, 0, true]     // 29 KPI_LABEL
  ];

  const S = {
    DEFAULT: 0, HEADER: 1, CURRENCY: 2,
    JOUR: 3, JOUR_CUR: 4, NUIT: 5, NUIT_CUR: 6, MN: 7, MN_CUR: 8,
    REPOS: 9, REPOS_CUR: 10, CONGES: 11, CONGES_CUR: 12,
    PEAGE: 13, PEAGE_CUR: 14, TOTAL: 15, TOTAL_CUR: 16, TITLE: 17,
    KPI_DARK_CUR: 19, KPI_JOUR: 20, KPI_NUIT: 21, KPI_MN: 22, KPI_REPOS: 23,
    KPI_CONGES: 24, KPI_PEAGE: 25, KPI_PEAGE_CUR: 26, LABEL: 27, SECTION: 28, KPI_LABEL: 29
  };

  function stylesXml() {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`;
    xml += `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/></numFmts>`;

    xml += `<fonts count="${FONT_SPECS.length}">`;
    FONT_SPECS.forEach((f) => {
      xml += `<font>${f.bold ? "<b/>" : ""}<sz val="${f.size}"/><color rgb="${f.color}"/><name val="Calibri"/></font>`;
    });
    xml += `</fonts>`;

    xml += `<fills count="${FILL_SPECS.length}">`;
    FILL_SPECS.forEach((fill) => {
      if (fill === null) xml += `<fill><patternFill patternType="none"/></fill>`;
      else if (fill === "GRAY125") xml += `<fill><patternFill patternType="gray125"/></fill>`;
      else xml += `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/></patternFill></fill>`;
    });
    xml += `</fills>`;

    xml += `<borders count="2">`;
    xml += `<border><left/><right/><top/><bottom/><diagonal/></border>`;
    xml += `<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>`;
    xml += `</borders>`;

    xml += `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`;

    xml += `<cellXfs count="${XF_SPECS.length}">`;
    XF_SPECS.forEach(([font, fill, numFmt, center]) => {
      const applyNum = numFmt !== 0 ? ` applyNumberFormat="1"` : "";
      const applyAlign = center ? ` applyAlignment="1"` : "";
      xml += `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${applyNum}${applyAlign}>`;
      if (center) xml += `<alignment horizontal="center" vertical="center"/>`;
      xml += `</xf>`;
    });
    xml += `</cellXfs>`;

    xml += `</styleSheet>`;
    return xml;
  }

  function styleForStatus(status) {
    switch (status) {
      case "jour": return [S.JOUR, S.JOUR_CUR];
      case "nuit": return [S.NUIT, S.NUIT_CUR];
      case "mn": return [S.MN, S.MN_CUR];
      case "repos": return [S.REPOS, S.REPOS_CUR];
      case "conges": return [S.CONGES, S.CONGES_CUR];
      default: return [S.DEFAULT, S.CURRENCY];
    }
  }

  // =====================================================================
  // Cell / row helpers
  // =====================================================================
  function esc(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function row(r, cells, height) {
    const ht = height ? ` ht="${height}" customHeight="1"` : "";
    return `<row r="${r}"${ht}>${cells}</row>`;
  }
  function sc(ref, value, s) {
    return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }
  function nc(ref, value, s) { return `<c r="${ref}" s="${s}"><v>${value}</v></c>`; }
  function ic(ref, value, s) { return `<c r="${ref}" s="${s === undefined ? 0 : s}"><v>${value}</v></c>`; }
  function col(n, width) { return `<col min="${n}" max="${n}" width="${width}" customWidth="1"/>`; }

  function monthDetailCols() {
    return col(1, 26) + col(2, 18) + col(3, 12) + col(4, 24) + col(5, 34) + col(6, 20);
  }
  function recapCols() {
    return col(1, 18) + col(2, 12) + col(3, 12) + col(4, 12) + col(5, 12) + col(6, 12) +
      col(7, 12) + col(8, 18) + col(9, 14) + col(10, 20);
  }

  function assembleSheet(cols, body, merges, freezeRow) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`;
    if (freezeRow > 0) {
      xml += `<sheetViews><sheetView workbookViewId="0">`;
      xml += `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`;
      xml += `</sheetView></sheetViews>`;
    }
    xml += `<cols>${cols}</cols>`;
    xml += `<sheetData>${body}</sheetData>`;
    if (merges.length) {
      xml += `<mergeCells count="${merges.length}">`;
      merges.forEach((m) => { xml += `<mergeCell ref="${m}"/>`; });
      xml += `</mergeCells>`;
    }
    xml += `</worksheet>`;
    return xml;
  }

  // =====================================================================
  // Totals block (shared by monthly export + per-month annual sheets)
  // =====================================================================
  function statLine(r, label, value, style) {
    return row(r, sc(`A${r}`, label, S.LABEL) + ic(`B${r}`, value, style));
  }
  function statLineCur(r, label, value, style) {
    return row(r, sc(`A${r}`, label, S.LABEL) + nc(`B${r}`, value, style));
  }
  function statsBlockXml(startR, stats) {
    let r = startR;
    let xml = "";
    xml += row(r, sc(`A${r}`, "Totaux du mois", S.SECTION), 20); r++;
    r++;
    xml += statLine(r, "Jours travaillés", stats.jours, S.JOUR); r++;
    xml += statLine(r, "Nuits travaillées", stats.nuits, S.NUIT); r++;
    xml += statLine(r, "Montées de nuit (MN)", stats.mns, S.MN); r++;
    xml += statLine(r, "Jours de repos", stats.repos, S.REPOS); r++;
    xml += statLine(r, "Jours de congés", stats.conges, S.CONGES); r++;
    r++;
    xml += statLine(r, "Nombre de péages", stats.tollCount, S.PEAGE); r++;
    xml += statLineCur(r, "Total péages", stats.tollMontant, S.PEAGE_CUR); r++;
    r++;
    xml += statLineCur(r, "Salaire de base", stats.salaryBase, S.CURRENCY); r++;
    xml += statLineCur(r, "Primes de quart", stats.shiftPrimes, S.CURRENCY); r++;
    xml += statLineCur(r, "Prime exceptionnelle", stats.bonus, S.CURRENCY); r++;
    r++;
    xml += row(r, sc(`A${r}`, "SALAIRE ESTIMÉ DU MOIS", S.LABEL) + nc(`B${r}`, stats.salary, S.KPI_DARK_CUR), 28); r++;
    return [xml, r];
  }

  function sheetMonthDetail(monthName, year, rows, stats, statsAtTop) {
    let body = "";
    let r = 1;
    body += row(r, sc(`A${r}`, `${monthName} ${year}`, S.TITLE), 26);
    const merges = [`A${r}:F${r}`];
    r += 2;

    if (statsAtTop) {
      const [xml, nextR] = statsBlockXml(r, stats);
      body += xml;
      r = nextR + 1;
    }

    body += row(r, sc(`A${r}`, "Détail jour par jour", S.SECTION), 20);
    r++;
    const headerRow = r;
    body += row(r,
      sc(`A${r}`, "Jour", S.HEADER) + sc(`B${r}`, "Date", S.HEADER) + sc(`C${r}`, "Type", S.HEADER) +
      sc(`D${r}`, "Libellé", S.HEADER) + sc(`E${r}`, "Note", S.HEADER) + sc(`F${r}`, "Salaire estimé (€)", S.HEADER)
    );
    r++;
    rows.forEach((entry) => {
      const [textStyle, curStyle] = styleForStatus(entry.status);
      body += row(r,
        sc(`A${r}`, entry.dayOfWeek, textStyle) + sc(`B${r}`, entry.date, textStyle) +
        sc(`C${r}`, entry.type, textStyle) + sc(`D${r}`, entry.label, textStyle) +
        sc(`E${r}`, entry.note, textStyle) + nc(`F${r}`, entry.salary, curStyle)
      );
      r++;
    });

    if (!statsAtTop) {
      r++;
      const [xml] = statsBlockXml(r, stats);
      body += xml;
    }

    return assembleSheet(monthDetailCols(), body, merges, headerRow);
  }

  function sheetRecapAnnual(year, months) {
    let body = "";
    let r = 1;
    body += row(r, sc(`A${r}`, `Récap annuel ${year}`, S.TITLE), 26);
    const merges = [`A${r}:J${r}`];
    r += 2;

    const sum = (key) => months.reduce((s, m) => s + m[key], 0);
    const totalJours = sum("jours"), totalNuits = sum("nuits"), totalMns = sum("mns");
    const totalRepos = sum("repos"), totalConges = sum("conges");
    const totalTollCount = sum("tollCount"), totalTollMontant = sum("tollMontant");
    const totalBonus = sum("bonus"), totalSalary = sum("salary");

    body += row(r,
      sc(`B${r}`, "Jours", S.KPI_LABEL) + sc(`C${r}`, "Nuits", S.KPI_LABEL) + sc(`D${r}`, "MN", S.KPI_LABEL) +
      sc(`E${r}`, "Repos", S.KPI_LABEL) + sc(`F${r}`, "Congés", S.KPI_LABEL) + sc(`G${r}`, "Péages", S.KPI_LABEL) +
      sc(`H${r}`, "Montant péages (€)", S.KPI_LABEL) + sc(`I${r}`, "Prime (€)", S.KPI_LABEL) +
      sc(`J${r}`, "Salaire annuel estimé (€)", S.KPI_LABEL)
    );
    r++;
    body += row(r,
      ic(`B${r}`, totalJours, S.KPI_JOUR) + ic(`C${r}`, totalNuits, S.KPI_NUIT) + ic(`D${r}`, totalMns, S.KPI_MN) +
      ic(`E${r}`, totalRepos, S.KPI_REPOS) + ic(`F${r}`, totalConges, S.KPI_CONGES) +
      ic(`G${r}`, totalTollCount, S.KPI_PEAGE) + nc(`H${r}`, totalTollMontant, S.KPI_PEAGE_CUR) +
      nc(`I${r}`, totalBonus, S.KPI_DARK_CUR) + nc(`J${r}`, totalSalary, S.KPI_DARK_CUR),
      26
    );
    r += 2;

    body += row(r, sc(`A${r}`, "Détail par mois", S.SECTION), 20);
    r++;
    const headerRow = r;
    body += row(r,
      sc(`A${r}`, "Mois", S.HEADER) + sc(`B${r}`, "Jours", S.JOUR) + sc(`C${r}`, "Nuits", S.NUIT) +
      sc(`D${r}`, "MN", S.MN) + sc(`E${r}`, "Repos", S.REPOS) + sc(`F${r}`, "Congés", S.CONGES) +
      sc(`G${r}`, "Péages", S.PEAGE) + sc(`H${r}`, "Montant péages (€)", S.PEAGE) +
      sc(`I${r}`, "Prime (€)", S.HEADER) + sc(`J${r}`, "Salaire estimé (€)", S.HEADER)
    );
    r++;
    months.forEach((m) => {
      body += row(r,
        sc(`A${r}`, m.label, S.DEFAULT) + ic(`B${r}`, m.jours, S.DEFAULT) + ic(`C${r}`, m.nuits, S.DEFAULT) +
        ic(`D${r}`, m.mns, S.DEFAULT) + ic(`E${r}`, m.repos, S.DEFAULT) + ic(`F${r}`, m.conges, S.DEFAULT) +
        ic(`G${r}`, m.tollCount, S.DEFAULT) + nc(`H${r}`, m.tollMontant, S.CURRENCY) +
        nc(`I${r}`, m.bonus, S.CURRENCY) + nc(`J${r}`, m.salary, S.CURRENCY)
      );
      r++;
    });
    body += row(r,
      sc(`A${r}`, "TOTAL ANNUEL", S.TOTAL) + ic(`B${r}`, totalJours, S.TOTAL) + ic(`C${r}`, totalNuits, S.TOTAL) +
      ic(`D${r}`, totalMns, S.TOTAL) + ic(`E${r}`, totalRepos, S.TOTAL) + ic(`F${r}`, totalConges, S.TOTAL) +
      ic(`G${r}`, totalTollCount, S.TOTAL) + nc(`H${r}`, totalTollMontant, S.TOTAL_CUR) +
      nc(`I${r}`, totalBonus, S.TOTAL_CUR) + nc(`J${r}`, totalSalary, S.TOTAL_CUR)
    );

    return assembleSheet(recapCols(), body, merges, headerRow);
  }

  // =====================================================================
  // OOXML package structure
  // =====================================================================
  function contentTypesXml(sheetCount) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`;
    xml += `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`;
    xml += `<Default Extension="xml" ContentType="application/xml"/>`;
    xml += `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`;
    xml += `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`;
    for (let i = 1; i <= sheetCount; i++) {
      xml += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }
    xml += `</Types>`;
    return xml;
  }
  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  }
  function workbookXml(names) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
    xml += `<sheets>`;
    names.forEach((n, i) => { xml += `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`; });
    xml += `</sheets></workbook>`;
    return xml;
  }
  function workbookRelsXml(sheetCount) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    for (let i = 1; i <= sheetCount; i++) {
      xml += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
    }
    xml += `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    xml += `</Relationships>`;
    return xml;
  }

  function buildWorkbook(sheets, names) {
    const files = [
      { name: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
      { name: "_rels/.rels", content: rootRelsXml() },
      { name: "xl/workbook.xml", content: workbookXml(names) },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
      { name: "xl/styles.xml", content: stylesXml() }
    ];
    sheets.forEach((xml, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, content: xml }));
    return buildZip(files);
  }

  // =====================================================================
  // Public API
  // =====================================================================
  function buildMonthly(year, month, config) {
    const filtered = entriesForMonth(config.entries, year, month);
    const bonus = (config.monthlyBonuses && config.monthlyBonuses[ymKey(year, month)]) || 0;
    const stats = monthStats(year, month, filtered, config, bonus);
    const sheet = sheetMonthDetail(stats.label, year, detailRows(filtered, config), stats, true);
    return buildWorkbook([sheet], [stats.label]);
  }

  function buildAnnual(year, config) {
    const filtered = (config.entries || []).filter((e) => Number(e.date.split("-")[0]) === year);
    const bundles = [];
    for (let m = 1; m <= 12; m++) {
      const me = entriesForMonth(filtered, year, m);
      const bonus = (config.monthlyBonuses && config.monthlyBonuses[ymKey(year, m)]) || 0;
      bundles.push({ m, entries: me, stats: monthStats(year, m, me, config, bonus) });
    }
    const sheets = [sheetRecapAnnual(year, bundles.map((b) => b.stats))];
    const names = ["Récap annuel"];
    bundles.forEach((b) => {
      sheets.push(sheetMonthDetail(b.stats.label, year, detailRows(b.entries, config), b.stats, false));
      names.push(b.stats.label);
    });
    return buildWorkbook(sheets, names);
  }

  global.XlsxExport = { buildMonthly, buildAnnual };
})(window);
