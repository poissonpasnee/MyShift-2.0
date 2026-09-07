// Color palettes — mirrors ColorPalettes.kt / CalendarWeekView.kt (ShiftColors) exactly.
(function (global) {
  "use strict";

  const PALETTES = [
    { id: "amethyste", label: "Améthyste" },
    { id: "ocean", label: "Océan" },
    { id: "foret", label: "Forêt" },
    { id: "ambre", label: "Ambre" },
    { id: "grenade", label: "Grenade" }
  ];

  // tones: primary, nuit, conges, peage
  const TONES_DARK = {
    amethyste: { primary: "#D0BCFF", nuit: "#5B4D8A", conges: "#2B3A37", peage: "#7DDB9F" },
    ocean: { primary: "#A8C8FF", nuit: "#3F5578", conges: "#2B3A3A", peage: "#7DDBB0" },
    foret: { primary: "#9FD6A4", nuit: "#3B5A44", conges: "#2E3A2B", peage: "#E6C04D" },
    ambre: { primary: "#F2C07A", nuit: "#6A4F2E", conges: "#3A352B", peage: "#8FD6A0" },
    grenade: { primary: "#F2B3CF", nuit: "#6A3F56", conges: "#332B3A", peage: "#7DDBB0" }
  };

  const TONES_LIGHT = {
    amethyste: { primary: "#6750A4", nuit: "#D8CCF5", conges: "#C3E9D8", peage: "#1E7A54" },
    ocean: { primary: "#1F5FA8", nuit: "#CFE0FF", conges: "#C2E8E2", peage: "#1E7A5A" },
    foret: { primary: "#2E6B3A", nuit: "#CBECC9", conges: "#DBE8BD", peage: "#8A6A00" },
    ambre: { primary: "#8A5A12", nuit: "#F0DCC0", conges: "#D5E6C4", peage: "#1E7A54" },
    grenade: { primary: "#9C3F68", nuit: "#F4D3E2", conges: "#D3E0D8", peage: "#1E7A54" }
  };

  // Fixed across all palettes/themes
  const SHIFT_FIXED = {
    jour: "#C99A2B",
    mn: "#AD4B6B",
    repos: "#6B7280"
  };

  function paletteTones(paletteId, isDark) {
    const table = isDark ? TONES_DARK : TONES_LIGHT;
    return table[paletteId] || table.amethyste;
  }

  function shiftColors(paletteId, isDark) {
    const tones = paletteTones(paletteId, isDark);
    return {
      jour: SHIFT_FIXED.jour,
      mn: SHIFT_FIXED.mn,
      repos: SHIFT_FIXED.repos,
      nuit: tones.nuit,
      conges: tones.conges,
      peage: tones.peage
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  // Relative luminance, same threshold logic as CalendarWeekView.kt's contrastingTextColor
  function relativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastingTextColor(hex) {
    return relativeLuminance(hex) > 0.5 ? "rgba(0,0,0,0.87)" : "#FFFFFF";
  }

  global.Palettes = {
    PALETTES,
    paletteTones,
    shiftColors,
    contrastingTextColor,
    relativeLuminance
  };
})(window);
