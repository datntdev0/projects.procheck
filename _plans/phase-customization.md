# Plan: Implement Phase Customization (Project settings → Customization)

> Trạng thái: **APPROVED v2** (Q10: tự dịch prompt VI · Q11: ẩn tab Scaffolding / SDLC)
> Ngày: 2026-11-27 · Nhánh đề xuất: `feature/phase-customization` (tách từ `develop`)

## 1. Bối cảnh

Commit `c1e95ca` / `9748b67` đã có **UI prototype** cho Customization:

- `_proto/project-settings.html` + `_proto/assets/workflow.js`: prototype HTML, chứa nội dung mặc định (`INSTR`, `SEED`, `PROMPT`).
- `angular/pages/project-settings/sections/customization/*`: component Angular đã dựng xong UI (tab theo phase, phase prompt, step card có instructions + danh sách artifact + đính kèm template).

Nhưng hiện tại **chỉ là UI**: state nằm trong signal của `CustomizationSectionComponent`, không load / save, file đính kèm chỉ lấy `name` + `size`, không có template mặc định nào, và backend (`desktop/src/features/projects`) chưa biết gì về `customization`.

## 2. Mục tiêu

| # | Yêu cầu | Kết quả mong đợi |
|---|---------|------------------|
| G1 | Viết instruction cho từng step | Instructions (và phase prompt) của **Initial phase** được lưu vào `<project>\.procheck\settings.json` → `customization`, load lại đúng khi mở lại app. |
| G2 | Upload mẫu tài liệu (`.md`) | Mỗi artifact có thể gắn / thay / gỡ 1 template `.md`. File được copy vào `<project>\.procheck\templates\`. Chỉ chấp nhận `.md`. |
| G3 | Default template + instruction trong source code, seed khi tạo project | Template (`.md`) và instruction mặc định nằm trong repo, có **2 ngôn ngữ (vi / en)**. Lúc tạo project, người dùng chọn **ngôn ngữ tài liệu**; Procheck seed template + instruction + tên artifact theo ngôn ngữ đó. |

### Nội dung mặc định được seed (giống proto `_proto/assets/workflow.js`)

| Step | Instruction mặc định | Artifact | Template mặc định |
|------|----------------------|----------|-------------------|
| 1. Khám phá (`discovery`) | `INSTR.discovery` | Biên bản họp / Meeting notes (`meeting`) | `meeting-notes.md` |
| | | Báo cáo khám phá / Discovery report (`disc`) | `discovery-report.md` |
| 2. Yêu cầu (`requirements`) | `INSTR.requirements` | Yêu cầu nghiệp vụ / Business requirements (`brd`) | `business-requirements.md` |
| 3. Phạm vi (`scope`) | `INSTR.scope` | Định nghĩa phạm vi / Scope definition (`scope`) | `scope-definition.md` |
| 4. Ước tính (`estimation`) | `INSTR.estimation` | Ước tính công sức / Effort estimation (`est`) | `effort-estimation.md` |
| 5. Đề xuất & ký SOW (`signoff`) | `INSTR.signoff` | SOW / Đề xuất (`sow`) | — *(proto không có template; người dùng tự upload)* |

Phase prompt mặc định: `PROMPT` của Initial trong proto. Proto chỉ có bản **EN** → mình sẽ dịch thêm bản **VI** (xem Q1).

### Ngoài phạm vi (non-goals)

- **Scaffolding và SDLC**: không lưu, không seed. Cách hiển thị tab của 2 phase này: xem Q11.
- **Project đã tạo trước tính năng này**: không migrate / seed bù. Customization của project không có dữ liệu sẽ hiện empty state.
- **Đồng bộ khi Procheck đổi nội dung mặc định ở version sau**: không xử lý.
- **Đổi ngôn ngữ tài liệu sau khi tạo project** (không seed lại).
- Assistant **sử dụng** instructions/templates khi generate artifact (pipeline generate chưa có). Plan này chỉ định nghĩa **cách lưu** để phần generate đọc sau (xem §8).
- Sửa nội dung template ngay trong app (editor). Chỉ upload / thay / gỡ / xem trước.
- Thêm / xóa / sắp xếp **step**. Artifact thì thêm / xóa được.
- Template dạng `.docx`, `.pdf`,… (prototype cho mọi loại file → thu hẹp còn `.md`).
- **Unit tests và Playwright tests**: không viết trong đợt này.

## 3. Thiết kế lưu trữ

### 3.1 Ngôn ngữ tài liệu của project

- Wizard **New project** (bước Basics, `angular/pages/new-project/steps/basics-step.component.ts`) thêm field **Ngôn ngữ tài liệu**: `Tiếng Việt` / `English`, mặc định = ngôn ngữ UI hiện tại.
- `NewProject` thêm `documentLanguage: 'vi' | 'en'`; `ProjectManifest` (`procheck.json`) thêm `documentLanguage`.
- Project Settings → General hiển thị **read-only** (không đổi được, vì không seed lại).

### 3.2 Cấu trúc thư mục project

```
<project dir>\
  procheck.json              ← thêm "documentLanguage"
  .procheck\
    settings.json            ← thêm "customization"
    templates\
      initial\
        meeting.md           ← <artifactId>.md
        disc.md
        brd.md
        scope.md
        est.md
        a-3f9c2e1b.md        ← template của artifact người dùng tự thêm
