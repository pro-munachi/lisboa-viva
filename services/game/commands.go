package main

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"strings"
	"time"
	"unicode/utf8"
)

func (a *App) available(tx pgx.Tx, p Player) error {
	if p.State.DetainedUntil.After(a.Now()) {
		return fail("busy")
	}
	var b bool
	e := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM actions WHERE user_id=$1 AND status='running') OR EXISTS(SELECT 1 FROM encounters WHERE (attacker=$1 OR victim=$1) AND status='pending')`, p.ID).Scan(&b)
	if e != nil {
		return e
	}
	if b {
		return fail("busy")
	}
	return nil
}
func (a *App) start(tx pgx.Tx, p Player, kind, target string, seconds int) error {
	if e := a.available(tx, p); e != nil {
		return e
	}
	_, e := tx.Exec(ctx, "INSERT INTO actions(id,user_id,kind,target,status,started_at,due_at) VALUES($1,$2,$3,$4,'running',$5,$6)", uid(), p.ID, kind, target, a.Now(), a.Now().Add(time.Duration(seconds)*time.Second))
	return e
}
func (a *App) disabled(tx pgx.Tx, key string) bool {
	var b bool
	tx.QueryRow(ctx, "SELECT value::boolean FROM settings WHERE key=$1", key).Scan(&b)
	return b
}
func (a *App) execute(tx pgx.Tx, p *Player, c Command) error {
	switch c.Kind {
	case "activity":
		act, e := a.activity(c.Target)
		if e != nil {
			return e
		}
		if p.Venue != act.Venue {
			return fail("wrong_place")
		}
		if a.disabled(tx, "activity:"+act.ID) {
			return fail("disabled")
		}
		v, _ := a.venue(p.Venue)
		if !openAt(a.hour(), v.Opens, v.Closes) {
			return fail("closed")
		}
		if act.Question != "" {
			found := false
			for _, o := range act.Options {
				if o == c.Choice {
					found = true
				}
			}
			if !found {
				return fail("invalid")
			}
			if act.Answer != "" && act.Answer != c.Choice {
				return fail("wrong_answer")
			}
		}
		if act.Requires != "" {
			var ok bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM qualifications WHERE user_id=$1 AND qualification=$2)", p.ID, act.Requires).Scan(&ok)
			if !ok {
				return fail("qualification")
			}
		}
		if act.Qualification != "" {
			var ok bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM qualifications WHERE user_id=$1 AND qualification=$2)", p.ID, act.Qualification).Scan(&ok)
			if ok {
				return fail("already_done")
			}
		}
		var recent bool
		tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM actions WHERE user_id=$1 AND target=$2 AND status='completed' AND due_at>$3)", p.ID, act.ID, a.Now().Add(-time.Duration(act.Cooldown)*time.Second)).Scan(&recent)
		if recent {
			return fail("cooldown")
		}
		if e = a.start(tx, *p, "activity", act.ID, act.Seconds); e != nil {
			return e
		}
		if act.Cost > 0 {
			return a.money(tx, p.ID, "purchase", act.Name, p.ID+":cash", "system", act.Cost)
		}
		return nil
	case "travel":
		to, e := a.venue(c.Target)
		if e != nil {
			return e
		}
		from, _ := a.venue(p.Venue)
		if to.ID == p.Venue {
			return fail("already_done")
		}
		if a.disabled(tx, "venue:"+to.ID) {
			return fail("disabled")
		}
		seconds := 3
		fare := int64(0)
		if from.Hub != to.Hub {
			found := false
			for _, r := range a.World.Routes {
				if r.ID == c.Choice && ((r.From == from.Hub && r.To == to.Hub) || (r.To == from.Hub && r.From == to.Hub)) {
					if !openAt(a.hour(), r.Opens, r.Closes) {
						return fail("closed")
					}
					seconds = r.Seconds
					fare = r.Fare
					found = true
				}
			}
			if !found {
				return fail("invalid")
			}
		}
		var count int
		tx.QueryRow(ctx, "SELECT count(*) FROM characters c JOIN presence p ON p.user_id=c.user_id WHERE c.venue=$1 AND p.seen_at>$2", to.ID, a.Now().Add(-25*time.Second)).Scan(&count)
		if count >= to.Capacity {
			return fail("capacity")
		}
		if e = a.start(tx, *p, "travel", to.ID, seconds); e != nil {
			return e
		}
		if fare > 0 {
			return a.money(tx, p.ID, "fare", to.Name, p.ID+":cash", "system", fare)
		}
		return nil
	case "cancel":
		var kind string
		e := tx.QueryRow(ctx, "SELECT kind FROM actions WHERE id=$1 AND user_id=$2 AND status='running'", c.Target, p.ID).Scan(&kind)
		if e != nil {
			return fail("not_found")
		}
		if kind != "travel" {
			return fail("forbidden")
		}
		_, e = tx.Exec(ctx, "UPDATE actions SET status='cancelled' WHERE id=$1", c.Target)
		return e
	case "consume":
		if e := a.available(tx, *p); e != nil {
			return e
		}
		res, e := tx.Exec(ctx, "UPDATE inventory SET quantity=quantity-1 WHERE user_id=$1 AND item='meal' AND quantity>0", p.ID)
		if e != nil {
			return e
		}
		if res.RowsAffected() != 1 {
			return fail("not_found")
		}
		p.State.Stats["hunger"] = min(100, p.State.Stats["hunger"]+35)
		return a.save(tx, *p)
	case "deposit", "withdraw":
		if p.Venue != "bank" {
			return fail("wrong_place")
		}
		if e := a.available(tx, *p); e != nil {
			return e
		}
		from, to := p.ID+":cash", p.ID+":bank"
		if c.Kind == "withdraw" {
			from, to = to, from
		}
		return a.money(tx, p.ID, c.Kind, "Movimento entre as tuas contas", from, to, c.Amount)
	case "transfer":
		var target string
		e := tx.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1 AND NOT banned", strings.ToLower(strings.TrimPrefix(c.Target, "@"))).Scan(&target)
		if e != nil || target == p.ID {
			return fail("not_found")
		}
		if utf8.RuneCountInString(c.Text) > 120 {
			return fail("invalid")
		}
		if e = a.money(tx, p.ID, "transfer", c.Text, p.ID+":bank", target+":bank", c.Amount); e != nil {
			return e
		}
		return a.event(tx, target, "receipt")
	case "message":
		c.Text = strings.TrimSpace(c.Text)
		if utf8.RuneCountInString(c.Text) < 1 || utf8.RuneCountInString(c.Text) > 500 {
			return fail("invalid")
		}
		var n int
		tx.QueryRow(ctx, "SELECT count(*) FROM messages WHERE sender=$1 AND created_at>$2", p.ID, a.Now().Add(-time.Minute)).Scan(&n)
		if n >= 20 {
			return fail("rate_limit")
		}
		var target any
		var venue any = p.Venue
		if c.Target != "" {
			var other string
			e := tx.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1 AND NOT banned", strings.ToLower(strings.TrimPrefix(c.Target, "@"))).Scan(&other)
			if e != nil {
				return fail("not_found")
			}
			op, e := a.player(tx, other)
			if e != nil {
				return e
			}
			if !op.State.DMs {
				return fail("blocked")
			}
			var blocked bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM blocks WHERE owner=$1 AND target=$2 OR owner=$2 AND target=$1)", p.ID, other).Scan(&blocked)
			if blocked {
				return fail("blocked")
			}
			target = other
			venue = nil
		}
		_, e := tx.Exec(ctx, "INSERT INTO messages VALUES($1,$2,$3,$4,$5,$6)", uid(), p.ID, target, venue, c.Text, a.Now())
		return e
	case "read":
		p.State.LastRead = a.Now()
		return a.save(tx, *p)
	case "risk":
		if e := a.available(tx, *p); e != nil {
			return e
		}
		p.State.Risk = c.Enabled
		return a.save(tx, *p)
	case "dm_permission":
		p.State.DMs = c.Enabled
		return a.save(tx, *p)
	case "block", "unblock", "report":
		var target string
		e := tx.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1", strings.TrimPrefix(strings.ToLower(c.Target), "@")).Scan(&target)
		if e != nil || target == p.ID {
			return fail("not_found")
		}
		if c.Kind == "block" {
			_, e = tx.Exec(ctx, "INSERT INTO blocks VALUES($1,$2) ON CONFLICT DO NOTHING", p.ID, target)
		} else if c.Kind == "unblock" {
			_, e = tx.Exec(ctx, "DELETE FROM blocks WHERE owner=$1 AND target=$2", p.ID, target)
		} else {
			if len(strings.TrimSpace(c.Text)) < 5 || utf8.RuneCountInString(c.Text) > 500 {
				return fail("invalid")
			}
			_, e = tx.Exec(ctx, "INSERT INTO reports(id,reporter,target,reason,created_at) VALUES($1,$2,$3,$4,$5)", uid(), p.ID, target, c.Text, a.Now())
		}
		return e
	case "quest":
		switch p.State.Quest {
		case 0:
			if p.Venue != "home" {
				return fail("wrong_place")
			}
			p.State.Quest = 1
		case 1:
			if p.Venue != "cafe" {
				return fail("wrong_place")
			}
			var ok bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM actions WHERE user_id=$1 AND target='coffee' AND status='completed')", p.ID).Scan(&ok)
			if !ok {
				return fail("qualification")
			}
			p.State.Quest = 2
		case 2:
			if p.Venue != "home" {
				return fail("wrong_place")
			}
			var ok bool
			tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM qualifications WHERE user_id=$1 AND qualification='hospitality')", p.ID).Scan(&ok)
			if !ok {
				return fail("qualification")
			}
			p.State.Quest = 3
			p.State.Skills["trust"] += 5
			if e := a.money(tx, p.ID, "quest", "Uma ajuda da Amélia", "system", p.ID+":cash", 1000); e != nil {
				return e
			}
		default:
			return fail("already_done")
		}
		return a.save(tx, *p)
	case "rob":
		return a.rob(tx, *p, c.Target)
	case "defend":
		if c.Choice != "protect" && c.Choice != "call" {
			return fail("invalid")
		}
		res, e := tx.Exec(ctx, "UPDATE encounters SET defense=$3 WHERE id=$1 AND victim=$2 AND status='pending' AND due_at>$4", c.Target, p.ID, c.Choice, a.Now())
		if e != nil {
			return e
		}
		if res.RowsAffected() != 1 {
			return fail("not_found")
		}
		return nil
	case "appeal":
		var history []byte
		var appealed bool
		e := tx.QueryRow(ctx, "SELECT history,appealed FROM cases WHERE id=$1 AND user_id=$2", c.Target, p.ID).Scan(&history, &appealed)
		if e != nil {
			return fail("not_found")
		}
		if appealed {
			return fail("already_done")
		}
		var h []map[string]any
		json.Unmarshal(history, &h)
		h = append(h, map[string]any{"stage": "Recurso", "text": "Uma juíza NPC independente reviu os registos. A decisão foi convertida em advertência; a obrigação de serviço comunitário foi levantada.", "at": a.Now()})
		_, e = tx.Exec(ctx, "UPDATE cases SET appealed=true,status='warning',history=$3 WHERE id=$1 AND user_id=$2", c.Target, p.ID, blob(h))
		if e != nil {
			return e
		}
		p.State.DetainedUntil = a.Now()
		p.State.Heat = max(0, p.State.Heat-1)
		return a.save(tx, *p)
	case "service":
		if p.Venue != "community" {
			return fail("wrong_place")
		}
		var ok bool
		tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM cases WHERE id=$1 AND user_id=$2 AND status='service' AND NOT service_done)", c.Target, p.ID).Scan(&ok)
		if !ok {
			return fail("not_found")
		}
		return a.start(tx, *p, "service", c.Target, 12)
	case "admin_adjust", "admin_ban", "admin_report", "admin_setting":
		if !p.Admin {
			return fail("forbidden")
		}
		if utf8.RuneCountInString(c.Text) < 5 {
			return fail("invalid")
		}
		var e error
		switch c.Kind {
		case "admin_adjust":
			var target string
			e = tx.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1", c.Target).Scan(&target)
			if e != nil {
				return fail("not_found")
			}
			if c.Amount > 0 {
				e = a.money(tx, p.ID, "adjustment", c.Text, "system", target+":bank", c.Amount)
			} else {
				e = a.money(tx, p.ID, "adjustment", c.Text, target+":bank", "system", -c.Amount)
			}
		case "admin_ban":
			_, e = tx.Exec(ctx, "UPDATE users SET banned=$2 WHERE handle=$1 AND id<>$3", c.Target, c.Enabled, p.ID)
		case "admin_report":
			_, e = tx.Exec(ctx, "UPDATE reports SET status='resolved' WHERE id=$1", c.Target)
		case "admin_setting":
			if strings.HasPrefix(c.Target, "activity:") {
				_, e = a.activity(strings.TrimPrefix(c.Target, "activity:"))
			} else if strings.HasPrefix(c.Target, "venue:") {
				_, e = a.venue(strings.TrimPrefix(c.Target, "venue:"))
			} else {
				return fail("invalid")
			}
			if e != nil {
				return e
			}
			_, e = tx.Exec(ctx, "INSERT INTO settings VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", c.Target, blob(c.Enabled))
		}
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO audit(actor,event,data,created_at) VALUES($1,$2,$3,$4)", p.ID, c.Kind, blob(c), a.Now())
		return e
	default:
		return fail("invalid")
	}
}
func (a *App) rob(tx pgx.Tx, p Player, target string) error {
	if e := a.available(tx, p); e != nil {
		return e
	}
	var id string
	if e := tx.QueryRow(ctx, "SELECT id FROM users WHERE handle=$1 AND NOT banned", strings.TrimPrefix(target, "@")).Scan(&id); e != nil {
		return fail("not_found")
	}
	v, e := a.player(tx, id)
	if e != nil {
		return e
	}
	venue, _ := a.venue(p.Venue)
	if p.ID == v.ID || !p.State.Risk || !v.State.Risk || p.Venue != v.Venue || venue.Safe || p.State.ProtectedUntil.After(a.Now()) || v.State.ProtectedUntil.After(a.Now()) {
		return fail("protected")
	}
	if e = a.available(tx, v); e != nil {
		return e
	}
	var ok bool
	tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM presence WHERE user_id=$1 AND seen_at>$2)", v.ID, a.Now().Add(-25*time.Second)).Scan(&ok)
	if !ok {
		return fail("protected")
	}
	tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM blocks WHERE owner=$1 AND target=$2 OR owner=$2 AND target=$1)", p.ID, v.ID).Scan(&ok)
	if ok {
		return fail("blocked")
	}
	tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM encounters WHERE ((attacker=$1 AND victim=$2) OR (attacker=$2 AND victim=$1)) AND created_at>$3)", p.ID, v.ID, a.Now().Add(-24*time.Hour)).Scan(&ok)
	if ok {
		return fail("cooldown")
	}
	_, e = tx.Exec(ctx, "INSERT INTO encounters(id,attacker,victim,venue,status,created_at,due_at) VALUES($1,$2,$3,$4,'pending',$5,$6)", uid(), p.ID, v.ID, p.Venue, a.Now(), a.Now().Add(10*time.Second))
	return e
}
