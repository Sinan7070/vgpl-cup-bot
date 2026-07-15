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
        'A': { teams: [], matches: [], boardMessageId: null },
        'B': { teams: [], matches: [], boardMessageId: null },
        'C': { teams: [], matches: [], boardMessageId: null },
        'D': { teams: [], matches: [], boardMessageId: null },
        'E': { teams: [], matches: [], boardMessageId: null },
        'F': { teams: [], matches: [], boardMessageId: null }
      },
      currentSpieltag: 1,
      deadlines: {},
      pendingScores: {} // Speichert unbestätigte Ergebnisse
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
  console.log('VGPL Cup Bot is online as: ' + client.user.tag);
});

// Admin Command: Setup
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Only Administrators can set up the tournament!');
    }

    const args = message.content.split(' ');
   
    const calendarChannel = message.mentions.channels.at(0);
    const registrationChannel = message.mentions.channels.at(1);
    const rulesChannel = message.mentions.channels.at(2);

    if (!calendarChannel || !registrationChannel || !rulesChannel) {
      return message.reply('❌ Please mention all 3 channels!');
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
        '› Home team reports the score via the bot ("Submit Score")\n' +
        '› Away team must confirm the reported score via the green button in the channel!\n' +
        '› Scores will NOT count without away team confirmation!'
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
    await message.reply('✅ Setup completed successfully!');
  }

  // Admin Command: Spielplan
  if (message.content.startsWith('!spielplan')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Only Admins can submit the matchday schedule!');
    }

    const content = message.content.replace('!spielplan', '').trim();
    const parts = content.split('|');
    const groupName = parts[0].trim();
    const groupLetter = groupName.replace('Gruppe', '').trim().toUpperCase();

    const data = loadData();
    if (!data.groups[groupLetter]) {
      return message.reply('❌ Invalid Group!');
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

// Helper function: Group Board Embed
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
    // 1. Registrierungen
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
      data.teams = data.teams.filter(t => t.userId !== interaction.user.id);
      saveData(data);
      await interaction.reply({ content: 'Successfully left.', ephemeral: true });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    if (interaction.customId === 'turnier_checkin') {
      const team = data.teams.find(t => t.userId === interaction.user.id);
      if (!team) return interaction.reply({ content: '❌ Register first!', ephemeral: true });
      if (team.checkedIn) return interaction.reply({ content: '✅ Already checked in!', ephemeral: true });

      team.checkedIn = true;
      saveData(data);
      await interaction.reply({ content: '🟢 Checked in successfully!', ephemeral: true });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    if (interaction.customId === 'turnier_schliessen') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
      data.status = 'closed';
      saveData(data);
      await interaction.reply({ content: '🔒 Closed!', ephemeral: true });
    }

    // 2. Score Eintragung (Öffnet Modal)
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

      // Den Spielplan-Match-Eintrag suchen und aktualisieren
      const group = data.groups[pending.groupLetter];
      const match = group.matches.find(m => m.team1 === pending.team1 && m.team2 === pending.team2);

      if (match) {
        match.score1 = pending.score1;
        match.score2 = pending.score2;
        delete data.pendingScores[pendingId]; // Aus den unbestätigten löschen
        saveData(data);

        await interaction.reply({ content: `✅ Score for **${pending.team1} vs ${pending.team2} (${pending.score1}:${pending.score2})** has been confirmed and updated!` });
        await interaction.message.delete().catch(() => {}); // Die Bestätigungsaufforderung löschen
        await postGroupBoard(interaction.channel, pending.groupLetter);
      } else {
        await interaction.reply({ content: '❌ Match not found in schedule anymore!', ephemeral: true });
      }
    }

    // 4. Score Ablehnung (Dispute)
    if (interaction.customId.startsWith('dispute_')) {
      const pendingId = interaction.customId.replace('dispute_', '');
      delete data.pendingScores[pendingId];
      saveData(data);

      await interaction.reply({ content: '⚠️ **Score rejected!** The opponent has disputed the score. Please contact an Administrator to clarify.' });
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
      const clubName = interaction.fields.getTextInputValue('club_name');
      const eaId = interaction.fields.getTextInputValue('ea_id');
      const rules = interaction.fields.getTextInputValue('rules').toUpperCase().trim();

      if (rules !== 'YES' && rules !== 'JA') return interaction.reply({ content: '❌ Confirm with YES!', ephemeral: true });

      data.teams.push({ userId: interaction.user.id, clubName: clubName, eaId: eaId, checkedIn: false });
      saveData(data);
     
      await interaction.reply({ content: '✅ Team registered!', ephemeral: true });
      await interaction.message.edit({ embeds: [createRegistrationEmbed(data.teams)] });
    }

    // Score Einreichung -> Erstellt Bestätigungsanfrage
    if (interaction.customId.startsWith('modal_ergebnis_')) {
      const groupLetter = interaction.customId.replace('modal_ergebnis_', '');
      const matchText = interaction.fields.getTextInputValue('match_id');
      const scoreText = interaction.fields.getTextInputValue('match_score');

      const match = data.groups[groupLetter].matches.find(m =>
        matchText.toLowerCase().includes(m.team1.toLowerCase()) &&
        matchText.toLowerCase().includes(m.team2.toLowerCase())
      );

      if (!match) return interaction.reply({ content: '❌ No matching fixture found. Verify club names!', ephemeral: true });

      const scores = scoreText.split(':');
      if (scores.length !== 2) return interaction.reply({ content: '❌ Use home:away format like 2:1', ephemeral: true });

      const pendingId = groupLetter + '-' + Date.now();
      data.pendingScores[pendingId] = {
        groupLetter: groupLetter,
        team1: match.team1,
        team2: match.team2,
        score1: scores[0].trim(),
        score2: scores[1].trim()
      };
      saveData(data);

      await interaction.reply({ content: '📩 Score submitted! Waiting for opponent confirmation.', ephemeral: true });

      // Nachricht für den Gegner zum Bestätigen in den Gruppenkanal posten
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

