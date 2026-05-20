const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'bot-data.json');

const defaultData = {
  roleMappings: {},
  guildSettings: {},
  queues: {},
  customTemplates: {},
};

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
  }
}

function loadData() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    return {
      ...defaultData,
      ...JSON.parse(raw),
    };
  } catch (error) {
    console.error('Failed to read data file, resetting it.', error);
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
    return { ...defaultData };
  }
}

function saveData(data) {
  ensureDataFile();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

module.exports = {
  loadData,
  saveData,
  dataFile,
};
