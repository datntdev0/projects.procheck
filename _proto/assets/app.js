/* ==========================================================================
   Procheck prototype runtime — theme, i18n, mock data, app shell, assistant
   Load in <head> WITHOUT defer:  <script src="assets/app.js"></script>
   Then Lucide with defer:        <script defer src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>

   Page contract (body attributes):
     data-page="board"               → highlights nav item
     data-shell="project|home|none"  → project: project sidebar+topbar+assistant; home: app sidebar+topbar+assistant; none: no chrome
     data-assistant="open|closed"    → initial assistant panel state (default open)
     data-crumb="i18n.key"           → last breadcrumb label
   Page provides <main class="canvas">…</main> as the only body child (plus scripts).

   API (window.PC):
     PC.i18n.extend({ en:{k:v}, vi:{k:v} })   register page strings (call before DOMContentLoaded)
     PC.t(key)                                  translate
     PC.lang / PC.setLang('en'|'vi')           current language; fires 'pc:lang' on document
     PC.theme / PC.setTheme('system'|'light'|'dark'); fires 'pc:theme'
     PC.onReady(fn)                             run after shell injected
     PC.refresh(root?)                          re-apply i18n + icons on dynamic content
     PC.toast(msg, {icon, tone})                show toast
     PC.modal({title, body(html), actions:[{label, kind, onClick}]}) → {close}
     PC.assistant.open()/close()/toggle()/setContext(chips)/seed(msgs)/push(msg)/reply(text)
     PC.data                                    shared mock data (projects, user, cli…)
     PC.esc(str)                                HTML escape
   i18n attributes: data-i18n, data-i18n-html, data-i18n-placeholder, data-i18n-title, data-i18n-tip
   ========================================================================== */
