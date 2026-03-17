package main

import (
	"context"
	"errors"
	"log"
	"net"
	"os"
	"os/signal"
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
	pubsub := redisClient.SubscribeEvents(ctx)
	defer func() {
		if err := pubsub.Close(); err != nil {
			log.Printf("close redis pubsub: %v", err)
		}
	}()

	log.Printf("controller-service listening on %s and dispatching to pod gRPC port %s", cfg.GRPCAddr, cfg.SlaveGRPCPort)

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

			previousState, err := resolveTargetSlaveState(ctx, redisClient, event.SessionID, event.TargetPod)
			if err != nil {
				log.Printf("resolve target slave: %v", err)
				continue
			}

			resp, err := executeEventOnTarget(ctx, cfg.SlaveGRPCPort, previousState, event)
			if err != nil {
				log.Printf("execute event on %s: %v", previousState.PodIP, err)
				continue
			}

			state := redislayer.FromProtoSlaveState(resp.GetSlaveState(), "controller-service")
			state.SessionID = event.SessionID

			if err := redisClient.PublishSlaveState(ctx, state); err != nil {
				log.Printf("publish slave state: %v", err)
				continue
			}

			if err := applySessionMetricsForStateChange(ctx, redisClient, event.SessionID, previousState, state); err != nil {
				log.Printf("update session metrics: %v", err)
				continue
			}
			if err := notifyGoneSlave(ctx, cfg.SlaveGRPCPort, previousState, state); err != nil {
				log.Printf("notify gone slave %s: %v", state.SlaveID, err)
			}

			log.Printf("event %d processed by slave_id=%s status=%s accepted=%v", event.EventID, state.SlaveID, state.Status, resp.GetAccepted())
		}
	}
}

func resolveTargetSlaveState(ctx context.Context, redisClient *redislayer.Client, sessionID, target string) (domain.SlaveState, error) {
	states, err := redisClient.ListSlaveStates(ctx, sessionID)
	if err != nil {
		return domain.SlaveState{}, err
	}
	if len(states) == 0 {
		return domain.SlaveState{}, errors.New("no active slave states")
	}

	if target == "" {
		for _, state := range states {
			if state.Status != domain.SlaveStatusGone {
				return state, nil
			}
		}
		return states[0], nil
	}

	for _, state := range states {
		if state.SlaveID == target || state.K8sPodName == target || state.PodIP == target {
			return state, nil
		}
	}

	return domain.SlaveState{}, errors.New("target slave not found")
}

func executeEventOnTarget(ctx context.Context, slaveGRPCPort string, targetState domain.SlaveState, event domain.Event) (*slavev1.ExecuteEventResponse, error) {
	targetAddr := net.JoinHostPort(targetState.PodIP, slaveGRPCPort)
	conn, err := grpc.DialContext(ctx, targetAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = conn.Close()
	}()

	client := slavev1.NewSlaveServiceClient(conn)
	rpcCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.ExecuteEvent(rpcCtx, &slavev1.ExecuteEventRequest{
		EventId:   event.EventID,
		Seed:      event.Seed,
		TargetPod: event.TargetPod,
	})
}

func isTerminalState(status domain.SlaveStatus) bool {
	return status == domain.SlaveStatusTerminating || status == domain.SlaveStatusGone
}

func isGoneTransition(previousState, currentState domain.SlaveState) bool {
	return previousState.Status != domain.SlaveStatusGone && currentState.Status == domain.SlaveStatusGone
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

func notifyGoneSlave(ctx context.Context, slaveGRPCPort string, previousState, currentState domain.SlaveState) error {
	if !isGoneTransition(previousState, currentState) || currentState.PodIP == "" {
		return nil
	}

	targetAddr := net.JoinHostPort(currentState.PodIP, slaveGRPCPort)
	conn, err := grpc.DialContext(ctx, targetAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	defer func() {
		_ = conn.Close()
	}()

	client := slavev1.NewSlaveServiceClient(conn)
	rpcCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err = client.Shutdown(rpcCtx, &slavev1.ShutdownRequest{
		Reason: string(currentState.DeathReason),
	})
	if err != nil {
		return err
	}

	if currentState.SlaveID == "" {
		return nil
	}

	log.Printf("shutdown dispatched to slave_id=%s pod=%s", currentState.SlaveID, currentState.K8sPodName)
	return nil
}
