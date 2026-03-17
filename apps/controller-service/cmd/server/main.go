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

	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

func main() {
	cfg, err := config.LoadController()
	if err != nil {
		log.Fatalf("load controller config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	redisClient := redislayer.New(cfg.Redis.Addr, cfg.Redis.EventsChannel, cfg.Redis.StatesChannel)
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Printf("close redis: %v", err)
		}
	}()

	if err := redisClient.Ping(ctx); err != nil {
		log.Fatalf("ping redis: %v", err)
	}

	conn, err := grpc.DialContext(
		ctx,
		cfg.SlaveGRPCTarget,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Fatalf("dial slave grpc: %v", err)
	}
	defer func() {
		if err := conn.Close(); err != nil {
			log.Printf("close grpc conn: %v", err)
		}
	}()

	client := slavev1.NewSlaveServiceClient(conn)
	pubsub := redisClient.SubscribeEvents(ctx)
	defer func() {
		if err := pubsub.Close(); err != nil {
			log.Printf("close redis pubsub: %v", err)
		}
	}()

	log.Printf("controller-service consuming Redis events and dispatching to %s", cfg.SlaveGRPCTarget)

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-pubsub.Channel():
			if !ok {
				return
			}

			event, err := redislayer.DecodeEvent(msg.Payload)
			if err != nil {
				log.Printf("decode event: %v", err)
				continue
			}

			rpcCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			resp, err := client.ExecuteEvent(rpcCtx, &slavev1.ExecuteEventRequest{
				EventId:   event.EventID,
				Seed:      event.Seed,
				TargetPod: event.TargetPod,
			})
			cancel()
			if err != nil {
				log.Printf("execute event: %v", err)
				continue
			}

			state := domain.SlaveState{
				PodID:     resp.GetSlaveState().GetPodId(),
				Status:    resp.GetSlaveState().GetStatus(),
				Stress:    resp.GetSlaveState().GetStress(),
				UpdatedAt: time.Now().UTC(),
				Source:    "controller-service",
			}
			if updatedAt := resp.GetSlaveState().GetUpdatedAt(); updatedAt != "" {
				if parsed, err := time.Parse(time.RFC3339, updatedAt); err == nil {
					state.UpdatedAt = parsed
				}
			}

			if err := redisClient.PublishSlaveState(ctx, state); err != nil {
				log.Printf("publish slave state: %v", err)
				continue
			}

			log.Printf("event %d processed by pod=%s accepted=%v", event.EventID, state.PodID, resp.GetAccepted())
		}
	}
}
