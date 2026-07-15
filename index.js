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

// Datenbank laden und speichern (Unterstützt Gruppen A-F)
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
      deadlines: {}
    }));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
  console.log('VGPL Cup Bot is online as: ' + client.user.tag);
});

// Admin Command: Setup of the Cup (Posts English rules, calendar and registration)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Only Administrators can set up the tournament!');
    }

    const args = message.content.split(' ');
   
    const calendarChannel = message.mentions.channels.at(0); // #📅│cup-calendar
    const registrationChannel = message.mentions.channels.at(1); // #📝│cup-registration
    const rulesChannel = message.mentions.channels.at(2); // #📜│cup-rules

    if (!calendarChannel || !registrationChannel || !rulesChannel) {
      return message.reply('❌ Please mention all 3 channels! Example: `!setup-turnier #cup-calendar #cup-registration #cup-rules Saturday 21:00`');
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
    saveData(data);

    // 1. Official, complete Rulebook (In the Rules Channel) - Translated to English
    const rulesEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL TRAINING CUP - OFFICIAL RULES')
      .setDescription(
        'These rules are strictly binding for all participating teams.\n' +
        'By participating in the tournament, you automatically accept them.\n\n' +
        '**» 1. TOURNAMENT FLOW**\n' +
        '› **Tournament Start:** Usually 21:00 CEST\n' +
        '› **Invite Time per Match:** 5 minutes\n' +
        '› Once the match has started, players are not allowed to leave the lobby\n\n' +
        '**» 2. TEAM REQUIREMENTS**\n' +
        '```\n' +
        '[+] 11 Players Required\n' +
        '[+] Any Required\n' +
        '[+] Goalkeeper (GK) Required\n' +
        '[-] Less than 11 players = Defwin for opponent\n' +
        '```\n\n' +
        '**» 3. GAMEPLAY & IN-GAME BEHAVIOR**\n' +
        '**Forbidden:**\n' +
        '› Standing on the goal line during free kicks\n' +
        '› Blocking or obstructing the goalkeeper in the penalty box\n' +
        '› Bugusing -> Immediate disqualification\n\n' +
        '**Allowed:**\n' +
        '› Panenka penalties\n' +
        '› All tactical formations\n\n' +
        '**» 4. STREAM & PROOF REQUIREMENT**\n' +
        '› Stream requirement is active for all matches\n' +
        '› Quality control is the responsibility of the teams\n\n' +
        '**Video proof required for:**\n' +
        '› Player height/weight checks (Club Management Lobby screen)\n' +
        '› Both teams must be clearly visible in the video\n' +
        '› *⚠️ Violation = Immediate Defwin for opponent*\n\n' +
        '**» 5. SCORE REPORTING [MANDATORY]**\n' +
        '› Home team reports the score via the bot\n' +
        '› Away team must confirm the reported score\n' +
        '› Scores will NOT count without away team confirmation\n' +
        '› *Incorrect or delayed reports are subject to tournament sanctions*\n\n' +
        '**» 6. HEIGHT & WEIGHT RULES [MANDATORY]**\n' +
        '**3-Back Formations:**\n' +
        '```\n' +
        'Goalkeeper:           Any\n' +
        'CBs:                  max. 1.87 m (6\'2") | 79 kg\n' +
        'All other positions:  max. 1.82 m (6\'0")\n' +
        '```\n' +
        '**4-Back Formations:**\n' +
        '```\n' +
        'Goalkeeper:           Any\n' +
        '2 CBs + 1 CDM/Fullback: max. 1.87 m (6\'2") | 79 kg\n' +
        'All other positions:  max. 1.82 m (6\'0")\n' +
        '```\n' +
        '› **Playstyles:** All Playstyles allowed\n\n' +
        '**» 7. TIME OF HEIGHT CONTROL**\n' +
        '› Height checks must be requested latest by halftime break\n' +
        '› *Requests made after the halftime whistle are invalid*\n\n' +
        '**» 8. PENALTIES & DECISIONS**\n' +
        'Rule violations lead to (depending on severity):\n' +
        '› Defwin (3:0)\n' +
        '› Disqualification\n' +
        '› Tournament ban\n' +
        '› *Decisions of the Administration are final and absolute*\n\n' +
        '**» 9. FAIRPLAY**\n' +
        '› Fairness, structure and competitive eSports\n' +
        '› Unsporting behavior will be strictly penalized.'
      )
      .setColor('#ffcc00')
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed] });

    // 2. Calendar Embed (In the Calendar Channel) - Translated to English
    const calendarEmbed = new EmbedBuilder()
      .setTitle('📅 VGPL CUP - TOURNAMENT CALENDAR')
      .setDescription(
        '**VGPL Training Cup**\n' +
        '**Day:** ' + dayInput + ' | **Time:** ' + timeInput + ' CEST\n' +
        '**Status:** 🟢 Registration Open\n\n' +
        '📊 **Official Schedule (CEST):**\n' +
        '› **19:00** - Registration Deadline (' + dayInput + ')\n' +
        '› **19:00 - 19:45** - Team Check-In (Use Check-In Button)\n' +
        '› **20:45** - Group Draw & Matchups Released\n' +
        '› **21:00** - Tournament Start (Matchday 1)\n\n' +
        '➡️ **Register here:** ' + registrationChannel.toString() + '\n' +
        '📖 **Read the rules here:** ' + rulesChannel.toString()
      )
      .setColor('#0099ff')
      .setTimestamp();

    await calendarChannel.send({ embeds: [calendarEmbed] });

    // 3. Registration Board (In the Registration Channel) - Translated to English
    const registrationEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL Cup - Registration Open')
      .setDescription(
        'Register your team here for the upcoming tournament!\n\n' +
        '📊 **Schedule (' + dayInput + '):**\n' +
        '› **19:00** - Registration Deadline\n' +
        '› **19:00 - 19:45** - Check-In Phase (Click Check-In below)\n' +
        '› **20:45** - Group Draw\n' +
        '› **21:00** - Tournament Start\n\n' +
        '### 📝 Registered Teams:\n*No teams registered yet.*'
      )
      .setColor('#00ff66')
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('turnier_anmelden').setLabel('Register').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('turnier_abmelden').setLabel('Leave').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('turnier_checkin').setLabel('Check-In (19:00-19:45)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('turnier_schliessen').setLabel('Close Registration (Admin)').setStyle(ButtonStyle.Secondary)
    );

    await registrationChannel.send({ embeds: [registrationEmbed], components: [row] });
   
    await message.reply('✅ Setup completed successfully!\n' +
      '• Rules posted in ' + rulesChannel.toString() + '\n' +
      '• Calendar posted in ' + calendarChannel.toString() + '\n' +
      '• Registration board posted in ' + registrationChannel.toString()
    );
  }

  // Admin Command: Matchday Schedule entry
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
      return message.reply('❌ Invalid Group! Use e.g.: !spielplan Gruppe B | TeamA vs TeamB');
    }

    const matchesRaw = parts.slice(1);
    data.groups[groupLetter].matches = [];
    data.groups[groupLetter].teams = [];
    data.groups[groupLetter].boardMessageId = null; // Zurücksetzen für neue Nachrichten-Verknüpfung

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
    const einladeDeadline = new Date(now.getTime() + 5 * 60 * 1000); // +5 Minutes
    const abgabeDeadline = new Date(now.getTime() + 20 * 60 * 1000); // +20 Minutes

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
          .setTitle('⚠️ MATCHDAY TIME EXPIRED (DEADLINE CLOSED)')
          .setDescription('The time for matchday ' + currentData.currentSpieltag + ' has expired! All unplayed matches have been automatically scored as 0:0.')
          .setColor('#ff0000');

        await message.channel.send({ embeds: [delayEmbed] });
        await postGroupBoard(message.channel, groupLetter);
      }
    }, 20 * 60 * 1000);

    await postGroupBoard(message.channel, groupLetter);
  }
});