```

- File lưu theo **artifact id** (không theo tên gốc) để tránh trùng tên / ký tự lạ; tên gốc lưu trong metadata để hiển thị.
- `ProjectDirectories` thêm `templates_dir()` và `template_file(phase, artifact_id)`.

### 3.3 Schema `settings.json`

Instruction, prompt và tên artifact được **ghi thành text cụ thể** lúc seed (theo ngôn ngữ tài liệu), không còn quy ước `null` = mặc định.

```jsonc
{
  "cli": "claude",
  "model": null,
  "customization": {
    "schemaVersion": 1,
    "phases": {
      "initial": {
        "prompt": "Bạn là trợ lý khám phá cho {project} ({client}). …",
        "steps": [
          {
            "id": "discovery",
            "instructions": "Viết biên bản cho từng cuộc họp: …",
            "artifacts": [
              {
                "id": "meeting",              // id mặc định, hoặc "a-<8 hex>" cho artifact tự thêm
                "name": "Biên bản họp",
                "template": {
                  "file": "initial/meeting.md",   // relative tới .procheck\templates\
                  "name": "meeting-notes.md",     // tên hiển thị (tên file gốc)
                  "size": 2140,
                  "origin": "default",            // "default" | "custom"
                  "updatedAt": "2026-11-27T09:00:00Z"
                }
              }
            ]
          }
        ]
      }
    }
  }
}
```

- Giữ map `phases` (chỉ có `initial`) để sau này thêm `release` / `sdlc` không phải đổi schema.
- Không có field `off`: step của Initial phase không tắt được.
- `origin: "default"` để hiển thị badge "Mặc định" và cho phép "Khôi phục mặc định".
- **"Khôi phục mặc định"** (instruction, prompt, template, reset cả phase) lấy nội dung mặc định **theo `documentLanguage` của project**, không theo ngôn ngữ UI. Vì không còn `null`, UI so sánh text hiện tại với bản mặc định để hiện tag "Tùy chỉnh".

## 4. Backend (Rust, `desktop/src`)

### 4.1 Nội dung mặc định trong source

```
desktop/resources/defaults/initial/
  vi/
    customization.json       ← prompt, instructions từng step, tên artifact (VI)
    meeting-notes.md
    discovery-report.md
    business-requirements.md
    scope-definition.md
    effort-estimation.md
  en/
    customization.json       ← bản EN
    (5 file .md như trên)
