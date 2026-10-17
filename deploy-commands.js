require("dotenv").config();
const { REST, Routes } = require("discord.js");
const commands = require("./commands");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in Replit Secrets/.env");
  process.exit(1);
}
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    const route = GUILD_ID && !GUILD_ID.startsWith("put_")
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log(`Registered ${commands.length} slash commands ${GUILD_ID && !GUILD_ID.startsWith("put_") ? "for test server " + GUILD_ID : "globally"}.`);
  } catch (err) {
    console.error("Command registration failed:", err);
    process.exit(1);
  }
})();
