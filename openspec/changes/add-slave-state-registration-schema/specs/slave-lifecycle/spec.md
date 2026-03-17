## ADDED Requirements

### Requirement: Slave Self-Registration
The system SHALL allow each `slave-service` instance to register itself with `controller-service` when it starts.

#### Scenario: Slave registers after startup
- **WHEN** a `slave-service` instance starts with its Kubernetes metadata and pod IP
- **THEN** it sends a registration request to `controller-service`

#### Scenario: Controller assigns a new logical slave identity
- **WHEN** `controller-service` receives a registration request
- **THEN** it issues a new UUID `slave_id` for that pod instance and returns it to the slave

### Requirement: Canonical Slave State
The system SHALL represent slave state with a canonical schema shared across gRPC responses and Redis payloads.

#### Scenario: Controller stores registered slave state
- **WHEN** a slave registration succeeds
- **THEN** `controller-service` stores a `SlaveState` containing `slave_id`, Kubernetes metadata, pod IP, status, death reason, turn counters, and observation time

#### Scenario: Slave returns canonical state after an event
- **WHEN** `slave-service` responds to an event execution request
- **THEN** it includes the canonical `SlaveState` in the gRPC response

### Requirement: Lifespan-Aware Status Representation
The system SHALL represent both active and terminal slave lifecycle states.

#### Scenario: Live slave state
- **WHEN** a slave is active after registration
- **THEN** its state uses `SLAVE_STATUS_LIVE`

#### Scenario: Lifespan termination is represented
- **WHEN** a slave reaches the end of its lifespan
- **THEN** its state can represent a terminal lifecycle with `SLAVE_STATUS_TERMINATING` or `SLAVE_STATUS_GONE` and `DEATH_REASON_LIFESPAN`

### Requirement: Redis Publication of Slave State Changes
The system SHALL publish slave state changes to Redis so that `master-service` can observe them.

#### Scenario: Registration state is published
- **WHEN** `controller-service` accepts a slave registration
- **THEN** it publishes the new `SlaveState` to the slave state Redis channel

#### Scenario: Event-updated state is published
- **WHEN** `controller-service` receives an updated state from a slave
- **THEN** it stores and publishes that updated `SlaveState` to Redis
