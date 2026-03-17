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
		InitialRemainingTurns: cfg.InitialRemainingTurns,
	}
	service.SetupPopulation(cfg.PodID, cfg.K8sPodName, cfg.K8SPodUID, cfg.PodIP, cfg.PodCount)

	go registerWithController(ctx, cfg, service)

	log.Printf("slave-service listening on %s with %d simulated pods", cfg.GRPCAddr, cfg.PodCount)
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

		pendingPods := service.UnregisteredPods()
		if len(pendingPods) == 0 {
			return
		}

		failed := false
		for _, pod := range pendingPods {
			conn, err := grpc.DialContext(
				ctx,
				cfg.ControllerGRPCTarget,
				grpc.WithTransportCredentials(insecure.NewCredentials()),
			)
			if err != nil {
				log.Printf("dial controller grpc: %v", err)
				failed = true
				continue
			}

			client := slavev1.NewControllerServiceClient(conn)
			registrationCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			resp, err := client.RegisterSlave(registrationCtx, &slavev1.RegisterSlaveRequest{
				K8SPodName:            pod.K8SPodName,
				K8SPodUid:             pod.K8SPodUID,
				PodIp:                 pod.PodIP,
				InitialRemainingTurns: pod.InitialTurn,
			})
			cancel()
			_ = conn.Close()
			if err != nil {
				log.Printf("register slave %s: %v", pod.PodID, err)
				failed = true
				continue
			}

			service.SetRegistration(pod.PodID, resp.GetSlaveId())
			log.Printf("registered pod %s as slave_id=%s", pod.PodID, resp.GetSlaveId())
		}

		if !failed {
			return
		}
		time.Sleep(2 * time.Second)
	}
}
