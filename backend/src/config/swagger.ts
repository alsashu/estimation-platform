// Complete OpenAPI 3.0 specification for the Estimation Platform API

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

// ─── Reusable Schemas ─────────────────────────────────────────────────────────
const schemas = {
  ApiSuccess: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object' },
    },
  },
  ApiError: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { type: 'string', example: 'Validation error' },
    },
  },
  Pagination: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'array', items: {} },
      total: { type: 'integer' },
      page: { type: 'integer' },
      limit: { type: 'integer' },
    },
  },
  StoryPointConfig: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      complexity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'] },
      risk: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High', 'Unknown'] },
      story_points: { type: 'integer', example: 8 },
      color_hex: { type: 'string', example: '#19AA6E' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  EffortEstimateConfig: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      story_points: { type: 'integer', example: 8 },
      min_days: { type: 'number', example: 3 },
      max_days: { type: 'number', example: 5 },
      min_hours: { type: 'number', example: 24 },
      max_hours: { type: 'number', example: 40 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CompetencyOverheadConfig: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      competency: { type: 'string', enum: ['Emerging', 'Competent', 'Expert'] },
      complexity: { type: 'string' },
      overhead_percent: { type: 'number', example: 0.1 },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CompetencyLevelDefinition: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      level: { type: 'string', enum: ['Emerging', 'Competent', 'Expert'] },
      description: { type: 'string' },
      knowledge_depth: { type: 'string' },
      independence: { type: 'string' },
      problem_solving: { type: 'string' },
      communication: { type: 'string' },
      mentorship: { type: 'string' },
      sort_order: { type: 'integer' },
    },
  },
  ComplexityDefinition: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      level: { type: 'string' },
      scope: { type: 'string' },
      requirement_clarity: { type: 'string' },
      business_logic: { type: 'string' },
      dependencies: { type: 'string' },
      implementation_effort: { type: 'string' },
      testing_effort: { type: 'string' },
      risk_label: { type: 'string' },
      rollback_complexity: { type: 'string' },
      sort_order: { type: 'integer' },
    },
  },
  Estimation: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', example: 'User authentication module' },
      description: { type: 'string' },
      project_name: { type: 'string', example: 'MyApp' },
      complexity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'] },
      risk: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High', 'Unknown'] },
      competency: { type: 'string', enum: ['Emerging', 'Competent', 'Expert'] },
      story_points: { type: 'integer', example: 8 },
      initial_min_days: { type: 'number' },
      initial_max_days: { type: 'number' },
      initial_min_hours: { type: 'number' },
      initial_max_hours: { type: 'number' },
      overhead_percent: { type: 'number' },
      revised_min_days: { type: 'number' },
      revised_max_days: { type: 'number' },
      revised_min_hours: { type: 'number' },
      revised_max_hours: { type: 'number' },
      actual_hours: { type: 'number', nullable: true },
      actual_days: { type: 'number', nullable: true },
      completed_at: { type: 'string', format: 'date-time', nullable: true },
      variance_hours: { type: 'number', nullable: true },
      accuracy_percent: { type: 'number', nullable: true },
      notes: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['open', 'completed'] },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CalculationResult: {
    type: 'object',
    properties: {
      story_points: { type: 'integer' },
      color_hex: { type: 'string' },
      initial_min_days: { type: 'number' },
      initial_max_days: { type: 'number' },
      initial_min_hours: { type: 'number' },
      initial_max_hours: { type: 'number' },
      overhead_percent: { type: 'number' },
      revised_min_days: { type: 'number' },
      revised_max_days: { type: 'number' },
      revised_min_hours: { type: 'number' },
      revised_max_hours: { type: 'number' },
    },
  },
  Notification: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
      title: { type: 'string' },
      message: { type: 'string' },
      read: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  LogEntry: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      timestamp: { type: 'string', format: 'date-time' },
      level: { type: 'string', enum: ['error', 'warn', 'info', 'http', 'debug'] },
      category: { type: 'string', enum: ['api', 'database', 'auth', 'system', 'job', 'general'] },
      message: { type: 'string' },
      correlationId: { type: 'string', nullable: true },
      method: { type: 'string', nullable: true },
      url: { type: 'string', nullable: true },
      statusCode: { type: 'integer', nullable: true },
      responseTimeMs: { type: 'integer', nullable: true },
      ip: { type: 'string', nullable: true },
      userAgent: { type: 'string', nullable: true },
      errorStack: { type: 'string', nullable: true },
      metadata: { type: 'object', nullable: true },
    },
  },
  HealthResponse: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
      timestamp: { type: 'string', format: 'date-time' },
      uptimeSeconds: { type: 'integer' },
      version: { type: 'string' },
      environment: { type: 'string' },
      responseTimeMs: { type: 'integer' },
      services: {
        type: 'object',
        properties: {
          api: { $ref: '#/components/schemas/ServiceCheck' },
          database: { $ref: '#/components/schemas/ServiceCheck' },
          memory: { $ref: '#/components/schemas/ServiceCheck' },
          system: { $ref: '#/components/schemas/ServiceCheck' },
          logStorage: { $ref: '#/components/schemas/ServiceCheck' },
          logDatabase: { $ref: '#/components/schemas/ServiceCheck' },
        },
      },
    },
  },
  ServiceCheck: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
      responseTimeMs: { type: 'integer' },
      message: { type: 'string', nullable: true },
      details: { type: 'object', nullable: true },
    },
  },
};

