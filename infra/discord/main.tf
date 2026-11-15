# The groups the website lists are the source of truth. A group gets a section
# of the server when its entry in data/groups.yaml has `discord:`. With `true`
# it's a full section (announcements, chat, organizer role). With an invite to
# the group's own server it's announcements only, followed from that server,
# so the conversation stays there instead of splitting in two.
locals {
  all_groups = yamldecode(file("${path.module}/../../data/groups.yaml"))
  # Same pattern as DISCORD_INVITE in src/lib/data.mjs, which refuses others.
  invite = "^https://(discord\\.gg|discord\\.com/invite)/[\\w-]+$"

  # Every group with a section: category, member role, announcements, onboarding.
  sections = {
    for g in local.all_groups : g.id => g
    if try(g.discord, false) == true || can(regex(local.invite, tostring(try(g.discord, ""))))
  }
  # Sections of our own, with chat and organizers.
  groups = { for id, g in local.sections : id => g if g.discord == true }
  # Sections that follow the group's own server: id => its invite link.
  follows = { for id, g in local.sections : id => g.discord if g.discord != true }

  # Discord's @everyone role has the same ID as the server.
  everyone = var.server_id

  # Category order: Start Here, Community, the groups in groups.yaml order,
  # Organizers, then Admins. Positions stay contiguous because Discord stores what it is
  # given and a gap would only be closed by the next drag in the app.
  group_ids = [for g in local.all_groups : g.id if contains(keys(local.sections), g.id)]

  # Channel positions count across the whole server, not within a category:
  # Discord renumbers them that way (rules 0, announcements 1, ...), and
  # numbering per category would show as drift every time it does. A full
  # section takes two places (announcements, then chat), a followed one one.
  channel_count = [for id in local.group_ids : contains(keys(local.groups), id) ? 2 : 1]
  group_channel_first = {
    for i, id in local.group_ids : id => 8 + sum(concat([0], slice(local.channel_count, 0, i)))
  }
  channel_position = {
    rules         = 0
    announcements = 1
    events        = 2
    general       = 3
    introductions = 4
    jobs          = 5
    show_and_tell = 6
    off_topic     = 7
    organizers    = 8 + sum(concat([0], local.channel_count))
    mod_updates   = 9 + sum(concat([0], local.channel_count))
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
