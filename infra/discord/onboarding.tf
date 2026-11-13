# Owns the whole onboarding setup: anything added by hand in Server Settings >
# Onboarding is replaced on the next apply. Change it here instead.
resource "discord_server_onboarding" "this" {
  server_id = var.server_id
  enabled   = true
  mode      = 0

  # Every member sees these. Discord asks for at least 7, 5 of them chattable.
  default_channel_ids = [
    discord_text_channel.rules.id,
    discord_news_channel.announcements.id,
    discord_news_channel.upcoming_events.id,
    discord_text_channel.general.id,
    discord_text_channel.introductions.id,
    discord_forum_channel.jobs.id,
    discord_text_channel.show_and_tell.id,
    discord_text_channel.off_topic.id,
  ]

  prompt {
    title         = "Which user groups do you want to follow?"
    type          = 0
    single_select = false
    required      = false
    in_onboarding = true

    dynamic "option" {
      for_each = local.group_ids
      content {
        title       = local.groups[option.value].short
        description = local.groups[option.value].name
        channel_ids = [discord_category_channel.group[option.value].id]
        role_ids    = [discord_role.member[option.value].id]
      }
    }
  }
}
