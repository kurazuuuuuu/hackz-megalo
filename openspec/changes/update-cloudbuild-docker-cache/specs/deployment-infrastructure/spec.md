## ADDED Requirements
### Requirement: Cloud Build reuses deployable image layers
The deployment infrastructure SHALL configure Cloud Build to reuse previously published Docker image layers for each deployable application image.

#### Scenario: Subsequent build reuses the latest image as cache
- **WHEN** a Cloud Build trigger runs for an app that already has a published build cache in Artifact Registry
- **THEN** Cloud Build imports that registry cache before building
- **AND** the Docker build reuses unchanged layers from earlier multi-stage builder steps

#### Scenario: First build succeeds without a published cache image
- **WHEN** a Cloud Build trigger runs for an app that does not yet have a published registry cache image
- **THEN** the cache import is skipped
- **AND** the image still builds and publishes successfully
