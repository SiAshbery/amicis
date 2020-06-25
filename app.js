const { WebClient } = require("@slack/web-api");
const { App } = require("@slack/bolt");
require("dotenv").config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SIGNING_SECRET,
});

// // Create a new instance of the WebClient class with the token read from your environment variable
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

let conversationHistory;

async function fetchHistory(id) {
  try {
    // Call the conversations.history method using the built-in WebClient
    const result = await app.client.conversations.history({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN,
      channel: id,
    });

    conversationHistory = result.messages;

    // Print results
    console.log(conversationHistory);
  } catch (error) {
    console.error(error);
  }
}

async function postSignup() {
  try {
    // Use the `chat.postMessage` method to send a message from this app
    await web.chat.postMessage({
      channel: "#general",
      text: "this is a test",
    });
  } catch (error) {
    console.log(error);
  }

  console.log("Message posted!");
}

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
  postSignup();

  // After the app starts, find conversation with a specified ID
  fetchHistory("C016C1X586M");

  app.message("ping", async ({ message, say }) => {
    await say(`_pong_`);
  });
})();
