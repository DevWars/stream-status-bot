const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fetch = require("node-fetch");
const snoowrap = require("snoowrap");
const djs = require('discord.js');

const conf = require('./config.json');

const p = require("./package");
const c = new djs.Client();
const t = new (require('twitch-webhook'))({
	"client_id": conf.twitch.clientId,
	"callback": conf.twitch.callback,
	"secret": conf.twitch.secret,
	"listen": {
		"port": conf.twitch.port
	}
});
const r = new snoowrap({
	userAgent: p.name + "/" + p.version + " by " + conf.reddit.username,
	username: conf.reddit.username,
	password: conf.reddit.password,
	clientId: conf.reddit.clientId,
	clientSecret: conf.reddit.clientSecret
});

let processResponse = res => {
	return new Promise((resolve, reject) => {
		if(!res.ok) reject(`${res.status}: ${res.statusText}`);
		else res.json().then(resolve).catch(reject);
	});
};

let postInDiscordChannels = (twitchUser, twitchStream) => {
	if(conf.map[twitchUser.id].discord) {
		for (let channelId of conf.map[twitchUser.id].discord) {
			let channel = c.channels.get(channelId);
			if(!channel) continue;

			console.info(`Posting an embed to ${channelId} - ${twitchUser.display_name} is now live);

			const embed = new djs.RichEmbed()
			.attachFile("./twitch.png")
			.setAuthor(`${twitchUser.display_name} is now streaming!`, twitchUser.profile_image_url)
			.setTitle(twitchStream.title)
			.setURL(`https://www.twitch.tv/${twitchUser.login}`)
			.setImage(twitchStream.thumbnail_url.replace("{width}", 480).replace("{height}", 270))
			.setFooter("Twitch", "attachment://twitch.png")
			.setTimestamp(new Date(twitchStream.started_at))
			.setColor(6570404);

			channel.send(embed).then().catch(err => {
				console.error(`Unable to send a message to a Discord channel with ID ${channelId}:`, err);
			});
		}
	}
};

let updateSubredditHeaders = (twitchUser, isStreamOnline) => {
	if(conf.map[twitchUser.id].reddit) {
		for (let subredditName of conf.map[twitchUser.id].reddit) {
			let subreddit = r.getSubreddit(subredditName);

			Promise.all([
				fetch(`https://api.devwars.tv/game/upcoming`),
				subreddit.getSettings()
			]).then(([gamesReq, subredditSettings]) => {
				processResponse(gamesReq).then(games => {
					let sidebar = subredditSettings.description.split("[](#" + subredditName.toLowerCase() + ")");
					if(sidebar.length != 3) throw new Error("Sidebar tag count mismatch");

					if(isStreamOnline) {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now live`);
						sidebar[1] = `[● DEVWARS LIVE](https://www.twitch.tv/${twitchUser.login})`;
					} else {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now offline`);
						sidebar[1] = "**Next DevWars:**[](#linebreak) ";
						if(games.length > 0 && games[0].timestamp) {
							let d = new Date(games[0].timestamp);
							sidebar[1] += "*" + days[d.getUTCDay()] + ", " + months[d.getUTCMonth()] + " " + d.getUTCDate() + " - " + ((d.getUTCHours() % 12) < 10 ? "0" : "") + (d.getUTCHours() % 12) + ":" + (d.getUTCMinutes() < 10 ? "0" : "") + d.getUTCMinutes() + " " + (d.getUTCHours() - 12 < 0 ? "AM" : "PM") + " UTC*";
						} else {
							sidebar[1] += "*No upcoming games scheduled*";
						}
					}

					subreddit.editSettings({"description": sidebar.join("[](#" + subredditName.toLowerCase() + ")")}).then().catch(err => {
						console.error(`Unable to set settings of /r/${subredditName}:`, err);
					});
				}).catch(err => {
					console.error(`Unable to get game info :`, err);
				});
			}).catch(err => {
				console.error(`Unable to get game info or /r/${subredditName} settings:`, err);
			});
		}
	}
};

c.on('ready', () => {
    console.info(`Logged in as ${c.user.tag}, listening for online status changes of ${Object.keys(conf.map).length} Twitch channels.`);

    t.on('streams', ({ options, event }) => {
		// Get user details
		fetch(`https://api.twitch.tv/helix/users?id=${options.user_id}`, { "headers": { "Client-ID": conf.twitch.clientId } }).then(processResponse).then(twitchUser => {
			if(twitchUser.data.length > 0) {
				updateSubredditHeaders(twitchUser.data[0], (event.data.length > 0));
				if(event.data.length > 0) postInDiscordChannels(twitchUser.data[0], event.data[0]);
			} else {
				throw new Error("User not found");
			}
		}).catch(err => {
			console.error(`Unable to get details of a Twitch user with ID ${options.user_id}:`, err);
		});
	});
});

// Twitch webhook lifecycle
for (let twitchId of Object.keys(conf.map)) t.subscribe('streams', { user_id: twitchId });
t.on('unsubscibe', obj => t.subscribe(obj['hub.topic']));

process.on('SIGINT', () => {
    t.unsubscribe('*');
    process.exit(0);
});

// Everything is set up, ready to start
c.login(conf.discordToken);
