package controllerapp

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type RegistrationService struct {
	slavev1.UnimplementedControllerServiceServer
	Redis *redislayer.Client
}

func (s *RegistrationService) RegisterSlave(ctx context.Context, req *slavev1.RegisterSlaveRequest) (*slavev1.RegisterSlaveResponse, error) {
	if s.Redis == nil {
		return nil, fmt.Errorf("redis client is required")
	}

	sessionID, err := s.Redis.GetActiveSessionID(ctx)
	if err != nil {
		return nil, fmt.Errorf("get active session: %w", err)
	}

	now := time.Now().UTC()
	state := domain.SlaveState{
		SessionID:      sessionID,
		SlaveID:        uuid.NewString(),
		K8sPodName:     req.GetK8SPodName(),
		K8sPodUID:      req.GetK8SPodUid(),
		PodIP:          req.GetPodIp(),
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     0,
		RemainingTurns: req.GetInitialRemainingTurns(),
		ObservedAt:     now,
		Source:         "controller-service",
	}

	if err := s.Redis.PublishSlaveState(ctx, state); err != nil {
		return nil, fmt.Errorf("publish slave state: %w", err)
	}
	if _, err := s.Redis.UpdateSessionMetrics(ctx, sessionID, func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves++
		return metrics
	}); err != nil {
		return nil, fmt.Errorf("increment session live count: %w", err)
	}

	return &slavev1.RegisterSlaveResponse{
		SlaveId:    state.SlaveID,
		SlaveState: redislayer.ToProtoSlaveState(state),
	}, nil
}
