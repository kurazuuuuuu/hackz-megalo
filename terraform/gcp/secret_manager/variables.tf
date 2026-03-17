variable "project_id" {
  description = "The ID of the GCP project"
  type        = string
}

variable "region" {
  description = "The default GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "secrets" {
  description = "A map of secret names to their corresponding payload values."
  type        = map(string)
  default     = {}
}
