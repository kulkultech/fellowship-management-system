// Package openbadges signs Open Badges 3.0 credentials (W3C Verifiable Credentials Data Model 2.0)
// with a Data Integrity proof using the eddsa-rdfc-2022 cryptosuite and an Ed25519 key, and
// publishes the issuer keys as did:web documents.
package openbadges

import (
	"crypto/ed25519"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/piprate/json-gold/ld"
)

const (
	ContextVCv2 = "https://www.w3.org/ns/credentials/v2"
	ContextOBv3 = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
	Cryptosuite = "eddsa-rdfc-2022"
)

//go:embed contexts/credentials-v2.jsonld
var vcV2Context []byte

//go:embed contexts/ob-v3p0-3.0.3.jsonld
var obV3Context []byte

// offlineLoader serves the bundled JSON-LD contexts and refuses anything else, so signing never
// depends on (or can be influenced by) the network.
type offlineLoader struct {
	once sync.Once
	docs map[string]any
	err  error
}

func (l *offlineLoader) LoadDocument(u string) (*ld.RemoteDocument, error) {
	l.once.Do(func() {
		l.docs = map[string]any{}
		for _, c := range []struct {
			url  string
			body []byte
		}{{ContextVCv2, vcV2Context}, {ContextOBv3, obV3Context}} {
			var doc any
			if err := json.Unmarshal(c.body, &doc); err != nil {
				l.err = err
				return
			}
			l.docs[c.url] = doc
		}
	})
	if l.err != nil {
		return nil, l.err
	}
	doc, ok := l.docs[u]
	if !ok {
		return nil, ld.NewJsonLdError(ld.LoadingDocumentFailed, "context not bundled: "+u)
	}
	return &ld.RemoteDocument{DocumentURL: u, Document: doc}, nil
}

var loader = &offlineLoader{}

// Canonicalize returns the RDF Dataset Canonicalization (URDNA2015 / RDFC-1.0) N-Quads of a JSON-LD document.
func Canonicalize(doc map[string]any) (string, error) {
	opts := ld.NewJsonLdOptions("")
	opts.Algorithm = ld.AlgorithmURDNA2015
	opts.Format = "application/n-quads"
	opts.DocumentLoader = loader
	opts.ProcessingMode = ld.JsonLd_1_1
	opts.SafeMode = true // fail on terms the contexts do not define instead of silently dropping them
	out, err := ld.NewJsonLdProcessor().Normalize(doc, opts)
	if err != nil {
		return "", err
	}
	s, _ := out.(string)
	if s == "" {
		return "", errors.New("canonical form is empty")
	}
	return s, nil
}

// Signer holds the platform's Ed25519 credential signing key.
type Signer struct {
	priv ed25519.PrivateKey
	pub  ed25519.PublicKey
}

// NewSigner derives a stable Ed25519 key from a secret, so the key survives restarts without
// extra storage. Credentials signed with an older key stay verifiable only while its DID document
// still lists that key, so the secret should not be rotated casually.
func NewSigner(secret string) *Signer {
	seed := sha256.Sum256([]byte("fellowhire/openbadges-v3/ed25519:" + secret))
	priv := ed25519.NewKeyFromSeed(seed[:])
	return &Signer{priv: priv, pub: priv.Public().(ed25519.PublicKey)}
}

// PublicKeyMultibase is the Multikey encoding of the public key (base58btc, ed25519-pub multicodec).
func (s *Signer) PublicKeyMultibase() string {
	return "z" + base58Encode(append([]byte{0xed, 0x01}, s.pub...))
}

// DIDWeb builds a did:web identifier for an https URL path on host, e.g.
// did:web:fellowhire.kul.to:api:v1:badges:issuers:<id> resolves to
// https://fellowhire.kul.to/api/v1/badges/issuers/<id>/did.json.
func DIDWeb(host string, pathSegments ...string) string {
	// A port's colon is percent-encoded (did:web spec), e.g. localhost%3A8080
	parts := []string{"did:web:" + strings.ReplaceAll(url.PathEscape(host), ":", "%3A")}
	parts = append(parts, pathSegments...)
	return strings.Join(parts, ":")
}

// KeyID is the verification method id of the signing key inside a DID document.
func KeyID(did string) string { return did + "#key-1" }

// DIDDocument publishes the signing key for an issuer DID.
func (s *Signer) DIDDocument(did string) map[string]any {
	key := KeyID(did)
	return map[string]any{
		"@context": []string{"https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"},
		"id":       did,
		"verificationMethod": []map[string]any{{
			"id":                 key,
			"type":               "Multikey",
			"controller":         did,
			"publicKeyMultibase": s.PublicKeyMultibase(),
		}},
		"assertionMethod": []string{key},
		"authentication":  []string{key},
	}
}

