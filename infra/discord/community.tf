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

# Filled by a webhook from dsmtechevents.com later.
resource "discord_news_channel" "upcoming_events" {
  server_id                = var.server_id
  category                 = discord_category_channel.start_here.id
  name                     = "upcoming-events"
  topic                    = "What's coming up. RSVP on each group's own page: https://dsmtechevents.com"
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
  topic                    = "The one catch-all conversation."
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
  # A forum's topic is its post guidelines. Tags (hiring, looking, contract,
  # remote) aren't supported by the provider yet; add them by hand.
  topic = <<-EOT
    One post per role. Include: company, role, location or remote, salary range, and a link to apply.
    No "DM me for details". Job posts go here and nowhere else.
  EOT
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
  topic                    = "Everything else."
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

# Admins only. Community mode sends Discord's notices to an updates channel;
# choose this one in Server Settings > Community Overview.
resource "discord_category_channel" "admins" {
  server_id = var.server_id
  name      = "Admins"
  position  = 100
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
