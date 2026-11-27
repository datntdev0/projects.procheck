# Plan: "Tạo bằng AI" cho các bước Initial phase & hiển thị artifact

> Trạng thái: **APPROVED v5** (git ở project, kiểm tra thay đổi ngoài artifacts bằng git, chỉ cảnh báo)
> Ngày: 2026-11-27 · Nhánh đề xuất: `feature/artifact-generation` (tách từ `feature/phase-customization`)
> Dựa trên: `_plans/phase-customization.md` (customization + template đã lưu trong project)

## 1. Bối cảnh

- Initial phase → Overview → **Phase progress** (`angular/pages/initial-phase/phase-progress.component.ts`) đã có nút **Tạo bằng AI / Cập nhật bằng AI** cho từng step. Nút chỉ `emit(step.id)`, chưa có xử lý. Danh sách artifact đang lấy cứng từ `DEFAULT_ARTIFACTS` (i18n) và status luôn `not_started`.
- Sidebar có mục **Artifacts** (`/projects/:id/artifacts`) nhưng route vẫn là "coming soon". Proto `_proto/artifacts.html` có danh sách, trình xem, trạng thái Draft / Review / Approved, lịch sử phiên bản.
- Backend đã chạy được CLI (Claude Code / Codex) cho chat (`features/chats/runner.rs`): CLI home riêng của Procheck, `process::spawn_streaming`, parser stream-json, `KillSwitch` để dừng. Code này đang gắn với `ChatStore`.
- Backend đã gọi `git` qua `process::run` (`features/projects/repository.rs`).
- Customization: `.procheck\settings.json` → `customization.phases.initial` (prompt, instructions, artifacts) và `.procheck\templates\initial\<artifactId>.md`. Manifest có `documentLanguage`.
- **Chưa có** trích xuất nội dung source: CLI tự đọc file gốc trong `sources\`.

## 2. Nguyên tắc (theo review lần 1)

- **CLI là agent.** Một lần bấm "Tạo bằng AI" = **một phiên agent cho cả step**. Agent tự đọc sources và template, rồi **tự ghi** file artifact vào project. Procheck không ép số lượng hay cách chia file. Ví dụ: một hay nhiều biên bản họp là do **instruction** của step quyết định.
- **Cách xử lý khi có phần không làm được** (thiếu nguồn, một tài liệu lỗi…) cũng do instruction quyết định. Procheck chỉ phân biệt phiên agent **thành công / lỗi / bị dừng**.
- **Phiên bản = git.** Project có một git repo nội bộ; mỗi phiên agent xong thì Procheck commit. Lịch sử của một file artifact chính là `git log` của file đó.
- **Step trước phải đã được generate.** Chỉ được generate step N khi mọi step trước đã có **ít nhất một phiên generate thành công** (không cần Approved). Step 1 luôn chạy được.
- **Phiên lỗi / bị dừng không hoàn tác.** File agent đã ghi vẫn nằm trong working directory (chưa commit), người dùng tự xem và quyết định.

## 3. Mục tiêu

| # | Mục tiêu |
|---|----------|
| G1 | Bấm **Tạo bằng AI** trên một step: Procheck chạy CLI của project như một agent, với phase prompt, step instructions, các artifact của step (tên, thư mục đích, template) và sources. Agent ghi các file Markdown vào thư mục artifact. |
| G2 | Theo dõi phiên agent ngay trên step: hoạt động hiện tại (đang đọc `sources/rfp.pdf`, đang ghi `artifacts/initial/brd/brd.md`…), nút **Dừng**, lỗi rõ ràng. |
| G3 | Phiên xong → Procheck commit vào git nội bộ. Các file mới hoặc thay đổi về trạng thái **Draft**. |
| G4 | **Hiển thị artifact**: chip trên Phase progress phản ánh trạng thái thật. Trang **Artifacts** có danh sách file theo step / artifact, trình xem Markdown, số phiên bản, đổi trạng thái (Draft → Review → Approved), mở bằng VS Code. |
| G5 | **Cập nhật bằng AI**: chạy lại step; agent thấy các file hiện có và sửa tiếp. Bản sửa tay của người dùng được commit trước khi chạy nên không bị mất. |

### Ngoài phạm vi
- UI lịch sử phiên bản (xem diff, khôi phục phiên bản cũ): chỉ hiện số phiên bản và commit mới nhất.
- Sửa artifact trong app (mở bằng VS Code / app ngoài).
- Export (docx / pdf), phát hiện artifact cũ khi source thay đổi, trích xuất nội dung source.
- Generate cho riêng một artifact, ô "Hướng dẫn thêm" khi generate.
- Trang Agent runs, Scaffolding / SDLC, tích hợp Assistant chat.
- Unit tests / Playwright tests.

## 4. Lưu trữ

```
<project dir>\
  artifacts\
    initial\
      meeting\                ← một thư mục cho mỗi artifact trong customization
        2026-08-14-kickoff.md   (agent tự đặt tên file, theo instruction)
        2026-08-21-workshop.md
      disc\
        discovery-report.md
      brd\
        business-requirements.md
      …
  .git\                       ← git repo của project
  .gitignore                  ← Procheck tạo, xem mục 4.1
  .procheck\
    artifacts.json            ← trạng thái review của từng file artifact
    runs\
      <runId>.json            ← nhật ký mỗi phiên agent
