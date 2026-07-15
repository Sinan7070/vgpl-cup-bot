require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('VGPL Cup Bot is running successfully!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = path.join(__dirname, 'turnier_data.json');

// Datenbank laden und speichern
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      teams: [],
      status: 'open',
      groups: {
        'A': { teams: [], matches: [] },
        'B': { teams: [], matches: [] },
        'C': { teams: [], matches: [] }
      },
      currentSpieltag: 1,
      deadlines: {}
    }));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
  console.log(`VGPL Cup Bot is online: ${client.user.tag}`);
});

// Admin-Befehl: Setup des Cups
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Only Administrators can set up the tournament!');
    }

    const args = message.content.split(' ');
    const targetChannel = message.mentions.channels.first(); // #cup-registration
    const rulesChannel = message.mentions.channels.at(1); // #cup-rules

    if (!targetChannel || !rulesChannel) {
      return message.reply('❌ Please mention both channels! Example: `!setup-turnier #cup-registration #cup-rules Saturday 21:00`');
    }

    const dayInput = args[3] || 'Wednesday';
    const timeInput = args[4] || '20:15';

    const data = loadData();
    data.teams = [];
    data.status = 'open';
    data.groups = {
      'A': { teams: [], matches: [] },
      'B': { teams: [], matches: [] },
      'C': { teams: [], matches: [] }
    };
    saveData(data);

    // 1. Offizielle Regeln posten
    const rulesEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL TRAINING CUP - OFFICIAL RULES')
      .setDescription(
        `These rules are binding for all participating teams. By registering, you automatically accept them.\n\n` +
        `### » 1. TOURNAMENT SCHEDULE\n` +
        `› **Tournament Start:** Usually at 9:00 PM CEST (21:00)\n` +
        `› **Invitation Time:** Max. 5 minutes per match to invite the opponent\n` +
        `› **No Leaving:** Once the match has started, players are not allowed to leave\n\n` +
        `### » 2. PLAYER HEIGHT RESTRICTIONS\n` +
        `CBs: Max. 1.87 m (6'2") | All other players: Max. 1.82 m (6'0")\n\n` +
        `> ⚠️ **Violation of these duties = Immediate Default Win (Defwin)**`
      )
      .setColor('#ffcc00')
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed] });

    // 2. Kalender-Embed posten
    const calendarEmbed = new EmbedBuilder()
      .setTitle('📅 VGPL CUP - TOURNAMENT CALENDAR')
      .setDescription(
        `**VGPL Training Cup**\n` +
        `**Day:** ${dayInput} | **Time:** ${timeInput} CEST\n` +
        `**Status:** 🟢 Registration Open\n\n` +
        `➡️ **Register here:** ${targetChannel}\n` +
        `📖 **Read the rules here:** ${rulesChannel}`
      )
      .setColor('#0099ff')
      .setTimestamp();

    await message.channel.send({ embeds: [calendarEmbed] });

    // 3. Registrierungs-Board
    const registrationEmbed = createRegistrationEmbed(data.teams);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('turnier_anmelden').setLabel('Register').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('turnier_abmelden').setLabel('Unregister').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('turnier_schliessen').setLabel('Close Registration (Admin)').setStyle(ButtonStyle.Secondary)
    );

    await targetChannel.send({ embeds: [registrationEmbed], components: [row] });
    await message.reply(`✅ Setup complete!`);
  }

  // Admin-Befehl: Spielplan eintragen
  // Syntax: !spielplan <Gruppe A/B/C> | <Team1> vs <Team2> | <Team3> vs <Team4>
  if (message.content.startsWith('!spielplan')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Nur Admins können den Spielplan eintragen!');
    }

    const content = message.content.replace('!spielplan', '').trim();
    const parts = content.split('|');
    const groupName = parts[0].trim(); // Z. B. "Gruppe B"
    const groupLetter = groupName.replace('Gruppe', '').trim().toUpperCase(); // Z. B. "B"

    const data = loadData();
    if (!data.groups[groupLetter]) {
      return message.reply(`❌ Ungültige Gruppe! Nutze z. B.: \`!spielplan Gruppe B | TeamA vs TeamB\``);
    }

    const matchesRaw = parts.slice(1);
    data.groups[groupLetter].matches = [];
    data.groups[groupLetter].teams = [];

    matchesRaw.forEach((matchStr, i) => {
      const teams = matchStr.split('vs');
      if (teams.length === 2) {
        const team1 = teams[0].trim();
        const team2 = teams[1].trim();

        // Teams der Gruppe hinzufügen
        if (!data.groups[groupLetter].teams.includes(team1)) data.groups[groupLetter].teams.push(team1);
        if (!data.groups[groupLetter].teams.includes(team2)) data.groups[groupLetter].teams.push(team2);

        // Spiel abspeichern
        data.groups[groupLetter].matches.push({
          id: `${groupLetter}-${i + 1}`,
          team1: team1,
          team2: team2,
          score1: '-',
          score2: '-',
          spieltag: 1, // Start bei Spieltag 1
          status: 'offen'
        });
      }
    });

    // Deadlines für Einladung (5 Min) und Abgabe (20 Min) setzen ab JETZT
    const now = new Date();
    const einladeDeadline = new Date(now.getTime() + 5 * 60 * 1000); // +5 Minuten
    const abgabeDeadline = new Date(now.getTime() + 20 * 60 * 1000); // +20 Minuten

    data.deadlines[groupLetter] = {
      einladung: einladeDeadline.toISOString(),
      abgabe: abgabeDeadline.toISOString(),
      closed: false
    };

    saveData(data);

    // Automatischer Timer für die "Keine Gnade"-20-Minuten-Regel starten
    setTimeout(async () => {
      const currentData = loadData();
      if (!currentData.deadlines[groupLetter] || currentData.deadlines[groupLetter].closed) return;

      let changed = false;
      currentData.groups[groupLetter].matches.forEach(m => {
        if (m.score1 === '-' && m.score2 === '-') {
          m.score1 = 0;
          m.score2 = 0;
          m.status = 'defwin'; // Automatische Nullwertung wegen verpasster Deadline
          changed = true;
        }
      });

      if (changed) {
        currentData.deadlines[groupLetter].closed = true;
        saveData(currentData);
       
        const delayEmbed = new EmbedBuilder()
          .setTitle('⚠️ SPIELTAG ABGELAUFEN (KEINE GNADE)')
          .setDescription(`Die Zeit für Spieltag ${currentData.currentSpieltag} ist abgelaufen! Alle ungespielten Partien wurden automatisch als **0:0** gewertet. Es gibt keinen Einspruch für verpasste Deadlines!`)
          .setColor('#ff0000');

        await message.channel.send({ embeds: [delayEmbed] });
       
        // Aktualisierte Tabelle posten
        await postGroupBoard(message.channel, groupLetter);
      }
    }, 20 * 60 * 1000); // 20 Minuten in Millisekunden

    await postGroupBoard(message.channel, groupLetter);
  }
});

// Hilfsfunktion: Schönes Gruppen-Board mit ASCII-Tabelle und Knöpfen generieren
async function postGroupBoard(channel, groupLetter) {
  const data = loadData();
  const group = data.groups[groupLetter];
  const deadline = data.deadlines[groupLetter];

  // 1. Tabelle im ASCII-Art Format zeichnen (wie PadBot)
  const stats = calculateStats(group);
  let tableString = '
http://googleusercontent.com/immersive_entry_chip/0
4. **Ergebnis:** Der Bot liest die Paarungen sofort aus, postet das **dynamische Live-Board** mit der schicken ASCII-Tabelle, trägt die exakten Deadlines ein (5 Min zum Einladen, 20 Min zum Spielen), und startet den Timer für die eiskalte Nullwertung!