// ─── Parameters ───────────────────────────────────────────────────────────────
const idParam = {
  in: 'path' as const,
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'Resource UUID',
};

const paginationParams = [
  { in: 'query' as const, name: 'page',   schema: { type: 'integer', default: 1 } },
  { in: 'query' as const, name: 'limit',  schema: { type: 'integer', default: 20 } },
];

// ─── Organisational hierarchy (see docs/HIERARCHY.md) ─────────────────────────
const q = (name: string, required = false, description?: string) =>
  ({ in: 'query' as const, name, required, schema: { type: 'string' }, ...(description ? { description } : {}) });
const op = (tag: string, summary: string, extra: Record<string, unknown> = {}) => ({
  tags: [tag], summary,
  responses: { 200: { description: 'OK' }, 400: { description: 'Validation / hierarchy-consistency error' }, 403: { description: 'Outside the caller\'s Department/Program scope or missing permission' }, 409: { description: 'Duplicate' } },
  ...extra,
});
const body = (props: Record<string, string>, required: string[]) => ({
  requestBody: { required: true, content: { 'application/json': { schema: {
    type: 'object', required,
    properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, { type: t }])),
  } } } },
});
const SCOPE_FILTERS = ['departmentId', 'programId', 'baselineId', 'componentId', 'subcomponentId'].map(n => q(n));
const crud = (tag: string, base: string, label: string, createProps: Record<string, string>, required: string[], parentParam?: string) => ({
  [base]: {
    get:  op(tag, `List ${label}s`, { parameters: [...(parentParam ? [q(parentParam)] : []), q('search'), q('status')] }),
    post: op(tag, `Create ${label}`, body(createProps, required)),
  },
  [`${base}/{id}`]: {
    get:    op(tag, `Get ${label}`, { parameters: [idParam] }),
    put:    op(tag, `Update ${label}`, { parameters: [idParam], ...body(createProps, []) }),
    delete: op(tag, `Delete ${label} (only when nothing references it)`, { parameters: [idParam] }),
  },
});

