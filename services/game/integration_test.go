package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type fixture struct {
	a   *App
	t   *testing.T
	now time.Time
	h   http.Handler
}

func setup(t *testing.T) *fixture {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set TEST_DATABASE_URL to run real PostgreSQL integration tests")
	}
	pool, e := pgxpool.New(ctx, url)
	if e != nil {
		t.Fatal(e)
	}
	schema := "test_" + uid()
	if _, e = pool.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	cfg, e := pgxpool.ParseConfig(url)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	sql, e := os.ReadFile("../../db/migrations/001_initial.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, string(sql)); e != nil {
		t.Fatal(e)
	}
	w, e := loadWorld("../../content/world.json")
	if e != nil {
		t.Fatal(e)
	}
	f := &fixture{t: t, now: time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)}
	f.a = &App{DB: db, World: w, Now: func() time.Time { return f.now }, Roll: func(n int) int { return 0 }, Origin: "http://localhost:3000"}
	f.h = f.a.Handler()
	t.Cleanup(func() { db.Close(); pool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); pool.Close() })
	return f
}
func (f *fixture) req(method, path, cookie string, body any) (int, map[string]any, *httptest.ResponseRecorder) {
	b := []byte{}
	if body != nil {
		b = blob(body)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	r.RemoteAddr = "192.0.2." + fmt.Sprint(len(f.t.Name())) + ":5555"
	r.Header.Set("Origin", f.a.Origin)
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	m := map[string]any{}
	json.Unmarshal(w.Body.Bytes(), &m)
	return w.Code, m, w
}
func (f *fixture) register(handle string) (string, string) {
	f.t.Helper()
	code, m, w := f.req("POST", "/v1/auth", "", map[string]any{"mode": "register", "handle": handle, "password": "test-password-123", "name": "Pessoa " + handle, "story": "newcomer"})
	if code != 200 {
		f.t.Fatalf("register %d %v", code, m)
	}
	cookie := w.Result().Cookies()[0].String()
	var id string
	f.a.DB.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1", handle).Scan(&id)
	return cookie, id
}
func (f *fixture) cmd(cookie string, c Command) int {
	f.t.Helper()
	if c.Key == "" {
		c.Key = uid()
	}
	code, m, _ := f.req("POST", "/v1/command", cookie, c)
	if code != 200 {
		f.t.Logf("command %s: %d %v", c.Kind, code, m)
	}
	return code
}
func (f *fixture) ok(cookie string, c Command) {
	f.t.Helper()
	if code := f.cmd(cookie, c); code != 200 {
		f.t.Fatalf("%s failed %d", c.Kind, code)
	}
}
func (f *fixture) player(id string) Player {
	f.t.Helper()
	var p Player
	e := f.a.transaction(func(tx pgx.Tx) error { var e error; p, e = f.a.player(tx, id); return e })
	if e != nil {
		f.t.Fatal(e)
	}
	return p
}
func (f *fixture) advance(n int) {
	f.now = f.now.Add(time.Duration(n) * time.Second)
	if e := f.a.tick(); e != nil {
		f.t.Fatal(e)
	}
}
func (f *fixture) place(id, venue string) {
	_, e := f.a.DB.Exec(ctx, "UPDATE characters SET venue=$2 WHERE user_id=$1", id, venue)
	if e != nil {
		f.t.Fatal(e)
	}
}
func (f *fixture) travel(cookie, id, to, route string, seconds int) {
	before := f.player(id).Venue
	f.ok(cookie, Command{Kind: "travel", Target: to, Choice: route})
	if f.player(id).Venue != before {
		f.t.Fatal("teleport before arrival")
	}
	f.advance(seconds + 1)
	if f.player(id).Venue != to {
		f.t.Fatalf("arrival not persisted: %s", to)
	}
}
func TestNewPlayerJourneyAndRestart(t *testing.T) {
	f := setup(t)
	c, id := f.register("journey")
	if f.player(id).Cash != 3500 {
		t.Fatal("starting cash")
	}
	f.ok(c, Command{Kind: "quest"})
	f.travel(c, id, "cafe", "", 3)
	f.ok(c, Command{Kind: "activity", Target: "coffee"})
	f.advance(5)
	f.ok(c, Command{Kind: "quest"})
	f.ok(c, Command{Kind: "activity", Target: "cafe_shift", Choice: "Atendo por ordem de chegada"})
	if f.cmd(c, Command{Kind: "travel", Target: "market"}) == 200 {
		t.Fatal("worked while travelling")
	}
	before := f.player(id).Cash
	// Recreate API/worker to simulate process restart while the action is durable.
	restarted := *f.a
	f.a = &restarted
	f.h = f.a.Handler()
	f.advance(21)
	if f.player(id).Cash != before+1800 {
		t.Fatal("wage not paid once")
	}
	f.advance(2)
	if f.player(id).Cash != before+1800 {
		t.Fatal("duplicate wage")
	}
	f.travel(c, id, "market", "", 3)
	f.ok(c, Command{Kind: "activity", Target: "bread"})
	f.advance(3)
	f.ok(c, Command{Kind: "consume"})
	if f.cmd(c, Command{Kind: "consume"}) == 200 {
		t.Fatal("duplicate inventory consumption")
	}
	f.travel(c, id, "school", "", 3)
	f.ok(c, Command{Kind: "activity", Target: "course", Choice: "Ouvir e corrigir o pedido"})
	f.advance(21)
	if f.cmd(c, Command{Kind: "activity", Target: "course", Choice: "Ouvir e corrigir o pedido"}) == 200 {
		t.Fatal("duplicate course")
	}
	var count int
	f.a.DB.QueryRow(ctx, "SELECT count(*) FROM qualifications WHERE user_id=$1", id).Scan(&count)
	if count != 1 {
		t.Fatal("qualification count")
	}
	f.travel(c, id, "home", "", 3)
	f.ok(c, Command{Kind: "quest"})
	f.ok(c, Command{Kind: "activity", Target: "rest"})
	f.advance(13)
	f.travel(c, id, "bank", "green", 10)
	f.ok(c, Command{Kind: "deposit", Amount: 500})
	f.ok(c, Command{Kind: "withdraw", Amount: 200})
	f.travel(c, id, "gym", "stadium", 15)
	f.ok(c, Command{Kind: "activity", Target: "workout"})
	f.advance(13)
	f.travel(c, id, "bank", "stadium", 15)
	f.travel(c, id, "station", "river", 8)
	f.travel(c, id, "riverside", "cascais1", 12)
	f.travel(c, id, "beach", "cascais2", 18)
	f.ok(c, Command{Kind: "activity", Target: "beach_walk"})
	f.advance(11)
	f.travel(c, id, "riverside", "cascais2", 18)
	f.travel(c, id, "station", "cascais1", 12)
	f.travel(c, id, "dock", "ferry", 12)
	f.travel(c, id, "station", "ferry", 12)
	f.travel(c, id, "bank", "river", 8)
	f.travel(c, id, "home", "green", 10)
	expected := f.player(id)
	f.req("POST", "/v1/logout", c, nil)
	code, _, w := f.req("POST", "/v1/auth", "", map[string]string{"mode": "login", "handle": "journey", "password": "test-password-123"})
	if code != 200 {
		t.Fatal("login")
	}
	code, s, _ := f.req("GET", "/v1/state", w.Result().Cookies()[0].String(), nil)
	if code != 200 {
		t.Fatal(s)
	}
	got := s["player"].(map[string]any)
	if got["venue"] != "home" || int64(got["cash"].(float64)) != expected.Cash {
		t.Fatal("resume changed state")
	}
	t.Log("Full journey: account, quest, work, food, course, rest, gym, train/beach, ferry, logout/resume verified")
}
func TestConcurrentMoneyAndRetries(t *testing.T) {
	f := setup(t)
	c, id := f.register("payer")
	_, other := f.register("recipient")
	key := uid()
	f.ok(c, Command{Kind: "transfer", Target: "recipient", Amount: 1000, Key: key})
	f.ok(c, Command{Kind: "transfer", Target: "recipient", Amount: 1000, Key: key})
	if f.player(id).Bank != 9000 || f.player(other).Bank != 11000 {
		t.Fatal("duplicate transfer")
	}
	if f.cmd(c, Command{Kind: "transfer", Target: "recipient", Amount: 2000, Key: key}) == 200 {
		t.Fatal("key conflict accepted")
	}
	var wg sync.WaitGroup
	success := make(chan bool, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _, _ := f.req("POST", "/v1/command", c, Command{Kind: "transfer", Target: "recipient", Amount: 1000, Key: uid()})
			success <- code == 200
		}()
	}
	wg.Wait()
	close(success)
	n := 0
	for ok := range success {
		if ok {
			n++
		}
	}
	if n != 9 || f.player(id).Bank != 0 || f.player(other).Bank != 20000 {
		t.Fatalf("overspending: %d", n)
	}
	var sum int64
	f.a.DB.QueryRow(ctx, "SELECT sum(amount) FROM ledger").Scan(&sum)
	if sum != 0 {
		t.Fatal("unbalanced money")
	}
	if f.cmd(c, Command{Kind: "transfer", Target: "recipient", Amount: -100}) == 200 {
		t.Fatal("negative transfer")
	}
	e := f.a.transaction(func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx, "INSERT INTO transactions VALUES('bad',$1,'bad','',$2)", id, f.now)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO ledger(transaction_id,wallet_id,amount) VALUES('bad',$1,1)", id+":bank")
		return e
	})
	if e == nil {
		t.Fatal("DB accepted unbalanced ledger")
	}
	t.Log("Concurrent spending, retry identity and database balance constraint verified")
}
func TestSocialOfflineAndAuthorization(t *testing.T) {
	f := setup(t)
	c, id := f.register("socialone")
	d, other := f.register("socialtwo")
	x, _ := f.register("outsider")
	f.req("GET", "/v1/state", c, nil)
	f.req("GET", "/v1/state", d, nil)
	_, s, _ := f.req("GET", "/v1/state", c, nil)
	if len(s["nearby"].([]any)) != 1 {
		t.Fatal("real presence")
	}
	k := uid()
	f.ok(c, Command{Kind: "message", Text: "Olá, bairro!", Key: k})
	f.ok(c, Command{Kind: "message", Text: "Olá, bairro!", Key: k})
	_, s, _ = f.req("GET", "/v1/state", d, nil)
	if len(s["messages"].([]any)) != 1 {
		t.Fatal("chat retry duplicated")
	}
	f.req("POST", "/v1/logout", d, nil)
	f.ok(c, Command{Kind: "message", Target: "socialtwo", Text: "Vemo-nos amanhã!"})
	f.ok(c, Command{Kind: "transfer", Target: "socialtwo", Amount: 500})
	_, s, _ = f.req("GET", "/v1/state", x, nil)
	for _, m := range s["messages"].([]any) {
		if m.(map[string]any)["recipient"] != nil {
			t.Fatal("private message leaked")
		}
	}
	_, _, w := f.req("POST", "/v1/auth", "", map[string]string{"mode": "login", "handle": "socialtwo", "password": "test-password-123"})
	d = w.Result().Cookies()[0].String()
	_, s, _ = f.req("GET", "/v1/state", d, nil)
	if len(s["messages"].([]any)) != 2 || f.player(other).Bank != 10500 {
		t.Fatal("offline delivery")
	}
	f.ok(d, Command{Kind: "block", Target: "socialone"})
	if f.cmd(c, Command{Kind: "message", Target: "socialtwo", Text: "Blocked"}) == 200 {
		t.Fatal("blocked message")
	}
	if f.cmd(c, Command{Kind: "admin_adjust", Target: "socialtwo", Amount: 100000, Text: "police request"}) != 403 {
		t.Fatal("role escalation")
	}
	if f.cmd(c, Command{Kind: "travel", Target: "beach", Choice: "ferry"}) == 200 {
		t.Fatal("forged teleport")
	}
	f.a.DB.Exec(ctx, "UPDATE sessions SET expires_at=$1 WHERE user_id=$2", f.now.Add(-time.Second), id)
	code, _, _ := f.req("GET", "/v1/state", c, nil)
	if code != 401 {
		t.Fatal("expired session")
	}
	t.Log("Presence, durable room chat, offline DM/transfer, blocking, privacy and unauthorized police/admin requests verified")
}
func TestRobberyProtectionDefenseJustice(t *testing.T) {
	f := setup(t)
	c, id := f.register("attacker")
	d, other := f.register("victim")
	f.place(id, "square")
	f.place(other, "square")
	f.ok(c, Command{Kind: "risk", Enabled: true})
	f.ok(d, Command{Kind: "risk", Enabled: true})
	f.req("GET", "/v1/state", d, nil)
	if f.cmd(c, Command{Kind: "rob", Target: "victim"}) == 200 {
		t.Fatal("newcomer protection")
	}
	f.advance(601)
	f.req("GET", "/v1/state", d, nil)
	f.place(id, "home")
	f.place(other, "home")
	if f.cmd(c, Command{Kind: "rob", Target: "victim"}) == 200 {
		t.Fatal("safe area protection")
	}
	f.place(id, "square")
	f.place(other, "square")
	f.ok(c, Command{Kind: "rob", Target: "victim"})
	var encounter string
	f.a.DB.QueryRow(ctx, "SELECT id FROM encounters WHERE attacker=$1", id).Scan(&encounter)
	f.ok(d, Command{Kind: "defend", Target: encounter, Choice: "call"})
	before := f.player(other).Cash
	f.advance(11)
	if f.player(other).Cash != before-before/10 {
		t.Fatal("cash cap")
	}
	if f.player(other).Bank != 10000 {
		t.Fatal("bank stolen")
	}
	after := f.player(id).Cash
	f.advance(1)
	if f.player(id).Cash != after {
		t.Fatal("double robbery")
	}
	var caseid string
	f.a.DB.QueryRow(ctx, "SELECT id FROM cases WHERE user_id=$1", id).Scan(&caseid)
	if caseid == "" {
		t.Fatal("no evidence case")
	}
	if f.cmd(d, Command{Kind: "appeal", Target: caseid}) == 200 {
		t.Fatal("unrelated case accessed")
	}
	f.ok(c, Command{Kind: "appeal", Target: caseid})
	if f.cmd(c, Command{Kind: "appeal", Target: caseid}) == 200 {
		t.Fatal("duplicate appeal")
	}
	if f.player(id).State.DetainedUntil.After(f.now) {
		t.Fatal("appeal did not release")
	}
	if f.cmd(c, Command{Kind: "rob", Target: "victim"}) == 200 {
		t.Fatal("victim protection")
	}
	f.advance(3601)
	f.req("GET", "/v1/state", d, nil)
	if f.cmd(c, Command{Kind: "rob", Target: "victim"}) == 200 {
		t.Fatal("pair cooldown")
	}
	_, s, _ := f.req("GET", "/v1/state", d, nil)
	if len(s["cases"].([]any)) != 0 {
		t.Fatal("case privacy")
	}
	t.Log("Mutual eligibility, newcomer/safe-area/victim safeguards, defense, single settlement, evidence, appeal and pair cooldown verified")
}
func TestOpeningsAndCSRF(t *testing.T) {
	for _, v := range []struct {
		hour int
		want bool
	}{{23, true}, {2, true}, {17, false}, {5, false}, {18, true}} {
		if openAt(v.hour, 18, 5) != v.want {
			t.Fatalf("cross midnight %d", v.hour)
		}
	}
	f := setup(t)
	r := httptest.NewRequest("POST", "/v1/auth", strings.NewReader(`{}`))
	r.Header.Set("Origin", "https://evil.invalid")
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("CSRF accepted")
	}
	b := blob(f.a.World)
	if bytes.Contains(b, []byte(`"answer"`)) {
		t.Fatal("assessment answers leaked")
	}
}
func TestAdminAuditAndDetentionExpiration(t *testing.T) {
	f := setup(t)
	c, id := f.register("operator")
	_, other := f.register("member")
	f.a.DB.Exec(ctx, "UPDATE users SET admin=true WHERE id=$1", id)
	f.ok(c, Command{Kind: "admin_adjust", Target: "member", Amount: 250, Text: "Correction with evidence"})
	if f.player(other).Bank != 10250 {
		t.Fatal("adjustment")
	}
	var count int
	f.a.DB.QueryRow(ctx, "SELECT count(*) FROM audit WHERE actor=$1", id).Scan(&count)
	if count != 1 {
		t.Fatal("missing audit")
	}
	f.ok(c, Command{Kind: "admin_setting", Target: "activity:rest", Enabled: true, Text: "Temporarily unavailable"})
	if f.cmd(c, Command{Kind: "activity", Target: "rest"}) == 200 {
		t.Fatal("disabled action started")
	}
	f.ok(c, Command{Kind: "admin_setting", Target: "activity:rest", Enabled: false, Text: "Restored availability"})
	e := f.a.transaction(func(tx pgx.Tx) error {
		p, e := f.a.player(tx, id)
		if e != nil {
			return e
		}
		p.State.DetainedUntil = f.now.Add(15 * time.Second)
		return f.a.save(tx, p)
	})
	if e != nil {
		t.Fatal(e)
	}
	if f.cmd(c, Command{Kind: "activity", Target: "rest"}) == 200 {
		t.Fatal("detention bypass")
	}
	f.advance(16)
	f.ok(c, Command{Kind: "activity", Target: "rest"})
	f.advance(13)
	t.Log("Administrative ledger correction/audit, activity suspension and offline detention expiration verified")
}

