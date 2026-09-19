# Privacy policy for x-scanner

Last updated 2026-09-18.

x-scanner is a browser extension that sends the text of posts you scroll past on X to TypeSafe's Jev
API and shows the answers next to the post. It has no server of its own and no analytics.

## What leaves your browser

- **Post text.** The text of a post, the text of a quoted post if there is one, and whether the post is
  a reply, are sent to `api.typesafe.ai` when the post comes near your viewport. Nothing else about the
  post is sent: no author name, handle, post id, media, or engagement numbers.
- **Your TypeSafe API key**, as the authorization header on those requests.

That is the only network traffic the extension makes. TypeSafe's handling of requests is described in
[TypeSafe's privacy policy](https://docs.typesafe.ai/legal); as of this writing TypeSafe states it does
not train on customer requests.

## What stays in your browser

Stored in Chrome's extension storage on your device, never synced or transmitted by the extension:

- your API key and settings,
- a cache of results keyed by post id, so a post you have already seen is not sent again,
- lifetime counters (posts analyzed, tokens, cost).

You can clear the cache and counters from the settings page, and removing the extension deletes all of it.

## What the extension does not do

- It does not collect, store, or transmit your identity, browsing history, or which posts you read, to
  anyone, including the authors of the extension.
- It does not read or send X cookies, direct messages, or any page other than the posts on screen.
- It does not sell or share data with third parties. The only third party is TypeSafe, and only the
  post text goes there, only because you asked the extension to analyze posts with your own key.

## Contact

Open an issue at https://github.com/oso95/x-scanner/issues.
