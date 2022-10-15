'use strict';

import fetch from 'node-fetch';

import {processResponse, processJsonResponse, StreamStatusBotError} from './util.js';

import config from '../config.json' assert {'type': 'json'};

export default class Twitch {
	// Lifecycle management
	constructor() {
		// Prepare variables to hold the OAuth access token details and API data
		this.auth = {
			token: null,
			lastValidation: 0
		};

		this.userInfo = {};
		this.streamInfo = {};
	}

	async init() {
		// Get the data from the API
		this.userInfo = await this.getUserInfo();
		this.streamInfo = await this.getStreamInfo();
	}

	destroy() {
		// If we have an OAuth access token, revoke it
		if (this.auth.token !== null) {
			const qs = Object.entries({
				'client_id': config.twitch.clientId,
				'token': this.auth.token,
			}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

			return fetch(`https://id.twitch.tv/oauth2/revoke?${qs}`, {'method': 'POST'}).then(processResponse).then((res) => {
				console.info('Twitch OAuth access token revoked');
			}).catch((err) => {
				console.error('Unable to revoke Twitch OAuth access token');
				console.error(err);
			});
		} else {
			return null;
		}
	}

	// Handle tokens
	requestToken() {
		return new Promise((resolve, reject) => {
			// Request a Twitch OAuth access token with details from the config
			const qs = Object.entries({
				'client_id': config.twitch.clientId,
				'client_secret': config.twitch.secret,
				'grant_type': 'client_credentials'
			}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

			fetch(`https://id.twitch.tv/oauth2/token?${qs}`, {'method': 'POST'}).then(processJsonResponse).then((res) => {
				// Store the token and validation/issue timestamp for later use
				console.info('Twitch OAuth access token acquired');
				this.auth.token = res.access_token;
				this.auth.lastValidation = Date.now();
				resolve(this.auth.token);
			}).catch((err) => {
				throw new StreamStatusBotError('Unable to acquire a Twitch OAuth access token', err);
			});
		});
	};

	getToken() {
		return new Promise((resolve, reject) => {
			const currentTimestamp = Date.now();

			if (this.auth.token !== null) {
				// If we have a token, check if we should validate it (it hasa been more than 1 hour since the last validation)
				if (this.auth.lastValidation + 60 * 60 * 1000 < currentTimestamp) {
					fetch(`https://id.twitch.tv/oauth2/validate`, {'headers': {'Authorization': `OAuth ${this.auth.token}`}}).then((res) => {
						// If the validation was succesful, update the validation timestamp
						console.info('Twitch OAuth access token validated');
						this.auth.lastValidation = currentTimestamp;
						resolve(this.auth.token);
					}).catch((err) => {
						// If the validation wasn't succesful, request a new token and return it
						console.info('Twitch OAuth access token not valid, requesting a new one');
						resolve(this.requestToken());
					});
				} else {
					resolve(this.auth.token);
				}
			} else {
				// If we don't have a token, request one and return it
				resolve(this.requestToken());
			}
		});
	}

	// Handle getting user and stream information
	async getUserInfo() {
		// Get user information for Twitch users from the config map
		const userLogins = Object.keys(config.map);

		return fetch(`https://api.twitch.tv/helix/users?login=${userLogins.join('&login=')}`, {
			'headers': {
				'Authorization': `Bearer ${await this.getToken()}`,
				'Client-ID': config.twitch.clientId
			}
		}).then(processJsonResponse).then((res) => {
			// Check if we got information for all users
			if (res.data.length === userLogins.length) {
				let users = {};
				for (const twitchUser of res.data) {
					// Store information for each user under their user logins
					users[twitchUser.login] = {
						'id': twitchUser.id,
						'display_name': twitchUser.display_name,
						'login': twitchUser.login,
						'profile_image_url': twitchUser.profile_image_url
					};
				}
				return users;
			} else {
				throw new StreamStatusBotError(`Some or all of Twitch users ${userLogins.join(', ')} not found`);
			};
		}).catch((err) => {
			throw new StreamStatusBotError('Unable to get Twitch user info', err);
		});
	};

	async getStreamInfo() {
		const userLogins = Object.keys(config.map);

		// Prepare the default values for streams that are not online
		let streamInfo = userLogins.reduce((obj, login) => {
			obj[login] = {
				'title': null,
				'online': false,
			};
			return obj;
		}, {});

		// Get stream information for Twitch users from the config map
		return fetch(`https://api.twitch.tv/helix/streams?user_login=${userLogins.join('&user_login=')}`, {
			'headers': {
				'Authorization': `Bearer ${await this.getToken()}`,
				'Client-ID': config.twitch.clientId
			}
		}).then(processJsonResponse).then((res) => {
			// Store information for each stream under their user logins
			for (const stream of res.data) {
				streamInfo[stream.user_login] = {
					'title': stream.title || null,
					'online': true,
				};
			}
			return streamInfo;
		}).catch((err) => {
			throw new StreamStatusBotError('Unable to get Twitch stream info', err);
		});
	};
}
