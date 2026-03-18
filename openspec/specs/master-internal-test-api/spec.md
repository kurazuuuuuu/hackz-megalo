# master-internal-test-api Specification

## Purpose
TBD - created by archiving change add-master-internal-test-api. Update Purpose after archive.
## Requirements
### Requirement: Internal Event Injection
The system SHALL provide an internal master HTTP endpoint for injecting test events.

#### Scenario: Internal event submission
- **WHEN** a caller sends an internal event request to `master-service`
- **THEN** `master-service` stores the event in Redis and publishes the event notification

### Requirement: Internal Slave State Inspection
The system SHALL provide internal master HTTP endpoints for inspecting canonical slave state stored in Redis.

#### Scenario: List slave states
- **WHEN** a caller requests the internal slave state list endpoint
- **THEN** `master-service` returns all stored slave states from Redis

#### Scenario: Get a single slave state
- **WHEN** a caller requests the internal slave state detail endpoint with a `slave_id`
- **THEN** `master-service` returns the matching canonical slave state from Redis

#### Scenario: Missing slave state
- **WHEN** a caller requests a `slave_id` that is not stored in Redis
- **THEN** `master-service` returns a not found response

