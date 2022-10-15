'use strict';

export const processResponse = (res) => {
	return new Promise((resolve, reject) => {
		if (!res.ok) reject(`${res.status}: ${res.statusText}`);
		else res.text().then(resolve).catch(reject);
	});
};

export const processJsonResponse = (res) => {
	return new Promise((resolve, reject) => {
		if (!res.ok) reject(`${res.status}: ${res.statusText}`);
		else res.json().then(resolve).catch(reject);
	});
};

export class StreamStatusBotError extends Error {
	constructor(message, exception) {
		super(message);
		this.name = 'StreamStatusBotError';
		this.exception = exception || null;
	}
};
