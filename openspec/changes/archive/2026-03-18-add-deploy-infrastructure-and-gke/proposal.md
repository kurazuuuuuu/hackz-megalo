# Change: add deploy infrastructure and minimal GKE cluster

## Why
The current Terraform layout now centers on deployment orchestration and cluster provisioning. We need a clearer `deploy` boundary and a minimal GKE cluster managed alongside the delivery pipeline so the application can be deployed end-to-end from Terraform.

## What Changes
- Rename the Terraform deployment stack to `deploy`
- Keep Cloud Build, Artifact Registry, Cloud Deploy, and related IAM under the new `deploy` boundary
- Add Terraform-managed GKE infrastructure for the target environment
- Provision a minimal-cost GKE Autopilot cluster suitable for the existing Cloud Deploy target
- Update any internal references, variables, and documentation paths that still point at the old stack path

## Impact
- Affected specs: `deployment-infrastructure`
- Affected code: `terraform/gcp/deploy`, `terraform/gcp/project`, `terraform/gcp/secret_manager`, repository docs and references to Terraform paths
