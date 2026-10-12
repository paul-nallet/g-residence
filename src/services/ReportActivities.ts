import { Effect } from 'effect'
import type { Me } from '../domain/accounts.ts'
import type { ReportRow } from '../domain/agenda.ts'
import { addDays, appointmentInstant, parisDate } from '../domain/rules.ts'
import { sql, type Sql } from './Database.ts'

type Activity = Omit<ReportRow, 'firstName' | 'lastName'>

export const reportActivities = Effect.fn('Agenda.activities')(function* (
  db: Sql['Service'],
  me: Me,
  from: string,
  to: string,
) {
  const start = appointmentInstant(from + 'T00:00')!,
    end = appointmentInstant(addDays(to, 1) + 'T00:00')!
  const dated = (query: string) => db.all<Activity>(sql(query, me.residenceId, from, to))
  const timed = (query: string) => db.all<Activity>(sql(query, me.residenceId, start, end))
  const location = `(SELECT group_concat(label, ', ') FROM
    (SELECT COALESCE('Lot ' || l.number,p.name) AS label FROM work_locations x
    LEFT JOIN lots l ON l.id=x.lot_id LEFT JOIN places p ON p.id=x.place_id
    WHERE x.work_id=w.id ORDER BY label))`
  const groups = yield* Effect.all([
    dated(`SELECT v.completed_on AS date,'Technique' AS module,'' AS lot,v.name || ' · ' || b.name AS subject,
      'Visite technique réalisée' AS kind,u.name AS actor,v.report ||
      COALESCE((SELECT ' · Anomalies : ' || group_concat(zone || ' · ' || label || ' : ' || note, ' ; ') FROM visit_points WHERE visit_id=v.id AND state='issue'),'') ||
      COALESCE((SELECT ' · Non vérifiés : ' || group_concat(zone || ' · ' || label || ' : ' || note, ' ; ') FROM visit_points WHERE visit_id=v.id AND state='not_verified'),'') AS comment
      FROM technical_visits v JOIN buildings b ON b.id=v.building_id JOIN users u ON u.id=v.completed_by
      WHERE v.residence_id=? AND v.status='done' AND v.completed_on BETWEEN ? AND ?`),
    timed(`SELECT t.completed_at AS date,'Ménage' AS module,l.number AS lot,t.template_name AS subject,
      'Ménage réalisé' AS kind,u.name AS actor,
      t.report || CASE WHEN t.note<>'' THEN ' · Consigne : ' || t.note ELSE '' END ||
      COALESCE((SELECT ' · Points signalés : ' || group_concat(label || CASE WHEN note<>'' THEN ' : ' || note ELSE '' END, ' ; ')
        FROM cleaning_task_items WHERE task_id=t.id AND state='issue'),'') AS comment
      FROM cleaning_tasks t JOIN lots l ON l.id=t.lot_id JOIN users u ON u.id=t.completed_by
      WHERE t.residence_id=? AND t.status='done' AND t.completed_at>=? AND t.completed_at<?`),
    dated(`SELECT i.reported_on AS date,'Technique' AS module,COALESCE(l.number,'') AS lot,
      i.title || ' · ' || COALESCE(p.name,'Lot ' || l.number,'Communs') AS subject,
      'Signalement constaté' AS kind,u.name AS actor,i.description AS comment
      FROM issues i LEFT JOIN lots l ON l.id=i.lot_id LEFT JOIN places p ON p.id=i.place_id
      JOIN users u ON u.id=i.created_by WHERE i.residence_id=? AND i.reported_on BETWEEN ? AND ?`),
    dated(`SELECT w.actual_start AS date,'Technique' AS module,'' AS lot,
      w.title || COALESCE(' · ' || ${location},'') AS subject,'Travaux commencés' AS kind,'' AS actor,w.description AS comment
      FROM works w WHERE w.residence_id=? AND w.state<>'cancelled' AND w.actual_start BETWEEN ? AND ?`),
    dated(`SELECT w.actual_end AS date,'Technique' AS module,'' AS lot,
      w.title || COALESCE(' · ' || ${location},'') AS subject,'Travaux terminés' AS kind,'' AS actor,w.description AS comment
      FROM works w WHERE w.residence_id=? AND w.state='done' AND w.actual_end BETWEEN ? AND ?`),
    timed(`SELECT n.created_at AS date,'Technique' AS module,'' AS lot,
      w.title || COALESCE(' · ' || ${location},'') AS subject,
      CASE n.kind WHEN 'problem' THEN 'Problème rencontré' ELSE 'Note de travaux' END AS kind,
      u.name AS actor,n.body AS comment FROM work_notes n JOIN works w ON w.id=n.work_id
      JOIN users u ON u.id=n.actor_id WHERE n.residence_id=? AND n.kind<>'status' AND n.created_at>=? AND n.created_at<?`),
    timed(`SELECT i.starts_at AS date,'Technique' AS module,'' AS lot,
      w.title || COALESCE(' · ' || ${location},'') AS subject,
      'Intervention réalisée' AS kind,COALESCE(s.name,'') AS actor,i.report AS comment
      FROM interventions i JOIN works w ON w.id=i.work_id LEFT JOIN suppliers s ON s.id=i.supplier_id
      WHERE i.residence_id=? AND i.status='done' AND i.starts_at>=? AND i.starts_at<?`),
    dated(`SELECT m.occurred_on AS date,'Stocks' AS module,'' AS lot,a.name AS subject,
      CASE m.kind WHEN 'in' THEN 'Entrée de stock' WHEN 'out' THEN 'Sortie de stock' ELSE 'Inventaire de stock' END AS kind,
      u.name AS actor,'Variation : ' || m.delta || ' ' || a.unit || ' · Stock après : ' || m.quantity_after ||
      CASE WHEN m.comment<>'' THEN ' · ' || m.comment ELSE '' END AS comment
      FROM stock_movements m JOIN stock_items a ON a.id=m.item_id JOIN users u ON u.id=m.actor_id
      WHERE m.residence_id=? AND m.occurred_on BETWEEN ? AND ?`),
    dated(`SELECT r.observed_on AS date,'Relevés' AS module,'' AS lot,m.name || ' · ' || m.location AS subject,
      'Index constaté' AS kind,u.name AS actor,'Index : ' || r.value || ' ' || CASE m.unit WHEN 'm3' THEN 'm³' ELSE m.unit END AS comment
      FROM meter_readings r JOIN meters m ON m.id=r.meter_id JOIN users u ON u.id=r.actor_id
      WHERE r.residence_id=? AND r.observed_on BETWEEN ? AND ?`),
    timed(`SELECT c.created_at AS date,'Prestations' AS module,'' AS lot,s.name AS subject,
      CASE WHEN c.before_json IS NULL THEN 'Chiffre d’affaires saisi' ELSE 'Chiffre d’affaires corrigé' END AS kind,
      u.name AS actor,'Période : ' || json_extract(c.after_json,'$.period') || ' · ' ||
      printf('%.2f',json_extract(c.after_json,'$.amount_cents')/100.0) || ' € ' ||
      CASE COALESCE(json_extract(c.after_json,'$.vat_mode'),'ttc') WHEN 'ht' THEN 'HT' ELSE 'TTC' END ||
      CASE WHEN COALESCE(json_extract(c.after_json,'$.comment'),'')<>'' THEN ' · ' || json_extract(c.after_json,'$.comment') ELSE '' END AS comment
      FROM revenue_entry_changes c JOIN revenue_entries e ON e.id=c.entry_id JOIN revenue_sources s ON s.id=e.source_id
      JOIN users u ON u.id=c.actor_id WHERE c.residence_id=? AND c.created_at>=? AND c.created_at<?`),
    timed(`SELECT f.created_at AS date,'Boîte à idées' AS module,'' AS lot,'Retour de l’équipe' AS subject,
      CASE f.kind WHEN 'bug' THEN 'Bug signalé' WHEN 'feature' THEN 'Fonctionnalité demandée' ELSE 'Idée déposée' END AS kind,
      u.name AS actor,f.message AS comment FROM feedback f JOIN users u ON u.id=f.author_id
      WHERE f.residence_id=? AND f.created_at>=? AND f.created_at<?`),
    timed(`SELECT h.created_at AS date,'Lots' AS module,l.number AS lot,'Lot ' || l.number AS subject,
      h.action AS kind,u.name AS actor,'' AS comment FROM history h JOIN lots l ON l.id=h.lot_id
      JOIN users u ON u.id=h.actor_id WHERE h.residence_id=? AND h.created_at>=? AND h.created_at<? AND h.action LIKE 'Lot %'`),
    me.role === 'admin'
      ? timed(`SELECT created_at AS date,'Équipe' AS module,'' AS lot,name AS subject,
          'Compte créé' AS kind,'' AS actor,CASE role WHEN 'admin' THEN 'Administrateur' WHEN 'manager' THEN 'Gestionnaire' ELSE 'Ménage' END AS comment
          FROM users WHERE residence_id=? AND created_at>=? AND created_at<?`)
      : Effect.succeed([]),
  ])
  return groups.flat().map((row): ReportRow => ({
    ...row,
    date: row.date.includes('T') ? parisDate(row.date) : row.date,
    lastName: '',
    firstName: '',
  }))
})
