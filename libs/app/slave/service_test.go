package slaveapp

import (
	"context"
	"testing"
	"time"

	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func TestExecuteEvent(t *testing.T) {
	service := &Service{
		InitialRemainingTurns: 3,
	}
	service.SetupPod("slave-1", "slave-service-0", "uid-1", "10.0.0.10")
	service.SetRegistration("slave-id-1")

	resp, err := service.ExecuteEvent(context.Background(), &slavev1.ExecuteEventRequest{
		EventId:   4,
		Seed:      11,
		TargetPod: "slave-id-1",
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
	if resp.GetSlaveState().GetFirewall() != true {
		t.Fatalf("Firewall = false, want true")
	}
}

func TestExecuteEventTargetsSinglePod(t *testing.T) {
	service := &Service{
		InitialRemainingTurns: 3,
	}
	service.SetupPod("slave-1", "slave-service-0", "uid-1", "10.0.0.10")
	service.SetRegistration("slave-id-1")

	_, err := service.ExecuteEvent(context.Background(), &slavev1.ExecuteEventRequest{
		EventId:   2,
		Seed:      11,
		TargetPod: "another-slave",
	})
	if err == nil {
		t.Fatalf("ExecuteEvent() error = nil, want target pod not found")
	}
}

func TestShutdownInvokesCallbackOnce(t *testing.T) {
	calls := make(chan string, 2)
	service := &Service{
		OnShutdown: func(reason string) {
			calls <- reason
		},
	}

	if _, err := service.Shutdown(context.Background(), &slavev1.ShutdownRequest{Reason: "gone"}); err != nil {
		t.Fatalf("Shutdown() first error = %v", err)
	}
	if _, err := service.Shutdown(context.Background(), &slavev1.ShutdownRequest{Reason: "ignored"}); err != nil {
		t.Fatalf("Shutdown() second error = %v", err)
	}

	select {
	case reason := <-calls:
		if reason != "gone" {
			t.Fatalf("reason = %q, want %q", reason, "gone")
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown callback was not invoked")
	}

	select {
	case reason := <-calls:
		t.Fatalf("unexpected second callback with reason %q", reason)
	default:
	}
}