```

### 4.1 Git của project
- `git init` ngay trong thư mục project, lúc tạo project. Project tạo trước tính năng này được init lúc generate lần đầu.
- **Theo dõi** (commit được): `artifacts/`, `sources/`, `procheck.json`, `.procheck/settings.json`, `.procheck/templates/`, `.procheck/sources.json`.
- **Bỏ qua** (`.gitignore` do Procheck tạo và commit): `.procheck/chats/`, `.procheck/runs/`, `.procheck/cli/`, `.procheck/worktrees/`, `.procheck/index/`, `.procheck/artifacts.json`, `repository/` (repo code riêng, nằm lồng bên trong), `board/` (để sau).
- **Source lớn** (> 50 MB, ví dụ ghi âm, video): Procheck thêm đường dẫn vào **`.gitignore`** (trong khối do Procheck quản lý, có comment đánh dấu) lúc import, và bỏ ra khi xoá source. Các file này được kiểm tra bằng cách so `sha256` trong `.procheck/sources.json` (Q-E).
- Mọi thay đổi do **chính Procheck** làm với file được theo dõi đều được commit ngay, để trạng thái gốc trước mỗi phiên agent luôn sạch:
  - thêm / xoá source: `sources: add 3 files`, `sources: remove rfp-v1.pdf`;
  - lưu Customization: `settings: customization`.
- Commit với author cố định `Procheck <procheck@local>` (truyền qua `-c user.name=… -c user.email=…`, không đụng git config của người dùng). Message có trailer để đọc lại:
  - Agent: `initial/<stepId>: <cli> · <model> · run <runId>`, trailer `Procheck-Run`, `Procheck-Step`, `Procheck-By: agent`.
  - Sửa tay / phần dở: `initial: changes before run <runId>`, trailer `Procheck-By: user` (và `Procheck-Partial-Run` nếu có).
- Lấy phiên bản: `git log --format=… -- <file>` → số phiên bản = số commit chạm tới file, kèm commit mới nhất (ngày, ai làm, run).
- Yêu cầu có `git` trong PATH. Không có thì nút generate bị disable, kèm hướng dẫn cài git. Tạo project vẫn được, chỉ bỏ qua bước init.
- Đây là repo git bình thường, nên người dùng vẫn dùng được bằng tool của mình (VS Code hiện lịch sử).

### 4.1b Kiểm tra thay đổi ngoài artifacts bằng git
Sau **mọi** phiên agent (thành công, lỗi hay bị dừng), Procheck chạy `git status --porcelain --untracked-files=all` và xét các đường dẫn **ngoài** `artifacts/initial/`:
- File theo dõi bị sửa / xoá, hoặc file mới xuất hiện → **chỉ cảnh báo**, không tự khôi phục (Q-F). Cảnh báo kèm lệnh gợi ý (`git restore -- <path>` / xoá file).
- Source lớn bị bỏ qua trong git → so `sha256` với `.procheck/sources.json`, khác thì cảnh báo.
- Cảnh báo được ghi vào `warnings` của kết quả và run log. UI hiện rõ trên step và trong toast.
- Các thay đổi này **không** được commit chung với commit của agent (commit agent chỉ `add -- artifacts/`). Chúng nằm lại trong working directory để người dùng tự xử lý; trước phiên sau, bước "sync" (mục 5.4) mới commit chúng.
- Vùng bị bỏ qua (`.procheck/chats`, `runs`…) không kiểm tra được; chấp nhận.

## 5. Backend (Rust)

### 5.1 Tách phần chạy CLI (refactor `chats/runner.rs`)
- Hàm dùng chung (ví dụ `features/agents/run.rs`): spawn CLI với home Procheck, cwd, model, quyền tool, prompt; stream signal; kill switch. Chat runner gọi lại hàm này, hành vi chat không đổi.
- Parser thêm `Signal::Tool { name, path }` từ các event `tool_use` (Claude: `assistant` / `content_block_start`; Codex: event command / file change), để UI hiện "đang đọc / đang ghi …".
- Quyền mới `ToolAccess::Agent { write_dir }`:
  - **Claude**: `--tools Read,Glob,Grep,Write,Edit` + `--allowedTools "Read,Glob,Grep,Write(artifacts/initial/**),Edit(artifacts/initial/**)"`, không có Bash / Web. Ghi ngoài `artifacts/initial/` sẽ bị từ chối.
  - **Codex**: `--sandbox workspace-write`, cwd = thư mục project (ghi được trong cả project).
  - Lớp chặn trên CLI chỉ là lớp đầu. Lớp phát hiện là bước kiểm tra bằng git sau phiên (mục 4.1b), áp dụng như nhau cho cả hai CLI.
- Mỗi phiên là **session mới**, cwd = thư mục project, model lấy từ `.procheck\settings.json` (`cli`, `model`), không có thì dùng model mặc định trong App settings.

### 5.2 Module `features/projects/artifacts/`
- `history.rs`: các lệnh git: init + `.gitignore`, `status --porcelain`, `add`, commit có trailer, `log` theo file, phát hiện thay đổi ngoài artifacts (mục 4.1b), quản lý khối source lớn trong `.gitignore`. Chạy qua `process::run` như `repository.rs`. Các chỗ Procheck tự sửa file được theo dõi (import / xoá source, lưu customization) gọi thêm commit (mục 4.1).
- `catalog.rs`: quét file, ghép customization, đọc / ghi `artifacts.json`, tính trạng thái file và step.
- `prompt.rs`: ghép prompt (§5.3).
- `generate.rs`: điều phối phiên agent (§5.4).

### 5.3 Prompt cho một step
Viết theo `documentLanguage` của project. Khung câu chữ nằm trong `desktop/resources/prompts/generate-step.{vi,en}.md` (nhúng bằng `include_str!`), các chỗ `{…}` được điền:

```
<phase prompt, thay {project} / {client}>

