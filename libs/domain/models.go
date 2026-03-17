package domain

import "time"

type SlaveStatus string

const (
	SlaveStatusUnspecified SlaveStatus = "SLAVE_STATUS_UNSPECIFIED"
	SlaveStatusLive        SlaveStatus = "SLAVE_STATUS_LIVE"
	SlaveStatusTerminating SlaveStatus = "SLAVE_STATUS_TERMINATING"
	SlaveStatusGone        SlaveStatus = "SLAVE_STATUS_GONE"
)

type DeathReason string

const (
	DeathReasonUnspecified DeathReason = "DEATH_REASON_UNSPECIFIED"
	DeathReasonLifespan    DeathReason = "DEATH_REASON_LIFESPAN"
	DeathReasonDisease     DeathReason = "DEATH_REASON_DISEASE"
	DeathReasonProcessDown DeathReason = "DEATH_REASON_PROCESS_DOWN"
	DeathReasonPodDown     DeathReason = "DEATH_REASON_POD_DOWN"
	DeathReasonUserAction  DeathReason = "DEATH_REASON_USER_ACTION"
)

type Event struct {
	EventID   int32     `json:"event_id"`
	Seed      int64     `json:"seed"`
	TargetPod string    `json:"target_pod"`
	Source    string    `json:"source"`
	CreatedAt time.Time `json:"created_at"`
}

type SlaveState struct {
	SlaveID        string      `json:"slave_id"`
	K8sPodName     string      `json:"k8s_pod_name"`
	K8sPodUID      string      `json:"k8s_pod_uid"`
	PodIP          string      `json:"pod_ip"`
	Status         SlaveStatus `json:"status"`
	DeathReason    DeathReason `json:"death_reason"`
	TurnsLived     int32       `json:"turns_lived"`
	RemainingTurns int32       `json:"remaining_turns"`
	ObservedAt     time.Time   `json:"observed_at"`
	Source         string      `json:"source"`
}
