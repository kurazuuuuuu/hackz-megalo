package domain

import "time"

type Event struct {
	EventID   int32     `json:"event_id"`
	Seed      int64     `json:"seed"`
	TargetPod string    `json:"target_pod"`
	Source    string    `json:"source"`
	CreatedAt time.Time `json:"created_at"`
}

type SlaveState struct {
	PodID     string    `json:"pod_id"`
	Status    string    `json:"status"`
	Stress    int32     `json:"stress"`
	UpdatedAt time.Time `json:"updated_at"`
	Source    string    `json:"source"`
}
