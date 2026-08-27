/* APP-WRITTEN. Overlay on the generated corpus (data/quotes.js).
   edits   : { quoteId: { text?, category? } }
   deletes : [ quoteId, ... ]
   added   : [ { id, text, category }, ... ]   (ids >= 100000, app-assigned)
*/
window.Wisdom = window.Wisdom || {};
window.Wisdom.quoteEdits = { "edits": {}, "deletes": [], "added": [] };
