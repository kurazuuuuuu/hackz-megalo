# Change: update single pod slave lifecycle

## Why
The current runtime simulates many Pods inside one `slave-service` process, which does not match the intended deployment model. We need each `slave-service` instance to represent exactly one Kubernetes Pod and let `controller-service` notify a dead slave process to exit so Kubernetes can restart it.

## What Changes
- Replace multi-Pod simulation inside `slave-service` with a single-Pod runtime model
- Route controller event execution to the specific slave Pod using the Pod state stored in Redis
- Make `controller-service` notify a gone slave process to shut down and rely on Kubernetes restart behavior
- Remove slave multi-Pod count configuration from the runtime path

## Impact
- Affected specs: `single-pod-slave-runtime`
- Affected code: `apps/controller-service`, `apps/slave-service`, `libs/app/slave`, `libs/config`, `libs/infra`
