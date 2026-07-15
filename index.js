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

// Load and save database
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ teams: [], status: 'open' }));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
  console.log(`VGPL Cup Bot is online: ${client.user.tag}`);
});

// Admin command to set up the Cup
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!setup-turnier')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Only Administrators can set up the tournament!');
    }

    const args = message.content.split(' ');
    const targetChannel = message.mentions.channels.first(); // First mentioned channel (#cup-registration)
    const rulesChannel = message.mentions.channels.at(1); // Second mentioned channel (#cup-rules)

    if (!targetChannel || !rulesChannel) {
      return message.reply('❌ Please mention both channels! Example: `!setup-turnier #cup-registration #cup-rules Saturday 21:00`');
    }

    // Extracting Day and Time from arguments (everything after the second channel mention)
    // Args are: [0]!setup-turnier, [1]#channel1, [2]#channel2, [3]Day, [4]Time
    const dayInput = args[3] || 'Wednesday';
    const timeInput = args[4] || '20:15';

    const data = loadData();
    data.teams = [];
    data.status = 'open';
    saveData(data);

    // 1. Post Official Rules to #cup-rules
    const rulesEmbed = new EmbedBuilder()
      .setTitle('🏆 VGPL TRAINING CUP - OFFICIAL RULES')
      .setDescription(
        `These rules are binding for all participating teams. By registering and participating in the tournament, you automatically accept them.\n\n` +
        `⸻\n` +
        `### » 1. TOURNAMENT SCHEDULE\n` +
        `› **Tournament Start:** Usually at 9:00 PM CEST (21:00)\n` +
        `› **Invitation Time:** Max. 5 minutes per match to invite the opponent\n` +
        `› **No Leaving:** Once the match has started, players are not allowed to leave the game\n\n` +
        `⸻\n` +
        `### » 2. TEAM REQUIREMENTS\n` +
        `\`\`\`\n` +
        `[+] 11 Players Required (Minimum)\n` +
        `[+] "Any" Position Required\n` +
        `[+] Goalkeeper (GK) Required\n` +
        `[-] Fewer than 11 players = Default Win (Defwin) for the opponent\n` +
        `\`\`\`\n\n` +
        `⸻\n` +
        `### » 3. GAMEPLAY & BEHAVIOR\n` +
        `**🚫 Forbidden:**\n` +
        `› Standing on the goal line during free kicks\n` +
        `› Blocking or obstructing the goalkeeper inside the penalty box\n` +
        `› Exploit/Bug abuse › **Immediate disqualification from the tournament**\n\n` +
        `**✅ Allowed:**\n` +
        `› Chipped penalties (Panenka)\n` +
        `› Any formation/tactical system\n\n` +
        `⸻\n` +
        `### » 4. STREAMING & EVIDENCE DUTY\n` +
        `› **Stream Duty:** All matches must be streamed live.\n` +
        `› **Monitoring:** It is the responsibility of both teams to check.\n\n` +
        `**📸 Video Evidence Required For:**\n` +
        `› Player height checks (must show the Club Management screen)\n` +
        `› Both teams must be clearly visible in the footage\n\n` +
        `> ⚠️ **Violation of these duties = Immediate Default Win (Defwin)**\n\n` +
        `⸻\n` +
        `### » 5. RESULT REPORTING [BINDING]\n` +
        `› **Home Team:** Must report the final score.\n` +
        `› **Away Team:** Must confirm the reported score.\n` +
        `› **No Confirmation:** Unconfirmed matches will **NOT** be counted.\n\n` +
        `> ⚠️ **False or delayed reporting will lead to sanctions.**\n\n` +
        `⸻\n` +
        `### » 6. PLAYER HEIGHT RESTRICTIONS [BINDING]\n` +
        `**🛡️ 3-At-The-Back Formations:**\n` +
        `\`\`\`\n` +
        `Goalkeeper (GK):      Any height\n` +
        `CBs:                  Max. 1.87 m (6'2")\n` +
        `All other players:    Max. 1.82 m (6'0")\n` +
        `\`\`\`\n` +
        `**🛡️ 4-At-The-Back Formations:**\n` +
        `\`\`\`\n` +
        `Goalkeeper (GK):      Any height\n` +
        `2 CBs + 1 CDM/Fullback: Max. 1.87 m (6'2")\n` +
        `All other players:    Max. 1.82 m (6'0")\n` +
        `\`\`\`\n` +
        `**✨ Playstyles:** All Playstyles are allowed.\n\n` +
        `⸻\n` +
        `### » 7. TIME LIMIT FOR HEIGHT CHECKS\n` +
        `› **Check Deadline:** Any player height checks must be requested and completed **before** the halftime whistle.\n\n` +
        `> 🚫 **Any complaints or claims made after halftime are invalid.**\n\n` +
        `⸻\n` +
        `### » 8. PENALTIES & DECISIONS\n` +
        `**Rule violations will lead to (depending on severity):**\n` +
        `› Default Win (Defwin)\n` +
        `› Disqualification from the match\n` +
        `› Permanent ban from the tournament\n\n` +
        `> ⚖️ **Decisions made by the Tournament Administration are final.**\n\n` +
        `⸻\n` +
        `### » 9. FAIR PLAY\n` +
        `**VGPL stands for:**\n` +
        `› Fairness\n` +
        `› Structure\n` +
        `› Competitive eSports\n\n` +
        `Unsporting behavior of any kind will be strictly penalized.`
      )
      .setColor('#ffcc00')
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed] });

    // 2. Calendar Embed for #cup-calendar (Dynamic Day & Time)
    const calendarEmbed = new EmbedBuilder()
      .setTitle('📅 VGPL CUP - TOURNAMENT CALENDAR')
      .setDescription(
        `**VGPL Training Cup**\n` +
        `**Day:** ${dayInput} | **Time:** ${timeInput} CEST\n` +
        `**Status:** 🟢 Registration Open\n\n` +
        `### 🕗 Schedule & Rules\n` +
        `* **Start:** The Cup starts as soon as we have at least 4 confirmed teams!\n` +
        `* **Odd Teams:** Placed on the waiting list until an even number is reached.\n` +
        `* **Schedule:** Created externally via **meinspielplan.de**.\n\n` +
        `➡️ **Register here:** ${targetChannel}\n` +
        `📖 **Read the rules here:** ${rulesChannel}`
      )
      .setColor('#0099ff')
      .setTimestamp();

    await message.channel.send({ embeds: [calendarEmbed] });

    // 3. Registration Board in target channel
    const registrationEmbed = createRegistrationEmbed(data.teams);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('turnier_anmelden')
        .setLabel('Register')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('turnier_abmelden')
        .setLabel('Unregister')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('turnier_schliessen')
        .setLabel('Close Registration (Admin)')
        .setStyle(ButtonStyle.Secondary)
    );

    await targetChannel.send({ embeds: [registrationEmbed], components: [row] });
    await message.reply(`✅ Setup complete! Rules posted in ${rulesChannel} and Registration Board posted in ${targetChannel}.`);
  }
});

