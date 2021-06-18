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

const requestTwitchToken = (retry = true) => {
	return new Promise((resolve, reject) => {
		const qs = Object.entries({
			'client_id': conf.twitch.clientId,
			'client_secret': conf.twitch.secret,
			'grant_type': 'client_credentials'
		}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

		fetch(`https://id.twitch.tv/oauth2/token?${qs}`, {'method': 'POST'}).then(processResponse).then((res) => {
			console.info('Twitch token acquired');
			twitchAuth.token = res.access_token;
			twitchAuth.lastValidation = Date.now();
			resolve(twitchAuth.token);
		}).catch((err) => {
			if(retry) {
				console.error('Unable to acquire a Twitch token, trying again in 10 seconds:', err);
				setTimeout(() => {
					resolve(requestTwitchToken());
				}, 10000)
			} else {
				reject(err);
			}
		});
	});
};

const getTwitchToken = () => {
	return new Promise((resolve, reject) => {
		const currentTimestamp = Date.now();
		if(twitchAuth.token !== null) {
			if(twitchAuth.lastValidation + 60 * 60 * 1000 < currentTimestamp) {
				fetch(`https://id.twitch.tv/oauth2/validate`, {'headers': {'Authorization': `OAuth ${twitchAuth.token}`}}).then((res) => {
					console.info('Twitch token validated');
					twitchAuth.lastValidation = currentTimestamp;
					resolve(twitchAuth.token);
				}).catch((err) => {
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

const getTwitchUsersInfo = (twitchUserIds, twitchToken) => {
	return fetch(`https://api.twitch.tv/helix/users?id=${twitchUserIds.join('&id=')}`, {
		'headers': {
			'Authorization': `Bearer ${twitchToken}`,
			'Client-ID': conf.twitch.clientId
		}
	}).then(processResponse).then((res) => {
		if(res.data.length === twitchUserIds.length) {
			let twitchUsersObj = {};
			for(const twitchUser of res.data) {
				twitchUsersObj[twitchUser.id] = {
					'display_name': twitchUser.display_name,
					'login': twitchUser.login,
					'profile_image_url': twitchUser.profile_image_url
				};
			}
			return twitchUsersObj;
		} else throw new Error(`Some or all of users ${twitchUserIds.join(', ')} not found`);
	});
};

const getTwitchStreamsStatus = (twitchUserIds, twitchToken) => {
	let twitchStreamsObj = twitchUserIds.reduce((obj, id) => {
		obj[id] = false;
		return obj;
	}, {});

	return fetch(`https://api.twitch.tv/helix/streams?user_id=${twitchUserIds.join('&user_id=')}`, {
		'headers': {
			'Authorization': `Bearer ${twitchToken}`,
			'Client-ID': conf.twitch.clientId
		}
	}).then(processResponse).then((res) => {
		for(const stream of res.data) twitchStreamsObj[stream.user_id] = true;
		return twitchStreamsObj;
	});
};

const updateSubredditHeaders = (twitchId, isStreamOnline) => {
	if(conf.map[twitchId].redditHeader) {
		const twitchUser = twitchUserDetails[twitchId];
		for(const subredditName of conf.map[twitchId].redditHeader) {
			const subreddit = r.getSubreddit(subredditName);

			Promise.all([fetch(`https://api.devwars.tv/games?status=scheduled&first=100`), subreddit.getSettings()]).then(([gamesReq, subredditSettings]) => {
				processResponse(gamesReq).then((games) => {
					let sidebar = subredditSettings.description.split(`[](#${subredditName.toLowerCase()})`);
					if(sidebar.length !== 3) throw new Error('Sidebar tag count mismatch');

					if(isStreamOnline) {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now live`);
						sidebar[1] = `[● DEVWARS LIVE](https://www.twitch.tv/${twitchUser.login})`;
					} else {
						console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now offline`);
						sidebar[1] = '**Next DevWars:**[](#linebreak) ';

						let game = null;
						let d;

						if(Array.isArray(games.data)) {
							games.data.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
							game = games.data[0];
						}

						if(game !== null) {
							sidebar[1] += `*${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()} - ${d.getUTCHours()}:${d.getUTCMinutes() < 10 ? '0' : ''}${d.getUTCMinutes()} UTC*`;
						} else {
							sidebar[1] += '*No upcoming games scheduled*';
						}
					}

					subreddit.editSettings({'description': sidebar.join(`[](#${subredditName.toLowerCase()})`)}).then().catch((err) => {
						console.error(`Unable to set settings of /r/${subredditName}:`, err);
					});
				}).catch((err) => {
					console.error(`Unable to get game info:`, err);
				});
			}).catch((err) => {
				console.error(`Unable to get game info or /r/${subredditName} settings:`, err);
			});
		}
	}
};

const postInDiscordChannels = (twitchId, twitchStream) => {
	if(conf.map[twitchId].discord) {
		const twitchUser = twitchUserDetails[twitchId];
		for(const channelConf of conf.map[twitchId].discord) {
			const channel = d.channels.cache.get(typeof channelConf === 'string' ? channelConf : channelConf.channel);
			if(!channel) continue;

			console.info(`Posting an embed to ${channel.id} - ${twitchUser.display_name} is now live`);

			const embed = new djs.MessageEmbed()
				.attachFiles(['./twitch.png'])
				.setAuthor(`${twitchUser.display_name} is now streaming!`, twitchUser.profile_image_url)
				.setTitle(twitchStream.title)
				.setURL(`https://www.twitch.tv/${twitchUser.login}`)
				.setFooter('Twitch', 'attachment://twitch.png')
				.setTimestamp(twitchStream.started_at)
				.setColor(6570404);

			channel.send((typeof channelConf !== 'string' && channelConf.message ? channelConf.message : ''), embed).then().catch((err) => {
				console.error(`Unable to send a message to a Discord channel with ID ${channel.id}:`, err);
			});
		}
	}
};

const postSubredditPosts = (twitchId, twitchStream) => {
	if(conf.map[twitchId].redditPost) {
		const twitchUser = twitchUserDetails[twitchId];
		for(const subredditConf of conf.map[twitchId].redditPost) {
			const subredditName = (typeof subredditConf === 'string' ? subredditConf : subredditConf.subreddit);
			let title = '';

			if(typeof subredditConf !== 'string' && subredditConf.title) {
				const streamDate = twitchStream.started_at;
				title = subredditConf.title
					.replace('{year}', streamDate.getUTCFullYear())
					.replace('{month}', `${streamDate.getUTCMonth() < 9 ? '0' : ''}${streamDate.getUTCMonth() + 1}`)
					.replace('{day}', `${streamDate.getUTCDate() < 10 ? '0' : ''}${streamDate.getUTCDate()}`);
			} else {
				title = twitchStream.title;
			}

			console.info(`Posting to /r/${subredditName} - ${twitchUser.display_name} is now live`);

			r.getSubreddit(subredditName).submitLink({'title': title, 'url': `https://www.twitch.tv/${twitchUser.login}`, 'resubmit': true}).then().catch((err) => {
				console.error(`Unable to post to /r/${subredditName}:`, err);
			});
		}
	}
};

const exit = () => {
	t.unsubscribe('*');
	d.destroy();
	process.exit(0);
};

// Data

let twitchAuth = {
	token: null,
	lastValidation: null
};

let twitchUserDetails = {};
let twitchStreamStatuses = {};

let processedStreams = {};
let latestStreams = {};

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
	exit();
});

t.on('webhook-error', (err) => {
	console.error('A twitch-webhook webhook error occurred:', err);
	exit();
});

t.on('denied', (err) => {
	console.error('A twitch-webhook subscription denied error occurred:', err);
	exit();
});

t.on('streams', ({options, event}) => {
	// We ignore notification IDs, because they're not very reliable (sometimes, we get the same notif. ID for different streams).
	// Notifying only once per stream and checking that the new stream started later than those we received before should be enough.
	const isStreamOnline = (event.data.length > 0);
	const receivedEvents = (isStreamOnline ? event.data.sort((a, b) => a.started_at - b.started_at) : []);

	updateSubredditHeaders(options.user_id, isStreamOnline);

	for(const receivedEvent of receivedEvents) {
		if(
			!receivedEvent.id ||
			receivedEvent.type !== 'live' ||
			processedStreams[receivedEvent.id] ||
			(latestStreams[options.user_id] && receivedEvent.started_at < latestStreams[options.user_id])
		) continue;

		processedStreams[receivedEvent.id] = true;
		latestStreams[options.user_id] = receivedEvent.started_at;

		postInDiscordChannels(options.user_id, receivedEvent);
		postSubredditPosts(options.user_id, receivedEvent);
	}
});

t.on('unsubscribe', (obj) => {
	t.subscribe(obj['hub.topic']).then().catch((err) => {
		console.error('Unable to resubscribe to a Twitch webhook topic:', err);
		exit();
	});
});

t.on('listening', () => {
	for(const sig of ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM']) process.on(sig, exit);

	for(const twitchId of Object.keys(conf.map)) {
		t.subscribe('streams', {'user_id': twitchId}).then(() => {
			updateSubredditHeaders(twitchId, twitchStreamStatuses[twitchId]);
		}).catch((err) => {
			console.error('Unable to subscribe to a Twitch webhook topic:', err);
			exit();
		});
	}

	console.info(`Listening for online status changes of ${Object.keys(conf.map).length} Twitch channels`);
});

// Discord

const d = new djs.Client();

d.on('error', (err) => {
	console.error('A discord.js WebSocket connection error occurred:', err);
});

d.on('ready', () => {
	console.info(`Logged in as ${d.user.tag}`);
	t.listen().then().catch((err) => {
		console.error('Unable to start listening to Twitch webhooks:', err);
		exit();
	});
});

// Everything is set up, let's start

requestTwitchToken(false).then((token) => {
	Promise.all([getTwitchUsersInfo(Object.keys(conf.map), token), getTwitchStreamsStatus(Object.keys(conf.map), token)]).then(([twitchUsers, twitchStreams]) => {
		twitchUserDetails = twitchUsers;
		twitchStreamStatuses = twitchStreams;

		d.login(conf.discordToken).then().catch((err) => {
			console.error('Unable to login to Discord:', err);
			exit();
		});
	}).catch((err) => {
		console.error('Unable to get Twitch info:', err);
		exit();
	});
}).catch((err) => {
	console.error(`Unable to acquire a Twitch token:`, err);
	exit();
});