// ─── User management: Estimation Module Access (SP / PE), independent of roles ───
const MODULES_SCHEMA = {
  type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: ['SP', 'PE'] },
  description: 'Estimation Module Access — SP (Story Point) and/or PE (Parametric). At least one. Callers can only grant '
    + 'modules they hold themselves (403 otherwise); on update, modules the caller cannot manage are kept. A Global Super Admin always has both.',
};
const userBody = (required: string[]) => ({
  requestBody: { required: true, content: { 'application/json': { schema: {
    type: 'object', required,
    properties: {
      firstName: { type: 'string' }, lastName: { type: 'string' }, username: { type: 'string' }, email: { type: 'string' },
      password: { type: 'string' }, roleIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      projectIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      departments: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, access_scope: { type: 'string', enum: ['assigned', 'all'] } } } },
      modules: MODULES_SCHEMA,
    },
  } } } },
});
const userPaths = {
  '/users': {
    get: op('User Management', 'List users (includes estimation_modules)', { parameters: [q('search'), q('status'), q('role'), q('page'), q('limit')] }),
    post: op('User Management', 'Create user with roles, Department/Program access and Estimation Module Access', userBody(['firstName', 'lastName', 'username', 'email', 'password', 'modules'])),
  },
  '/users/{id}': {
    get: op('User Management', 'Get user (includes estimation_modules)', { parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] }),
    put: op('User Management', "Update user; modules replaces the module set within the caller's own modules (audited as estimation_access_updated)", {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], ...userBody([]) }),
  },
  '/registrations/{id}/approve': {
    post: op('User Management', 'Approve a registration — creates the account with the given Estimation Module Access', {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: {
        type: 'object', required: ['modules'], properties: { roleId: { type: 'string', format: 'uuid' }, modules: MODULES_SCHEMA },
      } } } },
    }),
  },
};

// ─── Estimation Performance dashboard (see docs/ESTIMATION_PERFORMANCE.md) ─────
const PERF_FILTERS = [
  q('departmentId'), q('programIds', false, 'Comma-separated program ids (all accessible programs when omitted)'), q('baselineId'),
  q('from', false, 'YYYY-MM-DD (completion date, caller time zone)'), q('to', false, 'YYYY-MM-DD, not in the future'),
  q('tz', false, 'IANA time zone, default UTC'),
  { in: 'query' as const, name: 'method', schema: { type: 'string', enum: ['BOTH', 'SP', 'PE'], default: 'BOTH' },
    description: 'BOTH reports the methods the caller holds; an explicit method the caller lacks returns 403' },
];
const BASELINE_BODY = body({
  department_id: 'string', program_id: 'string', estimation_method: 'string', label: 'string', period_from: 'string', period_to: 'string',
  record_count: 'integer', total_estimated_pd: 'number', total_actual_pd: 'number', total_abs_error_pd: 'number', source_note: 'string',
}, ['department_id', 'label', 'record_count', 'total_estimated_pd', 'total_actual_pd', 'total_abs_error_pd']);
const performancePaths = {
  '/performance/dashboard': { get: op('Estimation Performance', 'EFA / ED / EBI / EEI with previous period, indicators, program/department comparisons, trend and |ED| distribution (PersonDays)', { parameters: PERF_FILTERS }) },
  '/performance/breakdown': { get: op('Estimation Performance', 'Drill-down rows: Department → Program → Baseline → Task', {
    parameters: [...PERF_FILTERS, { in: 'query' as const, name: 'groupBy', schema: { type: 'string', enum: ['department', 'program', 'baseline', 'task'], default: 'program' } }] }) },
  '/performance/baselines': {
    get: op('Estimation Performance', 'Governed pre-framework historical baselines (the historical side of EBI)', { parameters: [q('departmentId'), q('programIds'), q('includeInactive')] }),
    post: op('Estimation Performance', 'Create a historical baseline (performance.baseline.manage). One active per Department/Program/method', BASELINE_BODY),
  },
  '/performance/baselines/{id}': { put: op('Estimation Performance', 'Edit = new version; the previous version is retired (supersedes_id)', { parameters: [idParam], ...BASELINE_BODY }) },
  '/performance/baselines/{id}/status': { patch: op('Estimation Performance', 'Deactivate / reactivate a baseline version', { parameters: [idParam], ...body({ is_active: 'boolean' }, ['is_active']) }) },
  '/performance/settings': {
    get: op('Estimation Performance', 'Status thresholds, on-target tolerance, histogram bounds, default range'),
    put: op('Estimation Performance', 'Update KPI settings (performance.baseline.manage)', body({ on_target_tolerance: 'number', distribution_bounds: 'array', thresholds: 'object', default_range_days: 'integer' },
      ['on_target_tolerance', 'distribution_bounds', 'thresholds', 'default_range_days'])),
  },
  '/performance/snapshots': {
    get: op('Estimation Performance', 'List report snapshots (own; all for global users)'),
    post: op('Estimation Performance', 'Freeze the dashboard for the given filters (recalculated on the server)', body({ label: 'string', filters: 'object' }, ['label', 'filters'])),
  },
  '/performance/snapshots/{id}': { get: op('Estimation Performance', 'Get a snapshot with its full stored result', { parameters: [idParam] }) },
};

