# Change: add Memorystore Redis for GKE production

## Why
The production deployment currently expects an in-cluster Redis service name, but the deploy stack does not provision Redis for production. We need a managed Redis instance on GCP that GKE workloads can reach over the deploy VPC without changing the application contract.

## What Changes
- Provision MemoryStore for Redis in the deploy VPC using Terraform
- Establish Private Service Access for the deploy VPC
- Publish the Redis endpoint into the GKE cluster through a Terraform-managed ConfigMap
- Update the production overlay so backend services read their Redis address from that ConfigMap
- Enable any required GCP APIs for Private Service Access

## Impact
- Affected specs: `deployment-infrastructure`
- Affected code: `terraform/gcp/project`, `terraform/gcp/deploy`, `k8s-manifests/overlays/production`
