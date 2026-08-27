/* ---------- Static configuration ---------- */
window.Wisdom = window.Wisdom || {};

window.Wisdom.config = {
  /* app-written data files, in the order Save should PUT them.
     value = the window.Wisdom.<key> global each file defines */
  files: [
    ["data/tags.js",        "tags"],
    ["data/assignments.js", "assignments"],
    ["data/origins.js",     "origins"],
    ["data/quote-edits.js", "quoteEdits"],
    ["data/stamp.js",       "stamp"]
  ],

  categories: ["quote", "poem", "prayer"],
  categoryLabel: { quote: "Quotes", poem: "Poems", prayer: "Prayers" },
  readingCategories: ["poem", "prayer"],   /* rendered with line breaks kept */

  origins: ["aa", "religious", "misc"],
  originLabel: { aa: "AA", religious: "Religious", misc: "Misc" },

  lsPrefix: "wisdom_v2::",                 /* + stamp + key */
  configKey: "wisdom_site_config_v1",      /* NOT namespaced: survives publishes */

  savePromptEvery: 25,                     /* tagging queue: nudge to Save */
  addedIdBase: 100000,                     /* app-created cards start here */

  api: "https://api.github.com"
};
