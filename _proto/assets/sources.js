/* Procheck prototype — project sources (files the user adds to <project dir>\sources\).
   Shared by sources.html (table) and artifacts.html (derived-from links, generate modal).

   PC.srcKinds            kind registry: icon, tile, extensions, default category, AI read mode
   PC.srcKind(kind)       one kind (falls back to "other")
   PC.srcKindOf(name)     detect kind from a file name
   PC.srcCats             categories shown as filters in sources.html
   PC.srcModes            what Procheck extracts for the Assistant per AI read mode
   PC.sources()           sources of the current project (mutable array, same reference per page)
   PC.srcArtifact(id)     [icon, title] of an artifact a source is used in
*/
(function () {
  const PC = window.PC;

  PC.srcCats = ['docs', 'meet', 'media', 'data', 'design', 'code', 'other'];

  PC.srcModes = {
    text: { icon: 'scan-text', tone: 'success' },
    transcribe: { icon: 'captions', tone: 'success' },
    vision: { icon: 'scan-eye', tone: 'success' },
    data: { icon: 'table-2', tone: 'success' },
    code: { icon: 'code-xml', tone: 'success' },
    unpack: { icon: 'package-open', tone: 'success' },
    store: { icon: 'archive', tone: '' },
  };

  PC.srcKinds = {
    pdf: { icon: 'file-text', tile: 'pdf', ext: ['pdf'], cat: 'docs', mode: 'text', unit: 'pages' },
    doc: { icon: 'file-type-2', tile: 'doc', ext: ['doc', 'docx', 'odt', 'rtf'], cat: 'docs', mode: 'text', unit: 'pages' },
    slide: { icon: 'presentation', tile: 'slide', ext: ['ppt', 'pptx', 'odp', 'key'], cat: 'docs', mode: 'text', unit: 'slides' },
    md: { icon: 'notebook-pen', tile: 'md', ext: ['md', 'markdown'], cat: 'docs', mode: 'text', unit: 'pages' },
    text: { icon: 'file-type', tile: '', ext: ['txt', 'log'], cat: 'docs', mode: 'text', unit: 'lines' },
    html: { icon: 'globe', tile: 'doc', ext: ['html', 'htm', 'mhtml'], cat: 'docs', mode: 'text', unit: 'pages' },
    email: { icon: 'mail', tile: 'email', ext: ['eml', 'msg'], cat: 'docs', mode: 'text', unit: 'msgs' },
    transcript: { icon: 'captions', tile: 'md', ext: ['vtt', 'srt'], cat: 'meet', mode: 'text', unit: 'min' },
    audio: { icon: 'audio-lines', tile: 'audio', ext: ['m4a', 'mp3', 'wav', 'ogg', 'flac', 'aac'], cat: 'meet', mode: 'transcribe', unit: 'min' },
    video: { icon: 'film', tile: 'video', ext: ['mp4', 'mov', 'webm', 'mkv', 'avi'], cat: 'meet', mode: 'transcribe', unit: 'min' },
    image: { icon: 'image', tile: 'image', ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp'], cat: 'media', mode: 'vision', unit: '' },
    sheet: { icon: 'sheet', tile: 'sheet', ext: ['xlsx', 'xls', 'ods', 'numbers'], cat: 'data', mode: 'data', unit: 'sheets' },
    csv: { icon: 'table', tile: 'sheet', ext: ['csv', 'tsv'], cat: 'data', mode: 'data', unit: 'rows' },
    json: { icon: 'braces', tile: 'mono', ext: ['json', 'yaml', 'yml', 'xml', 'toml'], cat: 'data', mode: 'data', unit: '' },
    diagram: { icon: 'workflow', tile: 'design', ext: ['drawio', 'vsdx', 'puml', 'mmd', 'bpmn', 'excalidraw'], cat: 'design', mode: 'text', unit: 'pages' },
    design: { icon: 'pen-tool', tile: 'design', ext: ['fig', 'sketch', 'xd', 'psd', 'ai'], cat: 'design', mode: 'store', unit: '' },
    code: { icon: 'code-xml', tile: 'mono', ext: ['js', 'ts', 'java', 'cs', 'py', 'sql', 'go', 'kt', 'swift', 'php', 'rb', 'sh', 'ps1', 'c', 'cpp', 'rs'], cat: 'code', mode: 'code', unit: 'lines' },
    archive: { icon: 'file-archive', tile: 'archive', ext: ['zip', '7z', 'tar', 'gz', 'rar'], cat: 'code', mode: 'unpack', unit: 'files' },
    other: { icon: 'file', tile: '', ext: [], cat: 'other', mode: 'store', unit: '' },
  };

  PC.srcKind = kind => PC.srcKinds[kind] || PC.srcKinds.other;

  PC.srcKindOf = function (name) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    return Object.keys(PC.srcKinds).find(k => PC.srcKinds[k].ext.includes(ext)) || 'other';
  };

  const src = (id, kind, name, size, meta, date, used, opt) => Object.assign(
    { id, kind, name, size, meta, date, by: 'ME', used: used || [], cat: PC.srcKind(kind).cat, status: 'indexed' },
    opt || {});

  const DATA = {
    'lotus-pay': [
      src('rfp', 'pdf', 'RFP – Lotus Merchant Portal.pdf', '2.4 MB', 38, '2026-08-12', ['brd', 'scope', 'sow', 'c4']),
      src('rec-kickoff', 'audio', 'Kickoff recording 2026-08-14.m4a', '46 MB', 48, '2026-08-14', ['meeting-kickoff', 'brd', 'scope']),
      src('process-doc', 'doc', 'Current merchant onboarding process.docx', '312 KB', 9, '2026-08-13', ['brd', 'spec-kyc']),
      src('volume-forecast', 'sheet', 'Merchant volume forecast 2026.xlsx', '88 KB', 3, '2026-08-16', ['estimation', 'spec-settlement']),
      src('ekyc-circular', 'pdf', 'State Bank e-KYC circular.pdf', '1.1 MB', 22, '2026-08-15', ['brd', 'spec-kyc']),
      src('legacy-api', 'pdf', 'Legacy settlement API reference.pdf', '960 KB', 41, '2026-08-20', ['c4', 'adr-004', 'test-strategy']),
      src('interview-fin', 'audio', 'Finance Ops interview.m4a', '31 MB', 32, '2026-08-18', ['meeting-kickoff', 'brd', 'spec-settlement']),
      src('portal-walkthrough', 'video', 'Current portal walkthrough.mp4', '184 MB', 14, '2026-08-21', ['spec-kyc']),
      src('kyc-mail', 'email', 'RE: KYC record retention period.eml', '64 KB', 6, '2026-08-22', ['spec-kyc']),
      src('brand-deck', 'slide', 'Lotus brand guidelines.pptx', '12.6 MB', 28, '2026-08-25', []),
      src('wireframes', 'design', 'Merchant portal wireframes.fig', '38 MB', null, '2026-09-02', [], { status: 'stored' }),
      src('kyc-flow', 'diagram', 'KYC approval flow.drawio', '142 KB', 2, '2026-09-04', ['spec-kyc']),
      src('webhook-sample', 'json', 'Webhook payload samples.json', '18 KB', null, '2026-09-18', ['spec-settlement']),
      src('settlement-export', 'csv', 'Settlement export sample.csv', '2.1 MB', 18400, '2026-09-18', ['spec-settlement', 'test-strategy']),
      src('legacy-sdk', 'archive', 'Legacy settlement SDK.zip', '7.4 MB', 126, '2026-09-20', ['c4']),
    ],
    'saigon-tms': [
      src('rfp', 'pdf', 'RFP – Transport Management System.pdf', '1.8 MB', 26, '2026-11-17', []),
      src('dispatch-xlsx', 'sheet', 'Current dispatch process.xlsx', '214 KB', 4, '2026-11-18', []),
      src('intro-call', 'transcript', 'Intro call transcript.vtt', '58 KB', 42, '2026-11-19', []),
    ],
    'viethealth': [
      src('ops-overview', 'pdf', 'Clinic operations overview.pdf', '3.1 MB', 18, '2026-10-26', ['brd']),
      src('journey-map', 'image', 'Patient journey map.png', '1.2 MB', null, '2026-10-27', ['brd', 'meeting-notes']),
      src('his-spec', 'doc', 'Current HIS integration spec.docx', '640 KB', 24, '2026-10-30', ['brd', 'scope']),
      src('kickoff-vtt', 'transcript', 'Kickoff transcript.vtt', '71 KB', 52, '2026-10-28', ['meeting-notes']),
      src('workshop-m4a', 'audio', 'Clinical workflow workshop.m4a', '88 MB', 95, '2026-11-04', ['meeting-notes', 'brd']),
      src('itsec-notes', 'md', 'IT security session notes.md', '9 KB', 2, '2026-11-18', []),
    ],
    'mekong': [
      src('rfp', 'pdf', 'RFP – Mekong Omnichannel.pdf', '2.9 MB', 34, '2026-07-15', ['brd', 'scope', 'sow']),
      src('arch-overview', 'pdf', 'Current architecture overview.pdf', '1.4 MB', 29, '2026-08-19', ['c4', 'adr-001', 'adr-004']),
      src('pos-erp-spec', 'doc', 'POS and ERP integration spec.docx', '780 KB', 18, '2026-08-20', ['brd', 'adr-004']),
      src('store-process', 'doc', 'Store operations process.docx', '420 KB', 11, '2026-08-05', ['brd', 'scope']),
      src('stock-sheet', 'sheet', 'Stock sync volumes 2026.xlsx', '96 KB', 3, '2026-08-21', ['adr-004', 'estimation']),
      src('kickoff-m4a', 'audio', 'Kickoff recording 2026-07-21.m4a', '52 MB', 55, '2026-07-21', ['meeting-notes', 'brd']),
      src('store-interview', 'audio', 'Store operations interview.m4a', '36 MB', 40, '2026-08-05', ['brd']),
      src('pos-collection', 'json', 'POS API collection.postman.json', '46 KB', null, '2026-10-02', ['adr-004']),
      src('stock-schema', 'code', 'stock_tables.sql', '12 KB', 340, '2026-10-03', ['adr-002', 'repo-structure']),
      src('tablet-mock', 'design', 'Pick-list tablet mockups.fig', '22 MB', null, '2026-10-06', [], { status: 'stored' }),
    ],
    'atlas-hr': [
      src('process-map', 'pdf', 'Atlas HR process map.pdf', '2.2 MB', 21, '2026-01-13', ['brd', 'scope']),
      src('data-dict', 'sheet', 'Legacy HR tool data dictionary.xlsx', '180 KB', 6, '2026-01-27', ['brd', 'repo-structure']),
      src('napas', 'pdf', 'NAPAS bank file format v3.pdf', '740 KB', 16, '2026-02-16', ['brd', 'spec-payroll']),
      src('closing', 'doc', 'Payroll closing checklist.docx', '210 KB', 5, '2026-02-17', ['estimation', 'spec-payroll']),
      src('kickoff-m4a', 'audio', 'Kickoff recording 2026-01-12.m4a', '41 MB', 45, '2026-01-12', ['meeting-notes', 'brd']),
      src('payroll-ws', 'audio', 'Leave and attendance interview.m4a', '28 MB', 35, '2026-02-02', ['spec-leave']),
      src('napas-sample', 'text', 'NAPAS sample batch.txt', '410 KB', 5002, '2026-11-17', ['spec-payroll', 'test-strategy']),
      src('payslip-scan', 'image', 'Payslip template scan.jpg', '2.8 MB', null, '2026-03-03', ['spec-payroll']),
      src('pit-rules', 'pdf', 'PIT rules 2026 (protected).pdf', '1.6 MB', null, '2026-11-20', [], { status: 'failed' }),
    ],
  };

  const ARTS = {
    'meeting-kickoff': ['mic', 'Meeting notes – Kickoff'], 'meeting-notes': ['mic', 'Meeting notes'],
    brd: ['file-text', 'Business Requirements Doc'], scope: ['target', 'Scope Definition'], estimation: ['calculator', 'Effort Estimation'],
    sow: ['file-signature', 'Statement of Work'], c4: ['network', 'Solution Architecture (C4)'], 'tech-stack': ['layers', 'Tech Stack Decision'],
    'repo-structure': ['folder-tree', 'Repository Structure'], cicd: ['workflow', 'CI/CD Pipeline Spec'], infra: ['cloud', 'Infra plan'],
    'spec-kyc': ['file-text', 'Feature spec – Merchant KYC'], 'spec-settlement': ['file-text', 'Feature spec – Settlement Report'],
    'spec-leave': ['file-text', 'Feature spec – Leave approval delegation'], 'spec-payroll': ['file-text', 'Feature spec – Payroll export (NAPAS)'],
    'test-strategy': ['flask-conical', 'Test strategy'], 'release-notes': ['megaphone', 'Release notes'],
  };

  PC.srcArtifact = id => ARTS[id] || (/^adr-\d+$/.test(id) ? ['git-pull-request-arrow', id.toUpperCase()] : ['file-text', id]);

  let cache = null;
  PC.sources = function () {
    if (!cache) cache = DATA[PC.project().id] || DATA['lotus-pay'];
    return cache;
  };
})();
