package controllerapp

import (
	"context"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func TestRegisterSlave(t *testing.T) {
	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	if err := client.CreateSession(context.Background(), domain.SessionMeta{
		SessionID: "session-1",
		StartedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	service := &RegistrationService{Redis: client}
	resp, err := service.RegisterSlave(context.Background(), &slavev1.RegisterSlaveRequest{
		K8SPodName:            "slave-service-0",
		K8SPodUid:             "uid-1",
		PodIp:                 "10.0.0.10",
		InitialRemainingTurns: 12,
	})
	if err != nil {
		t.Fatalf("RegisterSlave() error = %v", err)
	}
	if resp.GetSlaveId() == "" {
		t.Fatalf("SlaveId should not be empty")
	}
	if resp.GetSlaveState().GetStatus() != slavev1.SlaveStatus_SLAVE_STATUS_LIVE {
		t.Fatalf("unexpected status: %v", resp.GetSlaveState().GetStatus())
	}
	if resp.GetSlaveState().GetSessionId() != "session-1" {
		t.Fatalf("SessionId = %q, want %q", resp.GetSlaveState().GetSessionId(), "session-1")
	}

	metrics, err := client.GetSessionMetrics(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("GetSessionMetrics() error = %v", err)
	}
	if metrics.LiveSlaves != 1 {
		t.Fatalf("LiveSlaves = %d, want %d", metrics.LiveSlaves, 1)
	}
}
