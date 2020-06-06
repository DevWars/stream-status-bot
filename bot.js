const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fetch = require('node-fetch');
const snoowrap = require('snoowrap');
const djs = require('discord.js');

const conf = require('./config.json');
const p = require('./package.json');

const processResponse = (res) => {
	return new Promise((resolve, reject) => {
		if(!res.ok) reject(`${res.status}: ${res.statusText}`);
		else res.json().then(resolve).catch(reject);
	});
};

const requestTwitchToken = () => {
	return new Promise((resolve, reject) => {
		const qs = Object.entries({
			'client_id': conf.twitch.clientId,
			'client_secret': conf.twitch.secret,
			'grant_type': 'client_credentials'
		}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

		fetch(`https://id.twitch.tv/oauth2/token?${qs}`, {'method': 'POST'}).then(processResponse).then(res => {
			console.info('Twitch token acquired');
			twitchAuth.token = res.access_token;
			twitchAuth.lastValidation = Date.now();
			resolve(twitchAuth.token);
		}).catch(err => {
			console.error(`Unable to acquire a Twitch token, trying again in 10 seconds:`, err);
			setTimeout(() => {
				resolve(requestTwitchToken());
			}, 10000)
		});
	});
};

const getTwitchToken = () => {
	return new Promise((resolve, reject) => {
		const currentTimestamp = Date.now();
		if(twitchAuth.token !== null) {
			if(twitchAuth.lastValidation + 60 * 60 * 1000 < currentTimestamp) {
				fetch(`https://id.twitch.tv/oauth2/validate`, {'headers': {'Authorization': `OAuth ${twitchAuth.token}`}}).then(res => {
					console.info('Twitch token validated');
					twitchAuth.lastValidation = currentTimestamp;
					resolve(twitchAuth.token);
				}).catch(err => {
					console.info('Twitch token not valid, getting a new one');
					resolve(requestTwitchToken());
				});
			} else {
				resolve(twitchAuth.token);
			}
		} else {
			resolve(requestTwitchToken());
		}
	});
}

const postInDiscordChannels = (twitchUser, twitchStream) => {
	if(conf.map[twitchUser.id].discord) {
		for(const channelConf of conf.map[twitchUser.id].discord) {
			const channel = d.channels.cache.get(typeof channelConf === 'string' ? channelConf : channelConf.channel);
			if(!channel) continue;

			console.info(`Posting an embed to ${channel.id} - ${twitchUser.display_name} is now live`);

			const embed = new djs.MessageEmbed()
				.attachFile('./twitch.png')
				.setAuthor(`${twitchUser.display_name} is now streaming!`, twitchUser.profile_image_url)
				.setTitle(twitchStream.title)
				.setURL(`https://www.twitch.tv/${twitchUser.login}`)
				// .setImage(twitchStream.thumbnail_url.replace('{width}', 480).replace('{height}', 270))
				.setFooter('Twitch', 'attachment://twitch.png')
				.setTimestamp(new Date(twitchStream.started_at))
				.setColor(6570404);

			channel.send((typeof channelConf !== 'string' && channelConf.message ? channelConf.message : ''), embed).then().catch((err) => {
				console.error(`Unable to send a message to a Discord channel with ID ${channel.id}:`, err);
			});
		}
	}
};

const updateSubredditHeaders = (twitchUser, isStreamOnline) => {
	if(conf.map[twitchUser.id].redditHeader) {
		for(const subredditName of conf.map[twitchUser.id].redditHeader) {
			const subreddit = r.getSubreddit(subredditName);

			Promise.all([fetch(`https://api.devwars.tv/game/upcoming`), subreddit.getSettings()]).then(([gamesReq, subredditSettings]) => {
				processResponse(gamesReq).then((games) => {
					let sidebar = subredditSettings.description.split(`[](#${subredditName.toLowerCase()})`);
					if(sidebar.length != 3) throw new Error('Sidebar tag count mismatch');

					if(isStreamOnline) {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now live`);
						sidebar[1] = `[● DEVWARS LIVE](https://www.twitch.tv/${twitchUser.login})`;
					} else {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now offline`);
						sidebar[1] = '**Next DevWars:**[](#linebreak) ';
						if(games.length > 0 && games[0].timestamp) {
							const d = new Date(games[0].timestamp);
							sidebar[1] += `*${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()} - ${(d.getUTCHours() % 12) < 10 ? '0' : ''}${d.getUTCHours() % 12}:${d.getUTCMinutes() < 10 ? '0' : ''}${d.getUTCMinutes()} ${d.getUTCHours() - 12 < 0 ? 'AM' : 'PM'} UTC*`;
						} else {
							sidebar[1] += '*No upcoming games scheduled*';
						}
					}

					subreddit.editSettings({'description': sidebar.join(`[](#${subredditName.toLowerCase()})`)}).then().catch(err => {
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

const postSubredditPosts = (twitchUser, twitchStream) => {
	if(conf.map[twitchUser.id].redditPost) {
		for(const subredditConf of conf.map[twitchUser.id].redditPost) {
			const subredditName = (typeof subredditConf === 'string' ? subredditConf : subredditConf.subreddit);
			let title = '';

			if(typeof subredditConf !== 'string' && subredditConf.title) {
				const streamDate = new Date(twitchStream.started_at);
				title = subredditConf.title
					.replace('{year}', streamDate.getUTCFullYear())
					.replace('{month}', `${streamDate.getUTCMonth() < 9 ? '0' : ''}${streamDate.getUTCMonth() + 1}`)
					.replace('{day}', `${streamDate.getUTCDate() < 10 ? '0' : ''}${streamDate.getUTCDate()}`);
			} else {
				title = twitchStream.title;
			}

			console.info(`Posting to /r/${subredditName} - ${twitchUser.display_name} is now live`);

			r.getSubreddit(subredditName).submitLink({'title': title, 'url': `https://www.twitch.tv/${twitchUser.login}`, 'resubmit': true}).then().catch(err => {
				console.error(`Unable to post to /r/${subredditName}:`, err);
			});
		}
	}
};

const exitFunc = () => {
	t.unsubscribe('*');
	d.destroy();
	process.exit(0);
};

// Data

let twitchAuth = {
	token: null,
	lastValidation: null
}

let processedNotifications = {};

// Reddit

const r = new snoowrap({
	userAgent: `${p.name}/${p.version} by ${conf.reddit.username}`,
	username: conf.reddit.username,
	password: conf.reddit.password,
	clientId: conf.reddit.clientId,
	clientSecret: conf.reddit.clientSecret
});

// Twitch webhooks

const t = new (require('twitch-webhook'))({
	'client_id': conf.twitch.clientId,
	'callback': conf.twitch.callback,
	'secret': conf.twitch.secret,
	'listen': {
		'port': conf.twitch.port,
		'autoStart': false
	},
	'tokenPromise': getTwitchToken
});

t.on('error', (err) => {
	console.error('A twitch-webhook error occurred:', err);
	exitFunc();
});

t.on('webhook-error', (err) => {
	console.error('A twitch-webhook webhook error occurred:', err);
	exitFunc();
});

t.on('denied', (err) => {
	console.error('A twitch-webhook subscription denied error occurred:', err);
	exitFunc();
});

t.on('streams', ({options, event}) => {
	if(event.data.length === 0 || !processedNotifications[event.data[0].id]) {
		// Get user details
		getTwitchToken().then(token => {
			return fetch(`https://api.twitch.tv/helix/users?id=${options.user_id}`, {
				'headers': {
					'Authorization': `Bearer ${token}`,
					'Client-ID': conf.twitch.clientId
				}
			});
		}).then(processResponse).then(twitchUser => {
			if(twitchUser.data.length > 0) {
				updateSubredditHeaders(twitchUser.data[0], (event.data.length > 0));
				if(event.data.length > 0) {
					processedNotifications[event.data[0].id] = true;
					postInDiscordChannels(twitchUser.data[0], event.data[0]);
					postSubredditPosts(twitchUser.data[0], event.data[0]);
				}
			} else {
				throw new Error('User not found');
			}
		}).catch(err => {
			console.error(`Unable to get details of a Twitch user with ID ${options.user_id}:`, err);
		});
	}
});

t.on('unsubscribe', (obj) => {
	t.subscribe(obj['hub.topic']).then(() => {}).catch((err) => {
		console.error('Unable to resubscribe to a Twitch webhook topic:', err);
		exitFunc();
	});
});

t.on('listening', () => {
	for (const sig of ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM']) process.on(sig, exitFunc);

	for (const twitchId of Object.keys(conf.map)) {
		t.subscribe('streams', {'user_id': twitchId}).then(() => {
			console.log('subscribed gud');
		}).catch((err) => {
			console.error('Unable to subscribe to a Twitch webhook topic:', err);
			console.error(err.response.options.headers);
			exitFunc();
		});
	}
});

// Discord

const d = new djs.Client();

d.on('error', (err) => {
	console.error('A discord.js WebSocket connection error occurred:', err);
});

d.on('ready', () => {
	console.info(`Logged in as ${d.user.tag}, listening for online status changes of ${Object.keys(conf.map).length} Twitch channels.`);
	t.listen().then(() => {}).catch((err) => {
		console.error('Unable to start listening to Twitch webhooks:', err);
		d.destroy();
	});
});

// Everything is set up, let's start by logging in to Discord

d.login(conf.discordToken).then(() => {}).catch((err) => {
	console.error('Unable to login to Discord:', err);
});
