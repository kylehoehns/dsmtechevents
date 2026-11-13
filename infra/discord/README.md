# Community Discord, as code

OpenTofu (or Terraform) config for the Des Moines tech community Discord server. It builds the server from `data/groups.yaml`, the same file the website uses, so the website and Discord stay in step. A group gets its own section of the server when its entry has `discord: true`:

```yaml
- id: cijug
  name: Central Iowa Java Users Group
  short: CIJUG
  meetup: https://www.meetup.com/central-iowa-java-users-group/
  discord: true
```

## What it builds

- **Start Here** (read-only): `#rules`, `#announcements`. `#rules` holds one message posted by the bot from `rules.md`; edit that file and apply to change it (the message is edited in place, with no new post or ping).
- **Community** (anyone posts): `#general`, `#introductions`, `#jobs` (forum), `#show-and-tell`, `#off-topic`
- **Organizers** (hidden; every `<id>-organizer` role can see it): `#organizers`, one room for the organizers of all groups
- **Admins** (hidden): `#mod-updates`
- **For each group**, a category named after the group's `short` name, containing:
  - `#<id>-announcements`: only organizers post
  - `#<id>-chat`
  - `<id>-member` role: given by onboarding, not mentionable by members. No color: Discord colors a name by the highest colored role, so with one color per group most names would show whichever group sits on top, and that group would look favored.
  - `<id>-organizer` role: no server-wide powers. Inside its own category it can delete and pin messages, manage threads, and ping its member role. Discord has no permission for pinging one role only, so it can also ping @everyone, @here and other groups' roles there; organizers should ping only their own members.
    - It can't add, rename or delete channels: those change through this repo, since a channel deleted by hand loses its history. For another space (a workshop, a study group), organizers start a thread off a message in `#<id>-chat`. Anyone can follow it, and it archives itself when it goes quiet. If a group outgrows threads, add channels for it here.
  - The chat channel's topic links to the group's own page (`meetup`, else `website` or `eventbrite`), where people RSVP.
- **Onboarding**:
  - the seven Start Here and Community channels as defaults: exactly Discord's minimum of 7, with 5 that members can post in, so removing any one breaks onboarding
  - one question, "Which user groups do you want to follow?", with an answer per group that grants the group's category and member role

## Still done by hand

- Turn on Community mode, choosing `#rules` as the rules channel and `#mod-updates` as the updates channel (Server Settings > Enable Community). See "First run" below for when.
- Name the server **Des Moines Tech** and give it the site's icon (`public/icons/icon-512.png`) in Server Settings > Overview. The provider could only set these by owning the server's other settings too.
- Write the Server Guide (Server Settings > Onboarding > Server Guide):
  - Welcome message: two sentences, ending with the Channels & Roles line under "Joining and leaving groups".
  - New member to-dos: read `#rules`, say hi in `#introductions`, pick your groups in Channels & Roles.
  - Resource pages: `#rules`, `#jobs`.
- Safety (Server Settings > Safety Setup):
  - Safety alerts channel: `#mod-updates`.
  - Raid protection on, with CAPTCHA for suspicious joins.
  - AutoMod (in Safety Setup). No role exemptions, so nothing to update when groups change; Discord already skips anyone with Administrator or Manage Server. The provider has no AutoMod, but Discord's API does, except for editing the built-in mention spam rule before it has been saved once in the app:
    - Mention spam: block at about 8 mentions, alert in `#mod-updates`, and time out for an hour.
    - Suspected spam content: block.
    - Commonly flagged words: slurs and sexual content on, profanity off.
    - Custom keywords, block and alert: `discord.gg/*`, `discord.com/invite/*`, `free nitro`, `steam gift`, `airdrop`, `seed phrase`.
  - Require 2FA for moderation, once the account that owns the bot has 2FA on; without it, applies can start failing.
- Bot (Developer Portal > Bot): turn Public Bot off, and leave every privileged intent off. OpenTofu only calls Discord's REST API and needs none.
- Set up the `#jobs` forum (Edit Channel > Overview). The provider can't do either part: it ignores a forum's `topic`, and it has no forum tags.
  - Post guidelines:

    > **Tag your post Hiring or Looking.**
    >
    > **Hiring:** one post per role. Include the company, role, on-site, hybrid or remote, salary range, and a link to apply.
    >
    > **Looking:** say what you do, what you want next, and on-site, hybrid or remote. A resume or LinkedIn link helps.
    >
    > No "DM me for details". Job posts go here and nowhere else.

  - Tags: `Hiring` and `Looking`, with "Require people to select tags when posting" on, so every post has one.
