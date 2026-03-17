package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

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

	service := &slaveapp.Service{
		PodID:          cfg.PodID,
		K8sPodName:     cfg.K8sPodName,
		K8sPodUID:      cfg.K8sPodUID,
		PodIP:          cfg.PodIP,
		RemainingTurns: cfg.InitialRemainingTurns,
	}

	go registerWithController(ctx, cfg, service)

	log.Printf("slave-service listening on %s as %s", cfg.GRPCAddr, cfg.PodID)
	if err := grpcserver.ListenAndServe(ctx, grpcserver.Config{
		Addr: cfg.GRPCAddr,
		Register: func(server grpc.ServiceRegistrar) {
			slavev1.RegisterSlaveServiceServer(server, service)
		},
	}); err != nil {
		log.Fatalf("grpc listen and serve: %v", err)
	}
}

func registerWithController(ctx context.Context, cfg config.SlaveConfig, service *slaveapp.Service) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := grpc.DialContext(
			ctx,
			cfg.ControllerGRPCTarget,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			log.Printf("dial controller grpc: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		client := slavev1.NewControllerServiceClient(conn)
		registrationCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		resp, err := client.RegisterSlave(registrationCtx, &slavev1.RegisterSlaveRequest{
			K8SPodName:            cfg.K8sPodName,
			K8SPodUid:             cfg.K8sPodUID,
			PodIp:                 cfg.PodIP,
			InitialRemainingTurns: cfg.InitialRemainingTurns,
		})
		cancel()
		_ = conn.Close()
		if err != nil {
			log.Printf("register slave: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		service.SetRegistration(resp.GetSlaveId())
		log.Printf("registered slave with slave_id=%s", resp.GetSlaveId())
		return
	}
}