// Interactions (Buttons & Modals)
client.on('interactionCreate', async (interaction) => {
  const data = loadData();

  if (interaction.isButton()) {
    // 1. REGISTRATION (Opens Modal)
    if (interaction.customId === 'turnier_anmelden') {
      if (data.status !== 'open') {
        return interaction.reply({ content: '❌ Registration for the VGPL Cup is closed.', ephemeral: true });
      }
      if (data.teams.some(t => t.userId === interaction.user.id)) {
        return interaction.reply({ content: '❌ Your team is already registered.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId('modal_anmeldung').setTitle('VGPL Cup Registration');
     
      const clubInput = new TextInputBuilder()
        .setCustomId('club_name')
        .setLabel('Club Name (Pro Clubs)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const eaInput = new TextInputBuilder()
        .setCustomId('ea_id')
        .setLabel('PSN-ID / EA-ID of Captain')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const ruleInput = new TextInputBuilder()
        .setCustomId('rules')
        .setLabel('Min 11 players & read rules? (YES)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Type YES if your roster is ready to play')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(clubInput),
        new ActionRowBuilder().addComponents(eaInput),
        new ActionRowBuilder().addComponents(ruleInput)
      );

      await interaction.showModal(modal);
    }

    // 2. UNREGISTER
    if (interaction.customId === 'turnier_abmelden') {
      if (data.status !== 'open') {
        return interaction.reply({ content: '❌ Registration is already closed.', ephemeral: true });
      }

      const initialLength = data.teams.length;
      data.teams = data.teams.filter(t => t.userId !== interaction.user.id);

      if (data.teams.length === initialLength) {
        return interaction.reply({ content: 'Your team is not registered for this Cup.', ephemeral: true });
      }

      saveData(data);
      await interaction.reply({ content: 'Successfully unregistered from VGPL Cup.', ephemeral: true });
     
      const updatedEmbed = createRegistrationEmbed(data.teams);
      await interaction.message.edit({ embeds: [updatedEmbed] });
    }

    // 3. CLOSE REGISTRATION (Admin Button)
    if (interaction.customId === 'turnier_schliessen') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only Administrators can close the registration!', ephemeral: true });
      }

      data.status = 'closed';
      saveData(data);

      await interaction.reply({ content: '🔒 Registration has been closed! You can now transfer the teams to meinspielplan.de.', ephemeral: true });
     
      const updatedEmbed = createRegistrationEmbed(data.teams, true);
      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
    }
  }

  // FORM SUBMISSION (Modal Submit)
  if (interaction.isModalSubmit() && interaction.customId === 'modal_anmeldung') {
    const clubName = interaction.fields.getTextInputValue('club_name');
    const eaId = interaction.fields.getTextInputValue('ea_id');
    const rules = interaction.fields.getTextInputValue('rules').toUpperCase().trim();

    if (rules !== 'YES' && rules !== 'JA') {
      return interaction.reply({ content: '❌ Registration declined. You must confirm that your team has at least 11 players and you read the rules!', ephemeral: true });
    }

    data.teams.push({
      userId: interaction.user.id,
      clubName: clubName,
      eaId: eaId,
      registeredAt: new Date().toISOString()
    });

    saveData(data);
    await interaction.reply({ content: `✅ Team **${clubName}** has been registered!`, ephemeral: true });

    const updatedEmbed = createRegistrationEmbed(data.teams);
    await interaction.message.edit({ embeds: [updatedEmbed] });
  }
});

// Dynamic registration embed with waiting list logic
function createRegistrationEmbed(teams, closed = false) {
  let teamListString = '';
 
  if (teams.length === 0) {
    teamListString = '*No teams registered yet.*';
  } else {
    teams.forEach((team, index) => {
      const position = index + 1;
      let statusTag = '🟢 **Confirmed**';
     
      if (position < 4) {
        statusTag = '🟢 **Confirmed** (Waiting for minimum participants: 4)';
      } else if (position >= 4 && position % 2 !== 0) {
        statusTag = '⏳ **Waiting List** (Needs 1 more team)';
      } else {
        statusTag = '🟢 **Confirmed**';
      }

      teamListString += `**${position}.** <@${team.userId}> - **${team.clubName}** (${team.eaId}) | ${statusTag}\n`;
    });
  }

  const statusColor = closed ? '#ff0000' : '#00ff66';
  const statusTitle = closed ? '🔒 VGPL Cup (Registration Closed)' : '🏆 VGPL Cup (Registration Open)';

  return new EmbedBuilder()
    .setTitle(statusTitle)
    .setDescription(
      `**Game Mode:** 11vs11 Pro Clubs\n` +
      `**Start Condition:** Minimum of 4 teams. Every odd team is placed on the waiting list until an even number is reached.\n\n` +
      `### 📝 Registered Teams\n${teamListString}\n\n` +
      (closed ? '*The roster is finalized. The schedule is being generated!*' : '*Click **Register** below to sign up your club!*')
    )
    .setColor(statusColor)
    .setTimestamp();
}

client.login(process.env.DISCORD_TOKEN);
