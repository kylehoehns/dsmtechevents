terraform {
  required_version = ">= 1.6"

  required_providers {
    discord = {
      source  = "lucky3028/discord"
      version = "~> 2.7"
    }
  }
}

# The bot token comes from the DISCORD_TOKEN environment variable, never a file.
provider "discord" {}
