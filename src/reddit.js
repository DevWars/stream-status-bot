'use strict';

import fetch from 'node-fetch';
import Snoowrap from 'snoowrap';

import {processJsonResponse, StreamStatusBotError} from './util.js';

import config from '../config.json' assert {'type': 'json'};
import packageJson from '../package.json' assert {'type': 'json'};

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default class Reddit {
	// Lifecycle management
	constructor() {
		this.snoowrap = null;
	}

	init() {
		// Set up a new snoowrap instance
		this.snoowrap = new Snoowrap({
			userAgent: `${packageJson.name}/${packageJson.version} by ${packageJson.author.name}`,
			username: config.reddit.username,
			password: config.reddit.password,
			clientId: config.reddit.clientId,
			clientSecret: config.reddit.clientSecret
		});
	}

	destroy() {
		this.snoowrap = null;
	}

	// Handle header editing
	updateHeaders(twitchUser, isStreamOnline) {
		const twitchLogin = twitchUser.login;

		if (config.map[twitchLogin].redditHeader) {
			// Loop through each subreddit in the redditHeader section
			for (const subredditName of config.map[twitchLogin].redditHeader) {
				const subreddit = this.snoowrap.getSubreddit(subredditName);

				// Get the DevWars game info and subreddit settings
				Promise.all([fetch(`https://api.devwars.tv/games?status=scheduled&first=100`), subreddit.getSettings()]).then(([gamesReq, subredditSettings]) => {
					processJsonResponse(gamesReq).then((games) => {
						// Parse the subreddit sidebar to find our tags
						let sidebar = subredditSettings.description.split(`[](#${subredditName.toLowerCase()})`);
						if (sidebar.length !== 3) throw new StreamStatusBotError(`A sidebar tag count mismatch detected for /r/${subredditName}`);

						// Replace the content between the tags based on the stream status
						if (isStreamOnline) {
							console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now live`);
							sidebar[1] = `[● DEVWARS LIVE](https://www.twitch.tv/${twitchUser.login})`;
						} else {
							console.info(`Changing the header of /r/${subredditName} - ${twitchUser.display_name} is now offline`);
							sidebar[1] = '**Next DevWars:**[](#linebreak) ';

							// If the stream is not online, try to find the next game
							let game = null;

							if (Array.isArray(games.data) && games.data.length > 0) {
								games.data.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
								game = games.data[0];
							}

							if (game !== null) {
								// If we found one, prepare a date string
								let d = new Date(game.startTime);
								sidebar[1] += `*${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()} - ${d.getUTCHours()}:${d.getUTCMinutes() < 10 ? '0' : ''}${d.getUTCMinutes()} UTC*`;
							} else {
								// If there is no game, use a placeholder text
								sidebar[1] += '*No upcoming games scheduled*';
							}
						}

						// Set the subreddit sidebar to the new value
						if (!config.debug) {
							subreddit.editSettings({'description': sidebar.join(`[](#${subredditName.toLowerCase()})`)}).then().catch((err) => {
								throw new StreamStatusBotError(`Unable to set settings of /r/${subredditName}`, err);
							});
						} else {
							console.debug(`Sidebar of /r/${subredditName} would be set to:`);
							console.debug(sidebar.join(`[](#${subredditName.toLowerCase()})`));
						}
					}).catch((err) => {
						throw new StreamStatusBotError('Unable to get DevWars game info', err);
					});
				}).catch((err) => {
					throw new StreamStatusBotError(`Unable to get DevWars game info or /r/${subredditName} settings`, err);
				});
			}
		}
	}

	// Handle posting
	post(twitchUser, twitchStream) {
		const twitchLogin = twitchUser.login;

		if (config.map[twitchLogin].redditPost) {
			// Loop through each subreddit in the redditPost section
			for (const subredditConf of config.map[twitchLogin].redditPost) {
				// Prepare our title
				const subredditName = (typeof subredditConf === 'string' ? subredditConf : subredditConf.subreddit);
				let title = '';

				if (typeof subredditConf !== 'string' && subredditConf.title) {
					// If the config is not just a subreddit name string, use the provided title and replace date placeholders
					const streamDate = twitchStream.started_at;
					title = subredditConf.title
						.replace('{year}', streamDate.getUTCFullYear())
						.replace('{month}', `${streamDate.getUTCMonth() < 9 ? '0' : ''}${streamDate.getUTCMonth() + 1}`)
						.replace('{day}', `${streamDate.getUTCDate() < 10 ? '0' : ''}${streamDate.getUTCDate()}`);
				} else {
					// If it is, just use the stream title
					title = twitchStream.title;
				}

				// Post the link
				console.info(`Posting to /r/${subredditName} - ${twitchUser.display_name} is now live`);

				this.snoowrap.submitLink({
					'subredditName': subredditName,
					'title': title,
					'url': `https://www.twitch.tv/${twitchUser.login}`,
					'resubmit': true
				}).then().catch((err) => {
					throw new StreamStatusBotError(`Unable to post to /r/${subredditName}`, err);
				});
			}
		}
	}
}
