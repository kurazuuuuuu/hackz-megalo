# Change: enable Cloud Build Docker layer cache reuse

## Why
Cloud Build currently rebuilds all deployable images from scratch on every `main` push. The trigger does not pull any prior image nor pass a cache source into `docker build`, so repeated builds pay the full dependency and compilation cost even when only a subset of files changed.

## What Changes
- Add an OpenSpec requirement that deployable app images reuse previously published Docker layers in Cloud Build
- Update the Terraform-managed Cloud Build trigger to use Docker Buildx with a per-app registry cache image so multi-stage builder layers are preserved across builds
- Narrow Go service Docker build contexts so unrelated app changes do not invalidate the service build layers
- Tighten `.dockerignore` so the Docker daemon receives a smaller build context

## Impact
- Affected specs: `deployment-infrastructure`
- Affected code: `terraform/gcp/deploy/cloudbuild.tf`, service Dockerfiles, `.dockerignore`