```

- `customization.json` chứa prompt, instructions và tên artifact, copy từ `_proto/assets/workflow.js` (`PROMPT`, `INSTR`, `SEED`).
- Nhúng bằng `include_str!` → không cần khai báo resource trong `tauri.conf.json`, chạy được cả bản portable và installer.
- Module mới `features/projects/customization.rs` (+ `customization/defaults.rs`):
  - Các struct `Customization / PhaseCustomization / StepCustomization / ArtifactCustomization / TemplateRef` (serde camelCase, khớp §3.3).
  - `defaults::initial(lang) -> PhaseCustomization`.
  - `defaults::template(lang, artifact_id) -> Option<(&'static str /*file name*/, &'static str /*content*/)>`.
- Sau khi có bản Rust, i18n Angular `cz.initial.*.instr` / `cz.initial.prompt` **không còn dùng** cho Initial → xóa, để nội dung mặc định chỉ nằm ở một nơi.

### 4.2 Seed khi tạo project

Trong `create.rs::write_project`, ngay sau bước `CreateProgress::Settings`:

1. `customization::seed(&dirs, lang)` → ghi 5 file template vào `.procheck\templates\initial\`, trả về `Customization` có prompt / instructions / tên artifact theo `lang` và `template` trỏ tới các file vừa ghi.
2. `ProjectSettings` thêm `#[serde(default, skip_serializing_if = "Option::is_none")] customization: Option<Customization>` → ghi cùng `settings.json`.
3. `ProjectManifest` thêm `document_language`. Field `#[serde(default)]` để `procheck.json` của project cũ vẫn đọc được.
4. Rollback hiện tại đã dọn toàn bộ thư mục khi lỗi → không cần thêm gì.

### 4.3 Commands mới (`commands/customization.rs`)

| Command | Input | Output | Ghi chú |
|---------|-------|--------|---------|
| `projects_customization_get` | `id` | `{ customization: Customization \| null, defaults: PhaseCustomization }` | `defaults` theo `documentLanguage`, để UI so sánh / khôi phục. `null` với project cũ → empty state. |
| `projects_customization_save` | `id`, `customization`, `templates: TemplateChange[]` | `Customization` | Ghi template trước, rồi `settings.json` (atomic qua `json_file::write`), cuối cùng xóa file template mồ côi. |
| `projects_template_read` | `id`, `artifactId` | `{ name, content }` | Cho dialog "Xem trước". |

```ts
type TemplateChange =
  | { artifactId: string; action: 'upload'; name: string; content: string } // nội dung .md (UTF-8)
  | { artifactId: string; action: 'remove' }
  | { artifactId: string; action: 'restoreDefault' };                        // copy lại bản mặc định theo documentLanguage
```

Upload gửi **nội dung text** qua IPC (frontend đọc bằng `File.text()`). Nhờ vậy file picker HTML và drag-drop trên row dùng chung một luồng, không cần đường dẫn file.

### 4.4 Validation (trả `CommandError` với code riêng)

| Rule | Code |
|------|------|
| Đuôi file phải là `.md` (không phân biệt hoa thường) | `templateType` |
| Kích thước ≤ **1 MB** | `templateTooLarge` |
| Đúng 5 step của Initial, đúng thứ tự | `invalidCustomization` |
| Artifact id duy nhất; tên artifact không rỗng | `invalidCustomization` |
| `restoreDefault` chỉ hợp lệ với artifact có template mặc định | `invalidCustomization` |
| Project không ready / chưa có customization | `notReady` / `notSupported` |

## 5. Frontend (Angular)

### 5.1 Model & service

- `customization.model.ts`: đổi sang khớp schema backend: artifact có `id` (bỏ `key` sinh ở client), `name: string`, `template: TemplateRef | null`, `instructions: string`, `prompt: string`. Thêm trạng thái pending ở client (`pendingUpload`, `pendingRemove`, `pendingRestore`).
- `features/projects/customization.service.ts` (mới): bọc 3 command IPC.
- `ProjectCustomizationForm` (mới, `@Injectable()` cung cấp ở page giống `ProjectSettingsForm`): giữ `saved`, `draft`, `defaults`; có `dirty()`, `save()`, `discard()`.
- `projects.model.ts`: `NewProject.documentLanguage`, `ProjectManifest.documentLanguage`.

### 5.2 Tích hợp save bar

