'use strict';

import {createHmac, timingSafeEqual} from 'crypto';

import Express from 'express';
import fetch from 'node-fetch';

import {processJsonResponse, closeServerPromise, StreamStatusBotError} from './util.js';

import config from '../config.json' assert {'type': 'json'};

export default class TwitchEventSub {
	// Lifecycle management
	constructor(twitch) {
		// Prepare variables to hold the Twitch API service and Express plus its http.Server instance
		this.twitch = twitch;
		this.express = null;
		this.server = null;

		// Prepare helper variables for deduplicating notifications
		this.processedStreams = {};
		this.latestStreams = {};

		// Prepare default stream online and offline handlers
		this.onStreamOnline = (twitchUser, twitchStream) => {};
		this.onStreamOffline = (twitchUser) => {};
	}

	async init() {
		// Set up an Express instance
		this.express = Express();

		this.express.use(Express.raw({
			'type': 'application/json'
		}));

		this.express.post('/', (req, res) => {
			this.eventHandler(req, res, this);
		});

		this.server = this.express.listen(config.twitchEventSub.port);

		// Unsubscribe from any event subscriptions that might still be running
		await this.unsubscribe();

		// Subscribe to the events we want to be subscribed to
		await this.subscribe();
	}

	async destroy() {
		// Unsubscribe from all events
		await this.unsubscribe();

		// If an instance of http.Server is running, close it
		if (this.server !== null) {
			await closeServerPromise(this.server);
		}
	}

	// Manage subscriptions
	async subscribe() {
		let promises = [];

		// Loop through each Twitch channel in the config map
		for (const twitchUser of Object.values(this.twitch.userInfo)) {
			// Create event subscription requests for both stream online and offline events
			const twitchId = twitchUser.id;

			for (const eventType of ['stream.online', 'stream.offline']) {
				promises.push(fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
					'method': 'POST',
					'headers': {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${await this.twitch.getToken()}`,
						'Client-ID': config.twitch.clientId,
					},
					'body': JSON.stringify({
						'type': eventType,
						'version': '1',
						'condition': {
							'broadcaster_user_id': twitchId,
						},
						'transport': {
							'method': 'webhook',
							'callback': config.twitchEventSub.callback,
							'secret': config.twitchEventSub.secret,
						}
					}),
				}).then(processJsonResponse));
			}
		}

		// Send the event subscription requests
		return Promise.all(promises).then((res) => {
			console.info(`Listening for online status changes of ${res.length / 2} Twitch channels`);
		}).catch((err) => {
			throw new StreamStatusBotError('Unable to subscribe to Twitch channel online status changes', err);
		});
	}

	async unsubscribe () {
		// Get currently existing subscriptions
		return fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
			'headers': {
				'Authorization': `Bearer ${await this.twitch.getToken()}`,
				'Client-ID': config.twitch.clientId,
			}
		}).then(processJsonResponse).then(async (res) => {
			if (res.data.length > 0) {
				// Loop through each subscription and create a unsubscribe request for it
				let promises = [];

				for (const subscription of res.data) {
					promises.push(fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`, {
						'method': 'DELETE',
						'headers': {
							'Authorization': `Bearer ${await this.twitch.getToken()}`,
							'Client-ID': config.twitch.clientId,
						},
					}));
				}

				// Send the unsubscribe requests
				return Promise.all(promises);
			} else {
				return Promise.resolve([]);
			}
		}).then((res) => {
			if (res.length > 0) {
				console.info(`Unsubscribed from ${res.length} Twitch channel online status change subscriptions`);
			}
		}).catch((err) => {
			console.error('Unable to unsubscribe from Twitch channel online status changes');
			console.error(err);
		});
	}

	// Handle events
	async eventHandler(req, res, _self) {
		// Verify the signature and send a 403 if it's not valid
		const message = req.headers['twitch-eventsub-message-id'] + req.headers['twitch-eventsub-message-timestamp'] + req.body;
		const hmac = 'sha256=' + createHmac('sha256', config.twitchEventSub.secret).update(message).digest('hex');

		if (!req.headers['twitch-eventsub-message-signature'] || !timingSafeEqual(Buffer.from(hmac), Buffer.from(req.headers['twitch-eventsub-message-signature']))) {
			res.sendStatus(403);
			console.info(`Message with no or an invalid HMAC signature received, ignoring`);
			return;
		}

		// Parse the message and handle the different message types
		const data = JSON.parse(req.body);
		const messageType = req.headers['twitch-eventsub-message-type'];

		switch(messageType) {
			case 'notification':
				// We're working with a regular event notification, first return a 204
				res.sendStatus(204);

				// Check if we want to process this notification. We ignore notification IDs, because they're not very reliable
				// (sometimes, we get the same ID for different streams). Notifying only once per stream and checking that
				// the new stream started later than those we received before should be enough.
				const streamId = data.event.id || null;
				const streamStartedAt = data.event.started_at || null;
				const twitchLogin = data.event.broadcaster_user_login || null;

				if (streamId !== null && streamStartedAt !== null && twitchLogin  !== null) {
					if (!this.processedStreams[twitchLogin]) {
						this.processedStreams[twitchLogin] = [];
					}

					if (!this.latestStreams[twitchLogin]) {
						this.latestStreams[twitchLogin] = 0;
					}

					if (this.processedStreams[twitchLogin][streamId] || streamStartedAt < this.latestStreams[twitchLogin]) {
						console.info('This Twitch event has already been processed, ignoring');
						break;
					}

					this.processedStreams[twitchLogin][streamId] = true;
					this.latestStreams[twitchLogin] = streamStartedAt;
				}

				// Check which event type we're working with and handle it accordingly
				const eventType = data.subscription.type;

				switch (eventType) {
					case 'stream.online':
						const streamOnlineType = data.event.type;

						if (streamOnlineType === 'live') {
							// Get updated stream info from the Twitch API, we need this to get the stream title
							_self.twitch.streamInfo = await _self.twitch.getStreamInfo();

							// Check if we have a stream title
							if (_self.twitch.streamInfo[twitchLogin].title === null) {
								throw new StreamStatusBotError(`No stream title available for Twitch channel ${twitchLogin}, which we received a stream.online event for`);
							}

							// Call the stream online handler
							_self.onStreamOnline(_self.twitch.userInfo[twitchLogin], {
								'title': _self.twitch.streamInfo[twitchLogin].title,
								'started_at': new Date(data.event.started_at),
							});
						} else {
							console.info(`Event stream.online with stream type ${streamOnlineType} received, ignoring`);
						}
						break;

					case 'stream.offline':
						// Call the stream offline handler
						_self.onStreamOffline(_self.twitch.userInfo[twitchLogin]);
						break;

					default:
						console.info(`Event type ${eventType} is not supported, ignoring`);
						break;
				}

				break;

			case 'webhook_callback_verification':
				// We're responding to a verification, just send the challenge string back as a text/plain with a 200
				res.set('Content-Type', 'text/plain');
				res.status(200).send(data.challenge);
				console.info(`Twitch verification request for subscription ${data.subscription.id} received, challenge string sent`);
				break;

			case 'revocation':
				// Some of our subscriptions have been revoked, send a 204 and abort
				res.sendStatus(204);
				throw new StreamStatusBotError(`Subscription ${data.subscription.id} for type ${data.subscription.type} revoked due to ${data.subscription.status}`);

			default:
				// We've received an unknown message, send a 204 and ignore it
				res.sendStatus(204);
				console.info(`Message type ${messageType} is not supported, ignoring`);
				break;
		}
	}
}
