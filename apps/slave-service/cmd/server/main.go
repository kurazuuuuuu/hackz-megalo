package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	slaveapp "github.com/kurazuuuuuu/hackz-megalo/libs/app/slave"
	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
	grpcserver "github.com/kurazuuuuuu/hackz-megalo/libs/server/grpc"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func main() {
	cfg, err := config.LoadSlave()
	if err != nil {
		log.Fatalf("load slave config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("slave-service listening on %s as %s", cfg.GRPCAddr, cfg.PodID)
	if err := grpcserver.ListenAndServe(ctx, grpcserver.Config{
		Addr: cfg.GRPCAddr,
		Register: func(server grpc.ServiceRegistrar) {
			slavev1.RegisterSlaveServiceServer(server, &slaveapp.Service{PodID: cfg.PodID})
		},
	}); err != nil {
		log.Fatalf("grpc listen and serve: %v", err)
	}
}
