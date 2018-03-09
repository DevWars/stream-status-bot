const snoowrap = require("snoowrap");
const fetch = require("node-fetch");
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

let sidebar;

let processResponse = res => {
	return new Promise((resolve, reject) => {
		if(!res.ok) reject(response.statusText);
		else {
			res.json().then(resolve).catch(reject);
		}
	});
};

r.getSubreddit(c.reddit.subreddit).getSettings().then(res => {
	sidebar = res.description.split("[](#" + c.reddit.subreddit + ")");
	if(sidebar.length != 3) throw new Error("Sidebar tag mismatch");

	return Promise.all([
		fetch(`https://api.twitch.tv/kraken/streams/${c.twitch.channel}`, {
			headers: new fetch.Headers({
				"Accept": "application/vnd.twitchtv.v5+json",
				"Client-ID": c.twitch.clientid
			})
		}),
		fetch(`https://api.devwars.tv/game/upcoming`)
	]);
}).then((res) => Promise.all(res.map(processResponse))).then(([twitch, devwars]) => {
	if(twitch.stream) {
		sidebar[1] = "[● DEVWARS LIVE](https://www.twitch.tv/DevWars)";
	} else {
		sidebar[1] = "**Next DevWars:**[](#linebreak) ";
		if(devwars[0].timestamp) {
			let d = new Date(devwars[0].timestamp);
			sidebar[1] += "*" + days[d.getUTCDay()] + ", " + months[d.getUTCMonth()] + " " + d.getUTCDate() + " - " + ((d.getUTCHours() % 12) < 10 ? "0" : "") + (d.getUTCHours() % 12) + ":" + (d.getUTCMinutes() < 10 ? "0" : "") + d.getUTCMinutes() + " " + (d.getUTCHours() - 12 < 0 ? "AM" : "PM") + " UTC*";
		} else {
			sidebar[1] += "*Unavailable*";
		}
	}

	r.getSubreddit("DevWars").editSettings({"description": sidebar.join("[](#" + c.reddit.subreddit + ")")});
}).catch(console.error);