- Save bar của Project settings hiện chỉ theo `form.dirty()` (General). Đổi thành `general.dirty() || customization.dirty()`. **Lưu** gọi cả hai, **Hủy** bỏ thay đổi ở cả hai.
- File template upload được **giữ tạm trong bộ nhớ** tới khi bấm Lưu, nên Hủy là bỏ được.

### 5.3 UI thay đổi so với hiện tại

| Chỗ | Thay đổi |
|-----|----------|
| New project → Basics | Field **Ngôn ngữ tài liệu** (segmented VI / EN). Summary hiển thị lựa chọn. |
| Project settings → General | Hiển thị Ngôn ngữ tài liệu (read-only). |
| `CustomizationSectionComponent` – tab Initial | Load từ service thay vì `defaults()` trong component; mọi `patch*` ghi vào form draft. Tag "Tùy chỉnh" / nút "Khôi phục mặc định" dựa trên so sánh với `defaults`. Project cũ (`customization: null`) → empty state. |
| Tab Scaffolding / SDLC | **Ẩn** (Q11). Customization chỉ còn Initial phase; giữ code định nghĩa phase để sau bật lại. |
| `StepArtifactRowComponent` | `<input type="file" accept=".md,text/markdown">`. Drop file không phải `.md` hoặc quá 1 MB → toast lỗi, không đính kèm. Badge **Mặc định** khi `origin === 'default'`. Nút **Xem** mở dialog dùng `pc-markdown` có sẵn (`pages/chats/markdown.component.ts`). Artifact mặc định đã bị thay template → có thêm action **Khôi phục template mặc định**. |
| Reset phase | Draft = `defaults` + `restoreDefault` cho mọi artifact có template mặc định. |
| Note cuối section | Cập nhật text: chỉ nhận `.md`. |
| i18n (`en.ts`, `vi.ts`) | Key mới: ngôn ngữ tài liệu, lỗi định dạng, quá dung lượng, badge Mặc định, Xem trước, Khôi phục template mặc định, empty state, lưu thành công / thất bại. Xóa `cz.initial.*.instr`, `cz.initial.prompt`. |

## 6. Nội dung default template

Mỗi file có **2 bản (vi, en)**, cùng cấu trúc. Template là **khung cấu trúc cho AI làm theo**, không phải để điền tự động (mail-merge). Hướng dẫn cho AI viết trong comment `<!-- … -->` để không lẫn vào output.

**`meeting-notes.md`: Biên bản họp / Meeting notes**
1. Thông tin cuộc họp (tiêu đề, ngày giờ, hình thức, người chủ trì, người tham dự phía khách hàng / phía KMS)
2. Mục tiêu cuộc họp
3. Nội dung thảo luận (theo chủ đề, kèm nguồn: transcript / tài liệu)
4. Quyết định đã thống nhất
5. Việc cần làm (bảng: Việc · Người phụ trách · Hạn)
6. Câu hỏi còn mở
7. Nguồn tham chiếu

**`discovery-report.md`: Báo cáo khám phá / Discovery report**
1. Tóm tắt
2. Bối cảnh & mục tiêu kinh doanh của khách hàng
3. Các bên liên quan
4. Phát hiện theo chủ đề (mỗi phát hiện có trích nguồn)
5. Mâu thuẫn giữa các nguồn
6. Câu hỏi làm rõ
7. Ứng viên yêu cầu (requirement candidates)
8. Giả định & rủi ro ban đầu
9. Phụ lục: danh sách nguồn đã dùng

**`business-requirements.md`: Yêu cầu nghiệp vụ / Business requirements**
1. Giới thiệu (mục đích, phạm vi tài liệu, thuật ngữ)
2. Tổng quan nghiệp vụ & quy trình hiện tại / mong muốn
3. Vai trò người dùng
4. Yêu cầu chức năng (bảng: ID · Mô tả · Ưu tiên MoSCoW · Nguồn)
5. User stories & tiêu chí chấp nhận
6. Yêu cầu phi chức năng (hiệu năng, bảo mật, khả dụng, tuân thủ…)
7. Tích hợp & dữ liệu
8. Ràng buộc & giả định
9. Ma trận truy vết nguồn

