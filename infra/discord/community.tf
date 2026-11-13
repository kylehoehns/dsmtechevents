# The community-wide sections every member gets by default.

# START HERE: read-only, admins post.
resource "discord_category_channel" "start_here" {
  server_id = var.server_id
  name      = "Start Here"
  position  = 0
}

# Admins post here: they don't bypass channel rules (see the admin role).
resource "discord_channel_permission" "start_here_admin" {
  channel_id   = discord_category_channel.start_here.id
  type         = "role"
  overwrite_id = discord_role.admin.id
  allow        = data.discord_permission.admin_post.allow_bits
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
  position                 = local.channel_position.rules
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.start_here_read_only, discord_channel_permission.start_here_admin]
}

resource "discord_news_channel" "announcements" {
  server_id                = var.server_id
  category                 = discord_category_channel.start_here.id
  name                     = "announcements"
  topic                    = "Server-wide news."
  position                 = local.channel_position.announcements
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.start_here_read_only, discord_channel_permission.start_here_admin]
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
  topic                    = "Anything about tech in Des Moines: code, testing, product, data, design, ops, security, careers. Questions welcome, including how to break in."
  position                 = local.channel_position.general
  sync_perms_with_category = true
}

resource "discord_text_channel" "introductions" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "introductions"
  topic                    = "Say hi: what you do or are learning, and what you're looking for (a meetup to try, coffee, a job)."
  position                 = local.channel_position.introductions
  sync_perms_with_category = true
}

resource "discord_forum_channel" "jobs" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "jobs"
  position                 = local.channel_position.jobs
  sync_perms_with_category = true
  # The post guidelines and tags are set by hand (see the README): provider
  # 2.7 accepts `topic` on a forum but never sends it to Discord.
}

# A forum, so each project gets its own post and its own replies. Its post
# guidelines are set by hand (see the README), like #jobs.
resource "discord_forum_channel" "show_and_tell" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "show-and-tell"
  position                 = local.channel_position.show_and_tell
  sync_perms_with_category = true
}

resource "discord_text_channel" "off_topic" {
  server_id                = var.server_id
  category                 = discord_category_channel.community.id
  name                     = "off-topic"
  topic                    = "Everything that isn't work: pets, food, games, weekend plans."
  position                 = local.channel_position.off_topic
  sync_perms_with_category = true
}

# Server admins: shown in their own block of the member list so members can
# see who they are, and mentionable so anyone can ping @admin for help.
# Given by hand, like the organizer roles.
resource "discord_role" "admin" {
  server_id   = var.server_id
  name        = "Admin"
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

resource "discord_channel_permission" "admins_visible" {
  channel_id   = discord_category_channel.admins.id
  type         = "role"
  overwrite_id = discord_role.admin.id
  allow        = data.discord_permission.view.allow_bits
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
  position                 = local.channel_position.mod_updates
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.admins_hidden, discord_channel_permission.admins_visible]
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
    show_and_tell = discord_forum_channel.show_and_tell.id
    admin         = discord_role.admin.id
  }))

  # Discord adds a preview card for a bare link, which provider 2.7 reads back
  # as an embed and then crashes trying to remove. Links in rules.md are
  # wrapped in <...> so Discord makes no card, and any card is ignored here.
  lifecycle {
    ignore_changes = [embed]
  }
}