## Bước hiện tại: <tên step>
<step instructions>

## Tài liệu của bước này
Ghi mỗi tài liệu vào đúng thư mục của nó (một hoặc nhiều file .md, tuỳ hướng dẫn ở trên):
- Biên bản họp → artifacts/initial/meeting/   · template: .procheck/templates/initial/meeting.md
- Báo cáo khám phá → artifacts/initial/disc/  · template: .procheck/templates/initial/disc.md
- (không có template → tự chọn cấu trúc phù hợp)

## File đã có (cập nhật thay vì viết lại từ đầu; giữ nội dung người dùng đã sửa)
- artifacts/initial/meeting/2026-08-14-kickoff.md (v2, Approved)

## Nguồn (sources/)
- sources/kickoff-transcript.md (text)
- sources/rfp.pdf (pdf)
- sources/workshop.m4a (audio, không đọc được)

## Kết quả của các bước trước
- artifacts/initial/disc/discovery-report.md …

## Quy tắc
- Chỉ ghi file trong artifacts/initial/<thư mục của tài liệu>/. Không sửa sources, .procheck hay file khác.
- Markdown, viết bằng <Tiếng Việt | English>, bỏ các comment hướng dẫn của template.
- Kết thúc bằng một đoạn tóm tắt ngắn: đã ghi / cập nhật những file nào, còn thiếu gì.
```

- Sources lấy từ `.procheck\sources.json` (bỏ `missing`), gắn nhãn "không đọc được" theo `SourceKind` (audio, video, office, archive, stored-only).
- Đoạn tóm tắt cuối của agent được lưu vào run log và hiện trên UI.

### 5.4 Một phiên generate
1. Kiểm tra: project ready, có customization, có `git`, CLI đã kết nối, các step trước đã **generated** (`stepLocked`), project không có phiên nào đang chạy (`busy`; mỗi project một phiên).
2. Đảm bảo git đã có. Thay đổi chưa commit **ngoài** `artifacts/` (người dùng tự thêm file vào `sources\`…) → commit `sync: changes outside Procheck`. Work tree `artifacts/` đang có thay đổi chưa commit (sửa tay, hoặc phần dở của phiên trước bị dừng / lỗi) → **commit trước**: message `initial: changes before run <runId>`, trailer `Procheck-By: user`. Nếu run log cho thấy thay đổi đến từ một phiên dở thì ghi thêm `Procheck-Partial-Run: <oldRunId>`.
3. Ghép prompt, chạy agent, stream event lên UI.
4. **Kiểm tra thay đổi ngoài artifacts** bằng git và cảnh báo (mục 4.1b), với mọi kết quả.
5. Kết thúc:
   - **Thành công** (CLI exit 0): `add -A -- artifacts/` + commit (chỉ artifacts) (không có thay đổi thì không commit). Các file thay đổi sẽ tự về Draft (§4.2).
   - **Bị dừng / CLI lỗi**: **không commit, không hoàn tác**. File đã ghi vẫn nằm trong working directory, hiện trên UI là "chưa commit". Run log ghi danh sách file đã chạm và lý do. Step **không** được tính là generated.
6. Ghi `.procheck\runs\<runId>.json`: step, CLI, model, thời gian, kết quả, commit, các file thay đổi, tóm tắt của agent, usage / cost, cảnh báo, lỗi.

### 5.5 Commands

| Command | Input | Output |
|---------|-------|--------|
| `artifacts_list` | `{ id }` | `{ steps: StepState[], files: ArtifactFile[], gitAvailable: boolean }` (chỉ đọc, không commit; file có thay đổi chưa commit được đánh dấu `uncommitted: true`) |
| `artifacts_read` | `{ id, path }` | `{ file: ArtifactFile, content: string }` (`path` phải nằm trong `artifacts/`) |
| `artifacts_generate` | `{ id, stepId, onEvent: Channel<GenerateEvent> }` | `GenerateResult` |
| `artifacts_generate_stop` | `{ id }` | `bool` |
| `artifacts_set_status` | `{ id, path, status }` | `ArtifactFile` |
| `artifacts_open_in_vscode` / `artifacts_reveal` | `{ id, path }` | — |

```ts
interface ArtifactFile {
  path: string;            // "artifacts/initial/brd/business-requirements.md"
  artifactId: string;      // "brd" (thư mục)
  stepId: string | null;   // null = không còn trong customization
  status: 'draft' | 'review' | 'approved';
  version: number;         // số commit chạm tới file
  updatedAt: string;
  by: 'agent' | 'user';
  uncommitted: boolean;    // có thay đổi trong working directory chưa vào git (sửa tay / phiên dở)
  cli?: string; model?: string; runId?: string;
}
type GenerateEvent =
  | { type: 'started'; runId: string; stepId: string }
  | { type: 'activity'; tool: string; path?: string }   // Read / Write / Edit …
  | { type: 'text'; text: string }                      // lời agent (để hiện dòng mới nhất)
  | { type: 'finished'; result: GenerateResult };
