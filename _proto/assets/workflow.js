/* Procheck — Initial phase step setup.
   Shared by initial.html (renders the steps) and project-settings.html (edits them).
   Deliberately loose: each step has free-text instructions for the Assistant and a list of
   artifacts, each with a name and an optional template file of any document type.
   Real app: <project>\.procheck\settings.json → "workflow", template files in <project>\.procheck\templates\.
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
  function defaults() {
    const steps = {};
    STEPS.forEach(s => { steps[s] = { instr: null, arts: Object.keys(SEED).filter(k => SEED[k].step === s).map(id => ({ id, name: null, file: null })) }; });
    return { v: 2, steps };
  }

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

  const key = id => 'pc.workflow.v3.' + id;
  const W = {
    STEPS, STEP_META, SEED, INSTR,
    defaults,
    get(id) {
      try { const raw = localStorage.getItem(key(id)); if (raw) return JSON.parse(raw); } catch (e) {}
      const d = defaults(); return PRESETS[id] ? PRESETS[id](d) : d;
    },
    save(id, cfg) { try { localStorage.setItem(key(id), JSON.stringify(cfg)); } catch (e) {} },
    reset(id) { try { localStorage.removeItem(key(id)); } catch (e) {} },
    /* what the user sees: their own text, or the default in the current language */
    instr(cfg, step) { const v = cfg.steps[step].instr; return v != null ? v : PC.L(INSTR[step]); },
    artName(a) { return (a.name && a.name.trim()) || (SEED[a.id] ? PC.L(SEED[a.id].name) : PC.t('wf.untitled')); },
    artIcon(a) { return SEED[a.id] ? SEED[a.id].icon : (a.file ? 'file-badge' : 'file-text'); },
    /* artifact ids in the sample project's starting setup (used only to seed sample states) */
    seedIds(id) { const d = defaults(), c = PRESETS[id] ? PRESETS[id](d) : d; return new Set(STEPS.flatMap(s => c.steps[s].arts.map(a => a.id))); },
    fileSize(f) { return f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'; },
  };
  PC.i18n.extend({ en: { 'wf.untitled': 'Untitled artifact' }, vi: { 'wf.untitled': 'Tài liệu chưa đặt tên' } });
  PC.workflow = W;
})();
