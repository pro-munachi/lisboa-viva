package main

import (
	"encoding/json"
	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func decode(r *http.Request, v any) error {
	defer r.Body.Close()
	d := json.NewDecoder(io.LimitReader(r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		return fail("invalid")
	}
	if e := d.Decode(new(any)); e != io.EOF {
		return fail("invalid")
	}
	return nil
}
func errorOut(w http.ResponseWriter, e error) {
	code := e.Error()
	allowed := map[string]bool{"invalid": true, "credentials": true, "handle_taken": true, "insufficient": true, "invalid_amount": true, "not_found": true, "busy": true, "closed": true, "wrong_place": true, "qualification": true, "already_done": true, "wrong_answer": true, "protected": true, "cooldown": true, "forbidden": true, "blocked": true, "rate_limit": true, "idempotency_conflict": true, "expired": true, "capacity": true, "disabled": true}
	if !allowed[code] {
		slog.Error("request failed", "error", e)
		code = "server"
	}
	status := 400
	if code == "credentials" || code == "expired" {
		status = 401
	}
	if code == "forbidden" {
		status = 403
	}
	if code == "rate_limit" {
		status = 429
	}
	if code == "server" {
		status = 500
	}
	write(w, status, map[string]string{"error": code})
}

var handlePattern = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)
var rates = struct {
	sync.Mutex
	m map[string][]time.Time
}{m: map[string][]time.Time{}}

func rate(key string, max int) bool {
	rates.Lock()
	defer rates.Unlock()
	now := time.Now()
	times := rates.m[key]
	valid := times[:0]
	for _, t := range times {
		if now.Sub(t) < time.Minute {
			valid = append(valid, t)
		}
	}
	if len(valid) >= max {
		return false
	}
	rates.m[key] = append(valid, now)
	if len(rates.m) > 10000 {
		for k, v := range rates.m {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > time.Minute {
				delete(rates.m, k)
			}
		}
	}
	return true
}
func (a *App) user(r *http.Request) (string, error) {
	cookie, e := r.Cookie("lv_session")
	if e != nil {
		return "", fail("expired")
	}
	var id string
	e = a.DB.QueryRow(ctx, "SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>$2 AND NOT u.banned", hash(cookie.Value), a.Now()).Scan(&id)
	if e != nil {
		return "", fail("expired")
	}
	return id, nil
}
func (a *App) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /v1/health", func(w http.ResponseWriter, r *http.Request) {
		if e := a.DB.Ping(r.Context()); e != nil {
			write(w, 503, map[string]bool{"ok": false})
			return
		}
		write(w, 200, map[string]bool{"ok": true})
	})
	m.HandleFunc("GET /v1/world", func(w http.ResponseWriter, r *http.Request) { write(w, 200, a.World) })
	m.HandleFunc("GET /v1/profile", func(w http.ResponseWriter, r *http.Request) {
		_, e := a.user(r)
		if e != nil {
			errorOut(w, e)
			return
		}
		var id, name, handle string
		e = a.DB.QueryRow(ctx, "SELECT u.id,c.name,u.handle FROM users u JOIN characters c ON c.user_id=u.id WHERE u.handle=$1 AND NOT u.banned", strings.ToLower(strings.TrimPrefix(r.URL.Query().Get("handle"), "@"))).Scan(&id, &name, &handle)
		if e != nil {
			errorOut(w, fail("not_found"))
			return
		}
		write(w, 200, map[string]string{"id": id, "name": name, "handle": handle})
	})
	m.HandleFunc("POST /v1/auth", a.auth)
	m.HandleFunc("POST /v1/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, e := r.Cookie("lv_session"); e == nil {
			a.DB.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash(c.Value))
		}
		http.SetCookie(w, &http.Cookie{Name: "lv_session", Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.Secure, MaxAge: -1})
		write(w, 200, map[string]bool{"ok": true})
	})
	m.HandleFunc("GET /v1/state", a.snapshot)
	m.HandleFunc("POST /v1/command", a.command)
	m.HandleFunc("GET /v1/ws", a.socket)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == "POST" && r.Header.Get("Origin") != a.Origin {
			errorOut(w, fail("forbidden"))
			return
		}
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		limit := 180
		if r.URL.Path == "/v1/auth" {
			limit = 15
		}
		if !rate(host+r.URL.Path, limit) {
			errorOut(w, fail("rate_limit"))
			return
		}
		m.ServeHTTP(w, r)
	})
}
func (a *App) auth(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Mode      string `json:"mode"`
		Handle    string `json:"handle"`
		Password  string `json:"password"`
		Name      string `json:"name"`
		Story     string `json:"story"`
		Pronouns  string `json:"pronouns"`
		Bio       string `json:"bio"`
		Interests string `json:"interests"`
		Color     string `json:"color"`
	}
	if e := decode(r, &b); e != nil {
		errorOut(w, e)
		return
	}
	b.Handle = strings.ToLower(strings.TrimSpace(b.Handle))
	if !handlePattern.MatchString(b.Handle) || len(b.Password) < 10 || len(b.Password) > 72 {
		errorOut(w, fail("invalid"))
		return
	}
	var id string
	var e error
	if b.Mode == "register" {
		b.Name = strings.TrimSpace(b.Name)
		if len([]rune(b.Name)) < 2 || len([]rune(b.Name)) > 40 || len([]rune(b.Bio)) > 280 || len(b.Interests) > 120 || len(b.Pronouns) > 40 {
			errorOut(w, fail("invalid"))
			return
		}
		if b.Story != "local" && b.Story != "student" && b.Story != "returning" && b.Story != "newcomer" {
			b.Story = "newcomer"
		}
		if b.Color != "terra" && b.Color != "blue" && b.Color != "green" {
			b.Color = "terra"
		}
		pw, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
		if err != nil {
			errorOut(w, err)
			return
		}
		id = uid()
		e = a.transaction(func(tx pgx.Tx) error {
			var exists bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE handle=$1)", b.Handle).Scan(&exists)
			if exists {
				return fail("handle_taken")
			}
			now := a.Now()
			if _, e := tx.Exec(ctx, "INSERT INTO users(id,handle,password_hash,created_at) VALUES($1,$2,$3,$4)", id, b.Handle, string(pw), now); e != nil {
				return e
			}
			s := State{Stats: map[string]int{"energy": 80, "hunger": 75, "hygiene": 90, "mood": 80, "health": 90, "social": 60}, Skills: map[string]int{}, Story: b.Story, Pronouns: b.Pronouns, Bio: b.Bio, Interests: b.Interests, Color: b.Color, DMs: true, ProtectedUntil: now.Add(10 * time.Minute)}
			if _, e := tx.Exec(ctx, "INSERT INTO characters VALUES($1,$2,'home',$3,$4,$4)", id, b.Name, blob(s), now); e != nil {
				return e
			}
			for _, k := range []string{"cash", "bank"} {
				if _, e := tx.Exec(ctx, "INSERT INTO wallets(id,user_id,kind) VALUES($1,$2,$3)", id+":"+k, id, k); e != nil {
					return e
				}
			}
			if e := a.money(tx, id, "welcome", "Boas-vindas", "system", id+":cash", 3500); e != nil {
				return e
			}
			return a.money(tx, id, "welcome", "Fundo inicial", "system", id+":bank", 10000)
		})
	} else if b.Mode == "login" {
		var pw string
		e = a.DB.QueryRow(ctx, "SELECT id,password_hash FROM users WHERE handle=$1 AND NOT banned", b.Handle).Scan(&id, &pw)
		if e != nil || bcrypt.CompareHashAndPassword([]byte(pw), []byte(b.Password)) != nil {
			errorOut(w, fail("credentials"))
			return
		}
	} else {
		e = fail("invalid")
	}
	if e != nil {
		errorOut(w, e)
		return
	}
	token := uid() + uid()
	_, e = a.DB.Exec(ctx, "INSERT INTO sessions VALUES($1,$2,$3)", hash(token), id, a.Now().Add(7*24*time.Hour))
	if e != nil {
		errorOut(w, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "lv_session", Value: token, Path: "/", HttpOnly: true, Secure: a.Secure, SameSite: http.SameSiteStrictMode, MaxAge: 604800})
	write(w, 200, map[string]bool{"ok": true})
}
func rowsJSON(tx pgx.Tx, q string, args ...any) ([]map[string]any, error) {
	rows, e := tx.Query(ctx, q, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		values, e := rows.Values()
		if e != nil {
			return nil, e
		}
		m := map[string]any{}
		for i, f := range rows.FieldDescriptions() {
			m[f.Name] = values[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
func (a *App) snapshot(w http.ResponseWriter, r *http.Request) {
	id, e := a.user(r)
	if e != nil {
		errorOut(w, e)
		return
	}
	var out map[string]any
	e = a.transaction(func(tx pgx.Tx) error {
		p, e := a.player(tx, id)
		if e != nil {
			return e
		}
		steps := int(a.Now().Sub(p.Updated).Seconds() / 60)
		if steps > 30 {
			steps = 30
		}
		if steps > 0 {
			for _, k := range []string{"energy", "hunger", "hygiene", "social"} {
				p.State.Stats[k] = max(20, p.State.Stats[k]-steps/2)
			}
			if e = a.save(tx, p); e != nil {
				return e
			}
		}
		if _, e = tx.Exec(ctx, "INSERT INTO presence VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET seen_at=$2", id, a.Now()); e != nil {
			return e
		}
		out = map[string]any{"player": p, "now": a.Now(), "hour": a.hour(), "weather": "Céu limpo · brisa do Tejo"}
		queries := map[string]struct {
			q    string
			args []any
		}{
			"actions":        {`SELECT id,kind,target,status,started_at,due_at,result FROM actions WHERE user_id=$1 ORDER BY started_at DESC LIMIT 12`, []any{id}},
			"inventory":      {`SELECT item,quantity FROM inventory WHERE user_id=$1 AND quantity>0`, []any{id}},
			"qualifications": {`SELECT qualification,created_at FROM qualifications WHERE user_id=$1`, []any{id}},
			"messages":       {`SELECT m.id,u.handle,c.name,m.sender,m.recipient,m.venue,m.body,m.created_at FROM messages m JOIN users u ON u.id=m.sender JOIN characters c ON c.user_id=m.sender WHERE (m.venue=$2 OR m.recipient=$1 OR m.sender=$1 AND m.recipient IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE b.owner=$1 AND b.target=m.sender OR b.owner=m.sender AND b.target=$1) ORDER BY m.created_at DESC LIMIT 100`, []any{id, p.Venue}},
			"nearby":         {`SELECT u.id,u.handle,c.name,c.state->>'color' AS color,c.state->>'risk' AS risk FROM characters c JOIN users u ON u.id=c.user_id JOIN presence p ON p.user_id=u.id WHERE c.venue=$1 AND p.seen_at>$2 AND u.id<>$3 AND NOT u.banned AND NOT EXISTS(SELECT 1 FROM blocks b WHERE b.owner=$3 AND b.target=u.id OR b.owner=u.id AND b.target=$3)`, []any{p.Venue, a.Now().Add(-25 * time.Second), id}},
			"receipts":       {`SELECT t.id,t.kind,t.note,t.created_at,l.amount,w.kind AS wallet, COALESCE((SELECT u.handle FROM ledger l2 JOIN wallets w2 ON w2.id=l2.wallet_id JOIN users u ON u.id=w2.user_id WHERE l2.transaction_id=t.id AND w2.user_id<>$1 LIMIT 1),'') AS counterparty FROM ledger l JOIN wallets w ON w.id=l.wallet_id JOIN transactions t ON t.id=l.transaction_id WHERE w.user_id=$1 ORDER BY t.created_at DESC LIMIT 40`, []any{id}},
			"encounters":     {`SELECT e.*,ua.handle AS attacker_handle,uv.handle AS victim_handle FROM encounters e JOIN users ua ON ua.id=e.attacker JOIN users uv ON uv.id=e.victim WHERE attacker=$1 OR victim=$1 ORDER BY created_at DESC LIMIT 10`, []any{id}},
			"cases":          {`SELECT id,status,evidence,history,appealed,service_done,created_at FROM cases WHERE user_id=$1 ORDER BY created_at DESC`, []any{id}},
			"blocks":         {`SELECT u.handle,u.id FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=$1`, []any{id}},
		}
		for k, q := range queries {
			v, e := rowsJSON(tx, q.q, q.args...)
			if e != nil {
				return e
			}
			out[k] = v
		}
		if p.Admin {
			v, e := rowsJSON(tx, `SELECT r.*,u.handle FROM reports r JOIN users u ON u.id=r.target ORDER BY r.created_at DESC LIMIT 100`)
			if e != nil {
				return e
			}
			out["reports"] = v
		}
		return nil
	})
	if e != nil {
		errorOut(w, e)
		return
	}
	write(w, 200, out)
}
func (a *App) command(w http.ResponseWriter, r *http.Request) {
	id, e := a.user(r)
	if e != nil {
		errorOut(w, e)
		return
	}
	var c Command
	if e = decode(r, &c); e != nil {
		errorOut(w, e)
		return
	}
	if len(c.Key) < 8 || len(c.Key) > 100 || len(c.Text) > 2000 || len(c.Target) > 100 {
		errorOut(w, fail("invalid"))
		return
	}
	var response map[string]any
	e = a.transaction(func(tx pgx.Tx) error {
		requestHash := hash(string(blob(c)))
		var oldHash string
		var old []byte
		e := tx.QueryRow(ctx, "SELECT body_hash,response FROM requests WHERE user_id=$1 AND request_key=$2", id, c.Key).Scan(&oldHash, &old)
		if e == nil {
			if oldHash != requestHash {
				return fail("idempotency_conflict")
			}
			return json.Unmarshal(old, &response)
		}
		if e != pgx.ErrNoRows {
			return e
		}
		p, e := a.player(tx, id)
		if e != nil {
			return e
		}
		if e = a.execute(tx, &p, c); e != nil {
			return e
		}
		response = map[string]any{"ok": true}
		if _, e = tx.Exec(ctx, "INSERT INTO requests VALUES($1,$2,$3,$4)", id, c.Key, requestHash, blob(response)); e != nil {
			return e
		}
		return a.event(tx, "", "changed")
	})
	if e != nil {
		errorOut(w, e)
		return
	}
	write(w, 200, response)
}
func (a *App) socket(w http.ResponseWriter, r *http.Request) {
	id, e := a.user(r)
	if e != nil {
		errorOut(w, e)
		return
	}
	if r.Header.Get("Origin") != a.Origin {
		errorOut(w, fail("forbidden"))
		return
	}
	originURL, _ := url.Parse(a.Origin)
	c, e := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{originURL.Host}})
	if e != nil {
		return
	}
	defer c.CloseNow()
	readctx := c.CloseRead(r.Context())
	var cursor int64
	a.DB.QueryRow(ctx, "SELECT COALESCE(max(id),0) FROM outbox").Scan(&cursor)
	if e = c.Write(readctx, websocket.MessageText, blob(map[string]any{"type": "refresh", "cursor": cursor})); e != nil {
		return
	}
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-readctx.Done():
			return
		case <-tick.C:
			if _, e = a.user(r); e != nil {
				c.Close(websocket.StatusPolicyViolation, "Sessão terminada")
				return
			}
			var latest int64
			e = a.DB.QueryRow(ctx, "SELECT COALESCE(max(id),0) FROM outbox WHERE id>$1 AND (user_id IS NULL OR user_id=$2)", cursor, id).Scan(&latest)
			if e != nil {
				return
			}
			if latest > cursor {
				cursor = latest
				if e = c.Write(readctx, websocket.MessageText, blob(map[string]any{"type": "refresh", "cursor": cursor})); e != nil {
					return
				}
			}
		}
	}
}
