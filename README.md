Stream status bot for DevWars
===========

[![NPM](https://nodei.co/npm/devwars-stream-status-bot.png?compact=true)](https://www.npmjs.com/package/devwars-stream-status-bot)

When a new tag is created, the current state of this repo gets published to NPM and made into a Docker image using GitLab CI (https://gitlab.com/dpeukert/devwars-stream-status-bot).

## Instructions
Run a Docker image from [here](https://gitlab.com/dpeukert/devwars-stream-status-bot/container_registry) with a config file mounted to `/node/config.json`.

## Changelog

7\. 6. 2020 - 1.4.6 - even more debugging

6\. 6. 2020 - 1.4.5 - more debugging

6\. 6. 2020 - 1.4.4 - added various error handling

6\. 6. 2020 - 1.4.3 - debugging

6\. 6. 2020 - 1.4.2 - fixed twitch-webhook patch

18\. 5. 2020 - 1.4.1 - fixed typo

18\. 5. 2020 - 1.4.0 - fixed twitch webhooks

4\. 5. 2020 - 1.3.6 - fixed embeds, updated dependencies

10\. 4. 2020 - 1.3.5 - switched to token auth for Twitch, updated dependencies

10\. 1. 2020 - 1.3.4 - updated dependencies

19\. 5. 2019 - 1.3.3 - fixed repeat notification checking logic for stream end events

19\. 5. 2019 - 1.3.2 - fixed resubscribing logic, fixed to only process each notification once, updated dependencies

14\. 5. 2019 - 1.3.1 - updated dependencies

21\. 4. 2019 - 1.3.0 - added option to set a custom Discord message

20\. 4. 2019 - 1.2.0 - added a tag to Discord posts, added option to use a custom title for Reddit posts

20\. 4. 2019 - 1.1.2 - added more error handling, updated dependencies

22\. 9. 2018 - 1.1.1 - added some more logging

22\. 9. 2018 - 1.1.0 - added a feature to submit reddit posts

16\. 9. 2018 - 1.0.3 - fixed logging

14\. 9. 2018 - 1.0.2 - added some logging

14\. 9. 2018 - 1.0.1 - fixed config references

14\. 9. 2018 - 1.0.0 - initial version

## License

GPL v3
