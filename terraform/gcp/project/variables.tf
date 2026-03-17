variable "project_id" {
  type        = string
  description = "The Google Cloud Project ID"
}

variable "gcp_services" {
  type        = list(string)
  description = "List of Google Cloud APIs to enable"
  default = [
    "container.googleapis.com",           # Kubernetes Engine
    "compute.googleapis.com",             # Compute Engine (Required for default SA)
    "redis.googleapis.com",               # Memorystore for Redis
    "logging.googleapis.com",             # Logging
    "clouderrorreporting.googleapis.com", # Error Reporting
    "cloudbuild.googleapis.com",          # Cloud Build
    "clouddeploy.googleapis.com",         # Cloud Deploy
    "artifactregistry.googleapis.com",    # Artifact Registry
    "secretmanager.googleapis.com",       # Secret Manager
  ]
}