**`scope-definition.md`: Định nghĩa phạm vi / Scope definition**
1. Tóm tắt phạm vi
2. Trong phạm vi (bảng: Yêu cầu ID · Hạng mục · Ghi chú)
3. Để sau (phase / release sau)
4. Ngoài phạm vi
5. Giả định
6. Phụ thuộc
7. Rủi ro
8. Tiêu chí hoàn thành / nghiệm thu
9. Nhật ký quyết định

**`effort-estimation.md`: Ước tính công sức / Effort estimation**
1. Phương pháp ước tính & đơn vị (man-day)
2. Phân rã hạng mục (bảng: Hạng mục · Mô tả · Lạc quan · Khả dĩ · Bi quan · PERT)
3. Công việc chung (PM, QA, DevOps, UAT…)
4. Tổng hợp theo kịch bản
5. Đội ngũ đề xuất
6. Mốc bàn giao
7. Giả định
8. Rủi ro & buffer

## 7. Các bước thực hiện (thứ tự commit dự kiến)

1. **feat(desktop): bilingual initial-phase defaults**: `desktop/resources/defaults/initial/{vi,en}/` (customization.json + 5 template) + `customization/defaults.rs`.
2. **feat(desktop): document language and seeding on project create**: `documentLanguage` trong `NewProject` / manifest, struct customization, `seed()` trong `create.rs`, `ProjectDirectories::templates_dir`.
3. **feat(desktop): customization commands**: `get`, `save`, `template_read`, validation, đăng ký command.
4. **feat(ui): document language in New project wizard**: field Basics, summary, hiển thị read-only ở General.
5. **feat(ui): load/save initial-phase customization**: service, form, nối save bar, chuyển component sang dữ liệu thật, empty state, ghi chú cho tab Scaffolding / SDLC.
6. **feat(ui): markdown template upload, preview, restore default**: row component, dialog xem trước, i18n.
7. **docs**: cập nhật `_proto/README.md` dòng "Phase customization" (chỉ `.md`, ngôn ngữ tài liệu, nội dung mặc định được seed).

## 8. Gợi ý cho phần generate artifact sau này

Khi xây Generate/Update with AI, prompt cho một artifact = phase prompt + step instructions + nội dung `.procheck\templates\initial\<artifactId>.md` (nếu có) + sources liên quan. Toàn bộ đã nằm trong project (settings.json + templates). CLI chạy với cwd là thư mục project nên đọc thẳng bằng đường dẫn tương đối, không phụ thuộc i18n của UI.

## 9. Quyết định đã chốt (review lần 1)

| # | Nội dung | Quyết định |
|---|----------|------------|
| Q1 | Ngôn ngữ default template | **Hai thứ tiếng**, chọn **ngôn ngữ tài liệu** lúc tạo project. |
| Q2 | Instruction mặc định | **Có nội dung theo từng step** (lấy từ proto), seed thành text vào settings.json. |
| Q3 | Upload stage hay ghi ngay | Giữ tạm tới khi bấm **Lưu**. |
| Q4 | Giới hạn dung lượng | **1 MB**. |
| Q5 | Phạm vi phase | **Chỉ Initial**. Scaffolding / SDLC out of scope. |
| Q6 | Step 5 SOW | **Dùng template và instruction giống proto** (có instruction, không có template mặc định). |
| Q7 | Seed cho project cũ | Out of scope. |
| Q8 | Đồng bộ khi default đổi ở version sau | Out of scope. |
| Q9 | Khung template §6 | OK. |
| — | Tests | **Không viết** unit tests / Playwright tests. |

## 10. Quyết định bổ sung (review lần 2)

| # | Câu hỏi | Đề xuất của mình |
|---|---------|------------------|
| Q10 | Phase prompt bản VI | **Chốt**: tự dịch, review trong PR. |
| Q11 | Tab Scaffolding / SDLC | **Chốt**: ẩn. |
