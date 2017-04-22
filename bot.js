const snoowrap = require("snoowrap");
const request = require("request");

const c = require("./config");
const p = require("./package");
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const r = new snoowrap({
	userAgent: p.name + "/" + p.version + " by " + c.reddit.username,
	username: c.reddit.username,
	password: c.reddit.password,
	clientId: c.reddit.clientid,
	clientSecret: c.reddit.clientsecret
});

r.getSubreddit(c.reddit.subreddit).getSettings().then(settings => {
	var sidebar = settings.description.split("[](#" + c.reddit.subreddit + ")");

	if(sidebar.length != 3) return;

	request({
		url: "https://api.twitch.tv/kraken/streams/" + c.twitch.channel,
		json: true,
		headers: {
			"Accept": "application/vnd.twitchtv.v5+json",
			"Client-ID": c.twitch.clientid
		}
	}, (error, response, body) => {
		if(!error && response.statusCode == 200 && body.stream) {
			sidebar[1] = "[● DEVWARS LIVE](http://www.twitch.tv/DevWars)";
			r.getSubreddit("DevWars").editSettings({"description": sidebar.join("[](#" + c.reddit.subreddit + ")")});
		} else {
			request({
				url: "http://devwars.tv/v1/game/nearestgame",
				json: true
			}, (error, response, body) => {
				if(!error && response.statusCode == 200 && body.timestamp) {
					var d = new Date(body.timestamp);
					sidebar[1] = "**Next DevWars:**[](#linebreak) *" + days[d.getUTCDay()] + ", " + months[d.getUTCMonth()] + " " + d.getUTCDate() + " - " + d.getUTCHours() % 12 + ":" + d.getUTCMinutes() + " " + (d.getUTCHours() - 12 < 0 ? "AM" : "PM") + " UTC*";
				} else {
					sidebar[1] = "**Next DevWars:**[](#linebreak) *Unavailable*";
				}

				r.getSubreddit("DevWars").editSettings({"description": sidebar.join("[](#" + c.reddit.subreddit + ")")});
			});
		}
	});
});