(function () {
  'use strict';
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pc.' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pc.' + k, v); } catch (e) {} }
  };
  const PC = window.PC = window.PC || {};
  const base = (function () {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/app\.js.*$/, '') : '';
  })();
  PC.base = base;

  /* ------------------------------------------------------------------ THEME */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  PC.theme = LS.get('theme', 'system');
  function resolveTheme() { return PC.theme === 'system' ? (mq && mq.matches ? 'dark' : 'light') : PC.theme; }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', resolveTheme());
    document.documentElement.setAttribute('data-theme-pref', PC.theme);
  }
  PC.resolvedTheme = resolveTheme;
  PC.setTheme = function (t) {
    PC.theme = t; LS.set('theme', t); applyTheme(); updateToggles();
    document.dispatchEvent(new CustomEvent('pc:theme', { detail: { theme: t, resolved: resolveTheme() } }));
  };
  if (mq) (mq.addEventListener ? mq.addEventListener('change', () => PC.theme === 'system' && PC.setTheme('system')) : mq.addListener(() => PC.theme === 'system' && PC.setTheme('system')));
  applyTheme();

  /* ------------------------------------------------------------------- I18N */
  PC.lang = LS.get('lang', 'en');
  document.documentElement.lang = PC.lang;
  const dict = { en: {}, vi: {} };
  PC.i18n = {
    extend(d) { for (const l in d) Object.assign(dict[l] = dict[l] || {}, d[l]); },
    dict
  };
  PC.t = function (k, vars) {
    let s = (dict[PC.lang] && dict[PC.lang][k]) ?? dict.en[k] ?? k;
    if (vars) for (const v in vars) s = s.replace(new RegExp('\\{' + v + '\\}', 'g'), vars[v]);
    return s;
  };
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = PC.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = PC.t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = PC.t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = PC.t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-tip]').forEach(el => { el.setAttribute('data-tip', PC.t(el.dataset.i18nTip)); });
    root.querySelectorAll('[data-i18n-tip-right]').forEach(el => { el.setAttribute('data-tip-right', PC.t(el.dataset.i18nTipRight)); });
  }
  PC.setLang = function (l) {
    PC.lang = l; LS.set('lang', l); document.documentElement.lang = l;
    applyI18n(); updateToggles(); updateTitle();
    document.dispatchEvent(new CustomEvent('pc:lang', { detail: { lang: l } }));
    icons();
  };

  PC.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Shared shell strings */
  PC.i18n.extend({
    en: {
      'app.name': 'Procheck', 'app.by': 'by KMS Technology',
      'shell.search': 'Search projects, artifacts, tasks…',
      'shell.home': 'Projects', 'shell.search.tip': 'Search (Ctrl K)', 'shell.assistant': 'Assistant', 'shell.activity': 'Activity',
      'shell.runs': 'Agent runs', 'shell.design': 'Design system', 'shell.settings': 'Settings', 'shell.profile': 'Profile',
      'shell.theme': 'Theme', 'theme.system': 'System', 'theme.light': 'Light', 'theme.dark': 'Dark', 'shell.lang': 'Language',
      'nav.project': 'Project', 'nav.overview': 'Overview', 'nav.workflow': 'Workflow',
      'nav.initial': 'Initial phase', 'nav.release': 'Scaffolding', 'nav.scaffolding': 'Scaffolding', 'nav.sdlc': 'SDLC',
      'nav.artifacts': 'Artifacts', 'nav.sources': 'Sources', 'nav.assistant': 'Assistant', 'nav.repository': 'Scaffolding',
      'nav.board': 'SDLC board', 'nav.task': 'Task detail', 'nav.project_settings': 'Project settings', 'nav.app_settings': 'App settings',
      'nav.all_projects': 'All projects', 'nav.new_project': 'New project', 'nav.open_project': 'Open project folder…', 'nav.recent_projects': 'Recent projects',
      'crumb.switch': 'Switch project',
      'phase.initial': 'Initial', 'phase.release': 'Scaffolding', 'phase.sdlc': 'SDLC',
      'storage.app': 'Application data', 'storage.project': 'Project data',
      'cli.connected': 'connected', 'cli.isolated': 'HOME isolated',
      'as.title': 'Procheck Assistant', 'as.placeholder': 'Ask, or type / for commands…', 'as.new': 'New chat', 'as.history': 'History',
      'as.close': 'Close', 'as.mode.ask': 'Ask', 'as.mode.edit': 'Edit artifact', 'as.mode.agent': 'Agent',
      'as.attach': 'Attach', 'as.mention': 'Mention artifact', 'as.footnote': 'Runs through your connected CLI in an isolated HOME. Chat history is saved per project.',
      'as.thinking': 'Thinking…', 'as.you': 'You',
      'as.reply.default': 'Got it. I\'ll work on that using the project context. Here is a first pass — review it and tell me what to adjust.',
      'pal.placeholder': 'Type a command or search…', 'pal.nav': 'Go to', 'pal.actions': 'Actions',
      'pal.newproject': 'New project', 'pal.toggletheme': 'Toggle theme', 'pal.togglelang': 'Switch language (EN / VI)', 'pal.toggleassistant': 'Toggle assistant',
      'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close', 'common.confirm': 'Confirm',
    },
    vi: {
      'app.name': 'Procheck', 'app.by': 'bởi KMS Technology',
      'shell.search': 'Tìm dự án, tài liệu, task…',
      'shell.home': 'Dự án', 'shell.search.tip': 'Tìm kiếm (Ctrl K)', 'shell.assistant': 'Trợ lý', 'shell.activity': 'Hoạt động',
      'shell.runs': 'Lượt chạy agent', 'shell.design': 'Design system', 'shell.settings': 'Cài đặt', 'shell.profile': 'Hồ sơ',
      'shell.theme': 'Giao diện', 'theme.system': 'Theo hệ thống', 'theme.light': 'Sáng', 'theme.dark': 'Tối', 'shell.lang': 'Ngôn ngữ',
      'nav.project': 'Dự án', 'nav.overview': 'Tổng quan', 'nav.workflow': 'Quy trình',
      'nav.initial': 'Giai đoạn khởi tạo', 'nav.release': 'Scaffolding', 'nav.scaffolding': 'Scaffolding', 'nav.sdlc': 'SDLC',
      'nav.artifacts': 'Tài liệu', 'nav.sources': 'Nguồn', 'nav.assistant': 'Trợ lý', 'nav.repository': 'Scaffolding',
      'nav.board': 'Bảng SDLC', 'nav.task': 'Chi tiết task', 'nav.project_settings': 'Cài đặt dự án', 'nav.app_settings': 'Cài đặt ứng dụng',
      'nav.all_projects': 'Tất cả dự án', 'nav.new_project': 'Tạo dự án', 'nav.open_project': 'Mở thư mục dự án…', 'nav.recent_projects': 'Dự án gần đây',
      'crumb.switch': 'Chuyển dự án',
      'phase.initial': 'Khởi tạo', 'phase.release': 'Scaffolding', 'phase.sdlc': 'SDLC',
      'storage.app': 'Dữ liệu ứng dụng', 'storage.project': 'Dữ liệu dự án',
      'cli.connected': 'đã kết nối', 'cli.isolated': 'HOME cô lập',
      'as.title': 'Trợ lý Procheck', 'as.placeholder': 'Hỏi, hoặc gõ / để dùng lệnh…', 'as.new': 'Chat mới', 'as.history': 'Lịch sử',
      'as.close': 'Đóng', 'as.mode.ask': 'Hỏi', 'as.mode.edit': 'Sửa tài liệu', 'as.mode.agent': 'Agent',
      'as.attach': 'Đính kèm', 'as.mention': 'Nhắc tới tài liệu', 'as.footnote': 'Chạy qua CLI đã kết nối trong HOME cô lập. Lịch sử chat được lưu theo dự án.',
      'as.thinking': 'Đang suy nghĩ…', 'as.you': 'Bạn',
      'as.reply.default': 'Đã rõ. Tôi sẽ xử lý dựa trên ngữ cảnh dự án. Đây là bản nháp đầu tiên — bạn xem và cho tôi biết cần chỉnh gì.',
      'pal.placeholder': 'Gõ lệnh hoặc tìm kiếm…', 'pal.nav': 'Đi tới', 'pal.actions': 'Hành động',
      'pal.newproject': 'Tạo dự án mới', 'pal.toggletheme': 'Đổi giao diện sáng/tối', 'pal.togglelang': 'Đổi ngôn ngữ (EN / VI)', 'pal.toggleassistant': 'Bật/tắt trợ lý',
      'common.cancel': 'Huỷ', 'common.save': 'Lưu', 'common.close': 'Đóng', 'common.confirm': 'Xác nhận',
    }
  });

  /* -------------------------------------------------------------- MOCK DATA */
  PC.data = {
    // Local, single-user desktop app: there is only "me" and the agents (no assignees / members).
    user: { name: 'You', initials: 'ME' },
    agents: [
      { id: 'claude', name: 'Claude Code', initials: 'CC' },
      { id: 'codex', name: 'Codex', initials: 'CX' },
    ],
    cli: [
      { id: 'claude', name: 'Claude Code', version: '2.4.1', model: 'claude-opus-5-5', status: 'connected', bin: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd' },
      { id: 'codex', name: 'Codex CLI', version: '0.48.0', model: 'gpt-5-codex', status: 'connected', bin: 'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd' },
    ],
    // Storage boundary — application data vs. project data. There is NO "workspace" concept.
    storage: {
      app: {
        root: '%LOCALAPPDATA%\\Procheck',
        items: [
          { path: 'settings.json', desc: 'App preferences: theme, language, defaults' },
          { path: 'projects.json', desc: 'Registry of known project directories (recent list)' },
          { path: 'cli\\', desc: 'CLI tool registrations & auth' },
          { path: 'logs\\', desc: 'Application & harness logs' },
          { path: 'cache\\', desc: 'Indexes, thumbnails, temp files (safe to delete)' },
        ],
      },
      project: {
        items: [
          { path: 'procheck.json', desc: 'Project manifest: name, client, phase, linked repo' },
          { path: 'sources\\', desc: 'Uploaded documents (inputs)' },
          { path: 'artifacts\\', desc: 'Generated & edited artifacts with versions' },
          { path: 'board\\', desc: 'Tasks, plans, review evidence' },
          { path: '.procheck\\chats\\', desc: 'Assistant chat history' },
          { path: '.procheck\\runs\\', desc: 'Agent run logs & evidence' },
          { path: '.procheck\\home\\<cli>\\', desc: 'Isolated HOME for each CLI tool' },
          { path: '.procheck\\worktrees\\', desc: 'Git worktrees created by agents' },
          { path: '.procheck\\settings.json', desc: 'Project-level overrides (CLI, model, harness)' },
        ],
      },
    },
    currentProjectId: 'lotus-pay',
    projects: [
      { id: 'lotus-pay', name: 'Lotus Pay — Merchant Portal', short: 'LP', client: 'Lotus Financial Group', phase: 'sdlc', progress: { initial: 100, release: 100, sdlc: 42 }, color: 'linear-gradient(135deg,#006AFE,#245DB3)', updated: '12 min ago', dir: 'D:\\Projects\\lotus-pay', repo: 'D:\\Projects\\lotus-pay\\repo', artifacts: 18, tasks: 34 },
      { id: 'mekong', name: 'Mekong Retail — Omnichannel', short: 'MR', client: 'Mekong Retail JSC', phase: 'release', progress: { initial: 100, release: 64, sdlc: 0 }, color: 'linear-gradient(135deg,#6A26F1,#006AFE)', updated: '2 h ago', dir: 'D:\\Projects\\mekong-omni', repo: 'D:\\src\\mekong-omni', artifacts: 12, tasks: 0 },
      { id: 'viethealth', name: 'VietHealth Telemedicine', short: 'VH', client: 'VietHealth Clinics', phase: 'initial', progress: { initial: 55, release: 0, sdlc: 0 }, color: 'linear-gradient(135deg,#02CCB3,#006AFE)', updated: 'Yesterday', dir: 'D:\\Projects\\viethealth', repo: null, artifacts: 6, tasks: 0 },
      { id: 'saigon-tms', name: 'Saigon Logistics TMS', short: 'SL', client: 'Saigon Logistics Co.', phase: 'initial', progress: { initial: 10, release: 0, sdlc: 0 }, color: 'linear-gradient(135deg,#FE006A,#6A26F1)', updated: '3 days ago', dir: 'C:\\Users\\me\\Documents\\saigon-tms', repo: null, artifacts: 3, tasks: 0 },
      { id: 'atlas-hr', name: 'Atlas HR Suite', short: 'AH', client: 'Atlas Group (internal)', phase: 'sdlc', progress: { initial: 100, release: 100, sdlc: 78 }, color: 'linear-gradient(135deg,#245DB3,#62CCFE)', updated: 'Last week', dir: 'D:\\Projects\\atlas-hr', repo: 'D:\\Projects\\atlas-hr\\repo', artifacts: 24, tasks: 61 },
    ],
    phases: [
      { id: 'initial', icon: 'compass', color: 'var(--phase-initial)', href: 'initial.html' },
      { id: 'release', icon: 'blocks', color: 'var(--phase-release)', href: 'scaffolding.html' },
      { id: 'sdlc', icon: 'infinity', color: 'var(--phase-sdlc)', href: 'board.html' },
    ],
  };
  // Current project: ?p=<id> in the URL wins, then the last opened (localStorage), then the default.
  (function () {
    let q = null; try { q = new URLSearchParams(location.search).get('p'); } catch (e) {}
    const known = id => PC.data.projects.some(p => p.id === id);
    if (q && known(q)) { PC.data.currentProjectId = q; LS.set('project', q); }
    else { const saved = LS.get('project', null); if (saved && known(saved)) PC.data.currentProjectId = saved; }
  })();
  PC.setProject = function (id) { PC.data.currentProjectId = id; LS.set('project', id); };
  PC.projectHome = function (cli, p) { p = p || PC.project(); return p.dir + '\\.procheck\\home\\' + (cli || 'claude'); };
  PC.project = function (id) { return PC.data.projects.find(p => p.id === (id || PC.data.currentProjectId)); };
  /* ----------------------------------------------------------- PHASE STATES
     Each sample project demonstrates a DIFFERENT lifecycle state. Every page
     must render from PC.project().state — never assume a project is in SDLC.
     Phase status: 'locked' | 'not_started' | 'in_progress' | 'done'
     locked = previous phase gate not passed yet (show gate + prerequisites).   */
  const STATES = {
    // SAIGON — Initial phase just started: almost everything is an empty state.
    'saigon-tms': {
      label: { en: 'Initial · just started', vi: 'Khởi tạo · mới bắt đầu' },
      initial: {
        status: 'in_progress', step: 'discovery', // discovery|requirements|scope|estimation|signoff
        steps: { discovery: 'in_progress', requirements: 'not_started', scope: 'not_started', estimation: 'not_started', signoff: 'not_started' },
        meetings: [{ id: 'm1', title: 'Intro call with Ops Director', date: '2026-11-19', kind: 'transcript', insights: false }],
        sources: ['RFP – Transport Management System.pdf', 'Current dispatch process.xlsx'],
        questions: { total: 0, open: 0, blocking: 0 },
        requirements: 0,
        artifacts: [], // none generated yet
        next: { en: 'Extract insights from the intro call and draft discovery questions.', vi: 'Trích ý chính từ buổi intro call và soạn câu hỏi discovery.' },
      },
      scaffolding: { status: 'locked', gate: { en: 'Requires signed SOW (Initial phase)', vi: 'Cần SOW đã ký (giai đoạn Khởi tạo)' } },
      sdlc: { status: 'locked', gate: { en: 'Requires completed Scaffolding', vi: 'Cần hoàn tất Scaffolding' } },
      counts: { artifacts: 3, tasks: 0, runs: 0 },
      greet: { en: 'This project has 2 source documents and 1 meeting transcript. Want me to extract the key points from the intro call and draft discovery questions?', vi: 'Dự án có 2 tài liệu nguồn và 1 transcript cuộc họp. Bạn có muốn mình trích ý chính buổi intro call và soạn câu hỏi discovery không?' },
    },
    // VIETHEALTH — Initial phase mid-way: working on Scope, BRD draft in review, blocking questions.
    'viethealth': {
      label: { en: 'Initial · scoping', vi: 'Khởi tạo · đang chốt scope' },
      initial: {
        status: 'in_progress', step: 'scope',
        steps: { discovery: 'done', requirements: 'in_review', scope: 'in_progress', estimation: 'not_started', signoff: 'not_started' },
        meetings: [
          { id: 'm1', title: 'Kickoff', date: '2026-10-28', kind: 'transcript', insights: true },
          { id: 'm2', title: 'Clinical workflow workshop', date: '2026-11-04', kind: 'recording', insights: true },
          { id: 'm3', title: 'IT security & compliance session', date: '2026-11-18', kind: 'notes', insights: false },
        ],
        sources: ['Clinic operations overview.pdf', 'Patient journey map.png', 'Current HIS integration spec.docx'],
        questions: { total: 9, open: 5, blocking: 2 }, // blocking: e-prescription legal scope; HIS integration ownership
        requirements: 31,
        artifacts: [
          { id: 'meeting-notes', status: 'approved', version: 'v3' },
          { id: 'brd', status: 'in_review', version: 'v1' },
          { id: 'scope', status: 'draft', version: 'v1' },
          { id: 'estimation', status: 'not_started' },
          { id: 'sow', status: 'not_started' },
        ],
        next: { en: 'Resolve 2 blocking questions before freezing scope (e-prescription legality, HIS integration ownership).', vi: 'Giải quyết 2 câu hỏi blocking trước khi chốt scope (pháp lý kê đơn điện tử, trách nhiệm tích hợp HIS).' },
      },
      scaffolding: { status: 'locked', gate: { en: 'Requires signed SOW (Initial phase)', vi: 'Cần SOW đã ký (giai đoạn Khởi tạo)' } },
      sdlc: { status: 'locked', gate: { en: 'Requires completed Scaffolding', vi: 'Cần hoàn tất Scaffolding' } },
      counts: { artifacts: 6, tasks: 0, runs: 0 },
      greet: { en: 'BRD v1 is in review and scope is being drafted. 2 blocking questions are still open — shall I prepare them for the next client call?', vi: 'BRD v1 đang review và scope đang soạn. Còn 2 câu hỏi blocking — mình chuẩn bị chúng cho buổi gọi khách hàng tiếp theo nhé?' },
    },
    // MEKONG — Scaffolding in progress on an EXISTING (brownfield) repo; an ADR awaits approval; agent running CI/CD step.
    'mekong': {
      label: { en: 'Scaffolding · agent running', vi: 'Scaffolding · agent đang chạy' },
      initial: { status: 'done', completedOn: '2026-10-10', artifacts: 'all_approved' },
      scaffolding: {
        status: 'in_progress',
        repo: { path: 'D:\\src\\mekong-omni', kind: 'existing', stack: ['Java 21', 'Spring Boot', 'React 18', 'PostgreSQL', 'Azure DevOps'], branch: 'main', dirty: false },
        architecture: [
          { id: 'c4', status: 'approved' }, { id: 'adr-001', status: 'approved' }, { id: 'adr-002', status: 'approved' }, { id: 'adr-003', status: 'approved' },
          { id: 'adr-004', title: 'Event bus: Azure Service Bus vs Kafka', status: 'awaiting_approval' },
        ],
        steps: { structure: 'done', skeleton: 'done', iac: 'done', cicd: 'running', devcontainer: 'pending', linttest: 'pending' },
        run: { id: 'SC-04', step: 'cicd', progress: 60, agent: 'claude', branch: 'scaffold/ci-pipelines', startedMin: 7 },
      },
      sdlc: { status: 'locked', gate: { en: 'Requires completed Scaffolding (3 of 6 steps left)', vi: 'Cần hoàn tất Scaffolding (còn 3/6 bước)' } },
      counts: { artifacts: 12, tasks: 0, runs: 1 },
      greet: { en: 'The agent is generating CI/CD pipelines (step 4 of 6). ADR-004 (event bus) still needs your approval before the dev-container step.', vi: 'Agent đang tạo CI/CD pipelines (bước 4/6). ADR-004 (event bus) cần bạn duyệt trước bước dev container.' },
    },
    // LOTUS — SDLC mid-sprint: tasks waiting for human review (hero task LP-142).
    'lotus-pay': {
      label: { en: 'SDLC · sprint 4', vi: 'SDLC · sprint 4' },
      initial: { status: 'done', completedOn: '2026-08-29', artifacts: 'all_approved' },
      scaffolding: { status: 'done', completedOn: '2026-10-02' },
      sdlc: {
        status: 'in_progress', sprint: { n: 4, day: 5, days: 10, points: 66, done: 18 },
        hero: { id: 'LP-142', title: 'Merchant KYC document upload', state: 'human_review' },
        runs: { running: 2, review: 2, failed: 0 },
      },
      counts: { artifacts: 18, tasks: 34, runs: 2 },
      greet: { en: '2 tasks are finished by the agent and waiting for your review (LP-142, LP-151).', vi: 'Có 2 task agent đã làm xong và chờ bạn review (LP-142, LP-151).' },
    },
    // ATLAS — SDLC late: release hardening, a FAILED agent run and a changes-requested task.
    'atlas-hr': {
      label: { en: 'SDLC · release hardening', vi: 'SDLC · hardening release' },
      initial: { status: 'done', completedOn: '2026-03-14', artifacts: 'all_approved' },
      scaffolding: { status: 'done', completedOn: '2026-04-20' },
      sdlc: {
        status: 'in_progress', sprint: { n: 9, day: 8, days: 10, points: 48, done: 37 }, release: { name: 'v2.0', readiness: 82 },
        hero: { id: 'AH-311', title: 'Payroll export to bank file (NAPAS)', state: 'failed', e2e: { passed: 6, total: 9 } },
        changesRequested: { id: 'AH-298', title: 'Leave approval delegation' },
        runs: { running: 1, review: 1, failed: 1 },
      },
      counts: { artifacts: 24, tasks: 61, runs: 2 },
      greet: { en: 'Heads-up: the agent run for AH-311 failed — 3 of 9 e2e tests did not pass. Want me to analyse the failures?', vi: 'Lưu ý: lượt chạy agent của AH-311 bị lỗi — 3/9 test e2e không qua. Bạn muốn mình phân tích lỗi không?' },
    },
  };
  PC.data.projects.forEach(p => { p.state = STATES[p.id]; });
  PC.phaseStatus = function (phase, p) { p = p || PC.project(); const k = phase === 'release' ? 'scaffolding' : phase; return (p.state && p.state[k] && p.state[k].status) || 'not_started'; };
  PC.L = function (obj) { return obj ? (obj[PC.lang] || obj.en || '') : ''; };

  /* ---------------------------------------------------------------- HELPERS */
  function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); }
  PC.refresh = function (root) { applyI18n(root); icons(); };
  const readyQ = [];
  let isReady = false;
  PC.onReady = fn => (isReady ? fn() : readyQ.push(fn));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  PC.h = h;
  const href = p => base + p;

  PC.toast = function (msg, opts) {
    opts = opts || {};
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = h('<div class="toast-stack"></div>'); document.body.appendChild(stack); }
    const color = { success: 'var(--success)', danger: 'var(--danger)', warning: 'var(--warning)' }[opts.tone] || 'var(--kms-sky)';
    const el = h(`<div class="toast"><i data-lucide="${opts.icon || 'check-circle-2'}" style="color:${color}"></i><span>${msg}</span></div>`);
    stack.appendChild(el); icons();
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, opts.duration || 2800);
  };

  PC.modal = function (o) {
    const ov = h(`<div class="overlay"><div class="modal" role="dialog" aria-modal="true" style="${o.width ? 'width:min(' + o.width + 'px,100%)' : ''}">
      <div class="modal-header"><h4>${o.title || ''}</h4><button class="btn btn-ghost btn-icon btn-sm" data-x><i data-lucide="x"></i></button></div>
      <div class="modal-body">${o.body || ''}</div>
      ${o.actions ? '<div class="modal-footer"></div>' : ''}</div></div>`);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); o.onClose && o.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
    (o.actions || []).forEach(a => {
      const b = h(`<button class="btn btn-${a.kind || 'secondary'}">${a.icon ? `<i data-lucide="${a.icon}"></i>` : ''}<span>${a.label}</span></button>`);
      b.onclick = () => { const r = a.onClick && a.onClick(ov); if (r !== false) close(); };
      ov.querySelector('.modal-footer').appendChild(b);
    });
    document.body.appendChild(ov); document.addEventListener('keydown', onKey); PC.refresh(ov);
    return { el: ov, close };
  };

  /* ------------------------------------------------------------------ SHELL */
  /* Sidebar replaces the old icon rail. Cross-project navigation happens in the
     topbar breadcrumb:  Projects  /  <Project ▾>  /  <Page>
     "Projects" → index.html (cross-project overview); the project crumb opens a
     switcher. There is NO "workspace" concept: a project = a directory on disk. */
  const NAV = [
    { group: 'nav.project', items: [
      { id: 'overview', icon: 'layout-dashboard', label: 'nav.overview', href: 'overview.html' },
      { id: 'artifacts', icon: 'files', label: 'nav.artifacts', href: 'artifacts.html', count: () => PC.project().state.counts.artifacts },
      { id: 'assistant', icon: 'sparkles', label: 'nav.assistant', href: 'assistant.html' },
    ] },
    { group: 'nav.workflow', items: [
      { id: 'initial', icon: 'compass', label: 'nav.initial', href: 'initial.html', phase: 'initial' },
      { id: 'scaffolding', icon: 'blocks', label: 'nav.scaffolding', href: 'scaffolding.html', phase: 'release', lockable: 'release' },
      { id: 'board', icon: 'kanban', label: 'nav.board', href: 'board.html', phase: 'sdlc', lockable: 'sdlc', count: () => PC.project().state.counts.tasks },
      { id: 'task', icon: 'bot', label: 'shell.runs', href: 'task.html', count: () => PC.project().state.counts.runs },
    ] },
  ];

  function phaseTrack(p) {
    const seg = (id, col) => `<span><i style="width:${p.progress[id]}%;background:${col}"></i></span>`;
    return `<div class="phase-track">
      <div class="row between"><span class="text-xs text-muted" data-i18n="nav.workflow"></span><span class="phase-chip phase-${p.phase}" data-i18n="phase.${p.phase}"></span></div>
      <div class="bars">${seg('initial', 'var(--phase-initial)')}${seg('release', 'var(--phase-release)')}${seg('sdlc', 'var(--phase-sdlc)')}</div>
      <div class="labels"><span data-i18n="phase.initial"></span><span data-i18n="phase.release"></span><span data-i18n="phase.sdlc"></span></div>
    </div>`;
  }
  const brandHTML = () => `<a class="sb-brand" href="${href('index.html')}">
      <span class="brand-mark"><img src="${href('assets/kms-mark.svg')}" alt=""></span>
      <span class="brand-name" data-i18n="app.name"></span><span class="brand-by" data-i18n="app.by"></span>
    </a>`;
  const navLink = (it, page) => {
    const count = typeof it.count === 'function' ? it.count() : it.count;
    const locked = it.lockable && PC.phaseStatus(it.lockable) === 'locked';
    const st = it.phase ? PC.phaseStatus(it.phase) : null;
    const marker = !it.phase ? '' : locked ? '<i data-lucide="lock" class="nav-lock"></i>'
      : st === 'done' ? `<i data-lucide="check" class="nav-done" style="color:var(--phase-${it.phase})"></i>`
      : `<span class="phase-dot" style="background:var(--phase-${it.phase})"></span>`;
    return `<a class="nav-item ${it.id === page ? 'is-active' : ''} ${locked ? 'is-locked' : ''}" href="${href(it.href)}">
      <i data-lucide="${it.icon}"></i><span class="truncate" data-i18n="${it.label}"></span>
      ${marker}${count ? `<span class="count">${count}</span>` : ''}
    </a>`;
  };
  const footerHTML = (page) => `<div class="sidebar-footer">
      ${navLink({ id: 'settings', icon: 'settings', label: 'nav.app_settings', href: 'settings.html' }, page)}
      ${navLink({ id: 'design', icon: 'palette', label: 'shell.design', href: 'DESIGN.html' }, page)}
      <div class="cli-status"><span class="dot dot-pulse"></span><span class="truncate"><b>Claude Code</b> · <span data-i18n="cli.connected"></span></span><span class="badge badge-outline" style="margin-left:auto" data-i18n="cli.isolated"></span></div>
    </div>`;

  function buildProjectSidebar(page) {
    const p = PC.project();
    const nav = NAV.map(g => `<div class="nav-group"><div class="nav-group-title"><span data-i18n="${g.group}"></span></div>
      ${g.items.map(it => navLink(it, page)).join('')}</div>`).join('');
    return `<aside class="sidebar"><div class="sidebar-inner">
      ${brandHTML()}
      <div class="sb-project">
        <div class="project-avatar" style="background:${p.color}">${p.short}</div>
        <div class="grow" style="min-width:0"><div class="name truncate">${PC.esc(p.name)}</div><div class="meta truncate" title="${PC.esc(p.dir)}">${PC.esc(p.dir)}</div></div>
      </div>
      ${phaseTrack(p)}
      <nav class="nav">${nav}
        <div class="nav-group">${navLink({ id: 'project-settings', icon: 'sliders-horizontal', label: 'nav.project_settings', href: 'project-settings.html' }, page)}</div>
      </nav>
      ${footerHTML(page)}
    </div></aside>`;
  }

  function buildHomeSidebar(page) {
    const projects = PC.data.projects.map(p => `<a class="nav-item" href="${href('overview.html?p=' + p.id)}">
        <span class="project-avatar" style="background:${p.color}">${p.short}</span><span class="truncate">${PC.esc(p.name.split(' — ')[0])}</span>
        <span class="phase-chip phase-${p.phase}" data-i18n="phase.${p.phase}"></span></a>`).join('');
    return `<aside class="sidebar"><div class="sidebar-inner">
      ${brandHTML()}
      <nav class="nav">
        <div class="nav-group">
          ${navLink({ id: 'home', icon: 'layout-grid', label: 'nav.all_projects', href: 'index.html' }, page)}
          ${navLink({ id: 'new-project', icon: 'folder-plus', label: 'nav.new_project', href: 'new-project.html' }, page)}
          ${navLink({ id: 'open-project', icon: 'folder-open', label: 'nav.open_project', href: 'new-project.html?mode=open' }, page)}
        </div>
        <div class="nav-group"><div class="nav-group-title"><span data-i18n="nav.recent_projects"></span></div>${projects}</div>
      </nav>
      ${footerHTML(page)}
    </div></aside>`;
  }

  function buildTopbar(shell, crumb) {
    const p = PC.project();
    let crumbs = `<a class="crumb" href="${href('index.html')}"><i data-lucide="layout-grid" class="icon-sm"></i><span data-i18n="shell.home"></span></a>`;
    if (shell === 'project') {
      crumbs += `<span class="crumb-sep">/</span><button class="crumb" id="pc-project-crumb" data-i18n-title="crumb.switch"><span class="project-avatar" style="background:${p.color}">${p.short}</span><span class="truncate" style="max-width:240px">${PC.esc(p.name)}</span><i data-lucide="chevrons-up-down" class="chev"></i></button>`;
      if (crumb) crumbs += `<span class="crumb-sep">/</span><span class="crumb current" data-i18n="${crumb}"></span>`;
    } else if (crumb && crumb !== 'home.title') {
      crumbs += `<span class="crumb-sep">/</span><span class="crumb current" data-i18n="${crumb}"></span>`;
    }
    return `<header class="topbar">
      <div class="crumbs">${crumbs}</div>
      <button class="search-btn" data-action="palette"><i data-lucide="search" class="icon-sm"></i><span class="truncate" data-i18n="shell.search"></span><span class="kbd">Ctrl K</span></button>
      <div class="tb-actions">
        <button class="tb-btn" data-action="lang" data-i18n-tip="shell.lang"><i data-lucide="languages" class="icon-sm"></i><span id="pc-lang-label">EN</span></button>
        <button class="tb-btn" data-action="theme" data-i18n-tip="shell.theme"><i data-lucide="sun-moon" class="icon-sm"></i></button>
        <div class="tb-sep"></div>
        <button class="tb-btn" data-action="assistant" id="pc-as-toggle"><i data-lucide="sparkles" class="icon-sm"></i><span data-i18n="shell.assistant"></span></button>
      </div>
    </header>`;
  }

  function projectSwitcher(anchor) {
    const cur = PC.data.currentProjectId;
    const items = PC.data.projects.map(p => `<button class="menu-item" data-v="${p.id}"><span class="project-avatar" style="background:${p.color};width:22px;height:22px;border-radius:6px;font-size:9px">${p.short}</span><span class="grow truncate">${PC.esc(p.name)}</span><span class="phase-chip phase-${p.phase}" data-i18n="phase.${p.phase}"></span>${p.id === cur ? '<i data-lucide="check"></i>' : '<span style="width:16px"></span>'}</button>`).join('');
    const pop = popover(anchor, `<div class="menu-label" data-i18n="crumb.switch"></div>${items}<div class="menu-sep"></div>
      <button class="menu-item" data-v="__all"><i data-lucide="layout-grid"></i><span data-i18n="nav.all_projects"></span></button>
      <button class="menu-item" data-v="__new"><i data-lucide="folder-plus"></i><span data-i18n="nav.new_project"></span></button>`, v => {
      if (v === '__all') location.href = href('index.html');
      else if (v === '__new') location.href = href('new-project.html');
      else { PC.setProject(v); location.href = href('overview.html'); }
    });
    pop.style.minWidth = '380px';
    pop.style.left = Math.max(8, anchor.getBoundingClientRect().left) + 'px';
  }

  /* -------------------------------------------------------------- ASSISTANT */
  const AS = PC.assistant = {
    context: null, msgs: null, mode: 'ask',
    open() { app && app.classList.remove('assistant-closed'); LS.set('assistant', 'open'); updateToggles(); },
    close() { app && app.classList.add('assistant-closed'); LS.set('assistant', 'closed'); updateToggles(); },
    toggle() { app && (app.classList.contains('assistant-closed') ? AS.open() : AS.close()); },
    setContext(chips) { AS.context = chips; renderCtx(); },
    seed(msgs) { AS.msgs = msgs; AS.msgsLocked = true; renderMsgs(); },
    push(m) { (AS.msgs = AS.msgs || defaultMsgs()).push(m); renderMsgs(); },
    reply(text, extra) {
      const list = document.getElementById('pc-as-msgs'); if (!list) return;
      const t = h(`<div class="msg"><div class="avatar avatar-ai"><i data-lucide="sparkles" style="width:13px;height:13px"></i></div><div class="msg-body"><div class="typing"><i></i><i></i><i></i></div></div></div>`);
      list.appendChild(t); icons(); list.scrollTop = list.scrollHeight;
      setTimeout(() => { t.remove(); AS.push(Object.assign({ role: 'ai', text: text || PC.t('as.reply.default') }, extra || {})); }, 1100);
    }
  };
  const defaultCtx = () => [{ icon: 'folder', label: PC.project().name.split(' — ')[0] }, { icon: 'hard-drive', label: PC.project().dir }, { icon: 'cpu', label: 'claude-opus-5-5' }];
  const defaultMsgs = () => { const p = PC.project(); if (p.id !== 'lotus-pay' && p.state && p.state.greet) return [{ role: 'ai', time: '09:12', text: '<p>' + PC.esc(PC.L(p.state.greet)) + '</p>' }]; return PC.lang === 'vi' ? [
    { role: 'ai', time: '09:12', text: '<p>Chào bạn 👋 Mình đã đọc <b>18 tài liệu</b> của dự án <b>' + PC.esc(PC.project().name.split(' — ')[0]) + '</b>. Giai đoạn SDLC đang ở sprint 4.</p><p>Hôm nay bạn muốn làm gì?</p>' },
    { role: 'user', time: '09:13', text: 'Tóm tắt các task đang chờ review giúp mình.' },
    { role: 'ai', time: '09:13', text: '<p>Có <b>2 task</b> agent đã hoàn thành và chờ bạn review:</p><ul><li><b>LP-142</b> Merchant KYC upload — 14 files, e2e pass 12/12</li><li><b>LP-151</b> Settlement report export — 6 files, e2e pass 5/5</li></ul>', tool: 'board.list --status=review', card: { icon: 'git-pull-request', title: 'LP-142 · Merchant KYC upload', sub: 'Ready for human review', href: 'task.html' } },
  ] : [
    { role: 'ai', time: '09:12', text: '<p>Hi 👋 I\'ve indexed <b>18 artifacts</b> for <b>Lotus Pay</b>. The SDLC phase is in sprint 4.</p><p>What would you like to work on?</p>' },
    { role: 'user', time: '09:13', text: 'Summarize the tasks waiting for my review.' },
    { role: 'ai', time: '09:13', text: '<p><b>2 tasks</b> are finished by the agent and waiting for you:</p><ul><li><b>LP-142</b> Merchant KYC upload — 14 files, e2e 12/12 passed</li><li><b>LP-151</b> Settlement report export — 6 files, e2e 5/5 passed</li></ul>', tool: 'board.list --status=review', card: { icon: 'git-pull-request', title: 'LP-142 · Merchant KYC upload', sub: 'Ready for human review', href: 'task.html' } },
  ]; };
  let customMsgs = false;

  function msgHTML(m) {
    if (m.role === 'user') return `<div class="msg user"><div class="avatar avatar-sm" style="width:26px;height:26px">${PC.data.user.initials}</div><div class="msg-body"><div class="msg-meta"><b>${PC.t('as.you')}</b>${m.time ? '· ' + m.time : ''}</div><div class="msg-text">${m.text}</div></div></div>`;
    return `<div class="msg"><div class="avatar avatar-ai"><i data-lucide="sparkles" style="width:13px;height:13px"></i></div><div class="msg-body">
      <div class="msg-meta"><b>Assistant</b>${m.time ? '· ' + m.time : ''}</div>
      ${m.tool ? `<div class="tool-call"><i data-lucide="terminal"></i>${PC.esc(m.tool)}<i data-lucide="check" style="margin-left:auto;color:var(--success)"></i></div>` : ''}
      <div class="msg-text" style="margin-top:4px">${m.text}</div>
      ${m.card ? `<a class="msg-card" href="${m.card.href ? href(m.card.href) : 'javascript:void(0)'}" style="text-decoration:none;color:inherit"><span class="file-tile"><i data-lucide="${m.card.icon}"></i></span><span class="grow"><span class="text-sm" style="font-weight:600;display:block">${PC.esc(m.card.title)}</span><span class="text-xs text-subtle">${PC.esc(m.card.sub || '')}</span></span><i data-lucide="arrow-up-right" class="icon-sm text-faint"></i></a>` : ''}
      <div class="msg-actions"><button class="btn btn-ghost btn-sm btn-icon"><i data-lucide="copy" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm btn-icon"><i data-lucide="thumbs-up" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm btn-icon"><i data-lucide="rotate-ccw" class="icon-sm"></i></button></div>
    </div></div>`;
  }
  function renderMsgs() {
    const list = document.getElementById('pc-as-msgs'); if (!list) return;
    list.innerHTML = (AS.msgs || defaultMsgs()).map(msgHTML).join('');
    icons(); list.scrollTop = list.scrollHeight;
  }
  function renderCtx() {
    const el = document.getElementById('pc-as-ctx'); if (!el) return;
    el.innerHTML = (AS.context || defaultCtx()).map(c => `<span class="ctx-chip"><i data-lucide="${c.icon}"></i>${PC.esc(c.label)}</span>`).join('');
    icons();
  }
  function buildAssistant() {
    return `<aside class="assistant" aria-label="Assistant"><div class="assistant-inner">
      <div class="as-header">
        <div class="avatar avatar-ai" style="width:30px;height:30px"><i data-lucide="sparkles" style="width:15px;height:15px"></i></div>
        <div class="grow"><div class="as-title" data-i18n="as.title"></div><div class="as-sub"><span class="dot dot-success" style="width:6px;height:6px"></span>Claude Code · claude-opus-5-5</div></div>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.history" data-action="as-history"><i data-lucide="history"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.new" data-action="as-new"><i data-lucide="square-pen"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.close" data-action="assistant"><i data-lucide="panel-right-close"></i></button>
      </div>
      <div class="as-context" id="pc-as-ctx"></div>
      <div class="as-messages" id="pc-as-msgs"></div>
      <div class="as-suggest" id="pc-as-suggest"></div>
      <form class="composer" id="pc-composer">
        <textarea rows="1" data-i18n-placeholder="as.placeholder"></textarea>
        <div class="composer-bar">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.attach"><i data-lucide="paperclip"></i></button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.mention"><i data-lucide="at-sign"></i></button>
          <button type="button" class="mode" id="pc-as-mode"><i data-lucide="message-circle" class="icon-sm"></i><span data-i18n="as.mode.ask"></span><i data-lucide="chevron-down" class="icon-sm"></i></button>
          <button type="submit" class="send" aria-label="send"><i data-lucide="arrow-up"></i></button>
        </div>
      </form>
      <div class="as-footnote" data-i18n="as.footnote"></div>
    </div></aside>`;
  }
  AS.setSuggestions = function (list, custom) {
    if (custom !== false) AS.customSuggest = true;
    const el = document.getElementById('pc-as-suggest'); if (!el) return;
    el.innerHTML = list.map(s => `<button type="button">${PC.esc(s)}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => send(b.textContent));
  };
  function send(text) {
    text = (text || '').trim(); if (!text) return;
    if (!AS.msgs) AS.msgs = defaultMsgs();
    customMsgs = true;
    const now = new Date(); const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    AS.push({ role: 'user', time, text: PC.esc(text) });
    AS.reply(null, { time });
  }
  function defaultSuggest() { AS.setSuggestions(PC.lang === 'vi' ? ['Tóm tắt tài liệu mới nhất', 'Tạo user stories', 'Rủi ro dự án?'] : ['Summarize latest docs', 'Draft user stories', 'Project risks?'], false); }
  const MODES = [{ id: 'ask', icon: 'message-circle' }, { id: 'edit', icon: 'file-pen-line' }, { id: 'agent', icon: 'bot' }];

  /* ---------------------------------------------------------- POPOVER MENU */
  function popover(anchor, html, onPick) {
    document.querySelectorAll('.popover').forEach(p => p.remove());
    const r = anchor.getBoundingClientRect();
    const pop = h(`<div class="popover menu">${html}</div>`);
    document.body.appendChild(pop);
    const w = pop.offsetWidth;
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    PC.refresh(pop);
    const off = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } };
    setTimeout(() => document.addEventListener('mousedown', off));
    pop.addEventListener('click', e => { const it = e.target.closest('[data-v]'); if (it) { onPick(it.dataset.v); pop.remove(); } });
    return pop;
  }
  PC.popover = popover;

  /* ------------------------------------------------------- COMMAND PALETTE */
  function palette() {
    const items = [
      { g: 'pal.nav', icon: 'layout-grid', label: 'shell.home', go: 'index.html' },
      { g: 'pal.nav', icon: 'layout-dashboard', label: 'nav.overview', go: 'overview.html' },
      { g: 'pal.nav', icon: 'files', label: 'nav.artifacts', go: 'artifacts.html' },
      { g: 'pal.nav', icon: 'sparkles', label: 'nav.assistant', go: 'assistant.html' },
      { g: 'pal.nav', icon: 'compass', label: 'nav.initial', go: 'initial.html' },
      { g: 'pal.nav', icon: 'blocks', label: 'nav.scaffolding', go: 'scaffolding.html' },
      { g: 'pal.nav', icon: 'kanban', label: 'nav.board', go: 'board.html' },
      { g: 'pal.nav', icon: 'bot', label: 'nav.task', go: 'task.html' },
      { g: 'pal.nav', icon: 'sliders-horizontal', label: 'nav.project_settings', go: 'project-settings.html' },
      { g: 'pal.nav', icon: 'settings', label: 'nav.app_settings', go: 'settings.html' },
      { g: 'pal.nav', icon: 'palette', label: 'shell.design', go: 'DESIGN.html' },
      { g: 'pal.actions', icon: 'plus', label: 'pal.newproject', go: 'new-project.html' },
      { g: 'pal.actions', icon: 'sun-moon', label: 'pal.toggletheme', run: () => PC.setTheme(resolveTheme() === 'dark' ? 'light' : 'dark') },
      { g: 'pal.actions', icon: 'languages', label: 'pal.togglelang', run: () => PC.setLang(PC.lang === 'en' ? 'vi' : 'en') },
      { g: 'pal.actions', icon: 'sparkles', label: 'pal.toggleassistant', run: () => AS.toggle() },
    ];
    const ov = h(`<div class="overlay"><div class="palette"><input data-i18n-placeholder="pal.placeholder" autofocus><div class="palette-list"></div></div></div>`);
    const list = ov.querySelector('.palette-list'); const input = ov.querySelector('input');
    let active = 0, shown = items;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
    const draw = () => {
      const q = input.value.toLowerCase();
      shown = items.filter(i => PC.t(i.label).toLowerCase().includes(q));
      active = Math.min(active, Math.max(0, shown.length - 1));
      let last = '';
      list.innerHTML = shown.map((i, n) => { const head = i.g !== last ? `<div class="menu-label">${PC.t(i.g)}</div>` : ''; last = i.g; return head + `<a class="palette-item ${n === active ? 'is-active' : ''}" data-n="${n}" ${i.go ? `href="${href(i.go)}"` : ''}><i data-lucide="${i.icon}"></i>${PC.t(i.label)}${i.go ? '<i data-lucide="corner-down-left" class="hint icon-sm"></i>' : ''}</a>`; }).join('');
      icons();
    };
    const pick = n => { const i = shown[n]; if (!i) return; if (i.go) location.href = href(i.go); else { i.run(); close(); } };
    const key = e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(active); e.preventDefault(); }
    };
    input.addEventListener('input', () => { active = 0; draw(); });
    ov.addEventListener('click', e => { if (e.target === ov) close(); const it = e.target.closest('[data-n]'); if (it && !it.getAttribute('href')) { e.preventDefault(); pick(+it.dataset.n); } });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov); applyI18n(ov); draw(); input.focus();
  }
  PC.palette = palette;

  /* --------------------------------------------------------------- TOGGLES */
  function updateToggles() {
    const l = document.getElementById('pc-lang-label'); if (l) l.textContent = PC.lang.toUpperCase();
    const t = document.getElementById('pc-as-toggle');
    if (t && app) t.classList.toggle('is-on', !app.classList.contains('assistant-closed'));
    const ti = document.querySelector('[data-action="theme"]');
    if (ti) { ti.innerHTML = `<i data-lucide="${PC.theme === 'system' ? 'monitor' : PC.theme === 'dark' ? 'moon' : 'sun'}" class="icon-sm"></i>`; icons(); }
    document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('is-active', b.dataset.themeSet === PC.theme));
    document.querySelectorAll('[data-lang-set]').forEach(b => b.classList.toggle('is-active', b.dataset.langSet === PC.lang));
  }
  PC.updateToggles = updateToggles;
  let baseTitle = '';
  function updateTitle() { const c = document.body && document.body.dataset.crumb; if (c) document.title = PC.t(c) + ' · Procheck'; }

  /* ------------------------------------------------------------------- BOOT */
  let app = null;
  function boot() {
    const body = document.body;
    const shell = body.dataset.shell || 'project';
    const page = body.dataset.page || '';
    const crumb = body.dataset.crumb || '';
    if (shell !== 'none') {
      const canvas = body.querySelector(':scope > main.canvas') || (() => { const m = document.createElement('main'); m.className = 'canvas'; while (body.firstChild) m.appendChild(body.firstChild); return m; })();
      app = document.createElement('div');
      app.className = 'app';
      const asPref = body.dataset.assistant || LS.get('assistant', 'open');
      if (asPref === 'closed') app.classList.add('assistant-closed');
      app.innerHTML = (shell === 'project' ? buildProjectSidebar(page) : buildHomeSidebar(page)) + buildTopbar(shell, crumb);
      app.appendChild(canvas);
      app.insertAdjacentHTML('beforeend', buildAssistant());
      body.insertBefore(app, body.firstChild);
      renderCtx(); renderMsgs();
      const pcrumb = document.getElementById('pc-project-crumb');
      if (pcrumb) pcrumb.addEventListener('click', () => projectSwitcher(pcrumb));
      // hash-aware sidebar highlight (e.g. overview.html#initial)
      const syncHash = () => {
        const links = [...app.querySelectorAll('.sidebar .nav-item[href]')];
        const file = location.pathname.split('/').pop();
        const hit = location.hash && links.find(l => l.getAttribute('href').endsWith(file + location.hash));
        if (hit) { links.forEach(l => l.classList.remove('is-active')); hit.classList.add('is-active'); }
        else if (file === 'overview.html') { links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href').endsWith('overview.html'))); }
      };
      syncHash(); window.addEventListener('hashchange', syncHash);
      defaultSuggest();

      // composer
      const form = document.getElementById('pc-composer'); const ta = form.querySelector('textarea');
      form.addEventListener('submit', e => { e.preventDefault(); send(ta.value); ta.value = ''; ta.style.height = ''; });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; });
      document.getElementById('pc-as-mode').addEventListener('click', e => {
        popover(e.currentTarget, MODES.map(m => `<button class="menu-item" data-v="${m.id}"><i data-lucide="${m.icon}"></i><span data-i18n="as.mode.${m.id}"></span>${AS.mode === m.id ? '<i data-lucide="check" style="margin-left:auto"></i>' : ''}</button>`).join(''), v => {
          AS.mode = v; const m = MODES.find(x => x.id === v);
          const b = document.getElementById('pc-as-mode'); b.innerHTML = `<i data-lucide="${m.icon}" class="icon-sm"></i><span data-i18n="as.mode.${v}"></span><i data-lucide="chevron-down" class="icon-sm"></i>`; PC.refresh(b);
        });
      });
    }

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]'); if (!a) return;
      const act = a.dataset.action;
      if (act === 'palette') { e.preventDefault(); palette(); }
      else if (act === 'assistant') { e.preventDefault(); AS.toggle(); }
      else if (act === 'lang') PC.setLang(PC.lang === 'en' ? 'vi' : 'en');
      else if (act === 'theme') popover(a, ['system', 'light', 'dark'].map(t => `<button class="menu-item" data-v="${t}"><i data-lucide="${t === 'system' ? 'monitor' : t === 'dark' ? 'moon' : 'sun'}"></i><span data-i18n="theme.${t}"></span>${PC.theme === t ? '<i data-lucide="check" style="margin-left:auto"></i>' : ''}</button>`).join(''), v => PC.setTheme(v));
      else if (act === 'as-new') { AS.msgs = []; renderMsgs(); }
      else if (act === 'as-history') location.href = href('assistant.html');
      else if (act === 'switch-project') projectSwitcher(a);
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); AS.toggle(); }
    });
    // generic [data-theme-set] / [data-lang-set] controls on pages
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-theme-set]'); if (t) PC.setTheme(t.dataset.themeSet);
      const l = e.target.closest('[data-lang-set]'); if (l) PC.setLang(l.dataset.langSet);
    });
    document.addEventListener('pc:lang', () => { if (!customMsgs && !AS.msgsLocked) { AS.msgs = null; renderMsgs(); } renderCtx(); if (!AS.customSuggest) defaultSuggest(); });

    updateTitle(); applyI18n(); updateToggles();
    isReady = true; readyQ.splice(0).forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
    applyI18n(); icons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', icons);
})();
