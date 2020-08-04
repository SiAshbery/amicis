require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const { App } = require("@slack/bolt");
const cron = require("node-cron");

const express = require("express");
const path = require("path");
const serveStatic = require("serve-static");

const expressApp = express();
const router = express.Router();

expressApp.get("/finish_auth", (req, res) => {
  console.log(req);
  res.send("All good");
});

const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const web = new WebClient(process.env.SLACK_TOKEN);

const currentTime = new Date().toTimeString();
// Change this to a configurable var
const assignedChannel = "make-new-friends";
const assignedEmoji = "raised_hands";

let currentPost;
let conversationsStore = {};
let assignedChannelId;

const signupTime = "0 0 10 * * 5 *";
const reminderTime = "0 0 9 * * 1 *";
const pairingTime = "0 0 11 * * 1 *";

const reminderText =
  "*Reminder:*\n Chat in what ever way you like and feel comfortable with, Send messages over slack, do a voice or video call\nAs time goes on repeat pairings are bound to happen, This is a feature not a bug! A repeat pairing is a chance to deepen a connection and learn more about each other :smile:\nIf you missed out on this weeks pairings it’s all good, just shout out in the channel and see if anyone fancies chatting.\nPlease also do shout out if you need any help with anything.\nHave a great week!";

const shuffle = (array) => {
  let currentIndex = array.length,
    temporaryValue,
    randomIndex;

  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
};

const pairUp = (users) => {
  const userCount = users.length;
  const shuffledUsers = shuffle(users);

  // For testing
  // const userCount = 13;
  // const shuffledUsers = [
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  //   "U0168TJQP8R",
  // ];

  const pairings = [];
  let i;
  for (i = 0; i < Math.floor(userCount / 2); i++) {
    // Grab each pair of users sequentially
    pairings.push([shuffledUsers[i * 2], shuffledUsers[i * 2 + 1]]);
  }
  if (userCount % 2 > 0) {
    // If the user count is odd that will leave one unassigned user at the end
    // So we manually grab them here.
    pairings[pairings.length - 1].push(shuffledUsers[userCount - 1]);
  }

  return pairings;
};

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
  // I can't find a way to capture a post's timestamp (used within slack as a UID)
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

const createPairings = async (signups) => {
  // Filters for only the people who hit the assignedEmoji.
  const users = pairUp(
    signups.filter((signup) => signup.name === assignedEmoji)[0].users
  );

  return users;
};

const formatPairings = (pairs) => {
  // Parse all users into the <@userid> format that is used by Slack for mentions.
  // Join each of the pairs with a &
  // Join each pairing with a new line.
  // Should read something like:
  // @user1 & @user2
  // @user3 & @user4
  // @user5 & @user6 & @user7
  return pairs
    .map((pair) => pair.map((user) => `<@${user}>`))
    .map((pair) => pair.join(" & "))
    .join("\n");
};

scheduleSignupMessage = (message, time) => {
  // Schedule the signup message
  cron.schedule(time, async () => {
    try {
      await web.chat.postMessage({
        channel: `#${assignedChannel}`,
        text: message,
      });
    } catch (error) {
      console.log(error);
    }
    // Store the posted message's timestamp for furture reference.
    await setCurrentMessage();
    // Add the signup emoji to the message as a pilot for others
    if (currentPost) {
      try {
        await web.reactions.add({
          token: process.env.SLACK_TOKEN,
          channel: assignedChannelId,
          name: assignedEmoji,
          timestamp: currentPost,
        });
      } catch (error) {
        console.log(error);
      }
    }
  });
};

scheduleReminderMessage = (message, time) => {
  // Schedule the signup message
  cron.schedule(time, async () => {
    try {
      await web.chat.postMessage({
        channel: `#${assignedChannel}`,
        text: message,
      });
    } catch (error) {
      console.log(error);
    }
  });
};

schedulePairingMessage = (message, time) => {
  cron.schedule(time, async () => {
    let signups;
    // Remove the bots reaction from the list as they should not be included
    // In the pairings (I did try to just filter them but this is less of a pain)
    // Checks for currentPost to prevent edge case where the pairings message comes
    // before the signup message
    if (currentPost) {
      try {
        await web.reactions.remove({
          token: process.env.SLACK_TOKEN,
          channel: assignedChannelId,
          name: assignedEmoji,
          timestamp: currentPost,
        });
      } catch (error) {
        console.log(error);
      }
      // Get the reactions of everyone who clicked the :raised_hands: emoji
      try {
        signups = await web.reactions.get({
          token: process.env.SLACK_TOKEN,
          channel: assignedChannelId,
          timestamp: currentPost,
        });
      } catch (error) {
        console.log(error);
      }
    }
    // Skip if nobody signed up (or if only 1 person did)
    if (signups && signups > 1) {
      // Create the pairings from the signups and then parse them into a string
      const pairings = await createPairings(signups.message.reactions);
      const formattedPairings = formatPairings(pairings);
      // Post the signups to the channel
      try {
        await web.chat.postMessage({
          channel: `#${assignedChannel}`,
          text: `${message}\n\n${formattedPairings}\n\n${reminderText}`,
        });
      } catch (error) {
        console.log(error);
      }
    } else {
      console.log("No signups this week :(");
    }
  });
};

// This is just for testing cron jobs
const fillRange = (start, end) => {
  return Array(end - start + 1)
    .fill()
    .map((item, index) => start + index);
};

const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

(async () => {
  // The app crashes if anyone tries to make a request to the hosted URL.
  // This just prevents it from doing so by supply 404 rather than 503 to any requests.
  expressApp.use(serveStatic(path.join(__dirname, "dist")));

  expressApp.listen(port);
  console.log("server started " + port);

  await fetchAssignedChannelID();
  console.log("Aaaaaaaaand we're live");

  scheduleSignupMessage(
    `It's that time again <!channel>, If you want to take part in the next set of pairings, please hit the :${assignedEmoji}: button!`,
    signupTime
  );

  scheduleReminderMessage(
    `Last chance to signup for this week's pairings <!channel>. Hit the :${assignedEmoji}: button on my above post to take part!`,
    reminderTime
  );

  schedulePairingMessage(`Here are this weeks pairings:`, pairingTime);

  // for testing purposes only:
  // scheduleSignupMessage(
  //   `It's that time again <!channel>, If you want to take part in the next set of pairings, please hit the :${assignedEmoji}: button!`,
  //   `${fillRange(0, 59)
  //     .filter((number) => !(number % 2))
  //     .join(",")} * * * *`
  // );

  // scheduleReminderMessage(
  //   `Last chance to signup for this week's pairings <!channel>. Hit the :${assignedEmoji}: button on my above post to take part!`,
  //   `${fillRange(0, 59)
  //     .filter((number) => number % 2)
  //     .join(",")} * * * *`
  // );

  // schedulePairingMessage(
  //   `Here are this weeks pairings:`,
  //   `${fillRange(0, 59)
  //     .filter((number) => number % 2)
  //     .join(",")} * * * *`
  // );
})();