- Give people their `admin` and organizer roles. `admin` has the Administrator permission, shows in its own block of the member list, and anyone can ping it.
- Order the roles (Server Settings > Roles; the provider can't): the bot's role, then `admin`, then the organizer roles, then the member roles. A role can only manage roles below it, so an admin below the organizers couldn't assign or moderate them.

## Joining and leaving groups

Members do this themselves. Onboarding asks "Which user groups do you want to follow?" when they join, and they can change their answer at any time under **Channels & Roles**, at the top of the channel list. Ticking a group gives them its member role and its category; unticking takes both away.

People new to Discord won't find Channels & Roles on their own, so say where it is in three places:

- **Server Guide**: a new member to-do and a line in the welcome message.
- **`#rules`**: one line at the end.
- **`#announcements`**: a post whenever a group is added.

Wording to paste:

> Want to follow another user group, or stop following one? Click **Channels & Roles** at the top of the channel list and tick or untick it.

## Adding a group

1. Add `discord: true` to the group's entry in `data/groups.yaml`, in a pull request. The `discord` check on the PR shows what will change in Discord.
2. Merge it. The workflow applies it: it creates the group's category, channels and roles, adds it as an answer to the onboarding question, and applies again to put the new channels in order.
3. Existing members aren't asked again. Post in `#announcements` that the group is here and how to join it (see above).

The onboarding answers are listed in the order groups were added, so a new group is always last; its place in `groups.yaml` doesn't matter. Removing a group is different: the provider keeps each answer's Discord ID by its place in the list, so every answer after the removed one takes the ID of the one before it. Nobody loses a role or a channel, but members' ticks in Channels & Roles may then show a neighboring group until they re-pick.

Onboarding is owned by this config: the question and its answers are replaced on the next apply if changed by hand in Server Settings > Onboarding. The default channels are the exception. Discord returns them in its own order, so the config doesn't compare them and a hand change there stays until the set in `onboarding.tf` changes.

A group's `id` must not change once it has a Discord section. Everything for the group is keyed by it, so a new `id` deletes the group's channels, with their history, and creates new ones.

Don't delete a managed channel or the rules message by hand. The provider then fails every plan with "Failed to fetch channel" until it is removed from the state with `tofu state rm '<address>'`, after which an apply creates it again.

## Running it

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications). Name it **DSM Tech** and give it the site's icon (`public/icons/icon-512.png`) under Bot; members see both on every message it posts.
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

### After that: GitHub Actions

`.github/workflows/discord.yml` runs every change from here on:

- **On a pull request** that touches `infra/discord/`, `data/groups.yaml` or the workflow, it plans and puts the result in the run's summary (the check's **Summary** page). If the plan deletes a channel or a member role, it fails unless the PR has the `discord-destroy` label: deleted messages and memberships can't come back.
- **On a merge to `main`**, or run by hand from the Actions tab, it applies, and keeps applying until a plan is clean (a new channel needs a second apply to take its position).

It reads these from the `discord` environment (Settings > Environments > discord):

| Name | Kind | Value |
|---|---|---|
| `DISCORD_TOKEN` | secret | the bot token |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | secret | the R2 key pair (see "State") |
| `AWS_ENDPOINT_URL_S3` | variable | `https://<cloudflare account id>.r2.cloudflarestorage.com` |
| `DISCORD_SERVER_ID` | variable | the server's ID |

Running it from a laptop still works the same way (`tofu plan` / `tofu apply -var server_id=<server id>`). An apply there takes the same lock in R2, so it can't overlap with the workflow's.

## State

OpenTofu's record of what it built (which Discord IDs belong to which resource) lives in Cloudflare R2: bucket `dsmtechevents-tofu-state`, key `discord/terraform.tfstate`. While an apply runs it holds a lock file next to it, so two applies can't overlap. The state holds Discord IDs and names, not the bot token.

The R2 key pair comes from Cloudflare > R2 > Manage API tokens: an Account API token with **Object Read & Write**, limited to that bucket.

Point it at a fresh server first. The current playground server has hand-made channels and roles that this config doesn't know about, and applying would replace its onboarding.
