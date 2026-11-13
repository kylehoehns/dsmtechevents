# Community Discord, as code

OpenTofu (or Terraform) config for the Des Moines tech community Discord server. It builds the server from `data/groups.yaml`, the same file the website uses, so the website and Discord stay in step. A group gets its own section of the server when its entry has `discord: true`:

```yaml
- id: cijug
  name: Central Iowa Java Users Group
  short: CIJUG
  meetup: https://www.meetup.com/central-iowa-java-users-group/
  discord: true
```

The reasoning behind each choice is in the setup decisions doc (DSM Community Discord: Setup Decisions).

## What it builds

- **Start Here** (read-only): `#rules`, `#announcements`, `#upcoming-events`. `#rules` holds one message posted by the bot from `rules.md`; edit that file and apply to change it (the message is edited in place, with no new post or ping).
- **Community** (anyone posts): `#general`, `#introductions`, `#jobs` (forum), `#show-and-tell`, `#off-topic`, and the Lounge voice channel
- **Organizers** (hidden; every `<id>-organizer` role can see it): `#organizers`, one room for the organizers of all groups
- **Admins** (hidden): `#mod-updates`
- **For each group**, a category named after the group's `short` name, containing:
  - `#<id>-announcements`: only organizers post
  - `#<id>-chat`
  - `<id>-member` role: given by onboarding, not mentionable by members. No color: Discord colors a name by the highest colored role, so with one color per group most names would show whichever group sits on top, and that group would look favored.
  - `<id>-organizer` role: no server-wide powers. Inside its own category it can manage channels, messages, pins, threads and events, and ping its member role.
- **Onboarding**:
  - the eight community channels as defaults
  - one question, "Which user groups do you want to follow?", with an answer per group that grants the group's category and member role

## Still done by hand

- Turn on Community mode, choosing `#rules` as the rules channel and `#mod-updates` as the updates channel (Server Settings > Enable Community). See "First run" below for when.
- Write the Server Guide (welcome message, new member to-dos).
- Set up the `#jobs` forum (Edit Channel > Overview). The provider can't do either part: it ignores a forum's `topic`, and it has no forum tags.
  - Post guidelines: "One post per role. Include: company, role, location or remote, salary range, and a link to apply. No "DM me for details". Job posts go here and nowhere else."
  - Tags: hiring, looking, contract, remote.
- Give people their organizer roles.

## Joining and leaving groups

Members do this themselves. Onboarding asks "Which user groups do you want to follow?" when they join, and they can change their answer at any time under **Channels & Roles**, at the top of the channel list. Ticking a group gives them its member role and its category; unticking takes both away.

People new to Discord won't find Channels & Roles on their own, so say where it is in three places:

- **Server Guide**: a new member to-do and a line in the welcome message.
- **`#rules`**: one line at the end.
- **`#announcements`**: a post whenever a group is added.

Wording to paste:

> Want to follow another user group, or stop following one? Click **Channels & Roles** at the top of the channel list and tick or untick it.

## Adding a group

1. Add `discord: true` to the group's entry in `data/groups.yaml`.
2. Run `tofu apply`. The group gets its category, channels and roles, and becomes a new answer to the onboarding question.
3. Existing members aren't asked again. Post in `#announcements` that the group is here and how to join it (see above).

Onboarding is owned by this config: anything changed by hand in Server Settings > Onboarding is replaced on the next apply.

## Running it

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Invite the bot with this link, filling in its application ID:
   `https://discord.com/oauth2/authorize?client_id=<application id>&scope=bot&permissions=8`

   `8` is Administrator. The bot needs it because the read-only and hidden channels deny things to @everyone, and those denials apply to the bot as well: it can't see a hidden category, and Discord won't let it set a channel permission it has lost there. Administrator is the only permission that skips channel rules. It also makes the token a full admin key for the server, so keep it out of files and chat, and reset it in the Developer Portal if it leaks.
3. Drag the bot's role above every role it will manage (Server Settings > Roles).
4. Set the secrets in your shell, never in a file (see "State" for the R2 ones):

   ```sh
   export DISCORD_TOKEN=...          # the bot token
   export AWS_ACCESS_KEY_ID=...      # R2 key pair
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_ENDPOINT_URL_S3=https://<cloudflare account id>.r2.cloudflarestorage.com
   ```

   On a Mac, keep them in the keychain and read them per shell, e.g. `export DISCORD_TOKEN=$(security find-generic-password -s dsm-tech-discord-bot -w)`. To store one without it landing in your shell history, run `security add-generic-password -a "$USER" -s <name> -w` in Terminal and paste at the prompt.
5. Run `tofu init` in this folder.

### First run

Announcement channels and onboarding only exist on a Community server, and Community mode needs the rules and updates channels to exist first. So the first run has three steps:

```sh
# 1. Just the two channels Community mode asks for
tofu apply -var server_id=<server id> \
  -target=discord_text_channel.rules -target=discord_text_channel.mod_updates
```

2. Server Settings > Enable Community: choose `#rules` and `#mod-updates`.

```sh
# 3. Everything else
tofu apply -var server_id=<server id>
```

4. Run `tofu apply` once more. Discord ignores a channel's position when creating it, so this second run moves channels into their configured order. A plan after that should say "No changes".
5. Delete the starter channels Discord made with the server ("Text Channels", "Voice Channels" and what's in them). This config doesn't manage them, and they sort above Start Here.

### After that

```sh
tofu plan  -var server_id=<server id>
tofu apply -var server_id=<server id>
```

An apply that creates channels (a new group, say) needs a second apply to put them in order, for the same reason as step 4 above.

## State

OpenTofu's record of what it built (which Discord IDs belong to which resource) lives in Cloudflare R2: bucket `dsmtechevents-tofu-state`, key `discord/terraform.tfstate`. While an apply runs it holds a lock file next to it, so two applies can't overlap. The state holds Discord IDs and names, not the bot token.

The R2 key pair comes from Cloudflare > R2 > Manage API tokens: an Account API token with **Object Read & Write**, limited to that bucket.

Point it at a fresh server first. The current playground server has hand-made channels and roles that this config doesn't know about, and applying would replace its onboarding.
