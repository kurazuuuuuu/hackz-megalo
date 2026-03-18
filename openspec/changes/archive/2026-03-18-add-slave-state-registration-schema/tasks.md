## 1. Implementation
- [x] 1.1 Add OpenSpec deltas for slave registration and canonical state schema
- [x] 1.2 Extend protobuf definitions with registration RPC and richer `SlaveState`
- [x] 1.3 Update shared config, domain, and Redis layers for the new state fields
- [x] 1.4 Add controller-side slave registration handling and Redis publication
- [x] 1.5 Add slave startup registration flow and in-memory assigned `slave_id`
- [x] 1.6 Update master state subscription handling for the new schema
- [x] 1.7 Update compose configuration for controller registration endpoint and slave metadata
- [x] 1.8 Validate with OpenSpec, Go tests, and compose runtime verification
