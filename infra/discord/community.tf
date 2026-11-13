# The community-wide sections every member gets by default.

# START HERE: read-only, admins post.
resource "discord_category_channel" "start_here" {
  server_id = var.server_id
  name      = "Start Here"
  position  = 0
}

resource "discord_channel_permission" "start_here_read_only" {
  channel_id   = discord_category_channel.start_here.id
  type         = "role"
  overwrite_id = local.everyone
  deny         = data.discord_permission.read_only.deny_bits
}

# Community mode needs a rules channel. Choose this one in
# Server Settings > Community Overview after the first apply.
resource "discord_text_channel" "rules" {
  server_id                = var.server_id
  category                 = discord_category_channel.start_here.id
  name                     = "rules"
  topic                    = "How we treat each other here."
  position                 = 0
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.start_here_read_only]
}

resource "discord_news_channel" "announcements" {
  server_id                = var.server_id
  category                 = discord_category_channel.start_here.id
  name                     = "announcements"
  topic                    = "Server-wide news."
  position                 = 1
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.start_here_read_only]
}

# Kept for a possible dsmtechevents.com feed. Whether to build one is
# undecided (feeds are ruled out in docs/decisions/0006), so nothing posts here yet.
resource "discord_news_channel" "upcoming_events" {
  server_id                = var.server_id
  category                 = discord_category_channel.start_here.id
  name                     = "upcoming-events"
  topic                    = "What's coming up: https://dsmtechevents.com"
  position                 = 2
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.start_here_read_only]
}

# COMMUNITY: anyone can post.
resource "discord_category_channel" "community" {
  server_id = var.server_id
  name      = "Community"
  position  = 1
}

resource "discord_text_channel" "general" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "general"
  topic                    = "Anything about tech in Des Moines: code, product, data, design, business, careers."
  position                 = 0
  sync_perms_with_category = true
}

resource "discord_text_channel" "introductions" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "introductions"
  topic                    = "Say hi: what you do and which groups you're in."
  position                 = 1
  sync_perms_with_category = true
}

resource "discord_forum_channel" "jobs" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "jobs"
  position                 = 2
  sync_perms_with_category = true
  # The post guidelines and tags are set by hand (see the README): provider
  # 2.7 accepts `topic` on a forum but never sends it to Discord.
}

resource "discord_text_channel" "show_and_tell" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "show-and-tell"
  topic                    = "Things you built, wrote or spoke about."
  position                 = 3
  sync_perms_with_category = true
}

resource "discord_text_channel" "off_topic" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "off-topic"
  topic                    = "Everything that isn't work: pets, food, games, weekend plans."
  position                 = 4
  sync_perms_with_category = true
}

resource "discord_voice_channel" "lounge" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "Lounge"
  position                 = 5
  sync_perms_with_category = true
}

# Server admins: shown in their own block of the member list so members can
# see who they are, and mentionable so anyone can ping @admin for help.
# Given by hand, like the organizer roles.
resource "discord_role" "admin" {
  server_id   = var.server_id
  name        = "admin"
  permissions = data.discord_permission.admin.allow_bits
  color       = 0
  hoist       = true
  mentionable = true
}

# Admins only. Community mode sends Discord's notices to an updates channel;
# choose this one in Server Settings > Community Overview.
resource "discord_category_channel" "admins" {
  server_id = var.server_id
  name      = "Admins"
  position  = 3 + length(local.group_ids)
}

resource "discord_channel_permission" "admins_hidden" {
  channel_id   = discord_category_channel.admins.id
  type         = "role"
  overwrite_id = local.everyone
  deny         = data.discord_permission.hidden.deny_bits
}

resource "discord_text_channel" "mod_updates" {
  server_id                = var.server_id
  category                 = discord_category_channel.admins.id
  name                     = "mod-updates"
  topic                    = "Discord's Community notices, and admin chat."
  position                 = 0
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.admins_hidden]
}

# The rules, posted by the bot. Edit rules.md; an apply edits this message in
# place (no new post, no ping). Discord caps a message at 2,000 characters.
resource "discord_message" "rules" {
  channel_id = discord_text_channel.rules.id
  # trimspace: Discord drops the file's final newline, which would otherwise
  # show as a change on every plan.
  content = trimspace(templatefile("${path.module}/rules.md", {
    general       = discord_text_channel.general.id
    off_topic     = discord_text_channel.off_topic.id
    jobs          = discord_forum_channel.jobs.id
    show_and_tell = discord_text_channel.show_and_tell.id
    admin         = discord_role.admin.id
  }))

  # Discord adds a preview card for a bare link, which provider 2.7 reads back
  # as an embed and then crashes trying to remove. Links in rules.md are
  # wrapped in <...> so Discord makes no card, and any card is ignored here.
  lifecycle {
    ignore_changes = [embed]
  }
}