const departmentPaths = crud('Departments', '/departments', 'department', { name: 'string', code: 'string', description: 'string' }, ['name', 'code']);
delete (departmentPaths['/departments/{id}'] as Record<string, unknown>).delete; // departments are deactivated, never deleted

const hierarchyPaths = {
  ...departmentPaths,
  '/departments/{id}/status': { patch: op('Departments', 'Activate / deactivate a department', { parameters: [idParam], ...body({ status: 'string' }, ['status']) }) },
  '/departments/{id}/users': {
    get:  op('Departments', 'List users assigned to a department', { parameters: [idParam] }),
    post: op('Departments', 'Assign users to a department', { parameters: [idParam], ...body({ userIds: 'array' }, ['userIds']) }),
  },
  '/departments/{id}/users/{userId}': { delete: op('Departments', 'Remove a user from a department (also drops their programs in it)', { parameters: [idParam, { in: 'path', name: 'userId', required: true, schema: { type: 'string', format: 'uuid' } }] }) },
  ...crud('Programs', '/projects', 'program', { department_id: 'string', name: 'string', code: 'string', description: 'string', status: 'string' }, ['department_id', 'name', 'code'], 'departmentId'),
  ...crud('Baselines', '/baselines', 'baseline', { program_id: 'string', name: 'string', version: 'string', description: 'string', start_date: 'string', end_date: 'string' }, ['program_id', 'name'], 'programId'),
  '/baselines/{id}/status': { patch: op('Baselines', 'Activate / deactivate a baseline', { parameters: [idParam], ...body({ status: 'string' }, ['status']) }) },
  ...crud('Components', '/components', 'component', { baseline_id: 'string', name: 'string', description: 'string' }, ['baseline_id', 'name'], 'baselineId'),
  ...crud('Components', '/subcomponents', 'subcomponent', { component_id: 'string', name: 'string', description: 'string' }, ['component_id', 'name'], 'componentId'),
  '/hierarchy/context': { get: op('Hierarchy Lookups', 'Departments and programs the caller can access (header context)') },
  '/hierarchy/lookup/departments':   { get: op('Hierarchy Lookups', 'Accessible active departments',   { parameters: [q('search')] }) },
  '/hierarchy/lookup/programs':      { get: op('Hierarchy Lookups', 'Accessible active programs of a department', { parameters: [q('departmentId', true), q('search')] }) },
  '/hierarchy/lookup/baselines':     { get: op('Hierarchy Lookups', 'Active baselines of a program',   { parameters: [q('programId', true), q('search')] }) },
  '/hierarchy/lookup/components':    { get: op('Hierarchy Lookups', 'Components of a baseline',        { parameters: [q('baselineId', true), q('search')] }) },
  '/hierarchy/lookup/subcomponents': { get: op('Hierarchy Lookups', 'Subcomponents of a component',    { parameters: [q('componentId', true), q('search')] }) },
  '/parametric-estimations/{id}/actuals': {
    patch: op('Parametric Actuals', 'Record or correct actual effort (PersonDays) for a parametric task', {
      description: 'Derives Variance = Estimated − Actual, Accuracy = max(0, 100 − Deviation), Deviation = |E − A| / E × 100 (null when the estimate is 0). '
        + 'The estimate is never modified. Correcting existing actuals requires being the original recorder or holding parametric.actuals.correct. Every change is written to audit_logs.',
      parameters: [idParam],
      ...body({ actual_days: 'number', notes: 'string', completed_at: 'string' }, ['actual_days']),
    }),
  },
  '/parametric-analysis/actuals': {
    get: op('Parametric Actuals', 'Estimated vs Actual scatter points and accuracy bands for completed tasks', { parameters: SCOPE_FILTERS }),
  },
  '/hierarchy/effort': {
    get: op('Hierarchy Lookups', 'Estimated vs Actual effort aggregated by hierarchy level', {
      description: 'SP (`module=sp`, hours, needs estimation.read) and PE (`module=pe`, person-days, needs parametric.read) are aggregated independently. Tasks without a component/subcomponent roll up under "(No component)" / "(No subcomponent)".',
      parameters: [q('module', true, 'sp | pe'), q('groupBy', true, 'department | program | baseline | component | subcomponent | task'), ...SCOPE_FILTERS, q('from'), q('to')],
    }),
  },
};

