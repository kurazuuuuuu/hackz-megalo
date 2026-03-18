package main

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"

	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
)

var (
	errMissingCloudflareAccessToken = errors.New("missing cloudflare access token")
	errInvalidCloudflareAccessToken = errors.New("invalid cloudflare access token")
)

type cloudflareAccessVerifier struct {
	enabled     bool
	issuer      string
	audience    string
	certsURL    string
	tokenHeader string
	tokenCookie string
	httpClient  *http.Client
	jwtParser   *jwt.Parser

	mu          sync.RWMutex
	jwksCache   map[string]*rsa.PublicKey
	jwksExpires time.Time
	jwksTTL     time.Duration
}

type cloudflareAccessJWKSResponse struct {
	Keys []cloudflareAccessJWK `json:"keys"`
}

type cloudflareAccessJWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func newCloudflareAccessVerifier(cfg config.CloudflareAccessConfig) (*cloudflareAccessVerifier, error) {
	if !cfg.Enabled {
		return &cloudflareAccessVerifier{enabled: false}, nil
	}

	issuer, err := normalizeCloudflareIssuer(cfg.TeamDomain)
	if err != nil {
		return nil, fmt.Errorf("normalize cloudflare issuer: %w", err)
	}

	certsURL, err := resolveCloudflareCertsURL(issuer, cfg.CertsURL)
	if err != nil {
		return nil, fmt.Errorf("resolve cloudflare certs URL: %w", err)
	}

	verifier := &cloudflareAccessVerifier{
		enabled:     true,
		issuer:      issuer,
		audience:    cfg.Audience,
		certsURL:    certsURL,
		tokenHeader: cfg.TokenHeader,
		tokenCookie: cfg.TokenCookie,
		httpClient: &http.Client{
			Timeout: cfg.HTTPTimeout,
		},
		jwksTTL: cfg.JWKSCacheTTL,
		jwtParser: jwt.NewParser(
			jwt.WithValidMethods([]string{"RS256"}),
			jwt.WithAudience(cfg.Audience),
			jwt.WithIssuer(issuer),
			jwt.WithExpirationRequired(),
		),
	}

	log.Printf("cloudflare access auth enabled: issuer=%s certs_url=%s", issuer, certsURL)

	return verifier, nil
}

func withCloudflareAccessAuth(verifier *cloudflareAccessVerifier, next http.Handler) http.Handler {
	if verifier == nil || !verifier.enabled {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := verifier.VerifyRequest(r.Context(), r); err != nil {
			status := http.StatusUnauthorized
			if errors.Is(err, errInvalidCloudflareAccessToken) {
				status = http.StatusForbidden
			}
			log.Printf("cloudflare access auth rejected request: path=%s status=%d err=%v", r.URL.Path, status, err)
			http.Error(w, "unauthorized", status)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (v *cloudflareAccessVerifier) VerifyRequest(ctx context.Context, r *http.Request) error {
	tokenString, err := v.tokenFromRequest(r)
	if err != nil {
		return err
	}

	claims := &jwt.RegisteredClaims{}
	_, err = v.jwtParser.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		kid, _ := token.Header["kid"].(string)
		kid = strings.TrimSpace(kid)
		if kid == "" {
			return nil, fmt.Errorf("%w: missing kid header", errInvalidCloudflareAccessToken)
		}
		return v.signingKey(ctx, kid)
	})
	if err != nil {
		return fmt.Errorf("%w: %v", errInvalidCloudflareAccessToken, err)
	}

	return nil
}

func (v *cloudflareAccessVerifier) tokenFromRequest(r *http.Request) (string, error) {
	if token := strings.TrimSpace(r.Header.Get(v.tokenHeader)); token != "" {
		return token, nil
	}

	if cookie, err := r.Cookie(v.tokenCookie); err == nil {
		if token := strings.TrimSpace(cookie.Value); token != "" {
			return token, nil
		}
	}

	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		if token := strings.TrimSpace(authorization[len("bearer "):]); token != "" {
			return token, nil
		}
	}

	return "", errMissingCloudflareAccessToken
}

func (v *cloudflareAccessVerifier) signingKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if key, ok := v.cachedSigningKey(kid); ok {
		return key, nil
	}

	if err := v.refreshSigningKeys(ctx, false); err != nil {
		return nil, err
	}
	if key, ok := v.cachedSigningKey(kid); ok {
		return key, nil
	}

	if err := v.refreshSigningKeys(ctx, true); err != nil {
		return nil, err
	}
	if key, ok := v.cachedSigningKey(kid); ok {
		return key, nil
	}

	return nil, fmt.Errorf("%w: signing key not found for kid=%s", errInvalidCloudflareAccessToken, kid)
}

func (v *cloudflareAccessVerifier) cachedSigningKey(kid string) (*rsa.PublicKey, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if len(v.jwksCache) == 0 {
		return nil, false
	}
	if time.Now().After(v.jwksExpires) {
		return nil, false
	}

	key, ok := v.jwksCache[kid]
	return key, ok
}

func (v *cloudflareAccessVerifier) refreshSigningKeys(ctx context.Context, force bool) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !force && len(v.jwksCache) > 0 && time.Now().Before(v.jwksExpires) {
		return nil
	}

	keys, err := v.fetchSigningKeys(ctx)
	if err != nil {
		return fmt.Errorf("%w: fetch signing keys: %v", errInvalidCloudflareAccessToken, err)
	}

	v.jwksCache = keys
	v.jwksExpires = time.Now().Add(v.jwksTTL)
	return nil
}

func (v *cloudflareAccessVerifier) fetchSigningKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.certsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	var jwks cloudflareAccessJWKSResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, err
	}

	keys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, jwk := range jwks.Keys {
		if !strings.EqualFold(jwk.Kty, "RSA") {
			continue
		}
		if strings.TrimSpace(jwk.Kid) == "" {
			continue
		}

		publicKey, err := parseCloudflareRSAPublicKey(jwk)
		if err != nil {
			return nil, fmt.Errorf("parse jwk kid=%s: %w", jwk.Kid, err)
		}
		keys[jwk.Kid] = publicKey
	}

	if len(keys) == 0 {
		return nil, errors.New("no RSA keys found in cloudflare certs response")
	}

	return keys, nil
}

func parseCloudflareRSAPublicKey(jwk cloudflareAccessJWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("decode n: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("decode e: %w", err)
	}
	if len(nBytes) == 0 || len(eBytes) == 0 {
		return nil, errors.New("empty modulus or exponent")
	}

	e := 0
	for _, b := range eBytes {
		e = (e << 8) | int(b)
	}
	if e <= 0 {
		return nil, errors.New("invalid exponent")
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: e,
	}, nil
}

func normalizeCloudflareIssuer(teamDomain string) (string, error) {
	value := strings.TrimSpace(teamDomain)
	if value == "" {
		return "", errors.New("team domain is empty")
	}
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	if parsed.Host == "" {
		return "", errors.New("team domain host is empty")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", fmt.Errorf("unsupported scheme %q", parsed.Scheme)
	}

	parsed.Path = ""
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""

	return strings.TrimRight(parsed.String(), "/"), nil
}

func resolveCloudflareCertsURL(issuer, certsURLOverride string) (string, error) {
	if override := strings.TrimSpace(certsURLOverride); override != "" {
		parsed, err := url.Parse(override)
		if err != nil {
			return "", err
		}
		if parsed.Scheme == "" || parsed.Host == "" {
			return "", errors.New("certs URL override must be absolute")
		}
		return parsed.String(), nil
	}
	return issuer + "/cdn-cgi/access/certs", nil
}
