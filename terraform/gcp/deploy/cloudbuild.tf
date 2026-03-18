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

  release_included_files = distinct(flatten(values(local.app_included_files)))
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

# Push Trigger: Build all deployable images, push them, and create a single Cloud Deploy release.
resource "google_cloudbuild_trigger" "push_trigger" {
  location        = var.region
  name            = "main-release-trigger"
  description     = "Build deployable images on main and create a single Cloud Deploy release"
  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.cicd_build_sa.email}"

  repository_event_config {
    repository = google_cloudbuildv2_repository.github_repo.id
    push {
      branch = ".*main.*"
    }
  }

  included_files = local.release_included_files

  build {
    step {
      id         = "build-images"
      name       = "gcr.io/cloud-builders/docker"
      entrypoint = "bash"
      args = [
        "-c",
        <<-EOT
          for app in ${join(" ", local.apps)}; do
            if [ "$app" = "frontend-webxr" ]; then
              docker build \
                -f apps/$app/Dockerfile \
                --build-arg VITE_API_BASE_URL="$$VITE_API_BASE_URL" \
                --build-arg VITE_WS_URL="$$VITE_WS_URL" \
                -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/$app:$COMMIT_SHA \
                -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/$app:latest \
                .
            else
              docker build \
                -f apps/$app/Dockerfile \
                -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/$app:$COMMIT_SHA \
                -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/$app:latest \
                .
            fi
          done
        EOT
      ]
      secret_env = ["VITE_API_BASE_URL", "VITE_WS_URL"]
    }

    step {
      id         = "push-images"
      name       = "gcr.io/cloud-builders/docker"
      entrypoint = "bash"
      args = [
        "-c",
        <<-EOT
          for app in ${join(" ", local.apps)}; do
            docker push \
              --all-tags \
              ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/$app
          done
        EOT
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
            --delivery-pipeline=hackz-megalo-pipeline \
            --region=${var.region} \
            --gcs-source-staging-dir=gs://${google_storage_bucket.clouddeploy_staging.name}/source \
            --skaffold-file=skaffold.yaml \
            --images=frontend-webxr=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/frontend-webxr:$COMMIT_SHA,controller-service=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/controller-service:$COMMIT_SHA,master-service=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/master-service:$COMMIT_SHA,slave-service=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hackz_megalo_repo.repository_id}/slave-service:$COMMIT_SHA
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
