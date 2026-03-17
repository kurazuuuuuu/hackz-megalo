package grpcserver

import (
	"context"
	"fmt"
	"net"

	"google.golang.org/grpc"
)

type Config struct {
	Addr     string
	Register func(grpc.ServiceRegistrar)
	Options  []grpc.ServerOption
}

func ListenAndServe(ctx context.Context, cfg Config) error {
	if cfg.Addr == "" {
		return fmt.Errorf("grpc address is required")
	}
	if cfg.Register == nil {
		return fmt.Errorf("grpc register callback is required")
	}

	lis, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.Addr, err)
	}

	server := grpc.NewServer(cfg.Options...)
	cfg.Register(server)

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(lis)
	}()

	select {
	case <-ctx.Done():
		server.GracefulStop()
		return nil
	case err := <-errCh:
		return err
	}
}
