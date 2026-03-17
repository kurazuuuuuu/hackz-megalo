package slaveapp

import (
	"context"
	"time"

	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type Service struct {
	slavev1.UnimplementedSlaveServiceServer
	PodID string
}

func (s *Service) ExecuteEvent(_ context.Context, req *slavev1.ExecuteEventRequest) (*slavev1.ExecuteEventResponse, error) {
	status := "ready"
	if req.GetTargetPod() != "" && req.GetTargetPod() != s.PodID {
		status = "ignored"
	}

	return &slavev1.ExecuteEventResponse{
		Accepted: status == "ready",
		Message:  "event handled by slave-service",
		SlaveState: &slavev1.SlaveState{
			PodId:     s.PodID,
			Status:    status,
			Stress:    req.GetEventId() * 10,
			UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		},
	}, nil
}
