/* ---------- Static configuration ---------- */
window.Wisdom = window.Wisdom || {};

window.Wisdom.config = {
  categories: ["quote", "poem", "prayer"],
  categoryLabel: { quote: "Quotes", poem: "Poems", prayer: "Prayers" },
  readingCategories: ["poem", "prayer"],   /* rendered with line breaks kept */

  origins: ["aa", "religious", "misc"],
  originLabel: { aa: "AA", religious: "Religious", misc: "Misc" },

  lsPrefix: "wisdom_v3::",                 /* + stamp + key */
  configKey: "wisdom_site_config_v1",      /* NOT namespaced: survives publishes */

  savePromptEvery: 25,                     /* tagging queue: nudge to Save */

  api: "https://api.github.com"
};
