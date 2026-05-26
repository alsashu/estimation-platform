import { PoolClient } from 'pg';

export async function seedData(client: PoolClient): Promise<void> {
  // Story Point Configs (Complexity × Risk → SP + color)
  const storyPoints = [
    { complexity: 'Low',          risk: 'Low',       sp: 1,   color: '#19AA6E' },
    { complexity: 'Low',          risk: 'Medium',    sp: 2,   color: '#73CDAA' },
    { complexity: 'Low',          risk: 'High',      sp: 2,   color: '#73CDAA' },
    { complexity: 'Medium',       risk: 'Low',       sp: 3,   color: '#A6B98C' },
    { complexity: 'Medium',       risk: 'Medium',    sp: 3,   color: '#A6B98C' },
    { complexity: 'Medium',       risk: 'High',      sp: 5,   color: '#9B875F' },
    { complexity: 'High',         risk: 'Low',       sp: 8,   color: '#AFA082' },
    { complexity: 'High',         risk: 'Medium',    sp: 13,  color: '#E15A50' },
    { complexity: 'High',         risk: 'High',      sp: 20,  color: '#DC3223' },
    { complexity: 'Very High',    risk: 'Very High', sp: 40,  color: '#4B5A69' },
    { complexity: 'Unmanageable', risk: 'Unknown',   sp: 100, color: '#1E3246' },
  ];

  for (const s of storyPoints) {
    await client.query(
      `INSERT INTO story_point_configs (complexity, risk, story_points, color_hex)
       VALUES ($1, $2, $3, $4) ON CONFLICT (complexity, risk) DO NOTHING`,
      [s.complexity, s.risk, s.sp, s.color]
    );
  }

  // Effort Estimate Configs (SP → Days range)
  const effortEstimates = [
    { sp: 1,   minD: 0.5, maxD: 1   },
    { sp: 2,   minD: 1,   maxD: 2   },
    { sp: 3,   minD: 2,   maxD: 5   },
    { sp: 5,   minD: 5,   maxD: 7   },
    { sp: 8,   minD: 7,   maxD: 12  },
    { sp: 13,  minD: 12,  maxD: 13  },
    { sp: 20,  minD: 15,  maxD: 26  },
    { sp: 40,  minD: 30,  maxD: 60  },
    { sp: 100, minD: 60,  maxD: 120 },
  ];

  for (const e of effortEstimates) {
    await client.query(
      `INSERT INTO effort_estimate_configs (story_points, min_days, max_days)
       VALUES ($1, $2, $3) ON CONFLICT (story_points) DO NOTHING`,
      [e.sp, e.minD, e.maxD]
    );
  }

  // Competency Overhead Matrix
  const overheads = [
    { competency: 'Emerging',  complexity: 'Low',          pct: 0.02 },
    { competency: 'Emerging',  complexity: 'Medium',       pct: 0.05 },
    { competency: 'Emerging',  complexity: 'High',         pct: 0.10 },
    { competency: 'Emerging',  complexity: 'Very High',    pct: 0.15 },
    { competency: 'Emerging',  complexity: 'Unmanageable', pct: 0.20 },
    { competency: 'Competent', complexity: 'Low',          pct: 0.01 },
    { competency: 'Competent', complexity: 'Medium',       pct: 0.02 },
    { competency: 'Competent', complexity: 'High',         pct: 0.05 },
    { competency: 'Competent', complexity: 'Very High',    pct: 0.07 },
    { competency: 'Competent', complexity: 'Unmanageable', pct: 0.10 },
    { competency: 'Expert',    complexity: 'Low',          pct: 0.00 },
    { competency: 'Expert',    complexity: 'Medium',       pct: 0.01 },
    { competency: 'Expert',    complexity: 'High',         pct: 0.02 },
    { competency: 'Expert',    complexity: 'Very High',    pct: 0.05 },
    { competency: 'Expert',    complexity: 'Unmanageable', pct: 0.07 },
  ];

  for (const o of overheads) {
    await client.query(
      `INSERT INTO competency_overhead_configs (competency, complexity, overhead_percent)
       VALUES ($1, $2, $3) ON CONFLICT (competency, complexity) DO NOTHING`,
      [o.competency, o.complexity, o.pct]
    );
  }

  // Competency Level Definitions
  const competencyDefs = [
    {
      level: 'Emerging', sort: 1,
      description: 'Basic knowledge, needs guidance, less than 3 years of experience.',
      knowledge: 'Basic Signalling & Alstom platform knowledge (U400, ETCS). Basic RIGHT Suite knowledge. Basic C++, C#, Qt, Python. Familiarity with TypeScript, Angular, databases. <3 yrs manual testing, limited automation.',
      independence: 'Understands basic requirement structures. Needs guidance to interpret and write specs. Can implement simple features with supervision. Executes predefined test cases.',
      problem_solving: 'Follows established procedures. Needs help with troubleshooting and root cause analysis.',
      communication: 'Communicates within the team. Learning to document and present clearly.',
      mentorship: 'Learns from peers and seniors.',
    },
    {
      level: 'Competent', sort: 2,
      description: 'Good knowledge, works independently on defined tasks, 3–6 years of experience.',
      knowledge: 'Good Signalling & Alstom platform knowledge (U400, ETCS). Good RIGHT Suite knowledge. Proficient in C++, C#, TypeScript, Qt. Solid Angular & database understanding. Intermediate Python. 3–6 yrs manual testing.',
      independence: 'Writes clear, complete, traceable requirements. Independently develops moderately complex features. Designs and executes test cases. Performs regression testing.',
      problem_solving: 'Analyses and resolves moderately complex issues. Suggests improvements. Can validate moderate-risk changes.',
      communication: 'Communicates effectively with cross-functional teams. Participates in reviews and discussions.',
      mentorship: 'Partially mentors junior team members.',
    },
    {
      level: 'Expert', sort: 3,
      description: 'Strong knowledge, leads solutions and stakeholder discussions, more than 6 years of experience.',
      knowledge: 'Strong Signalling expertise in multiple Alstom platforms (U400, ETCS). Strong RIGHT Suite knowledge. Expert C++, C#, TypeScript, Qt. Deep Angular, databases, Python, AutoCAD. >6 yrs testing, strong automation.',
      independence: 'Leads requirement elicitation and stakeholder discussions. Handles complex integrations. Defines test strategy and automation frameworks.',
      problem_solving: 'Solves complex, ambiguous problems. Innovates and optimises solutions. Anticipates risks. Performs impact analysis and ensures compliance.',
      communication: 'Influences stakeholders. Leads meetings, presents strategies, drives alignment.',
      mentorship: 'Coaches and builds team capability.',
    },
  ];

  for (const c of competencyDefs) {
    await client.query(
      `INSERT INTO competency_level_definitions
         (level, description, knowledge_depth, independence, problem_solving, communication, mentorship, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (level) DO NOTHING`,
      [c.level, c.description, c.knowledge, c.independence, c.problem_solving, c.communication, c.mentorship, c.sort]
    );
  }

  // Complexity Definitions
  const complexityDefs = [
    {
      level: 'Low', sort: 1,
      scope: 'Single feature within a module',
      req_clarity: 'Clear, unambiguous',
      biz_logic: 'Simple, no conditions',
      deps: 'None or minimal interdependencies. Simple code structures.',
      impl: 'Minimal code changes, easy to develop. No architectural changes. Single file/component.',
      testing: 'Unit testing only. Basic coverage. Simple test with less than 5 requirements. Existing test cases reused. Minimal regression.',
      risk_label: 'Low',
      rollback: 'Easy to revert',
    },
    {
      level: 'Medium', sort: 2,
      scope: 'Multiple related features within a module',
      req_clarity: 'Mostly clear, may need clarification',
      biz_logic: 'Moderate logic, some conditions',
      deps: 'Some interdependencies with other components or teams. May affect existing features, necessitating adequate testing.',
      impl: 'Moderate code changes, may need coordination. Multiple components. Minor architectural updates.',
      testing: 'Functional + integration testing. Moderate test scenarios. New test cases needed. Moderate regression. Functions affecting other functions with <12 requirements.',
      risk_label: 'Moderate',
      rollback: 'Requires planning',
    },
    {
      level: 'High', sort: 3,
      scope: 'Multiple related features across modules',
      req_clarity: 'Complex, may require workshops or deep analysis',
      biz_logic: 'Complex logic, multiple scenarios',
      deps: 'Significant interdependencies with other components or teams',
      impl: 'High, may require architectural changes. Thorough planning and rigorous testing required. Group of developers.',
      testing: 'Full regression and performance testing. Complex test scenarios. Extensive new test cases. High system impact. Functions with impact on other modules with >12 requirements.',
      risk_label: 'High',
      rollback: 'Complex, may need rollback strategy',
    },
    {
      level: 'Very High', sort: 4,
      scope: 'Multiple features across multiple modules, possibly spanning systems or domains',
      req_clarity: 'Highly complex, often ambiguous or evolving. Requires multiple workshops and stakeholder alignment.',
      biz_logic: 'Highly intricate logic with numerous conditional branches, algorithms, or external system interactions.',
      deps: 'Critical interdependencies across multiple teams, systems, or third-party services. Changes may have cascading effects.',
      impl: 'Significant architectural changes, cross-team collaboration, longer development cycles. May involve new technology adoption.',
      testing: 'End-to-end, performance/load, security, and compliance testing. Impacts multiple modules with >12 requirements.',
      risk_label: 'Very High',
      rollback: 'Extremely difficult. May require parallel systems, feature toggles, or phased rollouts.',
    },
    {
      level: 'Unmanageable', sort: 5,
      scope: 'Spans multiple systems, platforms, or business domains. May involve external vendors, legacy systems, or global impact.',
      req_clarity: 'Unclear, volatile, or conflicting. High risk of scope creep.',
      biz_logic: 'Extremely convoluted. May involve AI/ML, real-time decision engines, or regulatory constraints.',
      deps: 'Critical and unstable dependencies across many teams, systems, or third parties. High risk of bottlenecks or failures.',
      impl: 'Requires massive reengineering, new infrastructure, or organisational change. May involve unknowns or R&D.',
      testing: 'Custom test frameworks, multi-environment validation, compliance audits, and real-world simulations.',
      risk_label: 'Extreme',
      rollback: 'Rollback not feasible. May require disaster recovery plans, parallel systems, or manual overrides.',
    },
  ];

  for (const d of complexityDefs) {
    await client.query(
      `INSERT INTO complexity_definitions
         (level, scope, requirement_clarity, business_logic, dependencies, implementation_effort, testing_effort, risk_label, rollback_complexity, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (level) DO NOTHING`,
      [d.level, d.scope, d.req_clarity, d.biz_logic, d.deps, d.impl, d.testing, d.risk_label, d.rollback, d.sort]
    );
  }

  // Risk Definitions
  const riskDefs = [
    {
      level: 'Low', sort: 1,
      scope: 'Affects a small, isolated feature in module',
      req_clarity: 'Fully clear, well-documented, and agreed upon.',
      biz_logic: 'No change or very minor logic adjustment.',
      deps: 'No or minimal dependencies. Self-contained.',
      impl: 'Simple implementations with limited dependencies.',
      testing: 'Minimal testing. No new test cases.',
      risk_label: 'Very low chance of introducing defects.',
      rollback: 'Easy to revert with minimal impact.',
    },
    {
      level: 'Medium', sort: 2,
      scope: 'Impacts a specific module',
      req_clarity: 'Mostly clear but may need minor clarifications.',
      biz_logic: 'Moderate logic changes with limited impact.',
      deps: 'Some internal dependencies within the system.',
      impl: 'Moderate effort with some dependencies on other components.',
      testing: 'Targeted regression and some new test cases. Impact on other functions. Multiple scenarios required.',
      risk_label: 'Moderate risk of side effects or regressions.',
      rollback: 'Revert possible with moderate effort.',
    },
    {
      level: 'High', sort: 3,
      scope: 'Affects multiple modules',
      req_clarity: 'Ambiguous, evolving, or requires stakeholder alignment.',
      biz_logic: 'Core business logic changes or introduction of new workflows.',
      deps: 'Multiple internal and external dependencies. High coupling.',
      impl: 'High effort. Complex implementations with high interdependencies. May require multiple developers.',
      testing: 'Extensive regression, new test plans. Impact on other modules with multiple scenarios and combinations.',
      risk_label: 'High risk of critical failures or system instability.',
      rollback: 'Difficult to rollback.',
    },
    {
      level: 'Very High', sort: 4,
      scope: 'Impacts multiple systems or core platform components. Potential for widespread or critical failure.',
      req_clarity: 'Requirements are highly complex, ambiguous, or evolving during development.',
      biz_logic: 'Major redesign of critical business logic with widespread impact.',
      deps: 'Significant interdependencies across multiple modules, teams, or systems.',
      impl: 'Significant implementation effort requiring coordinated work across teams. Major architectural changes.',
      testing: 'Extensive testing required (end-to-end, regression, performance, security).',
      risk_label: 'Very high probability of critical failures, major regressions, or system instability.',
      rollback: 'Rollback is extremely difficult. May require feature toggles, phased rollout, or parallel systems.',
    },
    {
      level: 'Unknown', sort: 5,
      scope: 'Insufficient information to determine scope or potential impact. Requires further analysis.',
      req_clarity: 'Scope, dependencies, technical feasibility, or integration approach are not defined.',
      biz_logic: 'Insufficient clarity to assess the degree of business logic impact.',
      deps: 'High likelihood of rework, redesign, or task rejection once development starts.',
      impl: 'Insufficient clarity on required implementation effort, dependencies, or resource needs.',
      testing: 'Extensive testing required (end-to-end, regression, performance, security).',
      risk_label: 'Risk cannot be reliably assessed at estimation time.',
      rollback: 'Requires review with System Architect or stakeholders before proceeding.',
    },
  ];

  for (const r of riskDefs) {
    await client.query(
      `INSERT INTO risk_definitions
         (level, scope, requirement_clarity, business_logic, dependencies, implementation_effort, testing_effort, risk_label, rollback_complexity, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (level) DO NOTHING`,
      [r.level, r.scope, r.req_clarity, r.biz_logic, r.deps, r.impl, r.testing, r.risk_label, r.rollback, r.sort]
    );
  }

  // Welcome notification
  await client.query(
    `INSERT INTO notifications (type, title, message)
     VALUES ('info', 'Welcome to Estimation Platform', 'Master data has been seeded from EstimationModel.xlsx. You can start creating estimations.')`
  );
}
