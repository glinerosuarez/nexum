variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "web_image" {
  type = string
}

variable "api_image" {
  type = string
}

variable "db_instance_name" {
  type    = string
  default = "nexum-postgres"
}

variable "db_name" {
  type    = string
  default = "nexum"
}

variable "firebase_project_id" {
  type = string
}

variable "supply_agent_mcp_url" {
  type = string
}

variable "supply_agent_mcp_required" {
  type    = string
  default = "true"
}
