package main

import (
	"github.com/jackc/pgx/v5"
	"time"
)

func (a *App) tick() error {
	return a.transaction(func(tx pgx.Tx) error {
		rows, e := tx.Query(ctx, "SELECT id,user_id,kind,target FROM actions WHERE status='running' AND due_at<=$1 ORDER BY due_at LIMIT 50 FOR UPDATE SKIP LOCKED", a.Now())
		if e != nil {
			return e
		}
		type job struct{ id, user, kind, target string }
		jobs := []job{}
		for rows.Next() {
			var j job
			if e = rows.Scan(&j.id, &j.user, &j.kind, &j.target); e != nil {
				rows.Close()
				return e
			}
			jobs = append(jobs, j)
		}
		rows.Close()
		for _, j := range jobs {
			p, e := a.player(tx, j.user)
			if e != nil {
				return e
			}
			result := map[string]any{"text": "Atividade concluída."}
			switch j.kind {
			case "travel":
				p.Venue = j.target
				p.State.Stats["energy"] = max(20, p.State.Stats["energy"]-2)
				result["text"] = "Chegaste ao teu destino."
			case "activity":
				act, e := a.activity(j.target)
				if e != nil {
					return e
				}
				for k, d := range act.Effects {
					p.State.Stats[k] = max(0, min(100, p.State.Stats[k]+d))
				}
				if act.Skill != "" {
					p.State.Skills[act.Skill]++
				}
				if act.Reward > 0 {
					if e = a.money(tx, p.ID, "wage", act.Name, "system", p.ID+":cash", act.Reward); e != nil {
						return e
					}
				}
				if act.Item != "" {
					if _, e = tx.Exec(ctx, "INSERT INTO inventory VALUES($1,$2,1) ON CONFLICT(user_id,item) DO UPDATE SET quantity=inventory.quantity+1", p.ID, act.Item); e != nil {
						return e
					}
				}
				if act.Qualification != "" {
					if _, e = tx.Exec(ctx, "INSERT INTO qualifications VALUES($1,$2,$3) ON CONFLICT DO NOTHING", p.ID, act.Qualification, a.Now()); e != nil {
						return e
					}
					result["text"] = "Curso concluído. Recebeste a qualificação de atendimento."
				}
				result["activity"] = act.Name
			case "service":
				if _, e = tx.Exec(ctx, "UPDATE cases SET status='closed',service_done=true,history=history || $3::jsonb WHERE id=$1 AND user_id=$2", j.target, p.ID, blob([]map[string]any{{"stage": "Serviço concluído", "text": "O processo foi encerrado. Obrigado por ajudares o bairro.", "at": a.Now()}})); e != nil {
					return e
				}
				p.State.Heat = 0
				result["text"] = "Serviço comunitário concluído."
			}
			if e = a.save(tx, p); e != nil {
				return e
			}
			if _, e = tx.Exec(ctx, "UPDATE actions SET status='completed',result=$2 WHERE id=$1 AND status='running'", j.id, blob(result)); e != nil {
				return e
			}
			if e = a.event(tx, p.ID, "action"); e != nil {
				return e
			}
		}
		erows, e := tx.Query(ctx, "SELECT id,attacker,victim,defense FROM encounters WHERE status='pending' AND due_at<=$1 FOR UPDATE SKIP LOCKED", a.Now())
		if e != nil {
			return e
		}
		type enc struct{ id, attacker, victim, defense string }
		encs := []enc{}
		for erows.Next() {
			var n enc
			if e = erows.Scan(&n.id, &n.attacker, &n.victim, &n.defense); e != nil {
				erows.Close()
				return e
			}
			encs = append(encs, n)
		}
		erows.Close()
		for _, n := range encs {
			if e = a.resolve(tx, n.id, n.attacker, n.victim, n.defense); e != nil {
				return e
			}
		}
		_, e = tx.Exec(ctx, "UPDATE outbox SET delivered_at=$1 WHERE delivered_at IS NULL", a.Now())
		return e
	})
}
func (a *App) resolve(tx pgx.Tx, id, attacker, victim, defense string) error {
	p, e := a.player(tx, attacker)
	if e != nil {
		return e
	}
	v, e := a.player(tx, victim)
	if e != nil {
		return e
	}
	chance := 45 + min(15, p.State.Skills["street"]) - min(15, v.State.Skills["fitness"])
	if p.State.Stats["energy"] < 40 {
		chance -= 15
	}
	if defense == "protect" {
		chance -= 20
	}
	amount := int64(0)
	if a.Roll(100) < chance {
		amount = min(v.Cash/10, 10000)
	}
	if amount > 0 {
		if e = a.money(tx, attacker, "encounter", "Encontro de risco: "+id, victim+":cash", attacker+":cash", amount); e != nil {
			return e
		}
	}
	v.State.ProtectedUntil = a.Now().Add(time.Hour)
	p.State.Heat++
	p.State.Skills["street"]++
	if e = a.save(tx, v); e != nil {
		return e
	}
	detected := defense == "call" || a.Roll(100) < 70
	if detected {
		p.State.DetainedUntil = a.Now().Add(15 * time.Second)
		history := []map[string]any{}
		for _, s := range []struct{ stage, text string }{{"Incidente", "O servidor registou um encontro de risco entre participantes elegíveis."}, {"Participação", "Um agente NPC recebeu o registo automático do incidente."}, {"Investigação", "Uma investigadora NPC confirmou local, participantes e resultado."}, {"Prova", "Foram considerados apenas os eventos autenticados deste encontro."}, {"Audiência", "A assistência jurídica NPC representou o interveniente; não foi necessária presença da vítima."}, {"Decisão", "O juiz NPC determinou uma retenção de 15 segundos e uma tarefa de serviço comunitário. Podes apresentar recurso."}} {
			history = append(history, map[string]any{"stage": s.stage, "text": s.text, "at": a.Now()})
		}
		_, e = tx.Exec(ctx, "INSERT INTO cases(id,user_id,encounter,status,evidence,history,created_at) VALUES($1,$2,$3,'service',$4,$5,$6)", uid(), p.ID, id, blob(map[string]any{"event": id, "venue": p.Venue, "amount": amount, "source": "server"}), blob(history), a.Now())
		if e != nil {
			return e
		}
	}
	if e = a.save(tx, p); e != nil {
		return e
	}
	_, e = tx.Exec(ctx, "UPDATE encounters SET status='completed',amount=$2,resolved_at=$3 WHERE id=$1", id, amount, a.Now())
	if e != nil {
		return e
	}
	return a.event(tx, "", "encounter")
}
