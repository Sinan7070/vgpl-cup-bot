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
  PermissionFlagsBits
} = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('VGPL Cup Bot läuft erfolgreich!'));
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
  console.log('VGPL Cup Bot ist online als: ' + client.user.tag);
});

// Admin-Befehl: Setup des Cups mit 3 Kanälen
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Nur Administratoren können das Turnier einrichten!');
    }

    const args = message.content.split(' ');
   
    // Die 3 erwähnten Kanäle auslesen
    const calendarChannel = message.mentions.channels.at(0); // #📅│cup-calendar
    const registrationChannel = message.mentions.channels.at(1); // #📝│cup-registration
    const rulesChannel = message.mentions.channels.at(2); // #📜│cup-rules

    if (!calendarChannel || !registrationChannel || !rulesChannel) {
      return message.reply('❌ Bitte erwähne alle 3 Kanäle! Beispiel: `!setup-turnier #cup-calendar #cup-registration #cup-rules Samstag 21:00`');
    }

    // Wochentag und Uhrzeit auslesen (Standard: Samstag 21:00)
    const dayInput = args[4] || 'Samstag';
    const timeInput = args[5] || '21:00';

    const data = loadData();
    data.teams = [];
    data.status = 'open';
    data.groups = {
      'A': { teams: [], matches: [] },
      'B': { teams: [], matches: [] },
      'C': { teams: [], matches: [] }
    };
    saveData(data);

    // 1. Offizielle Regeln posten (In den Regeln-Kanal)
    const rulesEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL TRAINING CUP - OFFIZIELLES REGELWERK')
      .setDescription(
        'Diese Regeln sind für alle teilnehmenden Teams bindend. Mit der Anmeldung akzeptiert ihr diese automatisch.\n\n' +
        '### » 1. TURNIERABLAUF\n' +
        '› **Turnierstart:** Pünktlich zur angegebenen Uhrzeit\n' +
        '› **Einladezeit:** Maximal 5 Minuten pro Match, um den Gegner einzuladen\n' +
        '› **Kein Verlassen:** Sobald das Spiel läuft, darf kein Spieler die Partie verlassen\n\n' +
        '### » 2. GRÖSSENBESCHRÄNKUNGEN DER SPIELER\n' +
        'CBs: Max. 1.87 m (6\'2") | Alle anderen Positionen: Max. 1.82 m (6\'0")\n\n' +
        '> ⚠️ **Ein Verstoß gegen diese Regeln führt zum sofortigen Defwin für den Gegner!**'
      )
      .setColor('#ffcc00')
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed] });

    // 2. Kalender-Embed posten (In den Kalender-Kanal)
    const calendarEmbed = new EmbedBuilder()
      .setTitle('📅 VGPL CUP - TURNIERKALENDER')
      .setDescription(
        '**VGPL Training Cup**\n' +
        '**Tag:** ' + dayInput + ' | **Uhrzeit:** ' + timeInput + ' Uhr CEST\n' +
        '**Status:** 🟢 Anmeldung geöffnet\n\n' +
        '➡️ **Hier anmelden:** ' + registrationChannel.toString() + '\n' +
        '📖 **Regelwerk lesen:** ' + rulesChannel.toString()
      )
      .setColor('#0099ff')
      .setTimestamp();

    await calendarChannel.send({ embeds: [calendarEmbed] });

    // 3. Registrierungs-Board mit Buttons posten (In den Anmelde-Kanal)
    const registrationEmbed = createRegistrationEmbed(data.teams);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('turnier_anmelden').setLabel('Anmelden').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('turnier_abmelden').setLabel('Abmelden').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('turnier_schliessen').setLabel('Anmeldung schließen (Admin)').setStyle(ButtonStyle.Secondary)
    );

    await registrationChannel.send({ embeds: [registrationEmbed], components: [row] });
   
    await message.reply('✅ Setup erfolgreich abgeschlossen!\n' +
      '• Regeln gepostet in ' + rulesChannel.toString() + '\n' +
      '• Kalender gepostet in ' + calendarChannel.toString() + '\n' +
      '• Anmeldeboard gepostet in ' + registrationChannel.toString()
    );
  }

  // Admin-Befehl: Spielplan eintragen
  if (message.content.startsWith('!spielplan')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Nur Admins können den Spielplan eintragen!');
    }

    const content = message.content.replace('!spielplan', '').trim();
    const parts = content.split('|');
    const groupName = parts[0].trim();
    const groupLetter = groupName.replace('Gruppe', '').trim().toUpperCase();

    const data = loadData();
    if (!data.groups[groupLetter]) {
      return message.reply('❌ Ungültige Gruppe! Nutze z. B.: !spielplan Gruppe B | TeamA vs TeamB');
    }

    const matchesRaw = parts.slice(1);
    data.groups[groupLetter].matches = [];
    data.groups[groupLetter].teams = [];

    matchesRaw.forEach((matchStr, i) => {
      const teams = matchStr.split('vs');
      if (teams.length === 2) {
        const team1 = teams[0].trim();
        const team2 = teams[1].trim();

        if (!data.groups[groupLetter].teams.includes(team1)) data.groups[groupLetter].teams.push(team1);
        if (!data.groups[groupLetter].teams.includes(team2)) data.groups[groupLetter].teams.push(team2);

        data.groups[groupLetter].matches.push({
          id: groupLetter + '-' + (i + 1),
          team1: team1,
          team2: team2,
          score1: '-',
          score2: '-',
          spieltag: 1,
          status: 'offen'
        });
      }
    });

    const now = new Date();
    const einladeDeadline = new Date(now.getTime() + 5 * 60 * 1000); // +5 Minuten
    const abgabeDeadline = new Date(now.getTime() + 20 * 60 * 1000); // +20 Minuten

    data.deadlines[groupLetter] = {
      einladung: einladeDeadline.toISOString(),
      abgabe: abgabeDeadline.toISOString(),
      closed: false
    };

    saveData(data);

    setTimeout(async () => {
      const currentData = loadData();
      if (!currentData.deadlines[groupLetter] || currentData.deadlines[groupLetter].closed) return;

      let changed = false;
      currentData.groups[groupLetter].matches.forEach(m => {
        if (m.score1 === '-' && m.score2 === '-') {
          m.score1 = 0;
          m.score2 = 0;
          m.status = 'defwin';
          changed = true;
        }
      });

      if (changed) {
        currentData.deadlines[groupLetter].closed = true;
        saveData(currentData);
       
        const delayEmbed = new EmbedBuilder()
          .setTitle('⚠️ SPIELTAG ABGELAUFEN (KEINE GNADE)')
          .setDescription('Die Zeit für Spieltag ' + currentData.currentSpieltag + ' ist abgelaufen! Alle ungespielten Partien wurden automatisch als 0:0 gewertet. Es gibt keinen Einspruch bei verpasster Deadline!')
          .setColor('#ff0000');

        await message.channel.send({ embeds: [delayEmbed] });
        await postGroupBoard(message.channel, groupLetter);
      }
    }, 20 * 60 * 1000);

    await postGroupBoard(message.channel, groupLetter);
  }
});

