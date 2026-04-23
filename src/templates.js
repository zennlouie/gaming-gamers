const GAME_TEMPLATES = {
  apex: {
    key: 'apex',
    name: 'APEX',
    size: 3,
    primaryButtonLabel: 'Join Queue',
    secondaryButtonLabel: 'SUB',
  },
  valorant: {
    key: 'valorant',
    name: 'VALORANT',
    size: 5,
    primaryButtonLabel: 'Join Queue',
    secondaryButtonLabel: 'SUB',
  },
  cs: {
    key: 'cs',
    name: 'CS',
    size: 5,
    primaryButtonLabel: 'Join Queue',
    secondaryButtonLabel: 'SUB',
  },
  aram: {
    key: 'aram',
    name: 'ARAM',
    size: 5,
    primaryButtonLabel: 'Join Queue',
    secondaryButtonLabel: 'Join Backup',
  },
};

function getTemplateChoices() {
  return Object.values(GAME_TEMPLATES).map((template) => ({
    name: template.name,
    value: template.key,
  }));
}

module.exports = {
  GAME_TEMPLATES,
  getTemplateChoices,
};
