const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const clan = new SlashCommandBuilder()
  .setName("clan")
  .setDescription("Create and manage PEAK clans")
  .addSubcommand(s => s.setName("create").setDescription("Create a clan")
    .addStringOption(o => o.setName("name").setDescription("Clan name").setRequired(true).setMaxLength(32))
    .addStringOption(o => o.setName("tag").setDescription("Short unique clan tag (2-6 chars)").setRequired(true).setMinLength(2).setMaxLength(6)))
  .addSubcommand(s => s.setName("info").setDescription("Show your clan or another clan")
    .addStringOption(o => o.setName("tag").setDescription("Clan tag (optional)").setRequired(false)))
  .addSubcommand(s => s.setName("invite").setDescription("Invite a user to your clan")
    .addUserOption(o => o.setName("user").setDescription("Member to invite").setRequired(true)))
  .addSubcommand(s => s.setName("join").setDescription("Accept a clan invitation")
    .addStringOption(o => o.setName("tag").setDescription("Clan tag").setRequired(true)))
  .addSubcommand(s => s.setName("leave").setDescription("Leave your clan"))
  .addSubcommand(s => s.setName("kick").setDescription("Remove a member (leader/co-leader)")
    .addUserOption(o => o.setName("user").setDescription("Member to remove").setRequired(true)))
  .addSubcommand(s => s.setName("promote").setDescription("Promote a member to co-leader (leader only)")
    .addUserOption(o => o.setName("user").setDescription("Member to promote").setRequired(true)))
  .addSubcommand(s => s.setName("members").setDescription("List your clan members")
    .addStringOption(o => o.setName("tag").setDescription("Clan tag (optional)").setRequired(false)));

const war = new SlashCommandBuilder()
  .setName("war")
  .setDescription("Challenge clans and manage clan wars")
  .addSubcommand(s => s.setName("challenge").setDescription("Challenge another clan")
    .addStringOption(o => o.setName("tag").setDescription("Opponent clan tag").setRequired(true)))
  .addSubcommand(s => s.setName("accept").setDescription("Accept a pending war")
    .addIntegerOption(o => o.setName("id").setDescription("War ID").setRequired(true).setMinValue(1)))
  .addSubcommand(s => s.setName("decline").setDescription("Decline a pending war")
    .addIntegerOption(o => o.setName("id").setDescription("War ID").setRequired(true).setMinValue(1)))
  .addSubcommand(s => s.setName("report").setDescription("Report the winning clan after an accepted war")
    .addIntegerOption(o => o.setName("id").setDescription("War ID").setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName("winner_tag").setDescription("Winner's clan tag").setRequired(true)))
  .addSubcommand(s => s.setName("confirm").setDescription("Confirm the reported winner for your clan")
    .addIntegerOption(o => o.setName("id").setDescription("War ID").setRequired(true).setMinValue(1)))
  .addSubcommand(s => s.setName("list").setDescription("List recent clan wars"))
  .addSubcommand(s => s.setName("cancel").setDescription("Cancel a pending/accepted war (clan leader)")
    .addIntegerOption(o => o.setName("id").setDescription("War ID").setRequired(true).setMinValue(1)));

const leaderboard = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the clan points leaderboard")
  .addIntegerOption(o => o.setName("limit").setDescription("Number of clans to show (1-15)").setMinValue(1).setMaxValue(15));

const points = new SlashCommandBuilder()
  .setName("points")
  .setDescription("View clan points")
  .addStringOption(o => o.setName("tag").setDescription("Clan tag (optional)").setRequired(false));

const admin = new SlashCommandBuilder()
  .setName("clanadmin")
  .setDescription("Admin tools for PEAK clan management")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s => s.setName("addpoints").setDescription("Add or remove clan points")
    .addStringOption(o => o.setName("tag").setDescription("Clan tag").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Points to add (negative removes points)").setRequired(true).setMinValue(-100000).setMaxValue(100000))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setMaxLength(200)))
  .addSubcommand(s => s.setName("delete").setDescription("Delete a clan and its data")
    .addStringOption(o => o.setName("tag").setDescription("Clan tag").setRequired(true)));

module.exports = [clan, war, leaderboard, points, admin].map(c => c.toJSON());
