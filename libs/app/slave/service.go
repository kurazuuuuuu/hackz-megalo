package slaveapp

import (
	"context"
	"sync"
	"time"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type Service struct {
	slavev1.UnimplementedSlaveServiceServer
	mu             sync.RWMutex
	SlaveID        string
	PodID          string
	K8sPodName     string
	K8sPodUID      string
	PodIP          string
	TurnsLived     int32
	RemainingTurns int32
}

func (s *Service) ExecuteEvent(_ context.Context, req *slavev1.ExecuteEventRequest) (*slavev1.ExecuteEventResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := domain.SlaveStatusLive
	deathReason := domain.DeathReasonUnspecified
	if req.GetTargetPod() != "" && req.GetTargetPod() != s.PodID {
		status = domain.SlaveStatusTerminating
		deathReason = domain.DeathReasonUserAction
	} else {
		s.TurnsLived++
		if s.RemainingTurns > 0 {
			s.RemainingTurns--
		}
		if s.RemainingTurns == 0 {
			status = domain.SlaveStatusTerminating
			deathReason = domain.DeathReasonLifespan
		}
	}

	return &slavev1.ExecuteEventResponse{
		Accepted: status == domain.SlaveStatusLive,
		Message:  "event handled by slave-service",
		SlaveState: &slavev1.SlaveState{
			SlaveId:        s.SlaveID,
			K8SPodName:     s.K8sPodName,
			K8SPodUid:      s.K8sPodUID,
			PodIp:          s.PodIP,
			Status:         toProtoStatus(status),
			DeathReason:    toProtoDeathReason(deathReason),
			TurnsLived:     s.TurnsLived,
			RemainingTurns: s.RemainingTurns,
			ObservedAt:     time.Now().UTC().Format(time.RFC3339),
		},
	}, nil
}

func (s *Service) SetRegistration(slaveID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.SlaveID = slaveID
}

func toProtoStatus(status domain.SlaveStatus) slavev1.SlaveStatus {
	switch status {
	case domain.SlaveStatusLive:
		return slavev1.SlaveStatus_SLAVE_STATUS_LIVE
	case domain.SlaveStatusTerminating:
		return slavev1.SlaveStatus_SLAVE_STATUS_TERMINATING
	case domain.SlaveStatusGone:
		return slavev1.SlaveStatus_SLAVE_STATUS_GONE
	default:
		return slavev1.SlaveStatus_SLAVE_STATUS_UNSPECIFIED
	}
}

func toProtoDeathReason(reason domain.DeathReason) slavev1.DeathReason {
	switch reason {
	case domain.DeathReasonLifespan:
		return slavev1.DeathReason_DEATH_REASON_LIFESPAN
	case domain.DeathReasonDisease:
		return slavev1.DeathReason_DEATH_REASON_DISEASE
	case domain.DeathReasonProcessDown:
		return slavev1.DeathReason_DEATH_REASON_PROCESS_DOWN
	case domain.DeathReasonPodDown:
		return slavev1.DeathReason_DEATH_REASON_POD_DOWN
	case domain.DeathReasonUserAction:
		return slavev1.DeathReason_DEATH_REASON_USER_ACTION
	default:
		return slavev1.DeathReason_DEATH_REASON_UNSPECIFIED
	}
}