// ─── OpenAPI Document ─────────────────────────────────────────────────────────
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Estimation Platform API',
    version: '1.0.0',
    description: `
## Overview
REST API for the Estimation Platform — calculates software effort estimates based on complexity, risk, and competency matrices.

## Authentication
Currently open (no auth required). API key support planned for v2.

## Response Format
All endpoints return \`{ success: boolean, data: T }\` on success, or \`{ success: false, error: string }\` on failure.

## Correlation IDs
Each request gets a unique \`X-Correlation-Id\` header in the response for log tracing.
    `.trim(),
    contact: {
      name: 'Estimation Platform',
      url: BASE,
    },
  },
  servers: [
    { url: `${BASE}/api`, description: 'Current server' },
  ],
  tags: [
    { name: 'Estimations',       description: 'Create and manage effort estimates' },
    { name: 'Story Points',      description: 'Complexity × Risk → Story Point matrix' },
    { name: 'Effort Estimates',  description: 'Story Points → Day/Hour range mapping' },
    { name: 'Competency',        description: 'Competency overhead and level definitions' },
    { name: 'Definitions',       description: 'Read-only complexity and risk level definitions' },
    { name: 'Analysis',          description: 'Aggregated analytics and trend data' },
    { name: 'Notifications',     description: 'In-app notification management' },
    { name: 'Departments',       description: 'Department master data and user assignment' },
    { name: 'Programs',          description: 'Programs (formerly Projects) — always belong to a Department' },
    { name: 'Baselines',         description: 'Versioned baselines of a Program' },
    { name: 'Components',        description: 'Optional Components / Subcomponents of a Baseline' },
    { name: 'Parametric Actuals', description: 'Estimated vs Actual PersonDays for Parametric Estimation tasks' },
    { name: 'Estimation Performance', description: 'EFA, ED, EBI and EEI from Historical Data SP + PE on a PersonDay basis; governed pre-framework baselines; snapshots' },
    { name: 'User Management', description: 'Users, registrations and Estimation Module Access (SP / PE). SP / PE APIs return 403 for users without that module.' },
    { name: 'Hierarchy Lookups', description: 'Permission-filtered cascading dropdown data and Estimated vs Actual aggregation' },
    { name: 'Monitoring – Logs', description: 'Application log querying and management' },
    { name: 'Monitoring – Health', description: 'Service health and readiness probes' },
  ],
  components: { schemas },
  paths: {
    ...hierarchyPaths,
    ...userPaths,
    ...performancePaths,
    // ─── Estimations ─────────────────────────────────────────────────────────
    '/estimations/calculate': {
      get: {
        tags: ['Estimations'],
        summary: 'Calculate estimate (preview, no save)',
        description: 'Returns a full estimation result without persisting to the database.',
        parameters: [
          { in: 'query', name: 'complexity', required: true, schema: { type: 'string', enum: ['Low','Medium','High','Very High','Unmanageable'] }, description: 'Task complexity level' },
          { in: 'query', name: 'risk',        required: true, schema: { type: 'string', enum: ['Low','Medium','High','Very High','Unknown'] }, description: 'Task risk level' },
          { in: 'query', name: 'competency',  required: true, schema: { type: 'string', enum: ['Emerging','Competent','Expert'] }, description: 'Developer competency' },
        ],
        responses: {
          200: { description: 'Calculation result', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/CalculationResult' } } }] } } } },
          400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          422: { description: 'No matching story point configuration', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/estimations': {
      get: {
        tags: ['Estimations'],
        summary: 'List all estimations (paginated)',
        parameters: [
          ...paginationParams,
          { in: 'query', name: 'status',       schema: { type: 'string', enum: ['open','completed'] } },
          { in: 'query', name: 'complexity',   schema: { type: 'string' } },
          { in: 'query', name: 'risk',         schema: { type: 'string' } },
          { in: 'query', name: 'project_name', schema: { type: 'string' } },
          { in: 'query', name: 'search',       schema: { type: 'string' }, description: 'Full-text search on title/description' },
        ],
        responses: {
          200: { description: 'Paginated list', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/Pagination' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Estimation' } } } }] } } } },
        },
      },
      post: {
        tags: ['Estimations'],
        summary: 'Create a new estimation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'complexity', 'risk', 'competency'],
                properties: {
                  title:        { type: 'string', example: 'Payment gateway integration' },
                  description:  { type: 'string' },
                  project_name: { type: 'string', example: 'EcommerceApp' },
                  complexity:   { type: 'string', enum: ['Low','Medium','High','Very High','Unmanageable'] },
                  risk:         { type: 'string', enum: ['Low','Medium','High','Very High','Unknown'] },
                  competency:   { type: 'string', enum: ['Emerging','Competent','Expert'] },
                  notes:        { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created estimation', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/Estimation' } } }] } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/estimations/{id}': {
      get: {
        tags: ['Estimations'], summary: 'Get estimation by ID',
        parameters: [idParam],
        responses: {
          200: { description: 'Estimation', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/Estimation' } } }] } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      put: {
        tags: ['Estimations'], summary: 'Update estimation metadata',
        parameters: [idParam],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' }, description: { type: 'string' },
                  project_name: { type: 'string' }, notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      delete: {
        tags: ['Estimations'], summary: 'Delete estimation',
        parameters: [idParam],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/estimations/{id}/actuals': {
      patch: {
        tags: ['Estimations'], summary: 'Record actual hours for a completed estimation',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['actual_hours'],
                properties: {
                  actual_hours:  { type: 'number', example: 36.5 },
                  completed_at:  { type: 'string', format: 'date-time' },
                  notes:         { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated with actuals and accuracy metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        },
      },
    },

    // ─── Story Points ─────────────────────────────────────────────────────────
    '/story-points': {
      get: {
        tags: ['Story Points'], summary: 'Get all story point configurations',
        responses: { 200: { description: 'Array of configs', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/StoryPointConfig' } } } }] } } } } },
      },
      post: {
        tags: ['Story Points'], summary: 'Create a story point configuration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['complexity', 'risk', 'story_points'],
                properties: {
                  complexity:   { type: 'string' }, risk: { type: 'string' },
                  story_points: { type: 'integer' }, color_hex: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },
    '/story-points/{id}': {
      put: {
        tags: ['Story Points'], summary: 'Update a story point configuration',
        parameters: [idParam],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { story_points: { type: 'integer' }, color_hex: { type: 'string' } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
      delete: {
        tags: ['Story Points'], summary: 'Delete a story point configuration',
        parameters: [idParam],
        responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },

    // ─── Effort Estimates ─────────────────────────────────────────────────────
    '/effort-estimates': {
      get: {
        tags: ['Effort Estimates'], summary: 'Get all effort estimate configurations',
        responses: { 200: { description: 'Array of configs', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/EffortEstimateConfig' } } } }] } } } } },
      },
      post: {
        tags: ['Effort Estimates'], summary: 'Create an effort estimate configuration',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['story_points', 'min_days', 'max_days'], properties: { story_points: { type: 'integer' }, min_days: { type: 'number' }, max_days: { type: 'number' } } } } } },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },
    '/effort-estimates/{id}': {
      put: {
        tags: ['Effort Estimates'], summary: 'Update effort estimate configuration',
        parameters: [idParam],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { min_days: { type: 'number' }, max_days: { type: 'number' } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
      delete: { tags: ['Effort Estimates'], summary: 'Delete effort estimate configuration', parameters: [idParam], responses: { 200: { description: 'Deleted' } } },
    },

    // ─── Competency ───────────────────────────────────────────────────────────
    '/competency-overheads': {
      get: {
        tags: ['Competency'], summary: 'Get all competency overhead configurations',
        responses: { 200: { description: 'Array of overhead configs', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/CompetencyOverheadConfig' } } } }] } } } } },
      },
    },
    '/competency-overheads/{id}': {
      put: {
        tags: ['Competency'], summary: 'Update competency overhead percentage',
        parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['overhead_percent'], properties: { overhead_percent: { type: 'number', minimum: 0, maximum: 1, example: 0.1 } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },
    '/competency-definitions': {
      get: {
        tags: ['Competency'], summary: 'Get all competency level definitions',
        responses: { 200: { description: 'Array of definitions', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/CompetencyLevelDefinition' } } } }] } } } } },
      },
    },
    '/competency-definitions/{id}': {
      put: {
        tags: ['Competency'], summary: 'Update a competency level definition',
        parameters: [idParam],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CompetencyLevelDefinition' } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },

    // ─── Definitions ─────────────────────────────────────────────────────────
    '/definitions/complexity': {
      get: {
        tags: ['Definitions'], summary: 'Get all complexity level definitions',
        responses: { 200: { description: 'Array of complexity definitions', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ComplexityDefinition' } } } }] } } } } },
      },
    },
    '/definitions/risk': {
      get: {
        tags: ['Definitions'], summary: 'Get all risk level definitions',
        responses: { 200: { description: 'Array of risk definitions', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ComplexityDefinition' } } } }] } } } } },
      },
    },

    // ─── Analysis ─────────────────────────────────────────────────────────────
    '/analysis/summary': {
      get: {
        tags: ['Analysis'], summary: 'Get overall analytics summary',
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'to',   schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'project_name', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Summary metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },
    '/analysis/complexity': {
      get: { tags: ['Analysis'], summary: 'Get metrics grouped by complexity', responses: { 200: { description: 'Complexity breakdown array' } } },
    },
    '/analysis/sp-bands': {
      get: { tags: ['Analysis'], summary: 'Get metrics grouped by story point band', responses: { 200: { description: 'SP band summary array' } } },
    },
    '/analysis/scatter': {
      get: { tags: ['Analysis'], summary: 'Get scatter plot data (estimated vs actual)', responses: { 200: { description: 'Last 200 completed estimations scatter data' } } },
    },
    '/analysis/trend': {
      get: {
        tags: ['Analysis'], summary: 'Estimation Activity (SP): created / completed per bucket',
        description: 'Zero-filled buckets over the range; interval is day (≤ 62 days), week (≤ 366) or month. Max 3660 days. Returns { data, meta: { from, to, timezone, interval, days } }; 400 on invalid ranges. total counts by created_at, completed by completed_at.',
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'From Date (YYYY-MM-DD, inclusive). Requires to.' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'To Date (YYYY-MM-DD, inclusive, not in the future). Requires from.' },
          { in: 'query', name: 'tz', schema: { type: 'string', default: 'UTC' }, description: 'IANA time zone the dates are in (e.g. Asia/Kolkata)' },
          { in: 'query', name: 'days', schema: { type: 'integer', default: 30 }, description: 'Legacy: last N days ending today; ignored when from/to are given' },
          ...SCOPE_FILTERS,
        ],
        responses: { 200: { description: 'Activity buckets' }, 400: { description: 'Invalid date range or time zone' } },
      },
    },
    '/parametric-analysis/trend': {
      get: {
        tags: ['Analysis'], summary: 'Estimation Activity (PE): estimations per bucket, split manual / Excel import',
        description: 'Zero-filled buckets over the range; interval is day (≤ 62 days), week (≤ 366) or month. Max 3660 days. Returns { data, meta: { from, to, timezone, interval, days } }; 400 on invalid ranges. Buckets by created_at.',
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'From Date (YYYY-MM-DD, inclusive). Requires to.' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'To Date (YYYY-MM-DD, inclusive, not in the future). Requires from.' },
          { in: 'query', name: 'tz', schema: { type: 'string', default: 'UTC' }, description: 'IANA time zone the dates are in (e.g. Asia/Kolkata)' },
          { in: 'query', name: 'days', schema: { type: 'integer', default: 30 }, description: 'Legacy: last N days ending today; ignored when from/to are given' },
          ...SCOPE_FILTERS,
        ],
        responses: { 200: { description: 'Activity buckets' }, 400: { description: 'Invalid date range or time zone' } },
      },
    },

    // ─── Notifications ────────────────────────────────────────────────────────
    '/notifications': {
      get: {
        tags: ['Notifications'], summary: 'Get recent notifications (last 50)',
        responses: {
          200: {
            description: 'Notification list with unread count',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Notification' } }, unread_count: { type: 'integer' } } } } },
          },
        },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'], summary: 'Mark a notification as read',
        parameters: [idParam],
        responses: { 200: { description: 'Marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'], summary: 'Mark all notifications as read',
        responses: { 200: { description: 'All marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } } },
      },
    },

    // ─── Monitoring – Logs ────────────────────────────────────────────────────
    '/monitoring/logs': {
      get: {
        tags: ['Monitoring – Logs'], summary: 'Query application logs',
        description: 'Returns paginated log entries. Supports filtering by level, category, message search, date range, and correlation ID.',
        parameters: [
          { in: 'query', name: 'level',         schema: { type: 'string', enum: ['all','error','warn','info','http','debug'] }, description: 'Filter by log level' },
          { in: 'query', name: 'category',      schema: { type: 'string', enum: ['all','api','database','auth','system','job','general'] } },
          { in: 'query', name: 'search',        schema: { type: 'string' }, description: 'Full-text search on message and URL' },
          { in: 'query', name: 'from',          schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'to',            schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'correlationId', schema: { type: 'string' } },
          { in: 'query', name: 'limit',         schema: { type: 'integer', default: 100, maximum: 500 } },
          { in: 'query', name: 'offset',        schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'Paginated log entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/LogEntry' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Monitoring – Logs'], summary: 'Delete old log entries',
        parameters: [{ in: 'query', name: 'days', schema: { type: 'integer', default: 7 }, description: 'Delete logs older than N days' }],
        responses: { 200: { description: 'Deletion result', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, deleted: { type: 'integer' }, olderThanDays: { type: 'integer' } } } } } } },
      },
    },
    '/monitoring/logs/stats': {
      get: {
        tags: ['Monitoring – Logs'], summary: 'Get log statistics (last 24 hours)',
        responses: {
          200: {
            description: 'Stats by level, category, recent errors, and hourly trend',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        byLevel:     { type: 'array', items: { type: 'object', properties: { level: { type: 'string' }, count: { type: 'integer' } } } },
                        byCategory:  { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, count: { type: 'integer' } } } },
                        recentErrors: { type: 'array', items: { $ref: '#/components/schemas/LogEntry' } },
                        hourlyTrend: { type: 'array', items: { type: 'object', properties: { hour: { type: 'string' }, total: { type: 'integer' }, errors: { type: 'integer' }, warnings: { type: 'integer' }, avg_response_ms: { type: 'integer' } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Monitoring – Health ──────────────────────────────────────────────────
    '/monitoring/health': {
      get: {
        tags: ['Monitoring – Health'], summary: 'Full application health report',
        description: 'Checks database connectivity, memory usage, CPU load, log storage, and log database. Returns HTTP 503 if any service is unhealthy.',
        responses: {
          200: { description: 'All services healthy or degraded', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
          503: { description: 'One or more services unhealthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
        },
      },
    },
    '/monitoring/health/live': {
      get: {
        tags: ['Monitoring – Health'], summary: 'Liveness probe',
        description: 'Returns 200 if the process is alive. Used by container orchestrators.',
        responses: { 200: { description: 'Process alive', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'alive' }, timestamp: { type: 'string' }, uptime: { type: 'number' } } } } } } },
      },
    },
    '/monitoring/health/ready': {
      get: {
        tags: ['Monitoring – Health'], summary: 'Readiness probe',
        description: 'Returns 200 only if the database is reachable. Returns 503 otherwise.',
        responses: {
          200: { description: 'Ready to serve traffic' },
          503: { description: 'Not ready — database unavailable' },
        },
      },
    },
  },
};
