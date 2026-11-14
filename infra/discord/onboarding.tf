locals {
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

# Onboarding is set by scripts/discord-onboarding.mjs, which the discord
# workflow runs after each apply, from this output. The provider keeps each
# answer's Discord ID by its place in the list, and members' picks are saved
# by that ID, so it can't list the groups alphabetically without scrambling
# everyone's picks when a group is added mid-alphabet. The script matches
# each answer to its group by the member role instead, so the ID follows the
# group. It compares the default channels as a set, too, since Discord hands
# them back in its own order.
output "onboarding" {
  value = {
    default_channel_ids = local.default_channel_ids
    groups = [for id in local.group_ids : {
      short    = local.groups[id].short
      name     = local.groups[id].name
      role     = discord_role.member[id].id
      category = discord_category_channel.group[id].id
    }]
  }
}

# Onboarding used to be managed here. Forget it without deleting it: deleting
# would turn onboarding off and give the question new IDs, which loses every
# member's picks.
removed {
  from = discord_server_onboarding.this
  lifecycle {
    destroy = false
  }
}
