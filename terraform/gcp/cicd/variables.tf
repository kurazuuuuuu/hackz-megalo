variable "project_id" {
  type        = string
  description = "The Google Cloud Project ID"
}

variable "region" {
  type        = string
  description = "The Google Cloud Region"
  default     = "asia-northeast1"
}

variable "github_app_installation_id" {
  type        = string
  description = "Installation ID of the Cloud Build GitHub App"
  # You can find this ID in the URL when configuring the GitHub App installation
  # or via the GCP Console during initial setup.
}

variable "github_owner" {
  type        = string
  description = "GitHub repository owner (user or organization)"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository name"
}

variable "gke_cluster_name" {
  type        = string
  description = "Name of the GKE cluster for Cloud Deploy to target"
  default     = "hackz-megalo-cluster"
}
