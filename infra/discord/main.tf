# The groups the website lists are the source of truth. A group gets a section
# of the server when its entry in data/groups.yaml has `discord: true`.
locals {
  groups = {
    for g in yamldecode(file("${path.module}/../../data/groups.yaml")) :
    g.id => g if try(g.discord, false) == true
  }

  # Discord's @everyone role has the same ID as the server.
  everyone = var.server_id

  # Category order: Start Here, Community, the groups in groups.yaml order,
  # Organizers, then Admins. Positions stay contiguous because Discord stores what it is
  # given and a gap would only be closed by the next drag in the app.
  group_ids = [for g in yamldecode(file("${path.module}/../../data/groups.yaml")) : g.id if contains(keys(local.groups), g.id)]

  # Channel positions count across the whole server, not within a category:
  # Discord renumbers them that way (rules 0, announcements 1, ...), and
  # numbering per category would show as drift every time it does. Each
  # group takes two places (announcements, then chat).
  channel_position = {
    rules         = 0
    announcements = 1
    events        = 2
    general       = 3
    introductions = 4
    jobs          = 5
    show_and_tell = 6
    off_topic     = 7
    group_first   = 8
    organizers    = 8 + 2 * length(local.group_ids)
    mod_updates   = 9 + 2 * length(local.group_ids)
  }
}

# What an organizer can do inside their own group's section, and nowhere else:
# moderate it and ping their members. Not granted:
# - Manage Channels on the two channels this config makes: one deleted by hand
#   loses its history, and the provider then fails every plan until the state
#   is repaired. (They do get it on the category, below, to add their own.)
# - Manage Permissions (they could widen their own access) and Manage Webhooks.
# - Events: Discord's own event listings would be a second calendar beside
#   each group's page, and the permission only works on voice channels anyway.
data "discord_permission" "organizer" {
  manage_messages = "allow"
  pin_messages    = "allow"
  manage_threads  = "allow"
  # Lets them ping their member role. Discord has no narrower permission, so
  # it also allows @everyone, @here and other groups' roles in these channels.
  mention_everyone = "allow"
}

# Read-only for everyone else: announcement-style channels.
data "discord_permission" "read_only" {
  send_messages          = "deny"
  create_public_threads  = "deny"
  create_private_threads = "deny"
}

# The organizer's permissions plus posting, for their read-only announcements
# channel. allow_extends builds on the bits above rather than adding numbers.
# On the group's category: the above, plus Manage Channels so organizers can
# add channels of their own. Channels they add copy the category's
# permissions, so they can rename and delete those. Discord ties creating
# channels in a category to managing the category, so this also lets them
# rename or delete the category itself (behind a typed confirmation; the
# README has the recovery).
data "discord_permission" "organizer_category" {
  allow_extends   = data.discord_permission.organizer.allow_bits
  manage_channels = "allow"
}

# Denied on the channels this config makes, so organizers can't rename or
# delete them. A channel's own overwrite wins over its category's.
data "discord_permission" "no_manage_channels" {
  manage_channels = "deny"
}

data "discord_permission" "organizer_post" {
  allow_extends = data.discord_permission.organizer.allow_bits
  send_messages = "allow"
}

data "discord_permission" "hidden" {
  view_channel = "deny"
}

data "discord_permission" "admin" {
  administrator = "allow"
}

data "discord_permission" "view" {
  view_channel = "allow"
}
