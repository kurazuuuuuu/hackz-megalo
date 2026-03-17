locals {
  apps = [
    "frontend-webxr",
    "controller-service",
    "master-service",
    "slave-service"
  ]

  app_included_files = {
    "frontend-webxr" = [
      ".dockerignore",
      "apps/frontend-webxr/**"
    ]
    "controller-service" = [
      ".dockerignore",
      "apps/controller-service/**",
      "go.mod",
      "go.sum",
      "libs/**"
    ]
    "master-service" = [
      ".dockerignore",
      "apps/master-service/**",
      "go.mod",
      "go.sum",
      "libs/**"
    ]
    "slave-service" = [
      ".dockerignore",
      "apps/slave-service/**",
      "go.mod",
      "go.sum",
      "libs/**"
    ]
  }
}

# Cloud Build v2 Connection to GitHub
data "google_secret_manager_secret" "github_token" {
  secret_id = "github-token-secret"
}

resource "google_secret_manager_secret_iam_member" "github_token_cloudbuild_service_agent" {
  secret_id = data.google_secret_manager_secret.github_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.cloudbuild_service_agent}"
}

resource "google_cloudbuildv2_connection" "github_conn" {
  location = var.region
  name     = "github-connection"

  github_config {
    app_installation_id = var.github_app_installation_id
    authorizer_credential {
      oauth_token_secret_version = "projects/${var.project_id}/secrets/github-token-secret/versions/latest" # Assumption: User will need to configure this secret or authenticate manually
    }
  }

  lifecycle {
    ignore_changes = [
      github_config[0].authorizer_credential
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.github_token_cloudbuild_service_agent
  ]
}

resource "google_cloudbuildv2_repository" "github_repo" {
  location          = var.region
  name              = var.github_repository
  parent_connection = google_cloudbuildv2_connection.github_conn.name
  remote_uri        = "https://github.com/${var.github_owner}/${var.github_repository}.git"
}


# PR Triggers: Only run docker build to ensure code compiles.
resource "google_cloudbuild_trigger" "pr_trigger" {
  for_each = toset(local.apps)

  location        = var.region
  name            = "${each.key}-pr-trigger"
  description     = "Trigger for PRs modifying ${each.key}"
  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.cicd_build_sa.email}"

  repository_event_config {
    repository = google_cloudbuildv2_repository.github_repo.id
    pull_request {
      branch = ".*main.*"
    }
  }

  included_files = local.app_included_files[each.key]

  build {
    step {
      id         = "build-image"
      name       = "gcr.io/cloud-builders/docker"
      entrypoint = "bash"
      args = [
        "-c",
        <<-EOT
          if [ "${each.key}" = "frontend-webxr" ]; then
            docker build \
              -f apps/${each.key}/Dockerfile \
              --build-arg VITE_API_BASE_URL="$$VITE_API_BASE_URL" \
              --build-arg VITE_WS_URL="$$VITE_WS_URL" \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:pr-$SHORT_SHA \
              .
          else
            docker build \
              -f apps/${each.key}/Dockerfile \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:pr-$SHORT_SHA \
              .
          fi
        EOT
      ]
      secret_env = ["VITE_API_BASE_URL", "VITE_WS_URL"]
    }

    available_secrets {
      secret_manager {
        env          = "VITE_API_BASE_URL"
        version_name = "projects/${var.project_id}/secrets/vite-api-base-url/versions/latest"
      }
      secret_manager {
        env          = "VITE_WS_URL"
        version_name = "projects/${var.project_id}/secrets/vite-ws-url/versions/latest"
      }
    }
  }
}

# Push Triggers: Build, push to Artifact Registry, and trigger Cloud Deploy release.
resource "google_cloudbuild_trigger" "push_trigger" {
  for_each = toset(local.apps)

  location        = var.region
  name            = "${each.key}-main-trigger"
  description     = "Trigger for pushes to main modifying ${each.key}"
  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.cicd_build_sa.email}"

  repository_event_config {
    repository = google_cloudbuildv2_repository.github_repo.id
    push {
      branch = ".*main.*"
    }
  }

  included_files = local.app_included_files[each.key]

  build {
    step {
      id         = "build-image"
      name       = "gcr.io/cloud-builders/docker"
      entrypoint = "bash"
      args = [
        "-c",
        <<-EOT
          if [ "${each.key}" = "frontend-webxr" ]; then
            docker build \
              -f apps/${each.key}/Dockerfile \
              --build-arg VITE_API_BASE_URL="$$VITE_API_BASE_URL" \
              --build-arg VITE_WS_URL="$$VITE_WS_URL" \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:$COMMIT_SHA \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:latest \
              .
          else
            docker build \
              -f apps/${each.key}/Dockerfile \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:$COMMIT_SHA \
              -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:latest \
              .
          fi
        EOT
      ]
      secret_env = ["VITE_API_BASE_URL", "VITE_WS_URL"]
    }

    step {
      id   = "push-image"
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}"
      ]
    }

    step {
      id         = "create-release"
      name       = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      entrypoint = "bash"
      args = [
        "-c",
        <<-EOT
          gcloud deploy releases create release-$SHORT_SHA \
            --delivery-pipeline=${each.key}-pipeline \
            --region=${var.region} \
            --gcs-source-staging-dir=gs://${google_storage_bucket.clouddeploy_staging.name}/source \
            --skaffold-file=skaffold.yaml \
            --images=${each.key}=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/${each.key}:$COMMIT_SHA
        EOT
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    available_secrets {
      secret_manager {
        env          = "VITE_API_BASE_URL"
        version_name = "projects/${var.project_id}/secrets/vite-api-base-url/versions/latest"
      }
      secret_manager {
        env          = "VITE_WS_URL"
        version_name = "projects/${var.project_id}/secrets/vite-ws-url/versions/latest"
      }
    }
  }
}
