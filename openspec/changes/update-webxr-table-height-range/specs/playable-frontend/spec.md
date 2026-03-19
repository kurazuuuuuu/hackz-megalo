## MODIFIED Requirements

### Requirement: Floor-Referenced XR Board Placement
The system SHALL place the XR board relative to the `local-floor` reference space instead of deriving height from the user's head pose.

#### Scenario: Player enters XR
- **WHEN** the player starts XR mode with `local-floor` available
- **THEN** the board appears in front of the player
- **AND** the board height is determined from a fixed floor-relative table height
- **AND** the board can be adjusted up to approximately standard desk height for room-scale play
- **AND** the board does not shift vertically based on the player's current head height
