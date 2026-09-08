// Analyse d'une fiche de paie SNCF (PDF texte) pour calculer les taux
// Jour/Nuit réels du mois, à partir des primes effectivement versées et
// du nombre de jours/nuits déjà renseignés dans le calendrier MyShift.
// Tout se passe en local sur l'appareil — le PDF n'est jamais envoyé
// nulle part.
(function (global) {
  "use strict";

  if (global.pdfjsLib) {
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
  }

  const MONTHS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5,
    "juin": 6, "juillet": 7, "août": 8, "aout": 8, "septembre": 9,
    "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12
  };

  // Libellés recherchés sur la fiche de paie, groupés par ce à quoi ils
  // correspondent dans le modèle MyShift. Basé sur le format des fiches
  // SNCF (bulletin "PERSONNEL CONTRACTUEL").
  const LINE_GROUPS = {
    fixed: [
      "SALAIRE DE BASE",
      "AVANTAGE EN NATURE FACILITES DE CIRCULAT"
    ],
    perWorkedDay: [
      "IND JOURNALIERE TRANSPORT PERSONNEL",
      "INDEMNITE LOCALE"
    ],
    perNight: [
      "INDEMNITE TRAVAIL DE NUIT TAUX 2",
      "INDEMNITE TRAVAIL DE NUIT",
      "IND SUPPL HORAIRE MILIEU DE NUIT",
      "IND SPECIALE TRAVAIL NUIT TAUX A",
      "IND SUPPT. TRAVAUX DE NUIT",
      "IND SUPPT TRAVAUX DE NUIT",
      "COMPT ALLOC DE NUIT PERS. SEDENTAIRE",
      "COMPT ALLOC DE NUIT PERS SEDENTAIRE",
      "ALLOC DE NUIT PERSONNEL SEDENTAIRE",
      "IND COMPENS REPOS HS ZNE TRAV.INFRA",
      "IND COMPENS REPOS HS ZNE TRAV INFRA",
      "ALLOC DE DEPLACEMENT REGIME GENERAL",
      "INDEMNITÉ TRAVAIL DIMANCHES ET FÊTES"
    ]
  };

  function normalize(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toUpperCase();
  }

  // Cherche un montant (dernier nombre décimal de la ligne, colonne
  // "Gains ou retenues") pour un libellé donné dans le texte brut.
  function findAmount(text, label) {
    const target = normalize(label);
    const lines = text.split("\n");
    for (const line of lines) {
      if (normalize(line).includes(target)) {
        const numbers = line.match(/-?\d+,\d{2}/g);
        if (numbers && numbers.length > 0) {
          const last = numbers[numbers.length - 1].replace(",", ".");
          return parseFloat(last);
        }
      }
    }
    return null;
  }

  function findMonthYear(text) {
    const m1 = text.match(/PERIODE DU \d{2}\/(\d{2})\/(\d{2})/i);
    if (m1) return { m: parseInt(m1[1], 10), y: 2000 + parseInt(m1[2], 10) };
    const m2 = text.match(/MOIS DE (\S+)\s+(\d{4})/i);
    if (m2) {
      const monthNum = MONTHS_FR[m2[1].toLowerCase()];
      if (monthNum) return { m: monthNum, y: parseInt(m2[2], 10) };
    }
    return null;
  }

  function sumGroup(text, labels) {
    let total = 0;
    const found = [];
    for (const label of labels) {
      const amount = findAmount(text, label);
      if (amount !== null) {
        total += amount;
        found.push({ label, amount });
      }
    }
    return { total, found };
  }

  async function extractText(arrayBuffer) {
    if (!global.pdfjsLib) throw new Error("pdf.js non chargé");
    const pdf = await global.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Regroupe les fragments de texte par ligne visuelle, avec une
      // tolérance verticale (les libellés et leurs montants n'ont pas
      // toujours exactement la même position Y).
      const items = content.items
        .filter((it) => it.str.trim().length > 0)
        .map((it) => ({ x: it.transform[4], y: it.transform[5], str: it.str }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      const TOLERANCE = 3;
      for (const it of items) {
        let row = rows.find((r) => Math.abs(r.y - it.y) <= TOLERANCE);
        if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
        row.items.push(it);
      }
      fullText += rows
        .map((r) => r.items.sort((a, b) => a.x - b.x).map((it) => it.str).join(" "))
        .join("\n") + "\n";
    }
    return fullText;
  }

  // Analyse complète : renvoie les montants trouvés + les taux calculés
  // en croisant avec le calendrier MyShift du même mois.
  async function analyze(arrayBuffer, monthStatsProvider) {
    const text = await extractText(arrayBuffer);
    const period = findMonthYear(text);
    if (!period) throw new Error("Impossible de déterminer le mois de cette fiche de paie.");

    const fixed = sumGroup(text, LINE_GROUPS.fixed);
    const perWorkedDay = sumGroup(text, LINE_GROUPS.perWorkedDay);
    const perNight = sumGroup(text, LINE_GROUPS.perNight);

    if (fixed.found.length === 0 && perWorkedDay.found.length === 0 && perNight.found.length === 0) {
      throw new Error("Aucune ligne reconnue sur cette fiche de paie. Le format ne correspond peut-être pas à celui attendu.");
    }

    const stats = monthStatsProvider(period.y, period.m);
    const workedDays = stats.jour + stats.nuit + stats.mn;
    const nights = stats.nuit;

    const tauxJour = workedDays > 0 ? perWorkedDay.total / workedDays : null;
    const tauxNuitExtra = nights > 0 ? perNight.total / nights : null;
    const tauxNuit = (tauxJour !== null && tauxNuitExtra !== null) ? tauxJour + tauxNuitExtra : null;
    const salaryBase = fixed.found.find((f) => f.label === "SALAIRE DE BASE");

    return {
      period,
      workedDays, nights,
      salaryBase: salaryBase ? salaryBase.amount : null,
      perWorkedDayTotal: perWorkedDay.total,
      perNightTotal: perNight.total,
      tauxJour, tauxNuit,
      details: { fixed: fixed.found, perWorkedDay: perWorkedDay.found, perNight: perNight.found },
      warnings: (workedDays === 0 || nights === 0)
        ? ["Le calendrier MyShift ne contient aucun jour rempli pour ce mois — impossible de calculer un taux fiable. Remplis d'abord ton planning de ce mois-là."]
        : []
    };
  }

  global.MyShiftPayslip = { analyze };
})(window);
