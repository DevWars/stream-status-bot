'use strict';

import Discord from './discord.js';
import Reddit from './reddit.js';
import Twitch from './twitch.js';
import TwitchEventSub from './twitcheventsub.js';
import {StreamStatusBotError} from './util.js';

const discord = new Discord();
const reddit = new Reddit();
const twitch = new Twitch();
const twitcheventsub = new TwitchEventSub(twitch);

// Lifecycle management
let shutdownStarted = false;

const shutdownHandler = async (error) => {
	if (typeof error !== 'string') {
		if (error instanceof StreamStatusBotError) {
			console.error(`ERROR: ${error.message}`);
			if (error.exception) {
				console.error(error.exception);
			}
		} else {
			console.error(`UNEXPECTED ERROR: ${error.name}: ${error.message}`);
			if (error.stack) {
				console.error(error.stack);
			}
		}
	}

	if (shutdownStarted === false) {
		shutdownStarted = true;

		await twitcheventsub.destroy()
		await twitch.destroy();
		await reddit.destroy();
		await discord.destroy();

		process.exit(0);
	}
}

for (const sig of ['SIGINT', 'SIGTERM', 'uncaughtException']) process.on(sig, shutdownHandler);

const init = async () => {
	// Initialize our service classes
	await discord.init();
	await reddit.init();
	await twitch.init();

	// Update subreddit headers
	for (const twitchUser of Object.values(twitch.userInfo)) {
		reddit.updateHeaders(twitchUser, twitch.streamInfo[twitchUser.login].online);
	}

	// Initialize Twitch event handling
	twitcheventsub.onStreamOnline = (twitchUser, twitchStream) => {
		reddit.updateHeaders(twitchUser, true);
		discord.post(twitchUser, twitchStream);
		reddit.post(twitchUser, twitchStream);
	};

	twitcheventsub.onStreamOffline = (twitchUser) => {
		reddit.updateHeaders(twitchUser, false);
	};

	await twitcheventsub.init();
};

init();
