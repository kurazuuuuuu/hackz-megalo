package slaveapp

import (
	"context"
	"testing"

	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func TestExecuteEvent(t *testing.T) {
	service := &Service{
		SlaveID:        "slave-id-1",
		PodID:          "slave-1",
		K8sPodName:     "slave-service-0",
		K8sPodUID:      "uid-1",
		PodIP:          "10.0.0.10",
		TurnsLived:     0,
		RemainingTurns: 3,
	}

	resp, err := service.ExecuteEvent(context.Background(), &slavev1.ExecuteEventRequest{
		EventId:   4,
		Seed:      11,
		TargetPod: "slave-1",
	})
	if err != nil {
		t.Fatalf("ExecuteEvent() error = %v", err)
	}
	if !resp.GetAccepted() {
		t.Fatalf("Accepted = false, want true")
	}
	if resp.GetSlaveState().GetSlaveId() != "slave-id-1" {
		t.Fatalf("SlaveId = %q, want %q", resp.GetSlaveState().GetSlaveId(), "slave-id-1")
	}
	if resp.GetSlaveState().GetStatus() != slavev1.SlaveStatus_SLAVE_STATUS_LIVE {
		t.Fatalf("unexpected status: %v", resp.GetSlaveState().GetStatus())
	}
	if resp.GetSlaveState().GetTurnsLived() != 1 {
		t.Fatalf("TurnsLived = %d, want %d", resp.GetSlaveState().GetTurnsLived(), 1)
	}
}
