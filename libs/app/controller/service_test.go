package controllerapp

import (
	"context"
	"testing"

	miniredis "github.com/alicebob/miniredis/v2"

	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func TestRegisterSlave(t *testing.T) {
	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

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
}
