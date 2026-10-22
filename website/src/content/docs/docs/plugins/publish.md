---
title: Publish a plugin
description: List your plugin in the renCal plugin directory.
---

To list your plugin in the [plugin directory](/plugins/):

1. Push it to a public GitHub repository.
2. Add the `rencal-plugin` topic to the repository.
3. For providers, publish a release with the [release assets](/docs/plugins/providers/#release-assets). For views, publish a release with the built files attached; the [SDK's release workflow](https://www.npmjs.com/package/@rencomputer/rencal-sdk#publish) does it when you push a version tag.

It shows up within an hour.

## Preview image

Add a `preview.png` to the repository root to show it in the directory.

## Updates

renCal installs a plugin's latest release, or the latest commit on the default branch if it has none. Theme plugins can ship updates either way. Providers need a release, and so do views unless their built files are committed.
