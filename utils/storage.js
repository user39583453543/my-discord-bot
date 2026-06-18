const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePathFor(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function defaultData() {
  return {
    roster: {
      title: 'TEAM ROSTER',
      messageId: null,
      channelId: null,
      members: [],
    },
    links: {
      discord: null,
      telegram: null,
      youtube: null,
    },
    tickets: {
      config: {
        staffRoleId: null,
        logChannelId: null,
        categoryId: null,
        counter: 0,
        questions: [],
      },
      active: {},
    },
  };
}

function getGuildData(guildId) {
  const file = filePathFor(guildId);
  if (!fs.existsSync(file)) return defaultData();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.tickets) data.tickets = defaultData().tickets;
  if (!data.tickets.active) data.tickets.active = {};
  if (!data.tickets.config.questions) data.tickets.config.questions = [];
  return data;
}

function saveGuildData(guildId, data) {
  fs.writeFileSync(filePathFor(guildId), JSON.stringify(data, null, 2));
}

module.exports = { getGuildData, saveGuildData };