// Helper function: Group Board Embed (Optimized Mobile View & Message Editing)
async function postGroupBoard(channel, groupLetter) {
  const data = loadData();
  const group = data.groups[groupLetter];
  const deadline = data.deadlines[groupLetter];

  const stats = calculateStats(group);
 
  const ticks = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
 
  // Extrem kompakte Tabelle für perfekte mobile Darstellung
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
      '🏁 **Invite deadline:** ' + einladungTime + ' CEST (Opponent can request Defwin after this time)\n' +
      '⏱️ **Submit scores until:** ' + abgabeTime + ' CEST\n\n' +
      '📊 **Current Standings:**\n' + tableString + '\n' +
      '⚽ **Fixtures:**\n' + spielplanString
    )
    .setColor('#0099ff')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eintragen_' + groupLetter)
      .setLabel('Submit Score')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('video_' + groupLetter)
      .setLabel('Request Height Check Video')
      .setStyle(ButtonStyle.Secondary)
  );

  let boardMessage = null;

  // Versuchen, die bereits existierende Nachricht zu editieren, um Spam zu verhindern
  if (group.boardMessageId) {
    try {
      const existingMsg = await channel.messages.fetch(group.boardMessageId);
      if (existingMsg) {
        boardMessage = await existingMsg.edit({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      // Nachricht existiert nicht mehr im Kanal, wir senden eine neue
    }
  }

  // Wenn keine Nachricht editiert wurde, senden wir eine neue und speichern die ID
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
      if (data.status !== 'open') return interaction.reply({ content: '❌ Registration is currently closed.', ephemeral: true });
      if (data.teams.some(t => t.userId === interaction.user.id)) return interaction.reply({ content: '❌ Your team is already registered.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('modal_anmeldung').setTitle('VGPL Cup Registration');
      const clubInput = new TextInputBuilder().setCustomId('club_name').setLabel('Club Name (Pro Clubs)').setStyle(TextInputStyle.Short).setRequired(true);
      const eaInput = new TextInputBuilder().setCustomId('ea_id').setLabel('Captain EA-ID / PSN-ID').setStyle(TextInputStyle.Short).setRequired(true);
      const ruleInput = new TextInputBuilder().setCustomId('rules').setLabel('Read rules & min. 11 players? (YES)').setStyle(TextInputStyle.Short).setPlaceholder('Type YES').setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(clubInput), new ActionRowBuilder().addComponents(eaInput), new ActionRowBuilder().addComponents(ruleInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'turnier_abmelden') {
      data.teams = data.teams.filter(t => t.userId !== interaction.user.id);
      saveData(data);
      await interaction.reply({ content: 'Successfully removed your team from the cup.', ephemeral: true });
     
      const updateEmbed = createRegistrationEmbed(data.teams);
      await interaction.message.edit({ embeds: [updateEmbed] });
    }

    if (interaction.customId === 'turnier_checkin') {
      const team = data.teams.find(t => t.userId === interaction.user.id);
      if (!team) {
        return interaction.reply({ content: '❌ You must register your team first before checking in!', ephemeral: true });
      }

      if (team.checkedIn) {
        return interaction.reply({ content: '✅ Your team is already checked in!', ephemeral: true });
      }

      team.checkedIn = true;
      saveData(data);

      await interaction.reply({ content: '🟢 Check-In successful! Your team is marked as ready for the tournament.', ephemeral: true });

      const updateEmbed = createRegistrationEmbed(data.teams);
      await interaction.message.edit({ embeds: [updateEmbed] });
    }

    if (interaction.customId === 'turnier_schliessen') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Only Administrators can close the registration!', ephemeral: true });
      data.status = 'closed';
      saveData(data);
      await interaction.reply({ content: '🔒 Registration has been closed!', ephemeral: true });
    }

    if (interaction.customId.startsWith('eintragen_')) {
      const groupLetter = interaction.customId.replace('eintragen_', '');
     
      const modal = new ModalBuilder().setCustomId('modal_ergebnis_' + groupLetter).setTitle('Submit Score');
      const matchInput = new TextInputBuilder().setCustomId('match_id').setLabel('Fixture (e.g. Team A vs Team B)').setStyle(TextInputStyle.Short).setPlaceholder('Your Club vs Opponent').setRequired(true);
      const scoreInput = new TextInputBuilder().setCustomId('match_score').setLabel('Result (e.g. 2:1)').setStyle(TextInputStyle.Short).setPlaceholder('Home : Away').setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(matchInput), new ActionRowBuilder().addComponents(scoreInput));
      await interaction.showModal(modal);
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

      if (rules !== 'YES' && rules !== 'JA') return interaction.reply({ content: '❌ Registration declined. You must confirm with YES!', ephemeral: true });

      data.teams.push({ userId: interaction.user.id, clubName: clubName, eaId: eaId, checkedIn: false });
      saveData(data);
     
      await interaction.reply({ content: '✅ Team **' + clubName + '** successfully registered! Do not forget to click "Check-In" between 19:00 and 19:45 CEST!', ephemeral: true });
     
      const updateEmbed = createRegistrationEmbed(data.teams);
      await interaction.message.edit({ embeds: [updateEmbed] });
    }

    if (interaction.customId.startsWith('modal_ergebnis_')) {
      const groupLetter = interaction.customId.replace('modal_ergebnis_', '');
      const matchText = interaction.fields.getTextInputValue('match_id');
      const scoreText = interaction.fields.getTextInputValue('match_score');

      const match = data.groups[groupLetter].matches.find(m =>
        matchText.toLowerCase().includes(m.team1.toLowerCase()) &&
        matchText.toLowerCase().includes(m.team2.toLowerCase())
      );

      if (!match) return interaction.reply({ content: '❌ No matching fixture found. Please verify the club names!', ephemeral: true });

      const scores = scoreText.split(':');
      if (scores.length !== 2) return interaction.reply({ content: '❌ Invalid format! Please use home:away format like: 2:1', ephemeral: true });

      match.score1 = scores[0].trim();
      match.score2 = scores[1].trim();
      saveData(data);

      await interaction.reply({ content: '✅ Score for **' + match.team1 + ' vs ' + match.team2 + ' (' + scoreText + ')** submitted!', ephemeral: true });
      await postGroupBoard(interaction.channel, groupLetter);
    }

    if (interaction.customId.startsWith('modal_video_')) {
      const pName = interaction.fields.getTextInputValue('player_name');
      const oppClub = interaction.fields.getTextInputValue('opponent_club');

      await interaction.reply({
        content: '⚠️ **ATTENTION!** An opponent has requested a height check video for player **' + pName + '** from **' + oppClub + '**!\n' +
                 '› You have exactly **15 minutes** to upload the height/weight verification video in this channel, otherwise a Defwin (3:0) will be awarded to your opponent!',
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
    .setDescription(
      'Register your team here for the upcoming tournament!\n\n' +
      '📊 **Schedule:**\n' +
      '› **19:00** - Registration Deadline\n' +
      '› **19:00 - 19:45** - Check-In Phase (Click Check-In below)\n' +
      '› **20:45** - Group Draw\n' +
      '› **21:00** - Tournament Start\n\n' +
      '### 📝 Registered Teams:\n' + list
    )
    .setColor('#00ff66')
    .setTimestamp();
}

client.login(process.env.DISCORD_TOKEN);
