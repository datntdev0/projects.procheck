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
      'app.name': 'Procheck', 'app.by': 'by KMS Technology', 'app.version': 'Version', 'nav.settings': 'Settings',
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
      'cli.connected': 'connected',
      'as.title': 'Procheck Assistant', 'as.placeholder': 'Ask, or type / for commands…', 'as.new': 'New chat', 'as.history': 'History',
      'as.close': 'Close', 'as.mode.ask': 'Ask', 'as.mode.edit': 'Edit artifact', 'as.mode.agent': 'Agent',
      'as.attach': 'Attach', 'as.mention': 'Mention artifact', 'as.footnote': 'Runs through your signed-in CLI with this project’s context only. Chat history is saved per project.',
      'as.thinking': 'Thinking…', 'as.you': 'You',
      'as.newchat': 'New chat', 'as.switch': 'Switch chat', 'as.expand': 'Open in Assistant page', 'as.back': 'Back to chat', 'as.search': 'Search chats…',
      'as.scope': 'Context scope', 'as.scope.general': 'No project', 'as.g.pinned': 'Pinned', 'as.g.today': 'Today', 'as.g.yesterday': 'Yesterday', 'as.g.earlier': 'Earlier',
      'as.hist.none': 'No chats match.', 'as.hist.empty': 'No chats in this scope yet.', 'as.hist.all': 'Manage all chats', 'as.resume': 'Continuing <b>{t}</b>. Earlier messages are in the full transcript.',
      'as.fulltx': 'Full transcript', 'as.fulltx.sub': 'Open in the Assistant page',
      'as.reply.default': 'Got it. I\'ll work on that using the project context. Here is a first pass — review it and tell me what to adjust.',
      'as.footnote.gen': 'No project — no project files or artifacts are loaded. History is saved in application data.',
      'as.reply.gen': 'Sure. This chat has no project, so I am answering without any project files. Here is a first pass — tell me what to adjust.',
      'as.gen.greet': 'Hi 👋 This chat has <b>no project</b>, so nothing is loaded. Ask anything — or switch to a project to chat with its artifacts.',
      'nav.chats': 'Chats', 'nav.chats.project': 'Project chats', 'nav.chats.general': 'Chats without a project', 'nav.chats.all': 'All chats', 'nav.chats.allproject': 'All project chats', 'nav.chats.new': 'New chat', 'nav.chats.empty': 'No chats yet',
      'chat.general': 'No project', 'chat.general.sub': 'No project context', 'time.yesterday': 'Yesterday',
      'use.context': 'Context window', 'use.context.tip': '{u} of {w} tokens in the context window (last reply)', 'use.limits': 'Usage limits', 'use.plan': 'Plan',
      'use.w.5h': '5-hour session', 'use.w.7d': 'Weekly · all models', 'use.w.5h.short': '5h', 'use.w.7d.short': 'Week',
      'use.resets': 'Resets {t} · in {d}', 'use.updated': 'Updated {t} · after the last reply', 'use.account': 'Account-wide: shared by every project and chat that uses this CLI sign-in.',
      'use.cached': 'Cached (cache read)', 'use.new': 'New input', 'use.out': 'Output', 'use.last': 'Last reply · {t}', 'use.compact.hint': 'Auto-compact runs near 95%.', 'use.compact.warn': 'Context is almost full — compact or start a new chat to keep answers sharp.',
      'use.compact': 'Compact now', 'use.compacted': '/compact sent to the CLI session', 'use.refresh': 'Refresh', 'use.refreshed': 'Usage refreshed from the CLI', 'use.src': 'Source',
      'pal.placeholder': 'Type a command or search…', 'pal.nav': 'Go to', 'pal.actions': 'Actions',
      'pal.newproject': 'New project', 'pal.toggletheme': 'Toggle theme', 'pal.togglelang': 'Switch language (EN / VI)', 'pal.toggleassistant': 'Toggle assistant',
      'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close', 'common.confirm': 'Confirm',
    },
    vi: {
      'app.name': 'Procheck', 'app.by': 'bởi KMS Technology', 'app.version': 'Phiên bản', 'nav.settings': 'Cài đặt',
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
      'cli.connected': 'đã kết nối',
      'as.title': 'Trợ lý Procheck', 'as.placeholder': 'Hỏi, hoặc gõ / để dùng lệnh…', 'as.new': 'Chat mới', 'as.history': 'Lịch sử',
      'as.close': 'Đóng', 'as.mode.ask': 'Hỏi', 'as.mode.edit': 'Sửa tài liệu', 'as.mode.agent': 'Agent',
      'as.attach': 'Đính kèm', 'as.mention': 'Nhắc tới tài liệu', 'as.footnote': 'Chạy qua CLI đã đăng nhập, chỉ với ngữ cảnh của dự án này. Lịch sử chat được lưu theo dự án.',
      'as.thinking': 'Đang suy nghĩ…', 'as.you': 'Bạn',
      'as.newchat': 'Chat mới', 'as.switch': 'Đổi chat', 'as.expand': 'Mở trong trang Trợ lý', 'as.back': 'Quay lại chat', 'as.search': 'Tìm chat…',
      'as.scope': 'Phạm vi ngữ cảnh', 'as.scope.general': 'Không dự án', 'as.g.pinned': 'Đã ghim', 'as.g.today': 'Hôm nay', 'as.g.yesterday': 'Hôm qua', 'as.g.earlier': 'Trước đó',
      'as.hist.none': 'Không có chat phù hợp.', 'as.hist.empty': 'Chưa có chat nào trong phạm vi này.', 'as.hist.all': 'Quản lý tất cả chat', 'as.resume': 'Đang tiếp tục <b>{t}</b>. Các tin nhắn trước nằm trong bản ghi đầy đủ.',
      'as.fulltx': 'Bản ghi đầy đủ', 'as.fulltx.sub': 'Mở trong trang Trợ lý',
      'as.reply.default': 'Đã rõ. Tôi sẽ xử lý dựa trên ngữ cảnh dự án. Đây là bản nháp đầu tiên — bạn xem và cho tôi biết cần chỉnh gì.',
      'as.footnote.gen': 'Không thuộc dự án — không nạp file hay tài liệu của dự án nào. Lịch sử lưu trong dữ liệu ứng dụng.',
      'as.reply.gen': 'Được. Chat này không thuộc dự án nên mình trả lời không dựa trên file dự án nào. Đây là bản nháp đầu — bạn cho biết cần chỉnh gì nhé.',
      'as.gen.greet': 'Chào bạn 👋 Chat này <b>không thuộc dự án</b> nên không nạp gì cả. Hỏi gì cũng được — hoặc chuyển sang một dự án để chat với tài liệu của nó.',
      'nav.chats': 'Trò chuyện', 'nav.chats.project': 'Chat của dự án', 'nav.chats.general': 'Chat không thuộc dự án', 'nav.chats.all': 'Tất cả chat', 'nav.chats.allproject': 'Tất cả chat của dự án', 'nav.chats.new': 'Chat mới', 'nav.chats.empty': 'Chưa có chat nào',
      'chat.general': 'Không thuộc dự án', 'chat.general.sub': 'Không có ngữ cảnh dự án', 'time.yesterday': 'Hôm qua',
      'use.context': 'Cửa sổ ngữ cảnh', 'use.context.tip': '{u} / {w} token trong cửa sổ ngữ cảnh (lần trả lời gần nhất)', 'use.limits': 'Hạn mức sử dụng', 'use.plan': 'Gói',
      'use.w.5h': 'Phiên 5 giờ', 'use.w.7d': 'Hằng tuần · mọi model', 'use.w.5h.short': '5h', 'use.w.7d.short': 'Tuần',
      'use.resets': 'Đặt lại {t} · còn {d}', 'use.updated': 'Cập nhật {t} · sau lần trả lời gần nhất', 'use.account': 'Theo tài khoản: dùng chung cho mọi dự án và chat dùng phiên đăng nhập CLI này.',
      'use.cached': 'Đã cache (cache read)', 'use.new': 'Đầu vào mới', 'use.out': 'Đầu ra', 'use.last': 'Lần trả lời gần nhất · {t}', 'use.compact.hint': 'Tự động compact khi gần 95%.', 'use.compact.warn': 'Ngữ cảnh sắp đầy — hãy compact hoặc mở chat mới để câu trả lời giữ chất lượng.',
      'use.compact': 'Compact ngay', 'use.compacted': 'Đã gửi /compact tới phiên CLI', 'use.refresh': 'Làm mới', 'use.refreshed': 'Đã làm mới hạn mức từ CLI', 'use.src': 'Nguồn',
      'pal.placeholder': 'Gõ lệnh hoặc tìm kiếm…', 'pal.nav': 'Đi tới', 'pal.actions': 'Hành động',
      'pal.newproject': 'Tạo dự án mới', 'pal.toggletheme': 'Đổi giao diện sáng/tối', 'pal.togglelang': 'Đổi ngôn ngữ (EN / VI)', 'pal.toggleassistant': 'Bật/tắt trợ lý',
      'common.cancel': 'Huỷ', 'common.save': 'Lưu', 'common.close': 'Đóng', 'common.confirm': 'Xác nhận',
    }
  });

  /* -------------------------------------------------------------- MOCK DATA */
  PC.appVersion = '0.1.0';   // shown in the sidebar footer (the app reads it from the Tauri app info)
  PC.data = {
    // Local, single-user desktop app: there is only "me" and the agents (no assignees / members).
    user: { name: 'You', initials: 'ME' },
    agents: [
      { id: 'claude', name: 'Claude Code', initials: 'CC' },
      { id: 'codex', name: 'Codex', initials: 'CX' },
    ],
    cli: [
      // ctxWindow comes from the CLI at runtime: claude → result.modelUsage[model].contextWindow, codex → token_count.info.model_context_window
      { id: 'claude', name: 'Claude Code', version: '2.4.1', model: 'claude-opus-5-5', ctxWindow: 200000, status: 'connected', bin: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd' },
      { id: 'codex', name: 'Codex CLI', version: '0.48.0', model: 'gpt-6-luna', ctxWindow: 258400, status: 'connected', bin: 'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd' },
    ],
    // Usage limits are per CLI ACCOUNT (shared sign-in), not per project. Refreshed after every reply (end of turn):
    //   claude → stream-json `rate_limit_event.rate_limit_info.unifiedWindows.{five_hour,seven_day}`
    //   codex  → rollout `event_msg.token_count.rate_limits.{primary,secondary}` (window_minutes 300 / 10080)
    usage: {
      claude: { plan: 'Max', at: '2026-11-23T11:38', src: 'claude -p · rate_limit_event', windows: [{ k: '5h', used: 34, reset: '2026-11-23T14:00' }, { k: '7d', used: 78, reset: '2026-11-27T09:00' }] },
      codex: { plan: 'Plus', at: '2026-11-22T16:24', src: 'codex · token_count.rate_limits', windows: [{ k: '5h', used: 12, reset: '2026-11-23T13:10' }, { k: '7d', used: 41, reset: '2026-11-26T08:00' }] },
    },
    // Sidebar chat index (the Assistant page holds the full transcripts). '__general' = chats with no project context.
    chats: {
      '__general': [['g1', 'Tauri vs Electron for a desktop app', 'claude', '2026-11-23T10:05'], ['g2', 'Viết email follow-up sau buổi demo', 'claude', '2026-11-22T17:40'], ['g3', 'Regex for Vietnamese phone numbers', 'codex', '2026-11-20T14:15'], ['g4', 'PERT vs T-shirt sizing', 'claude', '2026-11-12T09:30', true]],
      'lotus-pay': [['s1', 'Rà soát BRD v3 — yêu cầu KYC', 'claude', '2026-11-23T09:12'], ['s2', 'ADR-005 · Observability stack', 'claude', '2026-11-23T08:30'], ['s3', 'Plan LP-157 · Webhook retry', 'codex', '2026-11-22T16:20'], ['s4', 'Sprint 5 capacity', 'claude', '2026-11-22T10:05'], ['s5', 'Scaffolding review · Nx libs layout', 'codex', '2026-11-19T14:10'], ['s6', 'Soạn change request CR-02', 'claude', '2026-11-16T15:30', true], ['s7', 'Kickoff transcript summary', 'claude', '2026-11-17T09:00']],
      'saigon-tms': [['sg1', 'Kick-off prep', 'claude', '2026-11-23T09:05'], ['sg2', 'RFP summary', 'claude', '2026-11-21T14:30']],
      'viethealth': [['vh1', 'Rà soát BRD v1 — kê đơn điện tử & HIS', 'claude', '2026-11-23T08:50'], ['vh2', 'Questions for IT security session', 'claude', '2026-11-21T16:10'], ['vh3', 'Scope options', 'claude', '2026-11-20T10:00']],
      'mekong': [['mk1', 'ADR-004 · Event bus discussion', 'claude', '2026-11-23T10:20'], ['mk3', 'CI/CD pipeline plan', 'claude', '2026-11-22T15:00'], ['mk2', 'Brownfield repo analysis', 'claude', '2026-11-20T09:30']],
      'atlas-hr': [['ah1', 'Why AH-311 failed', 'claude', '2026-11-23T11:05'], ['ah2', 'Release v2.0 notes', 'claude', '2026-11-22T17:20'], ['ah3', 'Sprint 9 planning', 'claude', '2026-11-17T09:00']],
    },
    // Storage boundary — application data vs. project data. There is NO "workspace" concept.
    storage: {
      app: {
        root: '%LOCALAPPDATA%\\Procheck',
        items: [
          { path: 'settings.json', desc: 'App preferences: theme, language, defaults' },
          { path: 'projects.json', desc: 'Registry of known project directories (recent list)' },
          { path: 'cli\\', desc: 'CLI home per tool (CLAUDE_CONFIG_DIR / CODEX_HOME): Procheck’s CLI sign-in, base config and sessions — apart from your own profile' },
          { path: 'chats\\', desc: 'General chat history (chats not tied to a project)' },
          { path: 'scratch\\', desc: 'Empty working directory for general chats — no project files' },
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
          { path: '.procheck\\cli\\<cli>\\', desc: 'CLI profile per tool: settings, MCP servers, instructions (no credentials)' },
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
  // CLI home. Every CLI runs with its own home in application data (%LOCALAPPDATA%\Procheck\cli\<cli>), set through
  // CLAUDE_CONFIG_DIR / CODEX_HOME. Procheck's sign-in (claude auth login / codex login inside that home), base config and
  // sessions live there, shared by every project; the user's ~/.claude / ~/.codex are never touched. HOME stays unchanged.
  PC.cliHome = function (cli) { return '%LOCALAPPDATA%\\Procheck\\cli\\' + (cli || 'claude'); };
  PC.cliEnv = function (cli) { return cli === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'; };
  // Context isolation per launch: cwd = project dir (Assistant) or worktree (agents) + the project's CLI profile
  // (<project dir>\.procheck\cli\<cli>\, no credentials) + only the CLI sessions recorded in this project.
  PC.projectCli = function (cli, p) { p = p || PC.project(); return (p.cliRoot ? p.cliRoot + '\\' : p.dir + '\\.procheck\\cli\\') + (cli || 'claude'); };
  // General chats (no project): cwd = an empty scratch dir; the CLI home itself is the profile, history lives in application data.
  PC.general = { id: '__general', dir: '%LOCALAPPDATA%\\Procheck\\scratch', cliRoot: '%LOCALAPPDATA%\\Procheck\\cli', chats: '%LOCALAPPDATA%\\Procheck\\chats' };
  PC.cliProfileFiles = function (cli) { return cli === 'codex' ? ['config.toml', 'AGENTS.md'] : ['settings.json', 'mcp.json', 'instructions.md']; };
  // Launch flags that load the project profile. opts.global = true also keeps the shared config of the Procheck CLI home.
  PC.cliFlags = function (cli, p, opts) {
    const d = PC.projectCli(cli, p), g = opts && opts.global;
    if (cli === 'codex') return '--profile-file ' + d + '\\config.toml' + (g ? '' : ' --ignore-user-config');
    return (g ? '' : '--setting-sources project ') + '--settings ' + d + '\\settings.json --mcp-config ' + d + '\\mcp.json' + (g ? '' : ' --strict-mcp-config') + ' --append-system-prompt-file ' + d + '\\instructions.md';
  };
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

  /* ---------------------------------------------------------------- TOOLTIP
     One fixed-position layer on <body>, driven by [data-tip] (above) and
     [data-tip-right] (to the right). Lives outside every container, so
     overflow:hidden / scroll panes can never clip it. Flips + clamps to the viewport. */
  (function tooltip() {
    const SEL = '[data-tip], [data-tip-right]', GAP = 6, PAD = 8;
    let tipEl = null, cur = null;
    function show(el) {
      const right = !el.hasAttribute('data-tip') && el.hasAttribute('data-tip-right');
      const text = el.getAttribute(right ? 'data-tip-right' : 'data-tip');
      if (!text) return;
      if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'pc-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
      cur = el; tipEl.textContent = text; tipEl.classList.add('is-on');
      const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
      let x, y;
      if (right) {
        x = r.right + GAP + 4; y = r.top + r.height / 2 - t.height / 2;
        if (x + t.width > vw - PAD) x = r.left - GAP - 4 - t.width;
      } else {
        x = r.left + r.width / 2 - t.width / 2; y = r.top - GAP - t.height;
        if (y < PAD) y = r.bottom + GAP;
      }
      x = Math.max(PAD, Math.min(x, vw - PAD - t.width));
      y = Math.max(PAD, Math.min(y, vh - PAD - t.height));
      tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    function hide() { cur = null; if (tipEl) tipEl.classList.remove('is-on'); }
    document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest(SEL); if (el !== cur) (el ? show(el) : hide()); });
    document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest(SEL); if (el && el.matches(':focus-visible')) show(el); });
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide, true);
    addEventListener('scroll', hide, true);
    addEventListener('blur', hide);
  })();

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

  /* ------------------------------------------------------------ CHAT INDEX
     Two scopes: project chats (<project dir>\.procheck\chats) and general chats
     (%LOCALAPPDATA%\Procheck\chats, no project context). The sidebar lists both;
     the Assistant page owns the transcripts and writes the same localStorage key. */
  PC.now = new Date('2026-11-23T11:40:00');   // prototype clock (matches the seeded chats)
  PC.chats = {
    key: scope => 'pc.assistant.sessions.v4.' + scope,
    list(scope) {
      let saved = null; try { saved = JSON.parse(localStorage.getItem(PC.chats.key(scope)) || 'null'); } catch (e) { /* ignore */ }
      const rows = Array.isArray(saved)
        ? saved.filter(s => s.messages && s.messages.length).map(s => ({ id: s.id, title: s.title, cli: s.cli, at: s.at, pinned: !!s.pinned }))
        : (PC.data.chats[scope] || []).map(r => ({ id: r[0], title: r[1], cli: r[2], at: r[3], pinned: !!r[4] }));
      PC.chats.inbox(scope).forEach(e => mergeInboxRow(rows, e));
      return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    stored(scope) { try { const v = JSON.parse(localStorage.getItem(PC.chats.key(scope)) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } },
    inboxKey: scope => 'pc.assistant.inbox.v1.' + scope,
    inbox(scope) { try { const v = JSON.parse(localStorage.getItem(PC.chats.inboxKey(scope)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    setInbox(scope, list) { try { if (list.length) localStorage.setItem(PC.chats.inboxKey(scope), JSON.stringify(list)); else localStorage.removeItem(PC.chats.inboxKey(scope)); } catch (e) { /* ignore */ } },
    messages(scope, id) {
      const st = PC.chats.stored(scope), s = st && st.find(x => x.id === id);
      if (s) return { msgs: s.messages || [], full: true };
      const e = PC.chats.inbox(scope).find(x => x.id === id);
      return { msgs: e ? e.messages : [], full: !!e && !e.seeded };
    },
    append(scope, chat, msgs) {
      const st = PC.chats.stored(scope);
      if (st) return appendStored(scope, st, chat, msgs);
      const inbox = PC.chats.inbox(scope);
      let e = inbox.find(x => x.id === chat.id);
      if (!e) { e = Object.assign({}, chat, { seeded: (PC.data.chats[scope] || []).some(r => r[0] === chat.id), messages: [] }); inbox.unshift(e); }
      e.messages.push(...msgs); e.at = chat.at;
      PC.chats.setInbox(scope, inbox);
    },
    blank: chat => ({ id: chat.id, title: chat.title, phase: chat.phase || null, cli: chat.cli, at: chat.at, pinned: false, attached: [], sid: 'ses_' + Math.random().toString(16).slice(2, 14).toUpperCase(), tok: { i: 0, o: 0, c: 0 }, messages: [] }),
    href(scope, id) { return 'assistant.html' + (id === 'new' && scope ? '?scope=' + scope : '') + (id ? '#' + id : ''); },
    when(iso) {
      const d = new Date(iso), a = new Date(d), b = new Date(PC.now); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
      const diff = Math.round((b - a) / 864e5);
      if (diff <= 0) return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      if (diff === 1) return PC.t('time.yesterday');
      return new Intl.DateTimeFormat(PC.lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: 'short' }).format(d);
    },
  };

  function mergeInboxRow(rows, e) {
    const r = rows.find(x => x.id === e.id);
    if (r) r.at = e.at; else rows.push({ id: e.id, title: e.title, cli: e.cli, at: e.at, pinned: false });
  }
  function appendStored(scope, st, chat, msgs) {
    let s = st.find(x => x.id === chat.id);
    if (!s) { s = PC.chats.blank(chat); st.unshift(s); }
    s.messages.push(...msgs); s.at = chat.at;
    try { localStorage.setItem(PC.chats.key(scope), JSON.stringify(st)); } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------------- USAGE
     Context window = the LAST reply's prompt size, not the chat total:
       claude: usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens (+ output_tokens)
       codex:  last_token_usage.input_tokens (cached is a subset) + output_tokens
     Limits are account-wide and refreshed at end of turn (no realtime polling). */
  PC.usage = {
    get(cli) { let o = null; try { o = JSON.parse(LS.get('usage.v1', 'null')); } catch (e) { /* ignore */ } return (o && o[cli]) || PC.data.usage[cli]; },
    set(cli, u) { let o = null; try { o = JSON.parse(LS.get('usage.v1', 'null')); } catch (e) { /* ignore */ } o = o || {}; o[cli] = u; LS.set('usage.v1', JSON.stringify(o)); document.dispatchEvent(new CustomEvent('pc:usage', { detail: { cli } })); },
    // Simulates what the end-of-turn hook/parser records after a reply.
    record(cli, atIso) { const u = JSON.parse(JSON.stringify(PC.usage.get(cli))); u.at = atIso; u.windows.forEach((w, i) => { w.used = Math.min(100, w.used + (i === 0 ? 1 : 0.4)); }); PC.usage.set(cli, u); },
    tone: pct => pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : '',
    worst(cli) { return PC.usage.get(cli).windows.slice().sort((a, b) => b.used - a.used)[0]; },
    clock(iso) { const d = new Date(iso); const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); const days = Math.round((new Date(PC.now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5); return days === 0 ? t : (new Intl.DateTimeFormat(PC.lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(d) + ' ' + t); },
    left(iso) { const m = Math.max(0, Math.round((new Date(iso) - PC.now) / 6e4)); const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + mm + 'm' : mm + 'm'; },
    rows(cli) {
      const u = PC.usage.get(cli);
      return u.windows.map(w => { const pct = Math.round(w.used); return `<div class="u-row"><div class="u-top"><span>${PC.t('use.w.' + w.k)}</span><b class="${PC.usage.tone(pct) ? 'text-' + (pct >= 95 ? 'danger' : 'warning') : ''}">${pct}%</b></div>
        <div class="u-bar ${PC.usage.tone(pct)}"><i style="width:${pct}%"></i></div><div class="u-sub">${PC.t('use.resets', { t: PC.usage.clock(w.reset), d: PC.usage.left(w.reset) })}</div></div>`; }).join('');
    },
    ring(pct, size) { const r = 7, C = 2 * Math.PI * r; return `<svg class="u-ring ${PC.usage.tone(pct)}" viewBox="0 0 18 18" width="${size || 16}" height="${size || 16}"><circle class="bg" cx="9" cy="9" r="${r}" fill="none" stroke-width="2.5"/><circle class="fg" cx="9" cy="9" r="${r}" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(C * Math.min(100, pct) / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>`; },
    fmtK: n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n),
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
      ${navLink({ id: 'settings', icon: 'settings', label: 'nav.settings', href: 'settings.html' }, page)}
      <div class="sb-version"><span data-i18n="app.version"></span> <span>${PC.appVersion}</span></div>
    </div>`;

  /* Chats group: recent chats of the current scope + entry points to both scopes.
     project shell → this project's chats + "General chats"; home shell → general chats.
     On the Assistant page the page already lists the chats, so the group only switches scope. */
  function chatItem(pid, c) {
    return `<a class="nav-item chat-item" href="${href(PC.chats.href(pid, c.id))}" data-action="as-open" data-scope="${pid}" data-chat="${c.id}" title="${PC.esc(c.title)}"><i data-lucide="${c.pinned ? 'pin' : 'message-square'}"></i><span class="truncate">${PC.esc(c.title)}</span><span class="when">${PC.chats.when(c.at)}</span></a>`;
  }
  function chatsGroup() {
    const pid = PC.data.currentProjectId, list = PC.chats.list(pid);
    const body = list.length ? list.slice(0, 4).map(c => chatItem(pid, c)).join('') : `<div class="nav-empty" data-i18n="nav.chats.empty"></div>`;
    return `<div class="nav-group nav-chats"><div class="nav-group-title"><span data-i18n="nav.chats"></span>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="as-new-open" data-i18n-tip="nav.chats.new"><i data-lucide="plus"></i></button></div>${body}
      <a class="nav-item" href="${href('assistant.html')}"><i data-lucide="messages-square"></i><span class="truncate" data-i18n="nav.chats.all"></span><span class="count">${list.length}</span></a></div>`;
  }

  function buildProjectSidebar(page) {
    const p = PC.project();
    const nav = NAV.map(g => `<div class="nav-group"><div class="nav-group-title"><span data-i18n="${g.group}"></span></div>
      ${g.items.map(it => navLink(it, page)).join('')}</div>`).join('') + chatsGroup();
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
          ${navLink({ id: 'chats', icon: 'messages-square', label: 'nav.chats.all', href: 'assistant.html' }, page)}
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
        <button class="tb-btn" data-action="assistant" id="pc-as-toggle" ${document.body.dataset.assistant === 'none' ? 'hidden' : ''}><i data-lucide="sparkles" class="icon-sm"></i><span data-i18n="shell.assistant"></span></button>
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
    context: null, msgs: null, mode: 'ask', scope: null, chat: null, title: null, view: 'chat', q: '',
    open() { app && app.classList.remove('assistant-closed'); LS.set('assistant', 'open'); updateToggles(); },
    close() { app && app.classList.add('assistant-closed'); LS.set('assistant', 'closed'); updateToggles(); },
    toggle() { app && (app.classList.contains('assistant-closed') ? AS.open() : AS.close()); },
    setContext(chips) { AS.context = chips; renderCtx(); },
    seed(msgs) { AS.chat = null; AS.title = null; AS.msgs = msgs; AS.msgsLocked = true; renderPanel(); },
    push(m) { (AS.msgs = AS.msgs || defaultMsgs()).push(m); renderMsgs(); },
    reply(text, extra) {
      const list = document.getElementById('pc-as-msgs'); if (!list) return;
      const t = h(`<div class="msg"><div class="avatar avatar-ai"><i data-lucide="sparkles" style="width:13px;height:13px"></i></div><div class="msg-body"><div class="typing"><i></i><i></i><i></i></div></div></div>`);
      list.appendChild(t); icons(); list.scrollTop = list.scrollHeight;
      const persist = extra && extra.persist; if (extra) delete extra.persist;
      setTimeout(() => {
        const answer = text || PC.t(scopeIsGeneral() ? 'as.reply.gen' : 'as.reply.default');
        t.remove(); AS.push(Object.assign({ role: 'ai', text: answer }, extra || {}));
        if (persist) persistTurn(persist, answer, extra.time);
        // end of turn → refresh context + usage limits (what the Stop hook / result parser records)
        AS.ctxUsed += 1400 + Math.round(Math.random() * 900); PC.usage.record('claude', '2026-11-23T' + String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'));
      }, 1100);
    },
    ctxUsed: 23400,
  };
  const isGeneral = () => document.body && document.body.dataset.shell === 'home';
  const scopeIsGeneral = () => AS.scope === '__general';
  const defaultCtx = () => scopeIsGeneral()
    ? [{ icon: 'globe', label: PC.t('chat.general.sub') }, { icon: 'cpu', label: 'claude-opus-5-5' }]
    : [{ icon: 'folder', label: PC.project().name.split(' — ')[0] }, { icon: 'hard-drive', label: PC.project().dir }, { icon: 'cpu', label: 'claude-opus-5-5' }];
  function renderUsage() {
    const el = document.getElementById('pc-as-usage'); if (!el) return;
    const win = PC.data.cli[0].ctxWindow, pct = AS.ctxUsed / win * 100, u = PC.usage.get('claude');
    el.innerHTML = `${PC.usage.ring(pct, 14)}<span>${PC.t('use.context')} <b>${Math.round(pct)}%</b></span>`
      + u.windows.map(w => `<span class="u-sep"></span><span class="${PC.usage.tone(w.used) ? 'text-' + (w.used >= 95 ? 'danger' : 'warning') : ''}">${PC.t('use.w.' + w.k + '.short')} <b>${Math.round(w.used)}%</b></span>`).join('')
      + '<i data-lucide="chevron-up" class="icon-sm" style="margin-left:auto"></i>';
    icons();
  }
  function usagePopover(anchor) {
    const win = PC.data.cli[0].ctxWindow, used = AS.ctxUsed, pct = used / win * 100, u = PC.usage.get('claude');
    const pop = popover(anchor, `<div class="u-pop">
      <div class="u-top"><b>${PC.t('use.context')}</b><span class="text-subtle">${PC.usage.fmtK(used)} / ${PC.usage.fmtK(win)}</span></div>
      <div class="u-bar ${PC.usage.tone(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div><div class="u-sub">${PC.t('use.compact.hint')}</div>
      <div class="u-top" style="margin-top:14px"><b>${PC.t('use.limits')} · Claude Code</b><span class="badge">${PC.esc(u.plan)}</span></div>
      ${PC.usage.rows('claude')}
      <div class="u-sub" style="margin-top:8px">${PC.t('use.updated', { t: PC.usage.clock(u.at) })}</div>
      <div class="u-sub">${PC.t('use.account')}</div></div>`, () => {});
    pop.style.width = (anchor.offsetWidth) + 'px';
    const r = anchor.getBoundingClientRect(); pop.style.left = r.left + 'px'; pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px';
  }
  document.addEventListener('pc:usage', renderUsage);
  const defaultMsgs = () => { if (scopeIsGeneral()) return [{ role: 'ai', time: '10:02', text: '<p>' + PC.t('as.gen.greet') + '</p>' }]; const p = PC.project(); if (p.id !== 'lotus-pay' && p.state && p.state.greet) return [{ role: 'ai', time: '09:12', text: '<p>' + PC.esc(PC.L(p.state.greet)) + '</p>' }]; return PC.lang === 'vi' ? [
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
    el.innerHTML = ((!scopeIsGeneral() && AS.context) || defaultCtx()).map(c => `<span class="ctx-chip"><i data-lucide="${c.icon}"></i>${PC.esc(c.label)}</span>`).join('');
    icons();
  }
  function buildAssistant() {
    return `<aside class="assistant" aria-label="Assistant"><div class="assistant-inner">
      <div class="as-header">
        <div class="avatar avatar-ai" style="width:30px;height:30px"><i data-lucide="sparkles" style="width:15px;height:15px"></i></div>
        <button type="button" class="as-switch" data-action="as-history" data-i18n-tip="as.switch"><span class="as-switch-t"><span class="as-title truncate" id="pc-as-title"></span><i data-lucide="chevron-down" class="icon-sm"></i></span><span class="as-sub"><span class="dot dot-success" style="width:6px;height:6px"></span>Claude Code · claude-opus-5-5</span></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.history" data-action="as-history" id="pc-as-hist-btn"><i data-lucide="history"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.new" data-action="as-new"><i data-lucide="square-pen"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.expand" data-action="as-expand"><i data-lucide="maximize-2"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.close" data-action="assistant"><i data-lucide="panel-right-close"></i></button>
      </div>
      <div class="as-scope" id="pc-as-scope"></div>
      <div class="as-context" id="pc-as-ctx"></div>
      <div class="as-history" id="pc-as-hist" hidden></div>
      <div class="as-messages" id="pc-as-msgs"></div>
      <div class="as-suggest" id="pc-as-suggest"></div>
      <button type="button" class="as-usage" id="pc-as-usage" data-i18n-tip="use.limits"></button>
      <form class="composer" id="pc-composer">
        <textarea rows="1" data-i18n-placeholder="as.placeholder"></textarea>
        <div class="composer-bar">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.attach"><i data-lucide="paperclip"></i></button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-i18n-tip="as.mention"><i data-lucide="at-sign"></i></button>
          <button type="button" class="mode" id="pc-as-mode"><i data-lucide="message-circle" class="icon-sm"></i><span data-i18n="as.mode.ask"></span><i data-lucide="chevron-down" class="icon-sm"></i></button>
          <button type="submit" class="send" aria-label="send"><i data-lucide="arrow-up"></i></button>
        </div>
      </form>
      <div class="as-footnote" id="pc-as-foot"></div>
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
    AS.reply(null, { time, persist: text });
  }
  function defaultSuggest() { AS.setSuggestions(PC.lang === 'vi' ? ['Tóm tắt tài liệu mới nhất', 'Tạo user stories', 'Rủi ro dự án?'] : ['Summarize latest docs', 'Draft user stories', 'Project risks?'], false); }
  const MODES = [{ id: 'ask', icon: 'message-circle' }, { id: 'edit', icon: 'file-pen-line' }, { id: 'agent', icon: 'bot' }];

  /* ------------------------------------------------- ASSISTANT NAVIGATION */
  const chatKey = () => 'assistant.chat.' + AS.scope;
  const nowIso = () => '2026-11-23T' + String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0');
  const plain = html => String(html).replace(/<[^>]+>/g, '');
  function persistTurn(userText, answer, time) {
    if (!AS.chat) { AS.chat = 'p' + Date.now().toString(36); AS.title = userText.length > 60 ? userText.slice(0, 57) + '…' : userText; LS.set(chatKey(), AS.chat); }
    const chat = { id: AS.chat, title: AS.title, cli: 'claude', at: nowIso(), phase: scopeIsGeneral() ? null : PC.project().phase };
    PC.chats.append(AS.scope, chat, [{ role: 'user', time, text: userText, chips: [] }, { role: 'ai', time, blocks: [{ t: 'tx', md: plain(answer) }] }]);
    renderHead();
  }
  const mdInline = t => PC.esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const mdCells = r => r.replace(/^\||\|$/g, '').split('|').map(c => mdInline(c.trim()));
  function mdTable(lines) {
    const head = mdCells(lines[0]).map(c => `<th>${c}</th>`).join('');
    const body = lines.slice(2).map(r => '<tr>' + mdCells(r).map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
    return `<div class="md-tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function mdBlock(p) {
    const lines = p.split('\n');
    if (lines[0].startsWith('|') && lines[1] && /^\|[\s:|-]+\|?$/.test(lines[1])) return mdTable(lines);
    if (/^[-*] /.test(p)) return '<ul>' + lines.map(l => '<li>' + mdInline(l.replace(/^[-*] /, '')) + '</li>').join('') + '</ul>';
    if (/^\d+\. /.test(p)) return '<ol>' + lines.map(l => '<li>' + mdInline(l.replace(/^\d+\. /, '')) + '</li>').join('') + '</ol>';
    return '<p>' + mdInline(p).replace(/\n/g, '<br>') + '</p>';
  }
  function mdLite(src) { return String(src).split(/\n{2,}/).map(mdBlock).join(''); }
  function blockCard(b) {
    if (b.t === 'art') return { icon: b.icon || 'file-text', title: b.title, sub: b.sum || '', href: b.id ? 'artifacts.html#' + b.id : '' };
    if (b.t === 'diff') return { icon: 'file-diff', title: b.file, sub: '' };
    if (b.t === 'plan') return { icon: 'list-checks', title: b.title, sub: b.items.length + ' steps' };
    return null;
  }
  function panelMsg(m) {
    if (m.role === 'user') return { role: 'user', time: m.time, text: PC.esc(m.text) };
    const blocks = m.blocks || [], tool = blocks.find(b => b.t === 'tool'), card = blocks.map(blockCard).find(Boolean);
    return { role: 'ai', time: m.time, text: blocks.filter(b => b.t === 'tx').map(b => mdLite(b.md)).join(''), tool: tool ? tool.label : '', card };
  }
  function resumeMsg(row) {
    return { role: 'ai', text: '<p>' + PC.t('as.resume', { t: PC.esc(row.title) }) + '</p>', card: { icon: 'maximize-2', title: PC.t('as.fulltx'), sub: PC.t('as.fulltx.sub'), href: PC.chats.href(AS.scope, row.id) } };
  }
  function openChat(id) {
    const row = PC.chats.list(AS.scope).find(r => r.id === id); if (!row) return newPanelChat();
    const r = PC.chats.messages(AS.scope, id);
    AS.chat = id; AS.title = row.title; LS.set(chatKey(), id);
    AS.msgs = (r.full ? [] : [resumeMsg(row)]).concat(r.msgs.map(panelMsg)); AS.msgsLocked = true; customMsgs = true;
    AS.view = 'chat'; renderPanel();
  }
  function newPanelChat() {
    AS.chat = null; AS.title = null; LS.set(chatKey(), '');
    AS.msgs = defaultMsgs().slice(0, 1); AS.msgsLocked = true;
    AS.view = 'chat'; renderPanel();
    const ta = document.querySelector('#pc-composer textarea'); if (ta) ta.focus();
  }
  function setScope(scope) {
    if (scope === AS.scope) return;
    AS.scope = scope; AS.q = '';
    const last = LS.get(chatKey(), '');
    if (last && PC.chats.list(scope).some(r => r.id === last)) openChat(last); else newPanelChat();
  }
  function restorePanelChat() {
    const last = LS.get(chatKey(), '');
    if (last && PC.chats.list(AS.scope).some(r => r.id === last)) openChat(last); else renderPanel();
  }
  function showHistory(on) {
    AS.view = on ? 'history' : 'chat'; renderPanel();
    if (on) { const q = document.getElementById('pc-as-q'); if (q) q.focus(); }
  }
  function renderHead() {
    const t = document.getElementById('pc-as-title'); if (!t) return;
    t.textContent = AS.title || PC.t('as.newchat'); t.title = AS.title || '';
  }
  function renderScope() {
    const el = document.getElementById('pc-as-scope'); if (!el) return;
    const p = PC.project(), gen = scopeIsGeneral();
    el.innerHTML = `<div class="segmented" role="tablist" aria-label="${PC.t('as.scope')}">
      <button type="button" class="${gen ? '' : 'is-active'}" data-scope="${p.id}" title="${PC.esc(p.dir)}"><span class="project-avatar" style="background:${p.color}">${p.short}</span><span class="truncate">${PC.esc(p.name.split(' — ')[0])}</span><span class="count">${PC.chats.list(p.id).length}</span></button>
      <button type="button" class="${gen ? 'is-active' : ''}" data-scope="__general"><i data-lucide="globe" class="icon-sm"></i><span>${PC.t('as.scope.general')}</span><span class="count">${PC.chats.list('__general').length}</span></button></div>`;
    el.querySelectorAll('[data-scope]').forEach(b => { b.onclick = () => setScope(b.dataset.scope); });
  }
  function histGroup(r) {
    if (r.pinned) return 'pinned';
    const a = new Date(r.at), b = new Date(PC.now); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    const d = Math.round((b - a) / 864e5);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : 'earlier';
  }
  function histRow(r) {
    return `<button type="button" class="ah-row ${r.id === AS.chat ? 'is-active' : ''}" data-chat="${r.id}"><i data-lucide="${r.pinned ? 'pin' : 'message-square'}"></i><span class="truncate">${PC.esc(r.title)}</span><span class="when">${PC.chats.when(r.at)}</span></button>`;
  }
  function renderHistoryList() {
    const el = document.getElementById('pc-as-hist-list'); if (!el) return;
    const all = PC.chats.list(AS.scope), q = AS.q.trim().toLowerCase(), rows = all.filter(r => !q || r.title.toLowerCase().includes(q));
    el.innerHTML = ['pinned', 'today', 'yesterday', 'earlier'].map(g => {
      const items = rows.filter(r => histGroup(r) === g);
      return items.length ? `<div class="ah-g">${PC.t('as.g.' + g)}</div>` + items.map(histRow).join('') : '';
    }).join('') || `<div class="ah-empty">${PC.t(all.length ? 'as.hist.none' : 'as.hist.empty')}</div>`;
    el.querySelectorAll('[data-chat]').forEach(b => { b.onclick = () => openChat(b.dataset.chat); });
    icons();
  }
  function renderHistory() {
    const el = document.getElementById('pc-as-hist'); if (!el) return;
    el.innerHTML = `<div class="ah-top">
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="as-back" data-i18n-tip="as.back"><i data-lucide="arrow-left"></i></button>
        <div class="input-group grow"><i data-lucide="search"></i><input class="input" id="pc-as-q" placeholder="${PC.t('as.search')}" value="${PC.esc(AS.q)}" style="height:30px"></div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="as-new"><i data-lucide="plus" class="icon-sm"></i>${PC.t('as.newchat')}</button></div>
      <div class="ah-list" id="pc-as-hist-list"></div>
      <a class="ah-all" href="${href('assistant.html')}"><i data-lucide="messages-square" class="icon-sm"></i>${PC.t('as.hist.all')}<i data-lucide="arrow-up-right" class="icon-sm" style="margin-left:auto"></i></a>`;
    document.getElementById('pc-as-q').oninput = e => { AS.q = e.target.value; renderHistoryList(); };
    renderHistoryList(); PC.refresh(el);
  }
  function renderPanel() {
    const root = document.querySelector('.assistant'); if (!root) return;
    const hist = AS.view === 'history';
    root.classList.toggle('is-history', hist);
    document.getElementById('pc-as-hist').hidden = !hist;
    document.getElementById('pc-as-hist-btn').classList.toggle('is-on', hist);
    const foot = document.getElementById('pc-as-foot'); foot.textContent = PC.t(scopeIsGeneral() ? 'as.footnote.gen' : 'as.footnote');
    renderHead(); renderScope(); renderCtx();
    if (hist) renderHistory(); else renderMsgs();
    icons();
  }
  function expandChat() { location.href = href(PC.chats.href(AS.scope, AS.chat || 'new')); }
  AS.openChat = function (scope, id) { AS.open(); AS.scope = scope; AS.q = ''; openChat(id); };
  AS.newChat = function (scope) { AS.open(); AS.scope = scope || AS.scope; newPanelChat(); };

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
      { g: 'pal.nav', icon: 'messages-square', label: 'nav.chats.all', go: 'assistant.html' },
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

  function initPanel() {
    AS.scope = isGeneral() ? '__general' : PC.data.currentProjectId;
    restorePanelChat(); renderUsage(); defaultSuggest();
    document.getElementById('pc-as-usage').addEventListener('click', e => usagePopover(e.currentTarget));
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
      const withPanel = body.dataset.assistant !== 'none';
      if (withPanel) app.insertAdjacentHTML('beforeend', buildAssistant()); else app.classList.add('assistant-closed', 'no-assistant');
      body.insertBefore(app, body.firstChild);
      if (withPanel) initPanel();
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
    }


    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]'); if (!a) return;
      const act = a.dataset.action;
      if (act === 'palette') { e.preventDefault(); palette(); }
      else if (act === 'assistant') { e.preventDefault(); AS.toggle(); }
      else if (act === 'lang') PC.setLang(PC.lang === 'en' ? 'vi' : 'en');
      else if (act === 'theme') popover(a, ['system', 'light', 'dark'].map(t => `<button class="menu-item" data-v="${t}"><i data-lucide="${t === 'system' ? 'monitor' : t === 'dark' ? 'moon' : 'sun'}"></i><span data-i18n="theme.${t}"></span>${PC.theme === t ? '<i data-lucide="check" style="margin-left:auto"></i>' : ''}</button>`).join(''), v => PC.setTheme(v));
      else if (act === 'as-new') newPanelChat();
      else if (act === 'as-history') showHistory(AS.view !== 'history');
      else if (act === 'as-back') showHistory(false);
      else if (act === 'as-expand') expandChat();
      else if (act === 'as-open' && !app.classList.contains('no-assistant')) { e.preventDefault(); AS.openChat(a.dataset.scope, a.dataset.chat); }
      else if (act === 'as-new-open') { e.preventDefault(); AS.newChat(PC.data.currentProjectId); }      else if (act === 'switch-project') projectSwitcher(a);
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && app && !app.classList.contains('no-assistant')) { e.preventDefault(); AS.toggle(); }
      if (e.key === 'Escape' && AS.view === 'history' && !document.querySelector('.popover, .overlay')) showHistory(false);
    });
    // generic [data-theme-set] / [data-lang-set] controls on pages
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-theme-set]'); if (t) PC.setTheme(t.dataset.themeSet);
      const l = e.target.closest('[data-lang-set]'); if (l) PC.setLang(l.dataset.langSet);
    });
    document.addEventListener('pc:lang', () => { if (!customMsgs && !AS.msgsLocked) AS.msgs = null; renderPanel(); renderUsage(); if (!AS.customSuggest) defaultSuggest(); });

    updateTitle(); applyI18n(); updateToggles();
    isReady = true; readyQ.splice(0).forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
    applyI18n(); icons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', icons);
})();
