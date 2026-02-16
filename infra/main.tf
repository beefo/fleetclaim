terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
  ])
  
  service            = each.value
  disable_on_destroy = false
}

# Generate a random signing key for share links
resource "random_password" "share_link_signing_key" {
  length  = 32
  special = false
}

# ----- Secrets -----

resource "google_secret_manager_secret" "share_link_signing_key" {
  secret_id = "fleetclaim-share-link-signing-key"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "share_link_signing_key" {
  secret      = google_secret_manager_secret.share_link_signing_key.id
  secret_data = random_password.share_link_signing_key.result
}

resource "google_secret_manager_secret" "sendgrid_api_key" {
  count     = var.sendgrid_api_key != "" ? 1 : 0
  secret_id = "fleetclaim-sendgrid-api-key"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "sendgrid_api_key" {
  count       = var.sendgrid_api_key != "" ? 1 : 0
  secret      = google_secret_manager_secret.sendgrid_api_key[0].id
  secret_data = var.sendgrid_api_key
}

resource "google_secret_manager_secret" "google_maps_api_key" {
  count     = var.google_maps_api_key != "" ? 1 : 0
  secret_id = "fleetclaim-google-maps-api-key"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "google_maps_api_key" {
  count       = var.google_maps_api_key != "" ? 1 : 0
  secret      = google_secret_manager_secret.google_maps_api_key[0].id
  secret_data = var.google_maps_api_key
}

# ----- Service Account -----

resource "google_service_account" "fleetclaim" {
  account_id   = "fleetclaim"
  display_name = "FleetClaim Service Account"
}

# Grant access to secrets
resource "google_secret_manager_secret_iam_member" "signing_key_access" {
  secret_id = google_secret_manager_secret.share_link_signing_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.fleetclaim.email}"
}

resource "google_secret_manager_secret_iam_member" "sendgrid_access" {
  count     = var.sendgrid_api_key != "" ? 1 : 0
  secret_id = google_secret_manager_secret.sendgrid_api_key[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.fleetclaim.email}"
}

resource "google_secret_manager_secret_iam_member" "maps_access" {
  count     = var.google_maps_api_key != "" ? 1 : 0
  secret_id = google_secret_manager_secret.google_maps_api_key[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.fleetclaim.email}"
}

# Grant access to list secrets with fleetclaim-creds- prefix
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.fleetclaim.email}"
  
  condition {
    title       = "FleetClaim credentials only"
    description = "Allow access to FleetClaim-prefixed secrets"
    expression  = "resource.name.startsWith(\"projects/${var.project_id}/secrets/fleetclaim-\")"
  }
}

# ----- Cloud Run Worker -----

resource "google_cloud_run_v2_job" "worker" {
  name     = "fleetclaim-worker"
  location = var.region
  
  template {
    template {
      containers {
        image = var.worker_image
        
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        
        env {
          name  = "SHARE_LINK_BASE_URL"
          value = var.share_link_base_url
        }
        
        env {
          name = "SHARE_LINK_SIGNING_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.share_link_signing_key.secret_id
              version = "latest"
            }
          }
        }
        
        dynamic "env" {
          for_each = var.sendgrid_api_key != "" ? [1] : []
          content {
            name  = "USE_SENDGRID"
            value = "true"
          }
        }
        
        dynamic "env" {
          for_each = var.sendgrid_api_key != "" ? [1] : []
          content {
            name = "SENDGRID_API_KEY"
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.sendgrid_api_key[0].secret_id
                version = "latest"
              }
            }
          }
        }
        
        dynamic "env" {
          for_each = var.google_maps_api_key != "" ? [1] : []
          content {
            name = "GOOGLE_MAPS_API_KEY"
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.google_maps_api_key[0].secret_id
                version = "latest"
              }
            }
          }
        }
        
        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
      
      timeout         = "${var.worker_timeout}s"
      service_account = google_service_account.fleetclaim.email
    }
  }
  
  depends_on = [google_project_service.apis]
}

# ----- Cloud Run API -----

resource "google_cloud_run_v2_service" "api" {
  name     = "fleetclaim-api"
  location = var.region
  
  template {
    containers {
      image = var.api_image
      
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      
      env {
        name = "SHARE_LINK_SIGNING_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.share_link_signing_key.secret_id
            version = "latest"
          }
        }
      }
      
      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }
      
      ports {
        container_port = 8080
      }
    }
    
    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }
    
    service_account = google_service_account.fleetclaim.email
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  depends_on = [google_project_service.apis]
}

# Allow unauthenticated access to API (public share links)
resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ----- Cloud Scheduler -----

resource "google_cloud_scheduler_job" "worker_trigger" {
  name        = "fleetclaim-worker-trigger"
  description = "Triggers FleetClaim worker to poll for new incidents"
  schedule    = var.worker_schedule
  time_zone   = "UTC"
  
  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.worker.name}:run"
    
    oauth_token {
      service_account_email = google_service_account.fleetclaim.email
    }
  }
  
  depends_on = [google_project_service.apis]
}

# Grant scheduler permission to invoke worker
resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  location = google_cloud_run_v2_job.worker.location
  name     = google_cloud_run_v2_job.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.fleetclaim.email}"
}

# ----- Outputs -----

output "api_url" {
  description = "URL of the FleetClaim API"
  value       = google_cloud_run_v2_service.api.uri
}

output "worker_name" {
  description = "Name of the worker Cloud Run job"
  value       = google_cloud_run_v2_job.worker.name
}

output "service_account_email" {
  description = "Service account email for FleetClaim"
  value       = google_service_account.fleetclaim.email
}

output "share_link_signing_key_secret" {
  description = "Secret Manager secret ID for the share link signing key"
  value       = google_secret_manager_secret.share_link_signing_key.secret_id
}
