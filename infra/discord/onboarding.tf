locals {
  group_by_member_role = { for id, r in discord_role.member : r.id => id }

  # Every member sees these. Discord asks for at least 7, 5 of them chattable
  # (the #jobs forum counts). This is exactly 7 and 5: removing any one fails.
  default_channel_ids = [
    discord_text_channel.rules.id,
    discord_news_channel.announcements.id,
    discord_text_channel.general.id,
    discord_text_channel.introductions.id,
    discord_forum_channel.jobs.id,
    discord_forum_channel.show_and_tell.id,
    discord_text_channel.off_topic.id,
  ]
}

# Discord hands the default channels back in its own order, so comparing the
# list would show a change on every plan. The onboarding ignores the list and
# is rebuilt instead when this sorted copy of it changes.
resource "terraform_data" "default_channels" {
  input = sort(local.default_channel_ids)
}

# Owns the whole onboarding setup: anything added by hand in Server Settings >
# Onboarding is replaced on the next apply. Change it here instead.
resource "discord_server_onboarding" "this" {
  server_id           = var.server_id
  enabled             = true
  mode                = 0 # Discord's minimums count the default channels only
  default_channel_ids = local.default_channel_ids

  lifecycle {
    ignore_changes       = [default_channel_ids]
    replace_triggered_by = [terraform_data.default_channels]
  }

  prompt {
    title         = "Which user groups do you want to follow?"
    type          = 0
    single_select = false
    required      = false
    in_onboarding = true

    # In the order groups were added, not groups.yaml order. The provider keeps
    # each answer's Discord ID by its place in this list, and members' picks
    # are saved by that ID, so an answer inserted mid-list would take over
    # another group's ID. Discord IDs grow over time (all 19 digits for
    # years yet, so they sort as strings), so sorting by the member role's ID
    # puts a new group last.
    dynamic "option" {
      for_each = [for id in sort([for r in discord_role.member : r.id]) : local.group_by_member_role[id]]
      content {
        title       = local.groups[option.value].short
        description = local.groups[option.value].name
        channel_ids = [discord_category_channel.group[option.value].id]
        role_ids    = [discord_role.member[option.value].id]
      }
    }
  }
}
