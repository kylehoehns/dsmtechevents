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
}

# What an organizer can do inside their own group's section, and nowhere else.
# Not granted: Manage Permissions (they could widen their own access) and
# Manage Webhooks (the events feed is set up centrally).
data "discord_permission" "organizer" {
  manage_channels  = "allow"
  manage_messages  = "allow"
  pin_messages     = "allow"
  manage_threads   = "allow"
  mention_everyone = "allow" # lets them ping their member role, only here
  create_events    = "allow"
  manage_events    = "allow"
}

# Read-only for everyone else: announcement-style channels.
data "discord_permission" "read_only" {
  send_messages          = "deny"
  create_public_threads  = "deny"
  create_private_threads = "deny"
}

# The organizer's permissions plus posting, for their read-only announcements
# channel. allow_extends builds on the bits above rather than adding numbers.
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