func TestWebSocketOriginAndRecovery(t *testing.T) {
	f := setup(t)
	cookie, _ := f.register("socketuser")
	server := httptest.NewServer(f.h)
	defer server.Close()
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	conn, _, e := websocket.Dial(cctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/ws", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {f.a.Origin}, "Cookie": {cookie}}})
	if e != nil {
		t.Fatal(e)
	}
	defer conn.CloseNow()
	_, b, e := conn.Read(cctx)
	if e != nil || !bytes.Contains(b, []byte("refresh")) {
		t.Fatalf("initial recovery snapshot: %s %v", b, e)
	}
	f.ok(cookie, Command{Kind: "message", Text: "Uma mensagem em tempo real."})
	_, b, e = conn.Read(cctx)
	if e != nil || !bytes.Contains(b, []byte("refresh")) {
		t.Fatalf("outbox notification: %s %v", b, e)
	}
	bad, response, e := websocket.Dial(cctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/ws", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"https://evil.invalid"}, "Cookie": {cookie}}})
	if bad != nil {
		bad.CloseNow()
	}
	if e == nil || response == nil || response.StatusCode != 403 {
		t.Fatal("cross-origin socket accepted")
	}
	t.Log("Authenticated WebSocket, initial/reconnect refresh, outbox delivery and origin rejection verified")
}
