const upgrade = require('./upgrade-mode');

module.exports = function attachModes(NpcBot) {
  Object.assign(NpcBot.prototype, upgrade);
};
