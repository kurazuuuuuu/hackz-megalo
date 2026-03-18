package main

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"

	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
)

func TestWithCloudflareAccessAuthAllowsValidHeaderToken(t *testing.T) {
	verifier, signer, kid := newTestCloudflareAccessVerifier(t)

	token := signCloudflareAccessToken(t, signer, kid, verifier.issuer, verifier.audience)
	handler := withCloudflareAccessAuth(verifier, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	req.Header.Set(verifier.tokenHeader, token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestWithCloudflareAccessAuthAllowsCookieToken(t *testing.T) {
	verifier, signer, kid := newTestCloudflareAccessVerifier(t)

	token := signCloudflareAccessToken(t, signer, kid, verifier.issuer, verifier.audience)
	handler := withCloudflareAccessAuth(verifier, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/internal/session", nil)
	req.AddCookie(&http.Cookie{Name: verifier.tokenCookie, Value: token})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestWithCloudflareAccessAuthRejectsMissingToken(t *testing.T) {
	verifier, _, _ := newTestCloudflareAccessVerifier(t)
	handler := withCloudflareAccessAuth(verifier, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestWithCloudflareAccessAuthRejectsInvalidAudience(t *testing.T) {
	verifier, signer, kid := newTestCloudflareAccessVerifier(t)

	token := signCloudflareAccessToken(t, signer, kid, verifier.issuer, "different-aud")
	handler := withCloudflareAccessAuth(verifier, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	req.Header.Set(verifier.tokenHeader, token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func newTestCloudflareAccessVerifier(t *testing.T) (*cloudflareAccessVerifier, *rsa.PrivateKey, string) {
	t.Helper()

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("rsa.GenerateKey() error = %v", err)
	}

	const kid = "test-kid"

	jwks := cloudflareAccessJWKSResponse{
		Keys: []cloudflareAccessJWK{
			{
				Kty: "RSA",
				Kid: kid,
				N:   base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(rsaPublicExponentBytes(privateKey.PublicKey.E)),
			},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/cdn-cgi/access/certs", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jwks)
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	cfg := config.CloudflareAccessConfig{
		Enabled:      true,
		TeamDomain:   server.URL,
		Audience:     "test-aud",
		TokenHeader:  "Cf-Access-Jwt-Assertion",
		TokenCookie:  "CF_Authorization",
		JWKSCacheTTL: time.Minute,
		HTTPTimeout:  2 * time.Second,
	}

	verifier, err := newCloudflareAccessVerifier(cfg)
	if err != nil {
		t.Fatalf("newCloudflareAccessVerifier() error = %v", err)
	}

	return verifier, privateKey, kid
}

func signCloudflareAccessToken(t *testing.T, key *rsa.PrivateKey, kid, issuer, audience string) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.RegisteredClaims{
		Issuer:    issuer,
		Audience:  jwt.ClaimStrings{audience},
		Subject:   "test-user",
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-1 * time.Minute)),
	})
	token.Header["kid"] = kid

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	return signed
}

func rsaPublicExponentBytes(exponent int) []byte {
	if exponent == 0 {
		return []byte{0}
	}

	bytes := []byte{}
	for exponent > 0 {
		bytes = append([]byte{byte(exponent & 0xff)}, bytes...)
		exponent >>= 8
	}
	return bytes
}
