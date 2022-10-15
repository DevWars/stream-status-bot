'use strict';

import DiscordJS from 'discord.js';

import {StreamStatusBotError} from './util.js';

import config from '../config.json' assert {'type': 'json'};

const DISCORD_READY_TIMEOUT = 10;

export default class Discord {
	// Lifecycle management
	constructor() {
		// Set up a new snoowrap instance
		this.discord = new DiscordJS.Client({'intents': [DiscordJS.GatewayIntentBits.Guilds]});
	}

	init() {
		return new Promise((resolve, reject) => {
			// Set up a timeout in case we wait for the ready event too long
			const timeoutCheck = setTimeout(() => {
				throw new StreamStatusBotError('A timeout occured while waiting for discord.js to fire the ready event');
			}, DISCORD_READY_TIMEOUT * 1000);

			// Set up discord.js events
			this.discord.once('ready', () => {
				clearTimeout(timeoutCheck);
				console.info(`Logged in to Discord as ${this.discord.user?.tag || ''}`);
				resolve();
			});

			this.discord.on('error', (err) => {
				throw new StreamStatusBotError('A discord.js error occurred', err);
			});

			// Login to Discord with our token
			this.discord.login(config.discordToken);
		});
	}

	destroy() {
		// Get rid of our discord.js instance
		this.discord.destroy();
		return null;
	}

	// Handle posting
	post(twitchUser, twitchStream) {
		const twitchLogin = twitchUser.login;

		if (config.map[twitchLogin].discord) {
			// Loop through each Discord channel in the discord section
			for (const channelConf of config.map[twitchLogin].discord) {
				// Get the channel we want to post in
				const channelId = typeof channelConf === 'string' ? channelConf : channelConf.channel;
				const channel = this.discord.channels.cache.get(channelId);

				if (!channel) {
					throw new StreamStatusBotError(`Unable to find Discord channel ${channelId}`);
				}

				// Prepare the Discord embed
				const footerIcon = new DiscordJS.AttachmentBuilder('./twitch.png');

				const embed = new DiscordJS.EmbedBuilder()
					.setAuthor({
						'name': `${twitchUser.display_name} is now streaming!`,
						'iconURL': twitchUser.profile_image_url,
					})
					.setTitle(twitchStream.title)
					.setURL(`https://www.twitch.tv/${twitchUser.login}`)
					.setFooter({
						'text': 'Twitch',
						'iconURL': 'attachment://twitch.png',
					})
					.setTimestamp(twitchStream.started_at)
					.setColor(6570404);

				// Post the embed with the provided message if the config is not just a channel ID, or without a message if it is
				console.info(`Posting to Discord channel ${channelId} - ${twitchUser.display_name} is now live`);

				if (!config.debug) {
					let message = {
						'embeds': [embed],
						'files': [footerIcon],
					};

					if (typeof channelConf !== 'string' && channelConf.message) {
						message.content = channelConf.message;
					}

					channel.send(message).then().catch((err) => {
						throw new StreamStatusBotError(`Unable to send a message to a Discord channel ${channelId}`, err);
					});
				} else {
					console.debug(`This message (with an embed) would be posted to Discord channel ${channelId}:`);
					console.debug(typeof channelConf !== 'string' && channelConf.message ? channelConf.message : '');
				}
			}
		}
	};
}
