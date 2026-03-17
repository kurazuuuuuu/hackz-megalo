package slaveapp

import (
	"context"
	"testing"

	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func TestExecuteEvent(t *testing.T) {
	service := &Service{PodID: "slave-1"}

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
	if resp.GetSlaveState().GetPodId() != "slave-1" {
		t.Fatalf("PodId = %q, want %q", resp.GetSlaveState().GetPodId(), "slave-1")
	}
}
