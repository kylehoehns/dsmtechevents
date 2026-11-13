terraform {
  # 1.10 brought locking with a lock file in the bucket (use_lockfile).
  required_version = ">= 1.10"

  # State lives in Cloudflare R2, which speaks the S3 API. The endpoint
  # (https://<account id>.r2.cloudflarestorage.com) comes from the
  # AWS_ENDPOINT_URL_S3 environment variable and the R2 key pair from
  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY; see the README.
  backend "s3" {
    bucket       = "dsmtechevents-tofu-state"
    key          = "discord/terraform.tfstate"
    region       = "auto"
    use_lockfile = true

    # R2 is not AWS: skip the AWS-only checks.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }

  required_providers {
    discord = {
      source  = "lucky3028/discord"
      version = "~> 2.7"
    }
  }
}

# The bot token comes from the DISCORD_TOKEN environment variable, never a file.
provider "discord" {}
