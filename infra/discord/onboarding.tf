locals {
  group_by_member_role = { for id, r in discord_role.member : r.id => id }

  # Every member sees these. Discord asks for at least 7, 5 of them chattable
  # (the #jobs forum counts; #events doesn't, since members only reply there).
  default_channel_ids = [
    discord_text_channel.rules.id,
    discord_news_channel.announcements.id,
    discord_forum_channel.events.id,
    discord_text_channel.general.id,
    discord_text_channel.introductions.id,
    discord_forum_channel.jobs.id,
    discord_forum_channel.show_and_tell.id,
    discord_text_channel.off_topic.id,
  ]
}

# Owns the onboarding question: its answers are updated in place as groups
# come and go, which keeps the prompt's and answers' IDs, and with them every
# member's picks.
#
# The default channels are set only when onboarding is first created.
# Discord hands them back in its own order, so comparing them would show a
# change on every plan, and rebuilding onboarding to apply a change gives the
# question new IDs, which wipes every member's picks. So the list is ignored
# after creation: change the default channels in Server Settings >
# Onboarding (the README says how).
resource "discord_server_onboarding" "this" {
  server_id           = var.server_id
  enabled             = true
  mode                = 0 # Discord's minimums count the default channels only
  default_channel_ids = local.default_channel_ids

  lifecycle {
    ignore_changes = [default_channel_ids]
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
