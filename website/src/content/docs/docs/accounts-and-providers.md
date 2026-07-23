---
title: Accounts and providers
description: Connect calendar accounts and extend renCal with additional providers.
---

Accounts connect renCal to remote calendar services. One account can provide several calendars, which are managed separately under **Settings → Calendars**.

## Connect an account

Open **Settings → Accounts** and select **Connect new account**.

renCal includes providers for:

- **Google Calendar**
- **iCloud Calendar**
- **Outlook Calendar**
- **CalDAV servers**

Depending on the provider, renCal opens a browser sign-in flow or asks for credentials such as an account name, app password, or server address.

<img src="/docs/connect-calendar.png" alt="The Connect calendar dialog in renCal" width="520" />

## Reconnect an account

The status beside an account shows whether renCal can currently connect to it. If it reports a failure, open the account's menu and select **Reconnect…**.

Reconnecting refreshes the provider's authentication without changing the calendars already stored on your computer.

## Additional providers

renCal discovers provider executables named `caldir-provider-*` in your `$PATH`. This makes it possible to add providers without changing renCal itself.

Examples include:

- [Proton Calendar Provider](https://github.com/t4t5/caldir-provider-proton)
- [Tuta Calendar Provider](https://github.com/t4t5/caldir-provider-tuta)

After installing a provider, restart renCal and open **Connect new account**. The provider should appear alongside the built-in options.

Provider authors can use the [Caldir provider protocol](https://caldir.org/providers/#provider-protocol).

## Accounts and calendars

Disconnecting an individual calendar is done under **Settings → Calendars**, not on the Accounts page. This removes its local copy from renCal; it does not delete the calendar from the remote service.

See [Calendars and groups](/docs/calendars-and-groups/) for visibility, defaults, subscriptions, and calendar deletion.
