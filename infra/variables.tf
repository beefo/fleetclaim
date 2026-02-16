variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run services"
  type        = string
  default     = "us-central1"
}

variable "worker_image" {
  description = "Docker image for the worker (e.g., gcr.io/PROJECT/fleetclaim-worker:latest)"
  type        = string
}

variable "api_image" {
  description = "Docker image for the API (e.g., gcr.io/PROJECT/fleetclaim-api:latest)"
  type        = string
}

variable "share_link_base_url" {
  description = "Base URL for share links (e.g., https://fleetclaim.app)"
  type        = string
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for email notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_maps_api_key" {
  description = "Google Maps API key for static map images in PDFs (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "worker_schedule" {
  description = "Cron schedule for worker execution (Cloud Scheduler format)"
  type        = string
  default     = "*/5 * * * *" # Every 5 minutes
}

variable "worker_timeout" {
  description = "Timeout for worker job in seconds"
  type        = number
  default     = 300
}

variable "api_min_instances" {
  description = "Minimum number of API instances (0 for scale to zero)"
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "Maximum number of API instances"
  type        = number
  default     = 10
}