func proofHash(doc map[string]any, proofConfig map[string]any) ([]byte, error) {
	canonDoc, err := Canonicalize(doc)
	if err != nil {
		return nil, fmt.Errorf("canonicalize credential: %w", err)
	}
	canonProof, err := Canonicalize(proofConfig)
	if err != nil {
		return nil, fmt.Errorf("canonicalize proof: %w", err)
	}
	proofDigest := sha256.Sum256([]byte(canonProof))
	docDigest := sha256.Sum256([]byte(canonDoc))
	return append(proofDigest[:], docDigest[:]...), nil
}

// Sign adds an eddsa-rdfc-2022 DataIntegrityProof to the credential and returns it.
func (s *Signer) Sign(credential map[string]any, verificationMethod string, created time.Time) (map[string]any, error) {
	plain, err := plainJSON(credential)
	if err != nil {
		return nil, err
	}
	unsigned := map[string]any{}
	for k, v := range plain {
		if k != "proof" {
			unsigned[k] = v
		}
	}
	proof := map[string]any{
		"type":               "DataIntegrityProof",
		"cryptosuite":        Cryptosuite,
		"created":            created.UTC().Format(time.RFC3339),
		"verificationMethod": verificationMethod,
		"proofPurpose":       "assertionMethod",
	}
	config := map[string]any{"@context": unsigned["@context"]}
	for k, v := range proof {
		config[k] = v
	}
	hash, err := proofHash(unsigned, config)
	if err != nil {
		return nil, err
	}
	proof["proofValue"] = "z" + base58Encode(ed25519.Sign(s.priv, hash))
	signed := map[string]any{}
	for k, v := range unsigned {
		signed[k] = v
	}
	signed["proof"] = proof
	return signed, nil
}

// Verify checks a credential's eddsa-rdfc-2022 proof against a public key.
func Verify(credential map[string]any, pub ed25519.PublicKey) error {
	credential, err := plainJSON(credential)
	if err != nil {
		return err
	}
	proof, ok := credential["proof"].(map[string]any)
	if !ok {
		return errors.New("credential has no proof")
	}
	if proof["cryptosuite"] != Cryptosuite || proof["type"] != "DataIntegrityProof" {
		return errors.New("unsupported proof type")
	}
	value, _ := proof["proofValue"].(string)
	if !strings.HasPrefix(value, "z") {
		return errors.New("proofValue is not base58btc multibase")
	}
	sig, err := base58Decode(value[1:])
	if err != nil {
		return err
	}
	unsigned := map[string]any{}
	for k, v := range credential {
		if k != "proof" {
			unsigned[k] = v
		}
	}
	config := map[string]any{"@context": unsigned["@context"]}
	for k, v := range proof {
		if k != "proofValue" {
			config[k] = v
		}
	}
	hash, err := proofHash(unsigned, config)
	if err != nil {
		return err
	}
	if !ed25519.Verify(pub, hash, sig) {
		return errors.New("signature does not match")
	}
	return nil
}

// plainJSON converts a document to generic JSON values ([]any, map[string]any, float64), which is
// what the JSON-LD processor expects.
func plainJSON(doc map[string]any) (map[string]any, error) {
	b, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// PublicKey exposes the verification key (for tests and DID documents).
func (s *Signer) PublicKey() ed25519.PublicKey { return s.pub }

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func base58Encode(b []byte) string {
	n := new(big.Int).SetBytes(b)
	radix, mod := big.NewInt(58), new(big.Int)
	var out []byte
	for n.Sign() > 0 {
		n.DivMod(n, radix, mod)
		out = append(out, base58Alphabet[mod.Int64()])
	}
	for _, c := range b {
		if c != 0 {
			break
		}
		out = append(out, '1')
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}

func base58Decode(s string) ([]byte, error) {
	n := new(big.Int)
	for _, c := range s {
		i := strings.IndexRune(base58Alphabet, c)
		if i < 0 {
			return nil, fmt.Errorf("invalid base58 character %q", c)
		}
		n.Mul(n, big.NewInt(58))
		n.Add(n, big.NewInt(int64(i)))
	}
	out := n.Bytes()
	for _, c := range s {
		if c != '1' {
			break
		}
		out = append([]byte{0}, out...)
	}
	return out, nil
}
