require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
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

// Extrem schnelle Antwort für den externen Weckruf (Ping)
app.get('/', (req, res) => {
  res.status(200).send('VGPL Cup Bot ist aktiv und wach!');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Webserver läuft auf Port ' + (process.env.PORT || 3000));
});

// Interner Backup-Pinger
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://vgpl-cup-bot.onrender.com';
setInterval(() => {
  if (RENDER_EXTERNAL_URL) {
    https.get(RENDER_EXTERNAL_URL, (res) => {
      // Ruhiger Ping im Hintergrund
    }).on('error', (err) => {
      console.error('Keep-Alive Fehler:', err.message);
    });
  }
}, 4 * 60 * 1000); // Alle 4 Minuten intern pingen

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
        'A': { teams: [], matches: [], boardMessageId: null },
        'B': { teams: [], matches: [], boardMessageId: null },
        'C': { teams: [], matches: [], boardMessageId: null },
        'D': { teams: [], matches: [], boardMessageId: null },
        'E': { teams: [], matches: [], boardMessageId: null },
        'F': { teams: [], matches: [], boardMessageId: null }
      },
      currentSpieltag: 1,
      deadlines: {},
      pendingScores: {}
    }));
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!parsed.pendingScores) parsed.pendingScores = {};
  return parsed;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
  console.log('VGPL Cup Bot ist online als: ' + client.user.tag);
});

// Admin-Befehl: Setup
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Nur Administratoren können das Turnier einrichten!');
    }

    const args = message.content.split(' ');
   
    const calendarChannel = message.mentions.channels.at(0);
    const registrationChannel = message.mentions.channels.at(1);
    const rulesChannel = message.mentions.channels.at(2);

    if (!calendarChannel || !registrationChannel || !rulesChannel) {
      return message.reply('❌ Bitte markiere alle 3 Kanäle!');
    }

    const dayInput = args[4] || 'Saturday';
    const timeInput = args[5] || '21:00';

    const data = loadData();
    data.teams = [];
    data.status = 'open';
    data.groups = {
      'A': { teams: [], matches: [], boardMessageId: null },
      'B': { teams: [], matches: [], boardMessageId: null },
      'C': { teams: [], matches: [], boardMessageId: null },
      'D': { teams: [], matches: [], boardMessageId: null },
      'E': { teams: [], matches: [], boardMessageId: null },
      'F': { teams: [], matches: [], boardMessageId: null }
    };
    data.pendingScores = {};
    saveData(data);

    const rulesEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL TRAINING CUP - OFFICIAL RULES')
      .setDescription(
        'These rules are strictly binding for all participating teams.\n\n' +
        '**» 5. SCORE REPORTING [MANDATORY]**\n' +
        '› Home or Away team reports the score via the bot ("Submit Score")\n' +
        '› The opponent team must confirm the reported score via the green button in the channel!\n' +
        '› Scores will NOT count without opponent team confirmation!'
      )
      .setColor('#ffcc00')
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed] });

    const calendarEmbed = new EmbedBuilder()
      .setTitle('📅 VGPL CUP - TOURNAMENT CALENDAR')
      .setDescription(
        '**VGPL Training Cup**\n' +
        '**Day:** ' + dayInput + ' | **Time:** ' + timeInput + ' CEST\n' +
        '➡️ **Register here:** ' + registrationChannel.toString()
      )
      .setColor('#0099ff')
      .setTimestamp();

    await calendarChannel.send({ embeds: [calendarEmbed] });

    const registrationEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL Cup - Registration Open')
      .setDescription('### 📝 Registered Teams:\n*No teams registered yet.*')
      .setColor('#00ff66')
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('turnier_anmelden').setLabel('Register').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('turnier_abmelden').setLabel('Leave').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('turnier_checkin').setLabel('Check-In').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('turnier_schliessen').setLabel('Close Registration').setStyle(ButtonStyle.Secondary)
    );

    await registrationChannel.send({ embeds: [registrationEmbed], components: [row] });
    await message.reply('✅ Setup erfolgreich abgeschlossen!');
  }

  // Admin-Befehl: Spielplan erstellen
  if (message.content.startsWith('!spielplan')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Nur Admins können den Spielplan erstellen!');
    }

    const content = message.content.replace('!spielplan', '').trim();
    const parts = content.split('|');
    const groupName = parts[0].trim();
    const groupLetter = groupName.replace('Gruppe', '').trim().toUpperCase();

    const data = loadData();
    if (!data.groups[groupLetter]) {
      return message.reply('❌ Ungültige Gruppe!');
    }

    const matchesRaw = parts.slice(1);
    data.groups[groupLetter].matches = [];
    data.groups[groupLetter].teams = [];
    data.groups[groupLetter].boardMessageId = null;

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
          status: 'offen'
        });
      }
    });

    const now = new Date();
    data.deadlines[groupLetter] = {
      einladung: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      abgabe: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
      closed: false
    };

    saveData(data);
    await postGroupBoard(message.channel, groupLetter);
  }
});

