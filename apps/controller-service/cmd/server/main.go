package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	controllerapp "github.com/kurazuuuuuu/hackz-megalo/libs/app/controller"
	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
	grpcserver "github.com/kurazuuuuuu/hackz-megalo/libs/server/grpc"
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

	errCh := make(chan error, 1)
	go func() {
		errCh <- grpcserver.ListenAndServe(ctx, grpcserver.Config{
			Addr: cfg.GRPCAddr,
			Register: func(server grpc.ServiceRegistrar) {
				slavev1.RegisterControllerServiceServer(server, &controllerapp.RegistrationService{
					Redis: redisClient,
				})
			},
		})
	}()

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

	log.Printf("controller-service listening on %s and dispatching to %s", cfg.GRPCAddr, cfg.SlaveGRPCTarget)

	for {
		select {
		case err := <-errCh:
			if err != nil && !errors.Is(err, context.Canceled) {
				log.Fatalf("controller grpc server: %v", err)
			}
			return
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

			state := redislayer.FromProtoSlaveState(resp.GetSlaveState(), "controller-service")
			state.SessionID = event.SessionID

			previousState, err := redisClient.GetSlaveState(ctx, event.SessionID, state.SlaveID)
			if err != nil && !errors.Is(err, context.Canceled) && !isNotFoundError(err) {
				log.Printf("get previous slave state: %v", err)
				continue
			}

			if err := redisClient.PublishSlaveState(ctx, state); err != nil {
				log.Printf("publish slave state: %v", err)
				continue
			}

			if err := applySessionMetricsForStateChange(ctx, redisClient, event.SessionID, previousState, state); err != nil {
				log.Printf("update session metrics: %v", err)
				continue
			}

			log.Printf("event %d processed by slave_id=%s status=%s accepted=%v", event.EventID, state.SlaveID, state.Status, resp.GetAccepted())
		}
	}
}

func isTerminalState(status domain.SlaveStatus) bool {
	return status == domain.SlaveStatusTerminating || status == domain.SlaveStatusGone
}

func applySessionMetricsForStateChange(ctx context.Context, redisClient *redislayer.Client, sessionID string, previousState, currentState domain.SlaveState) error {
	if isTerminalState(previousState.Status) || !isTerminalState(currentState.Status) {
		return nil
	}

	_, err := redisClient.UpdateSessionMetrics(ctx, sessionID, func(metrics domain.SessionMetrics) domain.SessionMetrics {
		if metrics.LiveSlaves > 0 {
			metrics.LiveSlaves--
		}
		metrics.GoneSlaves++
		return metrics
	})
	return err
}

func isNotFoundError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "not found")
}
