require("dotenv").config();
const { WebClient } = require("@slack/web-api");

const web = new WebClient(process.env.SLACK_TOKEN);

const currentTime = new Date().toTimeString();

(async () => {
  try {
    await web.chat.scheduleMessage({
      channel: "#general",
      text: `The current time is ${currentTime}`,
      post_at: 1595247000,
    });
  } catch (error) {
    console.log(error);
  }

  console.log("Message posted!");
})();
