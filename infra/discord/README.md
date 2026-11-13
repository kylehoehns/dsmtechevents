# Community Discord, as code

OpenTofu (or Terraform) config for the Des Moines tech community Discord server. It builds the server from `data/groups.yaml`, the same file the website uses, so the website and Discord stay in step. A group gets its own section of the server when its entry has a `discord:` block:

```yaml
- id: cijug
  name: Central Iowa Java Users Group
  short: CIJUG
  meetup: https://www.meetup.com/central-iowa-java-users-group/
  discord:
    color: "#c27c0e"
```

The reasoning behind each choice is in the setup decisions doc (DSM Community Discord: Setup Decisions).

## What it builds

- **Start Here** (read-only): `#rules`, `#announcements`, `#upcoming-events`
- **Community** (anyone posts): `#general`, `#introductions`, `#jobs` (forum), `#show-and-tell`, `#off-topic`, and the Lounge voice channel
- **Admins** (hidden): `#mod-updates`
- **For each group**, a category named after the group's `short` name, containing:
  - `#<id>-announcements`: only organizers post
  - `#<id>-chat`
  - `<id>-member` role: group color, given by onboarding, not mentionable by members
  - `<id>-organizer` role: no server-wide powers. Inside its own category it can manage channels, messages, pins, threads and events, and ping its member role.
- **Onboarding**:
  - the eight community channels as defaults
  - one question, "Which user groups do you want to follow?", with an answer per group that grants the group's category and member role

## Still done by hand

- Turn on Community mode, choosing `#rules` as the rules channel and `#mod-updates` as the updates channel (Server Settings > Enable Community). Do this after the first apply, since those channels must exist first.
- Write the Server Guide (welcome message, new member to-dos).
- Add the `#jobs` forum tags (hiring, looking, contract, remote). The provider can't set forum tags yet.
- Give people their organizer roles.

Onboarding is owned by this config: anything changed by hand in Server Settings > Onboarding is replaced on the next apply.

## Running it

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Invite the bot to the server with the **Manage Server**, **Manage Roles** and **Manage Channels** permissions.
3. Drag the bot's role above every role it will manage (Server Settings > Roles).
4. Run:

```sh
cd infra/discord
export DISCORD_TOKEN=...            # the bot token; never commit it
tofu init
tofu plan  -var server_id=<server id>
tofu apply -var server_id=<server id>
```

State is local for now (`terraform.tfstate`, ignored by git). Before more than one person applies, move it to a shared backend.

Point it at a fresh server first. The current playground server has hand-made channels and roles that this config doesn't know about, and applying would replace its onboarding.