// Gruppen-Board posten / editieren
async function postGroupBoard(channel, groupLetter) {
  const data = loadData();
  const group = data.groups[groupLetter];
  const deadline = data.deadlines[groupLetter];

  const stats = calculateStats(group);
  const ticks = '```';
 
  let tableHeader = ticks + '\n#  TEAM         P   W:D:L   GD  PTS\n';
  let tableBody = '';
  stats.forEach((team, index) => {
    const rank = String(index + 1).padEnd(2);
    const name = team.name.substring(0, 12).padEnd(12);
    const sp = String(team.sp).padEnd(3);
    const sun = (team.s + ':' + team.u + ':' + team.n).padEnd(7);
    const diff = (team.diff >= 0 ? '+' + team.diff : String(team.diff)).padEnd(4);
    const pkt = String(team.pkt);

    tableBody += rank + ' ' + name + ' ' + sp + ' ' + sun + ' ' + diff + ' ' + pkt + '\n';
  });
  const tableString = tableHeader + tableBody + ticks;

  let spielplanString = '';
  group.matches.forEach(m => {
    spielplanString += '• **' + m.team1 + '** ' + m.score1 + ':' + m.score2 + '  **' + m.team2 + '**\n';
  });

  const einladungTime = new Date(deadline.einladung).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const abgabeTime = new Date(deadline.abgabe).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const embed = new EmbedBuilder()
    .setTitle('🏆 GROUP ' + groupLetter + ' - LIVE BOARD')
    .setDescription(
      '🏁 **Invite deadline:** ' + einladungTime + ' CEST\n' +
      '⏱️ **Submit scores until:** ' + abgabeTime + ' CEST\n\n' +
      '📊 **Current Standings:**\n' + tableString + '\n' +
      '⚽ **Fixtures:**\n' + spielplanString
    )
    .setColor('#0099ff')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eintragen_' + groupLetter).setLabel('Submit Score').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('video_' + groupLetter).setLabel('Request Height Check Video').setStyle(ButtonStyle.Secondary)
  );

  let boardMessage = null;

  if (group.boardMessageId) {
    try {
      const existingMsg = await channel.messages.fetch(group.boardMessageId);
      if (existingMsg) {
        boardMessage = await existingMsg.edit({ embeds: [embed], components: [row] });
      }
    } catch (err) {}
  }

  if (!boardMessage) {
    boardMessage = await channel.send({ embeds: [embed], components: [row] });
    group.boardMessageId = boardMessage.id;
    saveData(data);
  }
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
      if (data.status !== 'open') return interaction.reply({ content: '❌ Registration is closed.', ephemeral: true });
      if (data.teams.some(t => t.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already registered.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('modal_anmeldung').setTitle('VGPL Cup Registration');
      const clubInput = new TextInputBuilder().setCustomId('club_name').setLabel('Club Name').setStyle(TextInputStyle.Short).setRequired(true);
      const eaInput = new TextInputBuilder().setCustomId('ea_id').setLabel('Captain EA-ID').setStyle(TextInputStyle.Short).setRequired(true);
      const ruleInput = new TextInputBuilder().setCustomId('rules').setLabel('Read rules & min. 11 players? (YES)').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(clubInput), new ActionRowBuilder().addComponents(eaInput), new ActionRowBuilder().addComponents(ruleInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'turnier_abmelden') {
      await interaction.deferReply({ ephemeral: true });
      data.teams = data.teams.filter(t => t.userId !== interaction.user.id);
      saveData(data);
      await interaction.editReply({ content: 'Successfully left.' });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    // Zeitschutz für den Check-In-Button (Nur Samstags 19:00 - 19:45 CEST)
    if (interaction.customId === 'turnier_checkin') {
      const now = new Date();
      const options = { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', weekday: 'long' };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(now);
     
      const weekday = parts.find(p => p.type === 'weekday').value;
      const hour = parseInt(parts.find(p => p.type === 'hour').value);
      const minute = parseInt(parts.find(p => p.type === 'minute').value);

      const isSaturday = weekday === 'Saturday';
      const currentMinutes = hour * 60 + minute;
      const startCheckInMinutes = 19 * 60; // 19:00
      const endCheckInMinutes = 19 * 60 + 45; // 19:45

      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isSaturday || currentMinutes < startCheckInMinutes || currentMinutes > endCheckInMinutes) {
        if (!isAdmin) {
          return interaction.reply({
            content: '🔒 **Check-In is currently locked!**\n' +
                     '› Check-In is **only** active on **Saturday between 19:00 and 19:45 CEST** (20:00 - 20:45 TRT).\n' +
                     '› Please come back on Saturday inside the official window to complete your Check-In!',
            ephemeral: true
          });
        }
      }

      await interaction.deferReply({ ephemeral: true });
      const team = data.teams.find(t => t.userId === interaction.user.id);
      if (!team) return interaction.editReply({ content: '❌ Register first!' });
      if (team.checkedIn) return interaction.editReply({ content: '✅ Already checked in!' });

      team.checkedIn = true;
      saveData(data);
      await interaction.editReply({ content: '🟢 Checked in successfully! Your team is marked as READY.' });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    if (interaction.customId === 'turnier_schliessen') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
      data.status = 'closed';
      saveData(data);
      await interaction.reply({ content: '🔒 Closed!', ephemeral: true });
    }

    // 2. Score Eintragung
    if (interaction.customId.startsWith('eintragen_')) {
      const groupLetter = interaction.customId.replace('eintragen_', '');
      const modal = new ModalBuilder().setCustomId('modal_ergebnis_' + groupLetter).setTitle('Submit Score');
      const matchInput = new TextInputBuilder().setCustomId('match_id').setLabel('Fixture (e.g. FC FIFA vs Eintracht Elgato)').setStyle(TextInputStyle.Short).setRequired(true);
      const scoreInput = new TextInputBuilder().setCustomId('match_score').setLabel('Result (e.g. 2:1)').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(matchInput), new ActionRowBuilder().addComponents(scoreInput));
      await interaction.showModal(modal);
    }

    // 3. Score Bestätigung (Verify System)
    if (interaction.customId.startsWith('confirm_')) {
      const pendingId = interaction.customId.replace('confirm_', '');
      const pending = data.pendingScores[pendingId];

      if (!pending) {
        return interaction.reply({ content: '❌ This submission was not found or is expired.', ephemeral: true });
      }

      const opponentTeam = data.teams.find(t => t.clubName.toLowerCase() === pending.team2.toLowerCase());
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isOpponentCaptain = opponentTeam && interaction.user.id === opponentTeam.userId;

      if (opponentTeam && !isOpponentCaptain && !isAdmin) {
        return interaction.reply({
          content: `❌ Only the captain of **${pending.team2}** (<@${opponentTeam.userId}>) or a Tournament Administrator can confirm this score!`,
          ephemeral: true
        });
      }

      await interaction.deferReply();
      const group = data.groups[pending.groupLetter];
      const match = group.matches.find(m => m.team1 === pending.team1 && m.team2 === pending.team2);

      if (match) {
        match.score1 = pending.score1;
        match.score2 = pending.score2;
        delete data.pendingScores[pendingId];
        saveData(data);

        await interaction.editReply({ content: `✅ Score for **${pending.team1} vs ${pending.team2} (${pending.score1}:${pending.score2})** has been confirmed!` });
        await interaction.message.delete().catch(() => {});
        await postGroupBoard(interaction.channel, pending.groupLetter);
      } else {
        await interaction.editReply({ content: '❌ Match not found in schedule anymore!' });
      }
    }

    // 4. Score Ablehnung (Dispute)
    if (interaction.customId.startsWith('dispute_')) {
      const pendingId = interaction.customId.replace('dispute_', '');
      const pending = data.pendingScores[pendingId];

      if (!pending) {
        return interaction.reply({ content: '❌ This submission was not found or is expired.', ephemeral: true });
      }

      const opponentTeam = data.teams.find(t => t.clubName.toLowerCase() === pending.team2.toLowerCase());
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isOpponentCaptain = opponentTeam && interaction.user.id === opponentTeam.userId;

      if (opponentTeam && !isOpponentCaptain && !isAdmin) {
        return interaction.reply({
          content: `❌ Only the captain of **${pending.team2}** (<@${opponentTeam.userId}>) or a Tournament Administrator can dispute this score!`,
          ephemeral: true
        });
      }

      await interaction.deferReply();
      delete data.pendingScores[pendingId];
      saveData(data);

      await interaction.editReply({ content: `⚠️ **Score rejected!** The team **${pending.team2}** has disputed the reported score (${pending.score1}:${pending.score2}). Please contact an Administrator to clarify.` });
      await interaction.message.delete().catch(() => {});
    }

    if (interaction.customId.startsWith('video_')) {
      const groupLetter = interaction.customId.replace('video_', '');
      const modal = new ModalBuilder().setCustomId('modal_video_' + groupLetter).setTitle('Request Height Check');
      const playerInput = new TextInputBuilder().setCustomId('player_name').setLabel('Opponent Player Name').setStyle(TextInputStyle.Short).setRequired(true);
      const clubInput = new TextInputBuilder().setCustomId('opponent_club').setLabel('Opponent Club Name').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(playerInput), new ActionRowBuilder().addComponents(clubInput));
      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_anmeldung') {
      await interaction.deferReply({ ephemeral: true });
      const clubName = interaction.fields.getTextInputValue('club_name');
      const eaId = interaction.fields.getTextInputValue('ea_id');
      const rules = interaction.fields.getTextInputValue('rules').toUpperCase().trim();

      if (rules !== 'YES' && rules !== 'JA') return interaction.editReply({ content: '❌ Confirm with YES!' });

      data.teams.push({ userId: interaction.user.id, clubName: clubName, eaId: eaId, checkedIn: false });
      saveData(data);
     
      await interaction.editReply({ content: '✅ Team registered!' });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    // Score Einreichung -> Erstellt Bestätigungsanfrage
    if (interaction.customId.startsWith('modal_ergebnis_')) {
      await interaction.deferReply({ ephemeral: true });
      const groupLetter = interaction.customId.replace('modal_ergebnis_', '');
      const matchText = interaction.fields.getTextInputValue('match_id');
      const scoreText = interaction.fields.getTextInputValue('match_score');

      const match = data.groups[groupLetter].matches.find(m =>
        matchText.toLowerCase().includes(m.team1.toLowerCase()) &&
        matchText.toLowerCase().includes(m.team2.toLowerCase())
      );

      if (!match) return interaction.editReply({ content: '❌ No matching fixture found. Verify club names!' });

      const scores = scoreText.split(':');
      if (scores.length !== 2) return interaction.editReply({ content: '❌ Use home:away format like 2:1' });

      const team1Db = data.teams.find(t => t.clubName.toLowerCase() === match.team1.toLowerCase());
      const team2Db = data.teams.find(t => t.clubName.toLowerCase() === match.team2.toLowerCase());
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      const isTeam1Captain = team1Db && interaction.user.id === team1Db.userId;
      const isTeam2Captain = team2Db && interaction.user.id === team2Db.userId;

      if ((team1Db || team2Db) && !isTeam1Captain && !isTeam2Captain && !isAdmin) {
        return interaction.editReply({
          content: `❌ Only the captains of **${match.team1}** or **${match.team2}**, or a Tournament Administrator can submit scores for this match!`
        });
      }

      const pendingId = groupLetter + '-' + Date.now();
      data.pendingScores[pendingId] = {
        groupLetter: groupLetter,
        team1: match.team1,
        team2: match.team2,
        score1: scores[0].trim(),
        score2: scores[1].trim()
      };
      saveData(data);

      await interaction.editReply({ content: '📩 Score submitted! Waiting for opponent confirmation.' });

      const confirmEmbed = new EmbedBuilder()
        .setTitle('🤝 Score Confirmation Required')
        .setDescription(
          `**${match.team1}** has reported the score:\n` +
          `### ⚽ **${match.team1}  ${scores[0].trim()} : ${scores[1].trim()}  ${match.team2}**\n\n` +
          `*Opponent **${match.team2}** must confirm or dispute this score!*`
        )
        .setColor('#ff9900')
        .setTimestamp();

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_' + pendingId).setLabel('Confirm Score ✓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dispute_' + pendingId).setLabel('Dispute ❌').setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
    }

    if (interaction.customId.startsWith('modal_video_')) {
      const pName = interaction.fields.getTextInputValue('player_name');
      const oppClub = interaction.fields.getTextInputValue('opponent_club');

      await interaction.reply({
        content: '⚠️ **ATTENTION!** An opponent has requested a height check video for player **' + pName + '** from **' + oppClub + '**!\n' +
                 '› You have exactly **15 minutes** to upload the video!',
        ephemeral: false
      });
    }
  }
});

function createRegistrationEmbed(teams) {
  let list = '';
  if (teams.length === 0) {
    list = '*No teams registered yet.*';
  } else {
    list = teams.map((t, i) => {
      const statusEmoji = t.checkedIn ? '🟢 Checked In' : '🔴 Not Checked In';
      return '**' + (i+1) + '.** <@' + t.userId + '> - **' + t.clubName + '** (' + t.eaId + ') | Status: **' + statusEmoji + '**';
    }).join('\n');
  }

  return new EmbedBuilder()
    .setTitle('🏆 VGPL Cup - Registration Open')
    .setDescription('### 📝 Registered Teams:\n' + list)
    .setColor('#00ff66')
    .setTimestamp();
}

client.login(process.env.DISCORD_TOKEN);
