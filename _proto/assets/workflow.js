/* Procheck — phase customisation (Initial phase, Scaffolding, SDLC).
   Shared by initial.html (renders the steps) and project-settings.html (edits them).
   Deliberately loose: each step has free-text instructions for the Assistant and a list of
   artifacts, each with a name and an optional template file of any document type.
   Real app: <project>\.procheck\settings.json → "customization" (per phase), template files in <project>\.procheck\templates\.
   Prototype: localStorage key pc.workflow.v3.<projectId>. Requires app.js (PC) first. */
(function () {
  const L = (en, vi) => ({ en, vi });
  const clone = o => JSON.parse(JSON.stringify(o));

  const STEPS = ['discovery', 'requirements', 'scope', 'estimation', 'signoff'];
  const STEP_META = {
    discovery: { name: L('Discovery', 'Khám phá'), icon: 'compass' },
    requirements: { name: L('Requirements', 'Yêu cầu'), icon: 'list-checks' },
    scope: { name: L('Scope', 'Phạm vi'), icon: 'target' },
    estimation: { name: L('Estimation', 'Ước tính'), icon: 'calculator' },
    signoff: { name: L('Proposal & SOW sign-off', 'Đề xuất & ký SOW'), icon: 'file-signature' },
  };

  /* default instructions: plain text the user can rewrite freely */
  const INSTR = {
    discovery: L(
      'Write meeting notes for every meeting: attendees, discussion, decisions and action items.\nThen read every transcript, note and client document and write one discovery report: findings by theme with the source cited, conflicts and open questions.\nWhen sources disagree, raise a clarification question instead of picking one.',
      'Viết biên bản cho từng cuộc họp: người tham dự, nội dung thảo luận, quyết định và việc cần làm.\nSau đó đọc mọi transcript, ghi chú và tài liệu khách hàng để viết một báo cáo khám phá: phát hiện theo chủ đề kèm nguồn, mâu thuẫn và câu hỏi còn mở.\nKhi các nguồn mâu thuẫn, tạo câu hỏi làm rõ thay vì tự chọn một bên.'),
    requirements: L(
      'Turn the findings and answered questions into functional and non-functional requirements.\nPrioritise them with MoSCoW and keep a link to where each one came from.',
      'Chuyển phát hiện và câu trả lời thành yêu cầu chức năng và phi chức năng.\nƯu tiên theo MoSCoW và giữ liên kết tới nguồn gốc của từng yêu cầu.'),
    scope: L(
      'Decide what is in scope, later or out for every requirement.\nRecord the assumptions and risks behind each decision.',
      'Quyết định trong phạm vi, để sau hay ngoài phạm vi cho từng yêu cầu.\nGhi nhận giả định và rủi ro đằng sau mỗi quyết định.'),
    estimation: L(
      'Size the effort for the agreed scope, by area, with an optimistic and a pessimistic case.\nPropose the team and the delivery milestones.',
      'Ước lượng công sức cho phạm vi đã chốt theo từng hạng mục, có kịch bản lạc quan và bi quan.\nĐề xuất đội ngũ và các mốc bàn giao.'),
    signoff: L(
      'Package the proposal and the SOW from the approved scope and estimation.',
      'Đóng gói đề xuất và SOW từ phạm vi và ước tính đã được duyệt.'),
  };

  /* the starter artifact of each step; these ids also carry the sample projects' history */
  const SEED = {
    meeting: { step: 'discovery', icon: 'mic', name: L('Meeting notes', 'Biên bản họp') },
    disc: { step: 'discovery', icon: 'compass', name: L('Discovery report', 'Báo cáo khám phá') },
    brd: { step: 'requirements', icon: 'file-text', name: L('Business requirements', 'Yêu cầu nghiệp vụ') },
    scope: { step: 'scope', icon: 'target', name: L('Scope definition', 'Định nghĩa phạm vi') },
    est: { step: 'estimation', icon: 'calculator', name: L('Effort estimation', 'Ước tính công sức') },
    sow: { step: 'signoff', icon: 'file-signature', name: L('SOW / Proposal', 'SOW / Đề xuất') },
  };

  /* a sample project that added its own artifacts and templates */
  const PRESETS = {
    mekong: cfg => {
      cfg.steps.requirements.arts[0].file = { name: 'KMS BRD template v4.docx', size: '84 KB', updated: '2026-07-20' };
      cfg.steps.requirements.arts.push({ id: 'nfr', name: 'NFR catalogue', file: { name: 'NFR checklist.xlsx', size: '22 KB', updated: '2026-08-02' } });
      cfg.steps.requirements.instr = INSTR.requirements.en + '\nCheck every NFR against the existing brownfield architecture and say which service it touches.';
      cfg.steps.scope.arts.push({ id: 'risk', name: 'Risk register', file: null });
      cfg.steps.estimation.arts.push({ id: 'plan', name: 'Milestone plan', file: null });
      cfg.steps.signoff.arts[0].file = { name: 'Mekong Retail SOW template.docx', size: '126 KB', updated: '2026-09-28' };
      cfg.steps.signoff.arts.push({ id: 'proposal', name: 'Proposal deck', file: { name: 'KMS proposal master.pptx', size: '2.4 MB', updated: '2026-06-11' } });
      return cfg;
    },
  };

  /* ---------------------------------------------------------------- Scaffolding */
  const RELEASE = {
    STEPS: ['structure', 'skeleton', 'iac', 'cicd', 'devcontainer', 'linttest'],
    STEP_META: {
      structure: { name: L('Repo structure', 'Cấu trúc repo'), icon: 'folder-tree' },
      skeleton: { name: L('Codebase skeleton', 'Khung mã nguồn'), icon: 'boxes' },
      iac: { name: L('Infrastructure as code', 'Hạ tầng dưới dạng mã'), icon: 'server-cog' },
      cicd: { name: L('CI/CD pipelines', 'Pipeline CI/CD'), icon: 'workflow' },
      devcontainer: { name: L('Dev containers', 'Dev container'), icon: 'container' },
      linttest: { name: L('Lint and test setup', 'Thiết lập lint và test'), icon: 'flask-conical' },
    },
    INSTR: {
      structure: L('Propose the architecture from the approved BRD and scope, then lay out the repository: folders, modules and naming.\nRecord every significant choice as an ADR.',
        'Đề xuất kiến trúc từ BRD và phạm vi đã duyệt, rồi bố trí repository: thư mục, module và quy ước đặt tên.\nGhi mỗi lựa chọn quan trọng thành một ADR.'),
      skeleton: L('Generate a runnable skeleton for each service and app, with one working example end to end.\nFollow the conventions of the linked repository.',
        'Tạo khung chạy được cho từng service và ứng dụng, có một ví dụ chạy xuyên suốt.\nTuân theo quy ước của repository đã liên kết.'),
      iac: L('Describe every environment as code (dev, staging, production).\nKeep secrets out of the repository.', 'Mô tả mọi môi trường bằng mã (dev, staging, production).\nKhông đưa secret vào repository.'),
      cicd: L('Build, test and deploy on every pull request and merge.\nFail the pipeline on lint or test errors.', 'Build, test và deploy cho mỗi pull request và merge.\nDừng pipeline khi lint hoặc test lỗi.'),
      devcontainer: L('Give developers and agents the same toolchain in a dev container.', 'Cung cấp cùng bộ công cụ cho lập trình viên và agent trong dev container.'),
      linttest: L('Set up lint, formatting, unit tests and the e2e command agents run as evidence.', 'Thiết lập lint, format, unit test và lệnh e2e mà agent chạy để làm bằng chứng.'),
    },
    SEED: {
      arch: { step: 'structure', icon: 'network', name: L('Architecture overview', 'Tổng quan kiến trúc') },
      adr: { step: 'structure', icon: 'git-pull-request-arrow', name: L('Architecture decision records', 'Hồ sơ quyết định kiến trúc (ADR)') },
      runbook: { step: 'iac', icon: 'book-open', name: L('Environment runbook', 'Hướng dẫn vận hành môi trường') },
    },
    optional: true,
    PROMPT: 'You are the architecture assistant for {project} ({client}).\nWork in the Scaffolding phase: propose the architecture, repository structure,\ninfrastructure and CI/CD pipeline, then generate the scaffold in the linked repo.\nFollow existing conventions; never overwrite files without asking.',
  };

  /* ---------------------------------------------------------------- SDLC: the stages every task goes through */
  const SDLC = {
    STEPS: ['plan', 'implement', 'verify', 'review'],
    STEP_META: {
      plan: { name: L('Plan', 'Lập kế hoạch'), icon: 'drafting-compass' },
      implement: { name: L('Implement', 'Triển khai'), icon: 'bot' },
      verify: { name: L('Verify', 'Kiểm chứng'), icon: 'flask-conical' },
      review: { name: L('Review', 'Review'), icon: 'eye' },
    },
    INSTR: {
      plan: L('Read the task, the linked artifacts and the code it touches.\nWrite a short plan: files to change, approach, risks and how it will be tested.',
        'Đọc task, các tài liệu liên kết và phần mã liên quan.\nViết kế hoạch ngắn: file cần sửa, cách làm, rủi ro và cách kiểm thử.'),
      implement: L('Implement the plan in an isolated git worktree.\nKeep the change small and follow the repository conventions.', 'Triển khai kế hoạch trong một git worktree riêng.\nGiữ thay đổi nhỏ gọn và tuân theo quy ước của repository.'),
      verify: L('Run lint, unit tests and the e2e command.\nAttach the output and screenshots as evidence.', 'Chạy lint, unit test và lệnh e2e.\nĐính kèm kết quả và ảnh chụp làm bằng chứng.'),
      review: L('Summarise what changed and why, list open points and stop for human review.\nNever push or open a pull request without approval.', 'Tóm tắt thay đổi và lý do, liệt kê điểm còn mở rồi dừng chờ người review.\nKhông push hay mở pull request khi chưa được duyệt.'),
    },
    SEED: {
      implplan: { step: 'plan', icon: 'list-checks', name: L('Implementation plan', 'Kế hoạch triển khai') },
      evidence: { step: 'verify', icon: 'flask-conical', name: L('Test evidence', 'Bằng chứng kiểm thử') },
      summary: { step: 'review', icon: 'file-text', name: L('Change summary', 'Tóm tắt thay đổi') },
    },
    optional: true,
    PROMPT: 'You are an implementation agent on {project} ({client}).\nWork in the SDLC phase: for each task, plan the solution, implement it in an\nisolated git worktree, run the e2e command and attach evidence.\nStop at review. Never push or open a pull request without approval.',
  };

  const INITIAL = {
    STEPS, STEP_META, INSTR, SEED, PRESETS, optional: false,
    PROMPT: 'You are the discovery assistant for {project} ({client}).\nWork in the Initial phase: turn meeting notes and source documents into\nclarifying questions, a BRD, scope and estimates.\nAlways cite the source document and flag assumptions explicitly.',
  };

  /* one customisable phase: a phase prompt, then steps with free-text instructions and artifacts */
  function makePhase(def, keyOf) {
    const defaults = () => {
      const steps = {};
      def.STEPS.forEach(s => { steps[s] = { instr: null, off: false, arts: Object.keys(def.SEED).filter(k => def.SEED[k].step === s).map(id => ({ id, name: null, file: null })) }; });
      return { v: 3, prompt: null, steps };
    };
    const presets = def.PRESETS || {};
    const fill = c => { def.STEPS.forEach(s => { if (!c.steps[s]) c.steps[s] = { instr: null, off: false, arts: [] }; }); if (c.prompt === undefined) c.prompt = null; return c; };
    return {
      STEPS: def.STEPS, STEP_META: def.STEP_META, SEED: def.SEED, INSTR: def.INSTR, PROMPT: def.PROMPT, optional: def.optional,
      defaults,
      get(id) {
        try { const raw = localStorage.getItem(keyOf(id)); if (raw) return fill(JSON.parse(raw)); } catch (e) {}
        const d = defaults(); return presets[id] ? presets[id](d) : d;
      },
      save(id, cfg) { try { localStorage.setItem(keyOf(id), JSON.stringify(cfg)); } catch (e) {} },
      reset(id) { try { localStorage.removeItem(keyOf(id)); } catch (e) {} },
      /* what the user sees: their own text, or the default in the current language */
      instr(cfg, step) { const v = cfg.steps[step].instr; return v != null ? v : PC.L(def.INSTR[step]); },
      prompt(cfg) { return cfg.prompt != null ? cfg.prompt : def.PROMPT; },
      artName(a) { return (a.name && a.name.trim()) || (def.SEED[a.id] ? PC.L(def.SEED[a.id].name) : PC.t('wf.untitled')); },
      artIcon(a) { return def.SEED[a.id] ? def.SEED[a.id].icon : (a.file ? 'file-badge' : 'file-text'); },
      /* artifact ids in the sample project's starting setup (used only to seed sample states) */
      seedIds(id) { const d = defaults(), c = presets[id] ? presets[id](d) : d; return new Set(def.STEPS.flatMap(s => c.steps[s].arts.map(a => a.id))); },
    };
  }

  /* Initial keeps its v3 key so initial.html and settings share it */
  const PHASES = {
    initial: makePhase(INITIAL, id => 'pc.workflow.v3.' + id),
    release: makePhase(RELEASE, id => 'pc.custom.release.v1.' + id),
    sdlc: makePhase(SDLC, id => 'pc.custom.sdlc.v1.' + id),
  };
  const W = Object.assign({}, PHASES.initial, {
    phase: ph => PHASES[ph],
    fileSize(f) { return f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'; },
  });
  PC.i18n.extend({ en: { 'wf.untitled': 'Untitled artifact' }, vi: { 'wf.untitled': 'Tài liệu chưa đặt tên' } });
  PC.workflow = W;
})();