// Hilfsfunktion: Schönes Gruppen-Board
async function postGroupBoard(channel, groupLetter) {
  const data = loadData();
  const group = data.groups[groupLetter];
  const deadline = data.deadlines[groupLetter];

  const stats = calculateStats(group);
 
  // Programmatisches Laden der Backticks, um Markdown-Spaltung im Bot-Generator komplett zu verhindern
  const ticks = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
 
  let tableHeader = ticks + '\n#   TEAM                 SP   S:U:N   TORE   +/-   PKT\n';
  let tableBody = '';
  stats.forEach((team, index) => {
    const rank = String(index + 1).padEnd(2);
    const name = team.name.substring(0, 18).padEnd(20);
    const sp = String(team.sp).padEnd(4);
    const sun = (team.s + ':' + team.u + ':' + team.n).padEnd(7);
    const tore = (team.goals + ':' + team.conceded).padEnd(6);
    const diff = (team.diff >= 0 ? '+' + team.diff : String(team.diff)).padEnd(5);
    const pkt = String(team.pkt);

    tableBody += rank + '  ' + name + ' ' + sp + ' ' + sun + ' ' + tore + ' ' + diff + ' ' + pkt + '\n';
  });
  const tableString = tableHeader + tableBody + ticks;

  let spielplanString = '';
  group.matches.forEach(m => {
    spielplanString += '• **' + m.team1 + '** ' + m.score1 + ':' + m.score2 + '  **' + m.team2 + '**\n';
  });

  const einladungTime = new Date(deadline.einladung).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const abgabeTime = new Date(deadline.abgabe).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const embed = new EmbedBuilder()
    .setTitle('🏆 GRUPPE ' + groupLetter + ' - LIVE BOARD')
    .setDescription(
      '🏁 **Einladezeit bis:** ' + einladungTime + ' Uhr (Gegner hat danach Anrecht auf Einladung/Defwin)\n' +
      '⏱️ **Ergebnis eintragen bis:** ' + abgabeTime + ' Uhr\n\n' +
      '📊 **Aktuelle Tabelle:**\n' + tableString + '\n' +
      '⚽ **Spielplan:**\n' + spielplanString
    )
    .setColor('#0099ff')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eintragen_' + groupLetter)
      .setLabel('Spieltag eintragen')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('video_' + groupLetter)
      .setLabel('Größen-Video fordern')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

function calculateStats(group) {
  const teamStats = {};
  group.teams.forEach(t => {
    teamStats[t] = { name: t, sp: 0, s: 0, u: 0, n: 0, goals: 0, conceded: 0, diff: 0, pkt: 0 };
  });

  group.matches.forEach(m => {
    if (m.score1 !== '-' && m.score2 !== '-') {
      const s1 = parseInt(m.score1);
      const s2 = parseInt(m.score2);

      teamStats[m.team1].sp++;
      teamStats[m.team2].sp++;

      teamStats[m.team1].goals += s1;
      teamStats[m.team1].conceded += s2;
      teamStats[m.team2].goals += s2;
      teamStats[m.team2].conceded += s1;

      if (s1 > s2) {
        teamStats[m.team1].s++;
        teamStats[m.team1].pkt += 3;
        teamStats[m.team2].n++;
      } else if (s1 < s2) {
        teamStats[m.team2].s++;
        teamStats[m.team2].pkt += 3;
        teamStats[m.team1].n++;
      } else {
        teamStats[m.team1].u++;
        teamStats[m.team1].pkt += 1;
        teamStats[m.team2].u++;
        teamStats[m.team2].pkt += 1;
      }
    }
  });

  return Object.values(teamStats).sort((a, b) => {
    a.diff = a.goals - a.conceded;
    b.diff = b.goals - b.conceded;
    if (b.pkt !== a.pkt) return b.pkt - a.pkt;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.goals - a.goals;
  });
}

client.on('interactionCreate', async (interaction) => {
  const data = loadData();

  if (interaction.isButton()) {
    if (interaction.customId === 'turnier_anmelden') {
      if (data.status !== 'open') return interaction.reply({ content: '❌ Die Anmeldung ist bereits geschlossen.', ephemeral: true });
      if (data.teams.some(t => t.userId === interaction.user.id)) return interaction.reply({ content: '❌ Dein Team ist bereits angemeldet.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('modal_anmeldung').setTitle('VGPL Cup Anmeldung');
      const clubInput = new TextInputBuilder().setCustomId('club_name').setLabel('Club-Name (Pro Clubs)').setStyle(TextInputStyle.Short).setRequired(true);
      const eaInput = new TextInputBuilder().setCustomId('ea_id').setLabel('PSN-ID / EA-ID des Kapitäns').setStyle(TextInputStyle.Short).setRequired(true);
      const ruleInput = new TextInputBuilder().setCustomId('rules').setLabel('Mind. 11 Spieler & Regeln gelesen? (JA)').setStyle(TextInputStyle.Short).setPlaceholder('Schreibe JA').setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(clubInput), new ActionRowBuilder().addComponents(eaInput), new ActionRowBuilder().addComponents(ruleInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'turnier_abmelden') {
      data.teams = data.teams.filter(t => t.userId !== interaction.user.id);
      saveData(data);
      await interaction.reply({ content: 'Erfolgreich vom Cup abgemeldet.', ephemeral: true });
    }

    if (interaction.customId === 'turnier_schliessen') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Nur Administratoren können die Anmeldung schließen!', ephemeral: true });
      data.status = 'closed';
      saveData(data);
      await interaction.reply({ content: '🔒 Die Anmeldung wurde erfolgreich geschlossen!', ephemeral: true });
    }

    if (interaction.customId.startsWith('eintragen_')) {
      const groupLetter = interaction.customId.replace('eintragen_', '');
     
      const modal = new ModalBuilder().setCustomId('modal_ergebnis_' + groupLetter).setTitle('Ergebnis eintragen');
      const matchInput = new TextInputBuilder().setCustomId('match_id').setLabel('Partie (z.B. Team A vs Team B)').setStyle(TextInputStyle.Short).setPlaceholder('Vereinsname vs Gegner').setRequired(true);
      const scoreInput = new TextInputBuilder().setCustomId('match_score').setLabel('Ergebnis (z.B. 2:1)').setStyle(TextInputStyle.Short).setPlaceholder('Heim : Gast').setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(matchInput), new ActionRowBuilder().addComponents(scoreInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('video_')) {
      const groupLetter = interaction.customId.replace('video_', '');
      const modal = new ModalBuilder().setCustomId('modal_video_' + groupLetter).setTitle('Größen-Video fordern');
      const playerInput = new TextInputBuilder().setCustomId('player_name').setLabel('Gegnerischer Spielername').setStyle(TextInputStyle.Short).setRequired(true);
      const clubInput = new TextInputBuilder().setCustomId('opponent_club').setLabel('Gegnerisches Team').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(playerInput), new ActionRowBuilder().addComponents(clubInput));
      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_anmeldung') {
      const clubName = interaction.fields.getTextInputValue('club_name');
      const eaId = interaction.fields.getTextInputValue('ea_id');
      const rules = interaction.fields.getTextInputValue('rules').toUpperCase().trim();

      if (rules !== 'YES' && rules !== 'JA') return interaction.reply({ content: '❌ Registrierung abgelehnt. Du musst mit JA bestätigen!', ephemeral: true });

      data.teams.push({ userId: interaction.user.id, clubName: clubName, eaId: eaId });
      saveData(data);
      await interaction.reply({ content: '✅ Team **' + clubName + '** erfolgreich registriert!', ephemeral: true });
    }

    if (interaction.customId.startsWith('modal_ergebnis_')) {
      const groupLetter = interaction.customId.replace('modal_ergebnis_', '');
      const matchText = interaction.fields.getTextInputValue('match_id');
      const scoreText = interaction.fields.getTextInputValue('match_score');

      const match = data.groups[groupLetter].matches.find(m =>
        matchText.toLowerCase().includes(m.team1.toLowerCase()) &&
        matchText.toLowerCase().includes(m.team2.toLowerCase())
      );

      if (!match) return interaction.reply({ content: '❌ Keine passende Partie gefunden. Bitte überprüfe die Teamnamen!', ephemeral: true });

      const scores = scoreText.split(':');
      if (scores.length !== 2) return interaction.reply({ content: '❌ Ungültiges Format! Bitte nutze ein Format wie z. B. 2:1', ephemeral: true });

      match.score1 = scores[0].trim();
      match.score2 = scores[1].trim();
      saveData(data);

      await interaction.reply({ content: '✅ Ergebnis für **' + match.team1 + ' vs ' + match.team2 + ' (' + scoreText + ')** erfolgreich eingetragen!', ephemeral: true });
      await postGroupBoard(interaction.channel, groupLetter);
    }

    if (interaction.customId.startsWith('modal_video_')) {
      const pName = interaction.fields.getTextInputValue('player_name');
      const oppClub = interaction.fields.getTextInputValue('opponent_club');

      await interaction.reply({
        content: '⚠️ **ACHTUNG!** Das gegnerische Team fordert einen Größen-Check für Spieler **' + pName + '** von **' + oppClub + '**!\n' +
                 '› Ihr habt ab jetzt **15 Minuten** Zeit, das Video der Höhenberechtigung in diesem Kanal hochzuladen, ansonsten wird die Partie als Defwin für den Gegner gewertet!',
        ephemeral: false
      });
    }
  }
});

function createRegistrationEmbed(teams) {
  let list = teams.length === 0 ? '*Noch keine Teams registriert.*' : teams.map((t, i) => '**' + (i+1) + '.** <@' + t.userId + '> - **' + t.clubName + '** (' + t.eaId + ')').join('\n');
  return new EmbedBuilder()
    .setTitle('🏆 VGPL Cup - Anmeldung geöffnet')
    .setDescription('Registriere dein Team hier für den Cup!\n\n### 📝 Registrierte Teams:\n' + list)
    .setColor('#00ff66')
    .setTimestamp();
}

client.login(process.env.DISCORD_TOKEN);
