// Macro: Open the PF2e Wawful's Spell Sustainer dialog for the selected token's actor
const selected = canvas.tokens.controlled[0]?.actor;
if (!window.PF2eWawfulsSpellSustainer || typeof window.PF2eWawfulsSpellSustainer.showSustainDialog !== 'function') {
  ui.notifications.error("PF2e Wawful's Spell Sustainer module is not loaded or does not expose showSustainDialog.");
} else if (!selected) {
  ui.notifications.warn("Please select a token.");
} else {
  window.PF2eWawfulsSpellSustainer.showSustainDialog(selected);
} 