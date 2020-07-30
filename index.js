require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const { createEventAdapter } = require("@slack/events-api");
const { App } = require("@slack/bolt");
const cron = require("node-cron");

const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const web = new WebClient(process.env.SLACK_TOKEN);
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

const currentTime = new Date().toTimeString();
// Change this to a configurable var
const assignedChannel = "general";
const assignedEmoji = "raised_hands";

let currentPost;
let conversationsStore = {};
let assignedChannelId;

// Why is this function needed when we have the channel name?
// The slack API is split amonst a number of different services.
// Some can take the channel name as an argument (e.g. the web cleint's postMessage function),
// Whereas other tools (e.g. slack/bolt) require an ID.
// Since the channel name is more human readable (and can be more easily configured)
// We derive the ID from the channel name by requesting that info from the slack client
const fetchAssignedChannelID = async () => {
  try {
    const result = await app.client.conversations.list({
      token: process.env.SLACK_TOKEN,
    });
    assignedChannelId = result.channels.filter(
      (channel) => channel.name === assignedChannel
    )[0].id;
  } catch (error) {
    console.log(error);
  }
};

const setCurrentMessage = async () => {
  // I can't find a way to capture a post'ßs timestamp (used within slack as a UID)
  // When making a post so I'm having to retrieve it manually.
  // This script retrieves all the posts in the assigned channel.
  // It then filters out any posts not coming from a bot.
  // Then it selects the most up to date (i.e largest) ts which should correspond
  // To our bot's recent signup post
  try {
    const result = await app.client.conversations.history({
      token: process.env.SLACK_TOKEN,
      channel: assignedChannelId,
    });
    currentPost = result.messages.filter(
      (message) => message.bot_profile && message.bot_profile.name === "amicis"
    )[0].ts;
  } catch (error) {
    console.log(error);
  }
};

const port = process.env.PORT || 3000;

scheduleSignupMessage = (message, time) => {
  // Schedule the signup message for the current set time
  // Post the message to associated channel
  // Capture the ts of said message
  // Add a ${assignedEmoji} emoji to said message
  cron.schedule(time, async () => {
    try {
      await web.chat.postMessage({
        channel: "#general",
        text: message,
      });
      await setCurrentMessage();
      web.reactions.add({
        token: process.env.SLACK_TOKEN,
        channel: assignedChannelId,
        name: assignedEmoji,
        timestamp: currentPost,
      });
    } catch (error) {
      console.log(error);
    }
  });
};

schedulePairingMessage = (message, time) => {
  // Schedule the signup message for the current set time
  // Post the message to associated channel
  // Capture the ts of said message
  // Add a ${assignedEmoji} emoji to said message
  cron.schedule(time, async () => {
    try {
      await web.chat.postMessage({
        channel: "#general",
        text: message,
      });
      await setCurrentMessage();
      web.reactions.add({
        token: process.env.SLACK_TOKEN,
        channel: assignedChannelId,
        name: assignedEmoji,
        timestamp: currentPost,
      });
    } catch (error) {
      console.log(error);
    }
  });
};

(async () => {
  const server = await slackEvents.start(port);

  console.log(`Listening for events on ${port}`);
  await fetchAssignedChannelID();

  scheduleSignupMessage(
    `It's that time again, please hit the :${assignedEmoji}: button!`,
    "0-59 * * * *"
  );
})();
