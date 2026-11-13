# One section per group with `discord: true` in data/groups.yaml.

resource "discord_role" "member" {
  for_each  = local.groups
  server_id = var.server_id
  name      = "${each.key}-member"
  # No color. Discord colors a name by its highest colored role, so with a
  # color per group most names would wear whichever group sits on top.
  # Provider 2.7 can't clear a color on update (it only sends one above 0),
  # so a role that once had a color must be cleared in Discord by hand.
  color       = 0
  permissions = 0
  # Off so any member can't ping the whole group; organizers can ping it in
  # their own section through the Mention permission.
  mentionable = false
}

resource "discord_role" "organizer" {
  for_each    = local.groups
  server_id   = var.server_id
  name        = "${each.key}-organizer"
  permissions = 0
  # Organizers get their own block at the top of the member list.
  hoist       = true
  mentionable = false
}

resource "discord_category_channel" "group" {
  for_each  = local.groups
  server_id = var.server_id
  name      = each.value.short
  position  = 2 + index(local.group_ids, each.key)
}

resource "discord_channel_permission" "group_organizer" {
  for_each     = local.groups
  channel_id   = discord_category_channel.group[each.key].id
  type         = "role"
  overwrite_id = discord_role.organizer[each.key].id
  allow        = data.discord_permission.organizer.allow_bits
}

resource "discord_text_channel" "group_chat" {
  for_each  = local.groups
  server_id = var.server_id
  category  = discord_category_channel.group[each.key].id
  name      = "${each.key}-chat"
  # The group's own page, where people RSVP, exactly as groups.yaml has it.
  topic = join(" ", compact([
    "${each.value.name}.",
    try("Meetups: ${coalesce(try(each.value.meetup, null), try(each.value.website, null), try(each.value.eventbrite, null))}", null),
  ]))
  position                 = local.channel_position.group_first + 2 * index(local.group_ids, each.key) + 1
  sync_perms_with_category = true
  depends_on               = [discord_channel_permission.group_organizer]
}

# Organizers post; members read. Not synced with the category, so it carries
# the organizer's permissions plus Send Messages itself.
resource "discord_news_channel" "group_announcements" {
  for_each                 = local.groups
  server_id                = var.server_id
  category                 = discord_category_channel.group[each.key].id
  name                     = "${each.key}-announcements"
  topic                    = "News from ${each.value.short} organizers."
  position                 = local.channel_position.group_first + 2 * index(local.group_ids, each.key)
  sync_perms_with_category = false
}

resource "discord_channel_permission" "group_announcements_read_only" {
  for_each     = local.groups
  channel_id   = discord_news_channel.group_announcements[each.key].id
  type         = "role"
  overwrite_id = local.everyone
  deny         = data.discord_permission.read_only.deny_bits
}

resource "discord_channel_permission" "group_announcements_organizer" {
  for_each     = local.groups
  channel_id   = discord_news_channel.group_announcements[each.key].id
  type         = "role"
  overwrite_id = discord_role.organizer[each.key].id
  allow        = data.discord_permission.organizer_post.allow_bits
}

# One room for every group's organizers. Hidden from everyone else; each
# organizer role can see it, so a new group's organizers are in automatically.
resource "discord_category_channel" "organizers" {
  server_id = var.server_id
  name      = "Organizers"
  position  = 2 + length(local.group_ids)
}

resource "discord_channel_permission" "organizers_hidden" {
  channel_id   = discord_category_channel.organizers.id
  type         = "role"
  overwrite_id = local.everyone
  deny         = data.discord_permission.hidden.deny_bits
}

resource "discord_channel_permission" "organizers_visible" {
  for_each     = local.groups
  channel_id   = discord_category_channel.organizers.id
  type         = "role"
  overwrite_id = discord_role.organizer[each.key].id
  allow        = data.discord_permission.view.allow_bits
}

resource "discord_text_channel" "organizers" {
  server_id                = var.server_id
  category                 = discord_category_channel.organizers.id
  name                     = "organizers"
  topic                    = "A place for organizers of every group to talk with each other."
  position                 = local.channel_position.organizers
  sync_perms_with_category = true
  depends_on = [
    discord_channel_permission.organizers_hidden,
    discord_channel_permission.organizers_visible,
  ]
}
