'use strict';

import {createHmac, timingSafeEqual} from 'crypto';

import Express from 'express';
import fetch from 'node-fetch';

import {processJsonResponse, StreamStatusBotError} from './util.js';

import config from '../config.json' assert {'type': 'json'};

export default class TwitchEventSub {
	// Lifecycle management
	constructor(twitch) {
		// Prepare variables to hold the Twitch API service and Express plus its http.Server instance
		this.twitch = twitch;
		this.express = null;
		this.server = null;

		// Prepare helper variables to store subscription IDs and already processed notifications
		this.subscriptionIds = [];
		this.processedNotifications = {};

		// Prepare default stream online and offline handlers
		this.onStreamOnline = (twitchUser, twitchStream) => {};
		this.onStreamOffline = (twitchUser) => {};
	}

	init() {
		// Set up an Express instance
		this.express = Express();

		this.express.use(Express.raw({
			'type': 'application/json'
		}));

		this.express.post('/', (req, res) => {
			this.eventHandler(req, res, this);
		});

		this.server = this.express.listen(config.twitchEventSub.port);

		// Subscribe to the events we want to be subscribed to
		this.subscribe();
	}

	destroy() {
		// Unsubscribe from all events
		this.unsubscribe();

		// If an instance of http.Server is running, close it
		if (this.server !== null) {
			this.server.close()
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
		Promise.all(promises).then((res) => {
			// Store the subscription IDs to be used when unsubscribing
			for (const response of res) {
				this.subscriptionIds.push(response.data[0].id);
			}

			console.info(`Listening for online status changes of ${res.length} Twitch channels`);
		}).catch((err) => {
			throw new StreamStatusBotError('Unable to subscribe to Twitch channel online status changes', err);
		});
	}

	async unsubscribe () {
		let promises = [];

		// Loop through each subscription and create a unsubscribe request for it
		for (const subscriptionId of this.subscriptionIds) {
			promises.push(fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`, {
				'method': 'DELETE',
				'headers': {
					'Authorization': `Bearer ${await this.twitch.getToken()}`,
					'Client-ID': config.twitch.clientId,
				},
			}));
		}

		// Send the unsubscribe requests
		Promise.all(promises).then((res) => {
			console.info(`Unsubscribed from online status changes of ${res.length} Twitch channels`);
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

		if (!timingSafeEqual(Buffer.from(hmac), Buffer.from(req.headers['twitch-eventsub-message-signature']))) {
			res.sendStatus(403);
			console.info(`Message with an invalid HMAC signature received, ignoring`);
			return;
		}

		// Parse the message and handle the different message types
		const data = JSON.parse(req.body);
		const messageType = req.headers['twitch-eventsub-message-type'];

		switch(messageType) {
			case 'notification':
				// We're working with a regular event notification, first return a 204
				res.sendStatus(204);

				// Check if we're working with an event we've already processed, if we are, skip it, if not, save it
				const eventId = data.subscription.id;

				if (_self.processedNotifications[eventId]) {
					console.info(`Event ${eventId} has already been processed, ignoring`);
					break;
				}

				_self.processedNotifications[eventId] = true;

				// Check which event type we're working with and handle it accordingly
				const eventType = data.subscription.type;

				switch (eventType) {
					case 'stream.online':
						const streamOnlineType = data.event.type;

						if (streamOnlineType === 'live') {
							// Get updated stream info from the Twitch API, we need this to get the stream title
							_self.twitch.streamInfo = await _self.twitch.getStreamInfo();

							// Check if we have a stream title
							const twitchLogin = 'danvq'; // data.event.broadcaster_user_login

							/*if (_self.twitch.streamInfo[twitchLogin].title === null) {
								throw new StreamStatusBotError(`No stream title available for Twitch channel ${twitchLogin}, which we received a stream.online event for`);
							}*/

							// Call the stream online handler
							_self.onStreamOnline(_self.twitch.userInfo[twitchLogin], {
								'title': 'Stream title', // _self.twitch.streamInfo[twitchLogin].title
								'started_at': new Date(data.event.started_at),
							});
						} else {
							console.info(`Event stream.online with stream type ${streamOnlineType} received, ignoring`);
						}
						break;

					case 'stream.offline':
						// Call the stream offline handler
						_self.onStreamOffline(_self.twitch.userInfo['danvq']); // data.event.broadcaster_user_login
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
				console.info(`Twitch verification received, challenge string sent`);
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
