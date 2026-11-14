/**
 * End-to-end integration test for the Department → Program → Baseline → Component → Subcomponent
 * hierarchy against a REAL PostgreSQL database through the real Express stack (supertest).
 *
 * Opt-in: set INTEGRATION_DATABASE_URL to a server you can create databases on, e.g.
 *   INTEGRATION_DATABASE_URL=postgresql://estimation_user:estimation_pass@localhost:5435/estimation_it npm run test:integration
 * The database named in the URL is DROPPED and re-created — never point it at a real database.
 */
import { Client } from 'pg';
import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';

const URL = process.env.INTEGRATION_DATABASE_URL;
const d = URL ? describe : describe.skip;

jest.setTimeout(120_000);

d('hierarchy integration (real PostgreSQL)', () => {
  let app: Express;
  let pool: Pool;
  let gsaToken = '';
  const ids: Record<string, string> = {};

  const api = () => request(app);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string, password: string): Promise<string> {
    const r = await api().post('/api/auth/login').send({ email, password });
    expect(r.status).toBe(200);
    return r.body.accessToken;
  }

  beforeAll(async () => {
    const dbName = new globalThis.URL(URL!).pathname.slice(1);
    if (!/_it$|_test$/.test(dbName)) throw new Error(`Refusing to recreate "${dbName}" — integration DB name must end in _it or _test`);
    const adminUrl = URL!.replace(/\/[^/]+$/, '/postgres');
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();

    process.env.DATABASE_URL = URL;
    process.env.JWT_SECRET = 'it-secret';
    process.env.JWT_REFRESH_SECRET = 'it-refresh';

    // ── Simulate a pre-hierarchy database: legacy schema + legacy data, then run the full init ──
    const db = await import('../../config/database');
    pool = db.pool;
    const pre = await pool.connect();
    try {
      const { runEnterpriseMigration } = await import('../../db/migrate');
      const { runParametricMigration } = await import('../../db/migrate.parametric');
      await pre.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await pre.query(`CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql'`);
      // minimal legacy estimations table (as created by the original init schema)
      await pre.query(`CREATE TABLE estimations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), title VARCHAR(255) NOT NULL, description TEXT, project_name VARCHAR(255),
        complexity VARCHAR(20) NOT NULL, risk VARCHAR(20) NOT NULL, competency VARCHAR(20) NOT NULL,
        work_group VARCHAR(20) NOT NULL DEFAULT 'DEVELOPMENT', story_points INTEGER NOT NULL,
        initial_min_days DECIMAL(8,2) NOT NULL, initial_max_days DECIMAL(8,2) NOT NULL,
        initial_min_hours DECIMAL(9,2) NOT NULL, initial_max_hours DECIMAL(9,2) NOT NULL, overhead_percent DECIMAL(5,4) NOT NULL,
        revised_min_days DECIMAL(8,4) NOT NULL, revised_max_days DECIMAL(8,4) NOT NULL,
        revised_min_hours DECIMAL(9,4) NOT NULL, revised_max_hours DECIMAL(9,4) NOT NULL,
        actual_hours DECIMAL(9,2), actual_days DECIMAL(8,2), completed_at TIMESTAMPTZ, variance_hours DECIMAL(9,4),
        accuracy_percent DECIMAL(6,4), notes TEXT, status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
      await pre.query(`CREATE TABLE notifications (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), type VARCHAR(20) DEFAULT 'info', title VARCHAR(255) NOT NULL, message TEXT NOT NULL, read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`);
      await runEnterpriseMigration(pre);
      await runParametricMigration(pre);
      const legacy = await pre.query(`INSERT INTO projects (name, code) VALUES ('Legacy Program', 'LEG') RETURNING id`);
      ids.legacyProgram = legacy.rows[0].id;
      const insertEst = `INSERT INTO estimations (title, project_id, complexity, risk, competency, story_points,
          initial_min_days, initial_max_days, initial_min_hours, initial_max_hours, overhead_percent,
          revised_min_days, revised_max_days, revised_min_hours, revised_max_hours)
        VALUES ($1, $2, 'Low','Low','Expert', 1, 1,1,8,8,0, 1,1,8,8)`;
      await pre.query(insertEst, ['Legacy with program', ids.legacyProgram]);
      await pre.query(insertEst, ['Legacy without program', null]);
    } finally {
      pre.release();
    }

    const { initDatabase } = await import('../../db/init');
    await initDatabase();
    await initDatabase(); // idempotent second run

    app = (await import('../../app')).default;
    gsaToken = await login('ashu.joshi@mail.com', 'Ashu@123');
  });

  afterAll(async () => { await pool?.end(); });

  // ─── Migration ─────────────────────────────────────────────────────────────
  it('migrates legacy programs into the Unassigned department and legacy tasks into a Legacy baseline', async () => {
    const { rows: [p] } = await pool.query(
      `SELECT d.code FROM projects p JOIN departments d ON d.id = p.department_id WHERE p.id = $1`, [ids.legacyProgram]);
    expect(p.code).toBe('UNASSIGNED');

    const { rows } = await pool.query(
      `SELECT e.title, e.department_id IS NOT NULL AS has_dept, b.is_legacy
         FROM estimations e LEFT JOIN baselines b ON b.id = e.baseline_id ORDER BY e.title`);
    expect(rows).toEqual([
      { title: 'Legacy with program', has_dept: true, is_legacy: true },
      { title: 'Legacy without program', has_dept: false, is_legacy: null }, // not invented
    ]);
    const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int n FROM baselines WHERE is_legacy`);
    expect(n).toBe(1); // created only for programs that had baseline-less rows, and only once
  });

  // ─── Master data via API ───────────────────────────────────────────────────
  it('creates departments, rejects duplicates', async () => {
    const eng = await api().post('/api/departments').set(auth(gsaToken)).send({ name: 'Engineering', code: 'ENG' });
    expect(eng.status).toBe(201);
    ids.eng = eng.body.data.id;
    const ops = await api().post('/api/departments').set(auth(gsaToken)).send({ name: 'Operations', code: 'OPS' });
    ids.ops = ops.body.data.id;
    const dup = await api().post('/api/departments').set(auth(gsaToken)).send({ name: 'engineering', code: 'X1' });
    expect(dup.status).toBe(409);
    const bad = await api().post('/api/departments').set(auth(gsaToken)).send({ name: 'No code' });
    expect(bad.status).toBe(400); // Zod → 400 via errorHandler
  });

  it('requires a department to create a program (via /api/programs)', async () => {
    const noDept = await api().post('/api/programs').set(auth(gsaToken)).send({ name: 'Orphan' });
    expect(noDept.status).toBe(400);
    const p1 = await api().post('/api/programs').set(auth(gsaToken)).send({ name: 'Apollo', code: 'APL', department_id: ids.eng });
    expect(p1.status).toBe(201);
    ids.apollo = p1.body.data.id;
    const p2 = await api().post('/api/programs').set(auth(gsaToken)).send({ name: 'Borealis', code: 'BOR', department_id: ids.eng });
    ids.borealis = p2.body.data.id;
    const list = await api().get(`/api/programs?departmentId=${ids.eng}`).set(auth(gsaToken));
    expect(list.body.data.map((p: { name: string }) => p.name)).toEqual(['Apollo', 'Borealis']);
  });

  it('creates multiple baselines, components and subcomponents', async () => {
    for (const [key, name] of [['b1', 'Baseline 1'], ['b2', 'Baseline 2']]) {
      const r = await api().post('/api/baselines').set(auth(gsaToken)).send({ program_id: ids.apollo, name, version: 'v1' });
      expect(r.status).toBe(201);
      ids[key] = r.body.data.id;
    }
    const other = await api().post('/api/baselines').set(auth(gsaToken)).send({ program_id: ids.borealis, name: 'Baseline 1' });
    expect(other.status).toBe(201); // same name allowed in a different program
    ids.borB1 = other.body.data.id;
    const dup = await api().post('/api/baselines').set(auth(gsaToken)).send({ program_id: ids.apollo, name: 'baseline 1' });
    expect(dup.status).toBe(409);

    const c = await api().post('/api/components').set(auth(gsaToken)).send({ baseline_id: ids.b1, name: 'API' });
    ids.comp = c.body.data.id;
    const s = await api().post('/api/subcomponents').set(auth(gsaToken)).send({ component_id: ids.comp, name: 'Auth' });
    ids.sub = s.body.data.id;
    const c2 = await api().post('/api/components').set(auth(gsaToken)).send({ baseline_id: ids.b2, name: 'UI' });
    ids.compB2 = c2.body.data.id;
    expect([c.status, s.status, c2.status]).toEqual([201, 201, 201]);
  });

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  const sp = { title: 'Login', complexity: 'Low', risk: 'Low', competency: 'Expert', work_group: 'DEVELOPMENT' };
  const pe = { task_title: 'Gateway', middleware_inputs: 'Small', application: 'Medium', system_configuration: 'NA', data_and_control_flow: 'Small', use_case: 'Large', team_efficiency: 1 };

  it('creates SP and PE tasks with and without optional levels', async () => {
    const h = { department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b1 };
    const r1 = await api().post('/api/estimations').set(auth(gsaToken)).send({ ...sp, ...h });
    const r2 = await api().post('/api/estimations').set(auth(gsaToken)).send({ ...sp, ...h, component_id: ids.comp, subcomponent_id: ids.sub });
    const r3 = await api().post('/api/parametric-estimations').set(auth(gsaToken)).send({ ...pe, ...h, component_id: ids.comp });
    expect([r1.status, r2.status, r3.status]).toEqual([201, 201, 201]);
    ids.spTask = r1.body.data.id;
    ids.peTask = r3.body.data.id;
    expect(r2.body.data.subcomponent_name).toBe('Auth');
  });

  it('rejects invalid hierarchy combinations at the API', async () => {
    const crossProgram = await api().post('/api/estimations').set(auth(gsaToken))
      .send({ ...sp, department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.borB1 });
    expect(crossProgram.status).toBe(400);
    const crossBaseline = await api().post('/api/parametric-estimations').set(auth(gsaToken))
      .send({ ...pe, department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b1, component_id: ids.compB2 });
    expect(crossBaseline.status).toBe(400);
    const crossDept = await api().post('/api/estimations').set(auth(gsaToken))
      .send({ ...sp, department_id: ids.ops, program_id: ids.apollo, baseline_id: ids.b1 });
    expect(crossDept.status).toBe(400);
  });

  it('enforces the hierarchy in the database itself (composite FKs + CHECK)', async () => {
    const base = `INSERT INTO estimations (title, department_id, project_id, baseline_id, component_id, subcomponent_id,
        complexity, risk, competency, story_points, initial_min_days, initial_max_days, initial_min_hours, initial_max_hours,
        overhead_percent, revised_min_days, revised_max_days, revised_min_hours, revised_max_hours)
      VALUES ('x', $1, $2, $3, $4, $5, 'Low','Low','Expert',1,1,1,8,8,0,1,1,8,8)`;
    await expect(pool.query(base, [ids.eng, ids.apollo, ids.borB1, null, null])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(base, [ids.ops, ids.apollo, ids.b1, null, null])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(base, [ids.eng, ids.apollo, ids.b1, ids.compB2, null])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(base, [ids.eng, ids.apollo, ids.b1, null, ids.sub])).rejects.toMatchObject({ code: '23514' });
  });

  it('aggregates estimated vs actual effort at every level', async () => {
    await api().patch(`/api/estimations/${ids.spTask}/actuals`).set(auth(gsaToken)).send({ actual_hours: 10 }).expect(200);
    await api().patch(`/api/parametric-estimations/${ids.peTask}/actuals`).set(auth(gsaToken)).send({ actual_days: 5 }).expect(200);

    const byComp = await api().get(`/api/hierarchy/effort?module=sp&groupBy=component&baselineId=${ids.b1}`).set(auth(gsaToken));
    expect(byComp.status).toBe(200);
    expect(byComp.body.data.map((r: { name: string }) => r.name).sort()).toEqual(['(No component)', 'API']);
    expect(byComp.body.totals.task_count).toBe(2);
    expect(byComp.body.totals.actual_total).toBe(10);

    const byDept = await api().get(`/api/hierarchy/effort?module=pe&groupBy=department&departmentId=${ids.eng}`).set(auth(gsaToken));
    expect(byDept.body.unit).toBe('person_days');
    expect(byDept.body.data).toHaveLength(1);
    expect(byDept.body.data[0]).toMatchObject({ name: 'Engineering', completed_count: 1, actual_total: 5 });
  });

  it('cascades a program move to its tasks', async () => {
    await api().put(`/api/programs/${ids.borealis}`).set(auth(gsaToken)).send({ department_id: ids.ops }).expect(200);
    await api().put(`/api/programs/${ids.apollo}`).set(auth(gsaToken)).send({ department_id: ids.ops }).expect(200);
    const { rows } = await pool.query(`SELECT DISTINCT department_id FROM estimations WHERE project_id = $1`, [ids.apollo]);
    expect(rows).toEqual([{ department_id: ids.ops }]);
    await api().put(`/api/programs/${ids.apollo}`).set(auth(gsaToken)).send({ department_id: ids.eng }).expect(200);
  });

  // ─── Scoped user permissions ───────────────────────────────────────────────
  it('scoped users only see and use departments / programs they are assigned to', async () => {
    const { rows: [yash] } = await pool.query(`SELECT id FROM users WHERE username = 'yash.hb'`);
    await api().post(`/api/programs/${ids.apollo}/users`).set(auth(gsaToken)).send({ userIds: [yash.id] }).expect(200);
    const token = await login('yash.hb@mail.com', 'Yash@123');

    const ctx = await api().get('/api/hierarchy/context').set(auth(token));
    expect(ctx.body.data.isGlobal).toBe(false);
    const deptNames = ctx.body.data.departments.map((x: { name: string }) => x.name);
    expect(deptNames).toContain('Engineering');
    expect(deptNames).not.toContain('Operations');
    const programNames = ctx.body.data.programs.map((x: { name: string }) => x.name);
    expect(programNames).toContain('Apollo');
    expect(programNames).not.toContain('Borealis');

    const opsPrograms = await api().get(`/api/hierarchy/lookup/programs?departmentId=${ids.ops}`).set(auth(token));
    expect(opsPrograms.body.data).toEqual([]);

    const forbidden = await api().post('/api/baselines').set(auth(token)).send({ program_id: ids.borealis, name: 'nope' });
    expect(forbidden.status).toBe(403); // User role lacks baseline.create

    const created = await api().post('/api/estimations').set(auth(token))
      .send({ ...sp, department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b2 });
    expect(created.status).toBe(201);

    const unauthorised = await api().post('/api/estimations').set(auth(token))
      .send({ ...sp, department_id: ids.ops, program_id: ids.borealis, baseline_id: ids.borB1 });
    expect(unauthorised.status).toBe(403);

    const list = await api().get(`/api/estimations?limit=100`).set(auth(token));
    expect(list.body.data.every((e: { project_id: string }) => e.project_id !== null)).toBe(true); // no legacy unassigned rows
    const other = await api().get(`/api/estimations?departmentId=${ids.ops}`).set(auth(token));
    expect(other.body.data).toEqual([]);
  });

  it('PE actuals: record, recorder correction, permission-gated correction, audit trail, KPIs', async () => {
    const token = await login('yash.hb@mail.com', 'Yash@123');
    // Yash cannot correct actuals the GSA recorded on peTask (User role lacks parametric.actuals.correct)
    const blocked = await api().patch(`/api/parametric-estimations/${ids.peTask}/actuals`).set(auth(token)).send({ actual_days: 6 });
    expect(blocked.status).toBe(403);

    const created = await api().post('/api/parametric-estimations').set(auth(token))
      .send({ ...pe, department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b1 });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const estimated = Number(created.body.data.final_estimation);
    expect(created.body.data.actual_days).toBeNull(); // only the estimate exists initially

    const rec = await api().patch(`/api/parametric-estimations/${id}/actuals`).set(auth(token)).send({ actual_days: estimated + 2, notes: 'ran long' });
    expect(rec.status).toBe(200);
    expect(rec.body.data).toMatchObject({ status: 'completed', actual_notes: 'ran long', actuals_recorded_by_name: 'Yash HB' });
    expect(Number(rec.body.data.variance_days)).toBe(-2);                       // Estimated − Actual
    expect(Number(rec.body.data.final_estimation)).toBe(estimated);             // estimate untouched

    const own = await api().patch(`/api/parametric-estimations/${id}/actuals`).set(auth(token)).send({ actual_days: estimated });
    expect(own.status).toBe(200);
    expect(Number(own.body.data.accuracy_percent)).toBe(100);
    expect(own.body.data.actual_notes).toBe('ran long');                        // notes kept when omitted

    const fixed = await api().patch(`/api/parametric-estimations/${id}/actuals`).set(auth(gsaToken)).send({ actual_days: estimated - 1 });
    expect(fixed.status).toBe(200);
    expect(fixed.body.data).toMatchObject({ actuals_recorded_by_name: 'Yash HB', actuals_updated_by_name: 'Ashu Joshi' });

    const { rows: audit } = await pool.query(
      `SELECT action, previous_value, new_value FROM audit_logs WHERE entity = 'parametric_estimation' AND entity_id = $1 ORDER BY timestamp`, [id]);
    expect(audit.map(a => a.action)).toEqual(['actuals_recorded', 'actuals_corrected', 'actuals_corrected']);
    expect(Number(audit[2].previous_value.actual_days)).toBe(estimated);

    await expect(pool.query(`UPDATE parametric_estimations SET actual_days = 0 WHERE id = $1`, [id])).rejects.toMatchObject({ code: '23514' });

    const summary = await api().get(`/api/parametric-analysis/summary?programId=${ids.apollo}`).set(auth(gsaToken));
    expect(summary.body.data.completed_count).toBe(2);
    expect(summary.body.data.under_estimate_count + summary.body.data.over_estimate_count + summary.body.data.on_target_count).toBe(2);
    const actuals = await api().get(`/api/parametric-analysis/actuals?programId=${ids.apollo}`).set(auth(gsaToken));
    expect(actuals.body.data.points).toHaveLength(2);
  });

  it('blocks tasks under inactive baselines', async () => {
    await api().patch(`/api/baselines/${ids.b2}/status`).set(auth(gsaToken)).send({ status: 'inactive' }).expect(200);
    const r = await api().post('/api/estimations').set(auth(gsaToken))
      .send({ ...sp, department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b2 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inactive/);
  });

  it('re-homes a legacy unassigned task into the hierarchy', async () => {
    const legacy = await api().get('/api/estimations?unassigned=true').set(auth(gsaToken));
    expect(legacy.body.data).toHaveLength(1);
    const moved = await api().put(`/api/estimations/${legacy.body.data[0].id}`).set(auth(gsaToken))
      .send({ department_id: ids.eng, program_id: ids.apollo, baseline_id: ids.b1 });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ program_name: 'Apollo', baseline_name: 'Baseline 1', department_name: 'Engineering' });
  });

  it('prevents deleting baselines / components that have tasks', async () => {
    expect((await api().delete(`/api/components/${ids.comp}`).set(auth(gsaToken))).status).toBe(409);
    expect((await api().delete(`/api/baselines/${ids.b1}`).set(auth(gsaToken))).status).toBe(409);
    expect((await api().delete(`/api/components/${ids.compB2}`).set(auth(gsaToken))).status).toBe(200);
  });
// ─── Dashboard Estimation Activity (date range) ────────────────────────────
  it("Estimation Activity: custom range, time zone bucketing, filters, manual vs Excel, SP completions", async () => {
    const { rows: [prog] } = await pool.query("SELECT department_id FROM projects WHERE id = $1", [ids.apollo]);
    const { rows: [bor] } = await pool.query("SELECT department_id FROM projects WHERE id = $1", [ids.borealis]);
    const h = { department_id: prog.department_id, program_id: ids.apollo, baseline_id: ids.b1 };
    const mk = async (body: object) => {
      const r = await api().post("/api/parametric-estimations").set(auth(gsaToken)).send({ ...pe, ...body });
      expect(r.status).toBe(201);
      return r.body.data.id as string;
    };
    const late = await mk(h);                                        // 10 Mar 20:00 UTC = 11 Mar in Kolkata
    const early = await mk(h);
    const excel = await mk(h);
    const other = await mk({ department_id: bor.department_id, program_id: ids.borealis, baseline_id: ids.borB1 });
    const setAt = (id: string, at: string, source = "manual") =>
      pool.query("UPDATE parametric_estimations SET created_at = $2, source = $3 WHERE id = $1", [id, at, source]);
    await setAt(late, "2025-03-10T20:00:00Z");
    await setAt(early, "2025-03-10T10:00:00Z");
    await setAt(excel, "2025-03-20T10:00:00Z", "excel_import");
    await setAt(other, "2025-03-10T10:00:00Z");

    const pt = (body: { data: Array<{ date: string }> }, date: string) => body.data.find(p => p.date === date);
    const march = await api().get(`/api/parametric-analysis/trend?from=2025-03-01&to=2025-03-31&programId=${ids.apollo}`).set(auth(gsaToken));
    expect(march.status).toBe(200);
    expect(march.body.meta).toEqual({ from: "2025-03-01", to: "2025-03-31", timezone: "UTC", interval: "day", days: 31 });
    expect(march.body.data).toHaveLength(31);                        // zero-filled
    expect(pt(march.body, "2025-03-10")).toMatchObject({ total: 2, manual: 2, excel_import: 0 });
    expect(pt(march.body, "2025-03-20")).toMatchObject({ total: 1, manual: 0, excel_import: 1 });
    expect(pt(march.body, "2025-03-11")).toMatchObject({ total: 0 });

    const ist = await api().get(`/api/parametric-analysis/trend?from=2025-03-01&to=2025-03-31&tz=Asia/Kolkata&programId=${ids.apollo}`).set(auth(gsaToken));
    expect(pt(ist.body, "2025-03-10")).toMatchObject({ total: 1 });
    expect(pt(ist.body, "2025-03-11")).toMatchObject({ total: 1 });

    const all = await api().get("/api/parametric-analysis/trend?from=2025-03-01&to=2025-03-31").set(auth(gsaToken));
    expect(pt(all.body, "2025-03-10")).toMatchObject({ total: 3 });
    const byBaseline = await api().get(`/api/parametric-analysis/trend?from=2025-03-01&to=2025-03-31&baselineId=${ids.borB1}`).set(auth(gsaToken));
    expect(byBaseline.body.data.reduce((n: number, p: { total: number }) => n + p.total, 0)).toBe(1);
    const byDept = await api().get(`/api/parametric-analysis/trend?from=2025-03-01&to=2025-03-31&departmentId=${prog.department_id}&programId=${ids.apollo}&baselineId=${ids.b1}`).set(auth(gsaToken));
    expect(byDept.body.data.reduce((n: number, p: { total: number }) => n + p.total, 0)).toBe(3);

    const sameDay = await api().get("/api/parametric-analysis/trend?from=2025-03-20&to=2025-03-20").set(auth(gsaToken));
    expect(sameDay.body.data).toEqual([expect.objectContaining({ date: "2025-03-20", total: 1, excel_import: 1 })]);

    const decade = await api().get("/api/parametric-analysis/trend?from=2016-01-01&to=2025-12-31").set(auth(gsaToken));
    expect(decade.body.meta.interval).toBe("month");
    expect(decade.body.data).toHaveLength(120);
    expect(pt(decade.body, "2025-03-01")).toMatchObject({ total: 4, period_start: "2025-03-01", period_end: "2025-03-31" });

    const weekly = await api().get("/api/parametric-analysis/trend?from=2025-01-01&to=2025-06-30").set(auth(gsaToken));
    expect(weekly.body.meta.interval).toBe("week");
    expect(weekly.body.data[0]).toMatchObject({ date: "2024-12-30", period_start: "2025-01-01", period_end: "2025-01-05" });

    const empty = await api().get("/api/parametric-analysis/trend?from=2019-01-01&to=2019-01-31").set(auth(gsaToken));
    expect(empty.body.data).toHaveLength(31);
    expect(empty.body.data.every((p: { total: number }) => p.total === 0)).toBe(true);

    const inverted = await api().get("/api/parametric-analysis/trend?from=2025-03-31&to=2025-03-01").set(auth(gsaToken));
    expect(inverted.status).toBe(400);
    expect((await api().get("/api/analysis/trend?from=2025-01-01&to=2999-01-01").set(auth(gsaToken))).status).toBe(400);

    // SP: creations by created_at, completions by completed_at
    const spRes = await api().post("/api/estimations").set(auth(gsaToken)).send({ ...sp, ...h });
    expect(spRes.status).toBe(201);
    await pool.query("UPDATE estimations SET created_at = $2, completed_at = $3, status = 'completed', accuracy_percent = 80 WHERE id = $1",
      [spRes.body.data.id, "2025-03-05T09:00:00Z", "2025-03-07T09:00:00Z"]);
    const spMarch = await api().get(`/api/analysis/trend?from=2025-03-01&to=2025-03-31&programId=${ids.apollo}`).set(auth(gsaToken));
    expect(spMarch.status).toBe(200);
    expect(pt(spMarch.body, "2025-03-05")).toMatchObject({ total: 1, completed: 0 });
    expect(pt(spMarch.body, "2025-03-07")).toMatchObject({ total: 0, completed: 1, avg_accuracy: 80 });

    const def = await api().get("/api/analysis/trend").set(auth(gsaToken));
    expect(def.body.meta).toMatchObject({ days: 30, interval: "day" });
    expect(def.body.data).toHaveLength(30);
  });
  // ─── Estimation module access (SP / PE) ────────────────────────────────────
  it('Module access: backfill, GSA/Admin grants, API enforcement, immediate revocation, audit', async () => {
    // Backfill: every seeded account keeps what its role already allowed (all roles allow both today), audited once
    const { rows: seeded } = await pool.query(`
      SELECT u.username, array_agg(uea.module_code ORDER BY uea.module_code DESC) AS modules, MIN(uea.grant_source) AS src
        FROM users u JOIN user_estimation_access uea ON uea.user_id = u.id AND uea.is_active
       WHERE u.username IN ('yash.hb', 'ankur.jain') GROUP BY u.username ORDER BY u.username`);
    expect(seeded).toEqual([
      { username: 'ankur.jain', modules: ['SP', 'PE'], src: 'migration' },
      { username: 'yash.hb', modules: ['SP', 'PE'], src: 'migration' },
    ]);
    const { rows: [mig] } = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'estimation_access_migrated'`);
    const { rows: [userCount] } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE deleted_at IS NULL`);
    expect(mig.n).toBeGreaterThan(0);
    expect(mig.n).toBeLessThanOrEqual(userCount.n);                // initDatabase ran twice; backfill only once
    await expect(pool.query(`INSERT INTO user_estimation_access (user_id, module_code) SELECT id, 'SP' FROM users WHERE username = 'yash.hb'`))
      .rejects.toMatchObject({ code: '23505' });                   // unique (user, module)

    const { rows: [adminRole] } = await pool.query(`SELECT id FROM roles WHERE name = 'Admin'`);
    const { rows: [userRole] } = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    const { rows: [prog] } = await pool.query(`SELECT department_id FROM projects WHERE id = $1`, [ids.apollo]);
    const scope = { departments: [{ id: prog.department_id, access_scope: 'assigned' }], projectIds: [ids.apollo] };
    const mk = (who: string, roleId: string, modules: string[], extra: object = {}) => ({
      firstName: who, lastName: 'IT', username: who, email: `${who}@it.test`, password: 'Pass@1234', roleIds: [roleId], modules, ...scope, ...extra,
    });

    // GSA creates an SP-only Admin
    const spAdminRes = await api().post('/api/users').set(auth(gsaToken)).send(mk('sp_admin', adminRole.id, ['SP']));
    expect(spAdminRes.status).toBe(201);
    expect(spAdminRes.body.data.estimation_modules).toEqual(['SP']);
    const spAdmin = await login('sp_admin@it.test', 'Pass@1234');
    const me = await api().get('/api/auth/me').set(auth(spAdmin));
    expect(me.body.data.modules).toEqual(['SP']);
    expect(me.body.data.permissions.filter((p: string) => p.startsWith('parametric.'))).toEqual([]);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['estimation.read', 'master.read', 'user.create']));

    // SP-only Admin: SP APIs allowed, every PE API forbidden (records, dashboard, analytics, master data, Excel upload)
    for (const url of ['/api/estimations', '/api/analysis/summary', '/api/analysis/trend', '/api/story-points', '/api/hierarchy/effort?module=sp&groupBy=program']) {
      expect([url, (await api().get(url).set(auth(spAdmin))).status]).toEqual([url, 200]);
    }
    for (const url of ['/api/parametric-estimations', '/api/parametric-analysis/summary', '/api/parametric-analysis/trend', '/api/parametric/average-configs', '/api/hierarchy/effort?module=pe&groupBy=program']) {
      expect([url, (await api().get(url).set(auth(spAdmin))).status]).toEqual([url, 403]);
    }
    expect((await api().post('/api/parametric-estimations/import').set(auth(spAdmin)).send({ rows: [] })).status).toBe(403);
    expect((await api().post('/api/parametric-estimations').set(auth(spAdmin))
      .send({ ...pe, department_id: prog.department_id, program_id: ids.apollo, baseline_id: ids.b1 })).status).toBe(403);

    // SP-only Admin grants: SP ok, PE / both forbidden, none invalid
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('sp_user', userRole.id, ['SP']))).status).toBe(201);
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('pe_try', userRole.id, ['PE']))).status).toBe(403);
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('both_try', userRole.id, ['SP', 'PE']))).status).toBe(403);
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('none_try', userRole.id, []))).status).toBe(400);
    // …and still bounded by Department / Program scope
    const outside = await api().post('/api/users').set(auth(spAdmin))
      .send(mk('scope_try', userRole.id, ['SP'], { projectIds: [ids.borealis], departments: undefined }));
    expect(outside.status).toBe(403);

    // GSA switches that Admin to PE-only: the SAME token is re-evaluated on the next request
    const { rows: [spAdminRow] } = await pool.query(`SELECT id FROM users WHERE username = 'sp_admin'`);
    const upd = await api().put(`/api/users/${spAdminRow.id}`).set(auth(gsaToken)).send({ modules: ['PE'] });
    expect(upd.status).toBe(200);
    expect(upd.body.data.estimation_modules).toEqual(['PE']);
    const nowSp = await api().get('/api/estimations').set(auth(spAdmin));
    expect(nowSp.status).toBe(403);
    expect(nowSp.headers['x-access-changed']).toBe('PE');
    expect((await api().get('/api/parametric-estimations').set(auth(spAdmin))).status).toBe(200);
    expect((await api().get('/api/auth/me').set(auth(spAdmin))).body.data.modules).toEqual(['PE']);

    // The (now PE) Admin can create PE users, not SP ones; editing the SP user they created keeps SP
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('pe_user', userRole.id, ['PE']))).status).toBe(201);
    expect((await api().post('/api/users').set(auth(spAdmin)).send(mk('sp_user2', userRole.id, ['SP']))).status).toBe(403);
    const { rows: [spUser] } = await pool.query(`SELECT id FROM users WHERE username = 'sp_user'`);
    const keep = await api().put(`/api/users/${spUser.id}`).set(auth(spAdmin)).send({ modules: ['PE'] });
    expect(keep.status).toBe(200);
    expect(keep.body.data.estimation_modules).toEqual(['SP', 'PE']);   // PE added, SP kept (outside the actor's modules)

    // Both-module Admin from GSA
    const both = await api().post('/api/users').set(auth(gsaToken)).send(mk('both_admin', adminRole.id, ['SP', 'PE']));
    expect(both.body.data.estimation_modules).toEqual(['SP', 'PE']);

    // Audit trail + deactivated (not deleted) history rows
    const { rows: audit } = await pool.query(
      `SELECT action, previous_value, new_value FROM audit_logs
        WHERE entity = 'user' AND entity_id = $1 AND action LIKE 'estimation_access_%' ORDER BY id`, [spAdminRow.id]);
    expect(audit.map(a => a.action)).toEqual(['estimation_access_granted', 'estimation_access_updated']);
    expect(audit[1].previous_value).toEqual({ modules: ['SP'] });
    expect(audit[1].new_value).toMatchObject({ modules: ['PE'], added: ['PE'], removed: ['SP'] });
    const { rows: hist } = await pool.query(
      `SELECT module_code, is_active FROM user_estimation_access WHERE user_id = $1 ORDER BY module_code DESC`, [spAdminRow.id]);
    expect(hist).toEqual([{ module_code: 'SP', is_active: false }, { module_code: 'PE', is_active: true }]);
  });
  it('Estimation Performance: EFA / ED / EBI / EEI from SP + PE records, scope, methods, baselines, snapshots, auth', async () => {
    const { rows: [pa] } = await pool.query(`SELECT department_id, name FROM projects WHERE id = $1`, [ids.apollo]);
    const { rows: [pb] } = await pool.query(`SELECT department_id, name FROM projects WHERE id = $1`, [ids.borealis]);
    const at = '2024-06-10T10:00:00Z';
    const insSp = (title: string, est: number | null, min: number, max: number, act: number | null) => pool.query(
      `INSERT INTO estimations (title, department_id, project_id, baseline_id, complexity, risk, competency, story_points,
         initial_min_days, initial_max_days, initial_min_hours, initial_max_hours, overhead_percent,
         revised_min_days, revised_max_days, revised_min_hours, revised_max_hours,
         estimated_hours, actual_hours, status, completed_at, created_at)
       VALUES ($1,$2,$3,$4,'Low','Low','Expert',3, 1,1,8,8,0, $5::numeric/8,$6::numeric/8,$5,$6, $7,$8,$9,$10,'2024-05-01')`,
      [title, pa.department_id, ids.apollo, ids.b1, min, max, est, act, act == null ? 'open' : 'completed', act == null ? null : at]);
    const insPe = (title: string, program: string, dept: string, baseline: string, est: number, act: number | null) => pool.query(
      `INSERT INTO parametric_estimations (task_title, department_id, project_id, baseline_id, middleware_inputs, application,
         system_configuration, data_and_control_flow, use_case, team_efficiency, multiplier, detailed_estimation,
         average_estimation, final_estimation, actual_days, status, completed_at, created_at)
       VALUES ($1,$2,$3,$4,'Small','Small','NA','Small','Small',1,1,$5,$5,$5,$6,$7,$8,'2024-05-01')`,
      [title, dept, program, baseline, est, act, act == null ? 'open' : 'completed', act == null ? null : at]);

    await insSp('PERF SP aligned', 80, 64, 96, 96);          // 10 PD → 12 PD, inside the framework range
    await insSp('PERF SP override', 200, 40, 80, 160);       // 25 PD → 20 PD, overridden outside the range
    await insSp('PERF SP open', null, 64, 96, null);         // no actual → not eligible, never 0
    await insPe('PERF PE apollo', ids.apollo, pa.department_id, ids.b1, 50, 45);
    await insPe('PERF PE borealis', ids.borealis, pb.department_id, ids.borB1, 100, 130);

    const base = `from=2024-06-01&to=2024-06-30&tz=UTC&programIds=${ids.apollo},${ids.borealis}`;
    const get = (q: string, t = gsaToken) => api().get(`/api/performance/dashboard?${q}`).set(auth(t));
    const both = await get(base);
    expect(both.status).toBe(200);
    const s = both.body.data.summary;
    // ΣE = 10 + 25 + 50 + 100 = 185, ΣA = 12 + 20 + 45 + 130 = 207, Σ|E−A| = 2 + 5 + 5 + 30 = 42
    expect(s.eligible).toMatchObject({ record_count: 4, total_estimated_pd: 185, total_actual_pd: 207, total_abs_error_pd: 42 });
    expect(s.eei.value).toBeCloseTo(100 - (42 / 185) * 100, 6);
    expect(s.ed.value).toBeCloseTo(((185 - 207) / 185) * 100, 6);
    expect(s.ed).toMatchObject({ under_count: 2, over_count: 2, on_target_count: 0 });
    // EFA: framework-aligned only (override excluded): ΣE = 160, Σ|E−A| = 37
    expect(s.framework).toMatchObject({ record_count: 3, excluded_overrides: 1 });
    expect(s.efa.value).toBeCloseTo(100 - (37 / 160) * 100, 6);
    expect(s.ebi).toMatchObject({ value: null, na_reason: 'no_historical_baseline' });
    expect(both.body.data.coverage).toMatchObject({ total_records: 5, with_actuals: 4 });
    expect(both.body.data.by_program.map((r: { name: string }) => r.name).sort()).toEqual([pa.name, pb.name].sort());

    // Method filters (PD conversion: SP hours ÷ 8)
    const spOnly = await get(`${base}&method=SP`);
    expect(spOnly.body.data.summary.eligible).toMatchObject({ record_count: 2, total_estimated_pd: 35, total_abs_error_pd: 7 });
    expect(spOnly.body.data.summary.eei.value).toBeCloseTo(80, 6);
    const peOnly = await get(`${base}&method=PE`);
    expect(peOnly.body.data.summary.eligible.record_count).toBe(2);
    // Date range + program + baseline + department filters
    expect((await get(`from=2024-07-01&to=2024-07-31&programIds=${ids.apollo}`)).body.data.summary.eligible.record_count).toBe(0);
    expect((await get(`from=2024-06-01&to=2024-06-30&programIds=${ids.apollo}`)).body.data.summary.eligible.record_count).toBe(3);
    expect((await get(`${base}&baselineId=${ids.borB1}`)).body.data.summary.eligible.record_count).toBe(1);
    expect((await get(`${base}&departmentId=${pa.department_id}`)).body.data.summary.eligible.record_count)
      .toBe(pa.department_id === pb.department_id ? 4 : 3);
    // Validation
    expect((await get('from=2024-06-30&to=2024-06-01')).status).toBe(400);
    expect((await get('method=XX')).status).toBe(400);
    expect((await get('programIds=not-a-uuid')).status).toBe(400);

    // Historical baseline (pre-framework) for Apollo: 40 % → EBI vs Apollo framework records (SP aligned + PE apollo)
    const hb = { department_id: pa.department_id, program_id: ids.apollo, estimation_method: 'ALL', label: 'IT pre-framework Apollo',
      record_count: 20, total_estimated_pd: 100, total_actual_pd: 130, total_abs_error_pd: 40 };
    expect((await api().post('/api/performance/baselines').set(auth(gsaToken)).send({ ...hb, total_abs_error_pd: 10 })).status).toBe(400);
    const created = await api().post('/api/performance/baselines').set(auth(gsaToken)).send(hb);
    expect(created.status).toBe(201);
    expect((await api().post('/api/performance/baselines').set(auth(gsaToken)).send(hb)).status).toBe(409); // one active per scope
    const withHb = (await get(base)).body.data.summary.ebi;
    const currentEd = (7 / 60) * 100;                       // (|10−12| + |50−45|) / (10 + 50)
    expect(withHb.historical_ed).toBeCloseTo(40, 6);
    expect(withHb.current_ed).toBeCloseTo(currentEd, 6);
    expect(withHb.value).toBeCloseTo(((40 - currentEd) / 40) * 100, 6);
    expect(withHb.missing_scope).toEqual([expect.objectContaining({ program_id: ids.borealis, method: 'PE', record_count: 1 })]);

    // Edit = new version; the old one is retired, not overwritten
    const v2 = await api().put(`/api/performance/baselines/${created.body.data.id}`).set(auth(gsaToken)).send({ ...hb, total_abs_error_pd: 30 });
    expect(v2.status).toBe(200);
    expect(v2.body.data).toMatchObject({ version: 2, supersedes_id: created.body.data.id });
    const { rows: versions } = await pool.query(`SELECT version, is_active FROM kpi_historical_baselines WHERE label = $1 ORDER BY version`, [hb.label]);
    expect(versions).toEqual([{ version: 1, is_active: false }, { version: 2, is_active: true }]);
    expect((await get(base)).body.data.summary.ebi.historical_ed).toBeCloseTo(30, 6);
    // Historical ED = 0 → N/A
    await pool.query(`UPDATE kpi_historical_baselines SET total_abs_error_pd = 0, total_actual_pd = 100 WHERE id = $1`, [v2.body.data.id]);
    expect((await get(base)).body.data.summary.ebi).toMatchObject({ value: null, na_reason: 'historical_ed_zero' });
    await pool.query(`UPDATE kpi_historical_baselines SET total_abs_error_pd = 30, total_actual_pd = 130 WHERE id = $1`, [v2.body.data.id]);

    // Snapshot: recalculated on the server and frozen
    const snap = await api().post('/api/performance/snapshots').set(auth(gsaToken))
      .send({ label: 'IT snapshot', filters: { from: '2024-06-01', to: '2024-06-30', programIds: `${ids.apollo},${ids.borealis}` } });
    expect(snap.status).toBe(201);
    await insPe('PERF PE later', ids.apollo, pa.department_id, ids.b1, 10, 10);
    const stored = await api().get(`/api/performance/snapshots/${snap.body.data.id}`).set(auth(gsaToken));
    expect(stored.body.data.result.summary.eligible.record_count).toBe(4);
    expect((await get(base)).body.data.summary.eligible.record_count).toBe(5);
    const { rows: audit } = await pool.query(`SELECT action FROM audit_logs WHERE entity IN ('kpi_historical_baseline', 'kpi_snapshot') ORDER BY "timestamp", action`);
    expect(audit.map(a => a.action)).toEqual(['historical_baseline_created', 'historical_baseline_updated', 'kpi_snapshot_created']);

    // Authorisation: a PE-only User scoped to Apollo
    const { rows: [userRole] } = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    const mkUser = await api().post('/api/users').set(auth(gsaToken)).send({
      firstName: 'Perf', lastName: 'IT', username: 'perf_pe', email: 'perf_pe@it.test', password: 'Pass@1234', roleIds: [userRole.id],
      modules: ['PE'], departments: [{ id: pa.department_id, access_scope: 'assigned' }], projectIds: [ids.apollo],
    });
    expect(mkUser.status).toBe(201);
    const peToken = await login('perf_pe@it.test', 'Pass@1234');
    expect((await get(`${base}&method=SP`, peToken)).status).toBe(403);
    const peView = await get(base, peToken);                 // BOTH → only the methods the user holds
    expect(peView.status).toBe(200);
    expect(peView.body.data.meta.methods).toEqual(['PE']);
    expect(peView.body.data.summary.eligible.record_count).toBe(2);  // Apollo PE (incl. the later one) — Borealis is out of scope
    const outOfScope = await get(`from=2024-06-01&to=2024-06-30&programIds=${ids.borealis}`, peToken);
    expect({ status: outOfScope.status, body: outOfScope.body.error }).toEqual({ status: 200, body: undefined });
    expect(outOfScope.body.data.summary.eligible.record_count).toBe(0);
    expect((await api().post('/api/performance/baselines').set(auth(peToken)).send(hb)).status).toBe(403);
    expect((await api().put('/api/performance/settings').set(auth(peToken)).send({})).status).toBe(403);
    expect((await api().get(`/api/performance/snapshots/${snap.body.data.id}`).set(auth(peToken))).status).toBe(404);
  });
});

