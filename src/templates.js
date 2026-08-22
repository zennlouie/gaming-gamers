const GAME_TEMPLATES = {
  apex: {
    key: 'apex',
    name: 'APEX',
    size: 3,
    primaryButtonLabel: 'Join Queue',
  },
  valorant: {
    key: 'valorant',
    name: 'VALORANT',
    size: 5,
    primaryButtonLabel: 'Join Queue',
  },
  cs: {
    key: 'cs',
    name: 'CS',
    size: 5,
    primaryButtonLabel: 'Join Queue',
  },
  aram: {
    key: 'aram',
    name: 'ARAM',
    size: 5,
    primaryButtonLabel: 'Join Queue',
  },
  arena: {
    key: 'arena',
    name: 'ARENA',
    size: 3,
    primaryButtonLabel: 'Join Queue',
  },
  amongus: {
    key: 'amongus',
    name: 'AMONG US',
    size: 15,
    primaryButtonLabel: 'Join Queue',
  },
};

function getAllTemplates(customTemplates = {}) {
  return {
    ...GAME_TEMPLATES,
    ...customTemplates,
  };
}

function getTemplateChoices(customTemplates = {}) {
  return Object.values(getAllTemplates(customTemplates)).map((template) => ({
    name: template.name,
    value: template.key,
  }));
}

module.exports = {
  GAME_TEMPLATES,
  getAllTemplates,
  getTemplateChoices,
};