interface GenerateResult {
  runId: string;
  outcome: 'completed' | 'stopped' | 'failed';
  commit: string | null;
  changed: string[];
  summary: string;
  warnings: string[];
  error?: { code: string; message: string };
}
```

Error codes: `busy`, `stepLocked`, `notSupported`, `gitMissing`, `cliMissing` / `notSignedIn` (tái dùng phân loại lỗi của chat), `stopped`, `notFound`, `io`, `storage`.

## 6. Frontend (Angular)

### 6.1 Data
- `features/projects/artifacts.model.ts`, `artifacts.service.ts`.
- `ArtifactsStore` (root, theo project id): `steps`, `files`, `load()`, `running` (step, hoạt động mới nhất, dòng text mới nhất), `generate(stepId)`, `stop()`, `setStatus()`. Trang Initial và trang Artifacts dùng chung store, nên chuyển trang khi đang chạy vẫn thấy tiến trình.

### 6.2 Initial phase → Overview (Phase progress)
- Step và artifact lấy từ **customization** (tên thật). Trạng thái từ `artifacts_list`. Một artifact có nhiều file thì chip hiện số file (ví dụ "Biên bản họp · 3"). Bỏ `DEFAULT_ARTIFACTS` cứng.
- Nút **Tạo bằng AI** (step chưa có file) / **Cập nhật bằng AI** (đã có):
  - Bị disable khi step trước chưa được generate (tooltip "Hãy tạo bước trước"), khi chưa có git hoặc CLI chưa kết nối / đăng nhập (tooltip dẫn tới App settings).
  - Step có file Approved → hộp thoại xác nhận "Các file được cập nhật sẽ về Draft".
  - Đang chạy: nút thành **Dừng**. Dưới step hiện hoạt động hiện tại (icon theo tool + đường dẫn) và dòng text mới nhất của agent. Các nút generate khác bị khoá.
  - Xong → toast "Đã cập nhật N file" kèm link "Xem". Tóm tắt của agent và cảnh báo hiện trong panel nhỏ dưới step tới khi đóng. Lỗi hoặc bị dừng → toast tương ứng; file agent đã ghi vẫn được giữ, hiện nhãn "Chưa commit".
- Click chip → trang Artifacts, chọn sẵn (`?path=` hoặc `?artifact=`).

### 6.3 Trang Artifacts (`pages/artifacts/`, đăng ký trong `PROJECT_PAGE_COMPONENTS`)
Port gọn từ `_proto/artifacts.html`:
- **Cột trái**: cây step → artifact → file. Artifact chưa có file hiện "Chưa tạo". Có chấm trạng thái, `v<n>`, ngày cập nhật, ô tìm kiếm, nhóm "Không còn trong quy trình".
- **Cột phải**: tên file, status badge, `v<n>`, "Cập nhật bởi Claude Code · sonnet · 27/11" hoặc "Sửa tay · 27/11". Nội dung render bằng `pc-markdown`.
- **Action**: đổi trạng thái (Draft / Review / Approved), Mở bằng VS Code, Mở thư mục, Copy Markdown. Generate chỉ chạy theo step, nên ở đây có link "Cập nhật bước này" dẫn về Initial.
- Empty state khi chưa có artifact nào.

### 6.4 i18n
Key mới cho cả `en.ts` / `vi.ts`.

## 7. Các bước thực hiện (commit dự kiến)

1. **refactor(desktop): shared CLI run for chats and agents**: tách hàm chạy, `Signal::Tool`, `ToolAccess::Agent`.
2. **feat(desktop): project git repository**: `history.rs`, init + `.gitignore` khi tạo project / lần đầu dùng, commit khi import / xoá source và lưu customization.
3. **feat(desktop): artifact catalog and review status**: `catalog.rs`, `artifacts_list/read/set_status/open/reveal`.
4. **feat(desktop): generate a step with the project CLI agent**: prompt (`resources/prompts/generate-step.{vi,en}.md`), `artifacts_generate` (Channel), dừng, commit / hoàn tác, run log.
5. **feat(ui): Initial phase generation with real artifact state**.
6. **feat(ui): Artifacts page**.
7. **docs**: `_proto/README.md`, plan.

Khi implement: agent **backend** (bước 1–4) và **frontend** (bước 5–6) chạy song song qua Herdr, cùng code theo một contract chung. Mình review rồi commit.

## 8. Quyết định đã chốt (review lần 1)

| # | Nội dung | Quyết định |
|---|----------|------------|
| Q1 | Số file biên bản họp | **Do instruction quyết định**, Procheck không ép. Mỗi artifact là một thư mục, chứa một hoặc nhiều file. |
| Q2, Q3 | Ai ghi file, quyền của CLI | **CLI tự ghi**, chạy như một agent (đọc + ghi trong `artifacts/initial/`). |
| Q4 | Xử lý khi có phần lỗi | **Do instruction quyết định**. Procheck chỉ xử lý phiên thành công / lỗi / dừng. |
| Q5 | Phiên bản | **Git nội bộ trong thư mục project**, commit sau mỗi phiên agent. |
| Q6 | Trạng thái | Đổi tay; file bị agent hoặc người dùng thay đổi → về Draft. |
| Q7 | Chạy đồng thời | Một phiên / project. |
| Q8 | Generate khi step trước chưa xong | **Không cho phép**: step trước phải đã có phiên generate thành công (không cần Approved). |
| Q9 | Chỗ xem artifact | Trang Artifacts + chip trên Phase progress. |
| Q10 | Source không đọc được | Liệt kê "không đọc được" trong prompt, cảnh báo trên UI. |
| Q11 | Tests | Không viết. |
| Q12 | Ô "Hướng dẫn thêm" | **Không**. |

## 9. Quyết định bổ sung (review lần 2)

| # | Câu hỏi | Quyết định |
|---|---------|------------|
| Q-A | Vị trí git | **`.git` ngay trong thư mục project** (đổi ở review lần 3), theo dõi cả sources. |
| Q-B | Phiên dừng / lỗi giữa chừng | **Giữ nguyên trong working directory**: không commit, không hoàn tác. Lần generate sau commit phần đó trước (§5.4). |
| Q-C | Điều kiện mở step sau | Step trước **đã được generate** (một phiên thành công), không cần Approved. |
| Q-D | Giới hạn ghi của agent | **Dùng git kiểm tra sau phiên** (mục 4.1b). Luật đường dẫn của Claude chỉ là lớp thêm. |

## 10. Quyết định bổ sung (review lần 4)

| # | Câu hỏi | Quyết định |
|---|---------|------------|
| Q-E | Source lớn | **Đưa vào `.gitignore`** (> 50 MB), kiểm tra bằng `sha256`. |
| Q-F | Agent sửa file ngoài artifacts | **Chỉ cảnh báo**, không tự khôi phục. |
