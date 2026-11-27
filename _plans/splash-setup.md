# Plan: Splash screen & công cụ đi kèm (Git, Claude Code, Codex)

> Trạng thái: **APPROVED v2** (splash chỉ tải Git; Claude / Codex tải trong App settings; Git = PortableGit, **đóng băng phiên bản**)
> Ngày: 2026-11-27 · Nhánh đề xuất: `feature/splash-setup` (tách từ `develop`)
> Tham khảo: `E:\Sources\projects\dreamy-studio` (`desktop/setup.manifest.json`, `desktop/src/infra/startup/*`, `angular/pages/splash/*`, `angular/features/setup/*`)

## 1. Bối cảnh

**Procheck hiện tại**
- CLI: `features/agents.rs::resolve_binary` tìm `claude` / `codex` theo **đường dẫn tuỳ chỉnh** trong App settings (`binPath`) → `PATH` → vài vị trí cài quen thuộc. App settings → Tích hợp agent hiển thị "đã cài / chưa cài", nguồn (Custom / Detected), version.
- Git: `repository.rs` và `artifacts/history.rs` gọi `git` trên `PATH` của người dùng. Không có git thì tính năng artifact bị tắt.
- Không có splash: app mở thẳng vào layout chính (`/projects`).
- Data dir: `%LOCALAPPDATA%\Procheck\`, hoặc cạnh file exe ở bản portable (`shared/env.rs`). CLI home riêng nằm ở `<data>\cli\<cli>\`.

**dreamy-studio làm thế nào**
- `desktop/setup.manifest.json` (nhúng bằng `include_str!`) liệt kê từng công cụ: `id`, `version`, `file`, `urls`, `sha256`, `size`, `format` (`raw` | `zip` | `tar.gz`), `root`, `entry`, `onDemand`. Trong đó **có sẵn Claude Code** (`claude.exe` raw từ `downloads.claude.ai`, ~400 MB) và **Codex** (`codex-package-…-windows-msvc.tar.gz` từ GitHub release, ~218 MB).
- `download.rs`: tải bằng `ureq` (rustls), file `.part`, **tải tiếp** bằng HTTP Range, tính hash trong lúc tải, có huỷ (`AtomicBool`), báo tiến trình mỗi 200 ms.
- `install.rs`: giải nén vào thư mục staging rồi đổi tên sang thư mục cài; ghi **file marker** (id, version, build) → `is_installed` chỉ đọc marker, không chạy exe.
- `setup.rs` / `models.rs`: một service chạy tuần tự các item, gửi event qua Tauri `Channel` (`snapshot`, `phase`, `item`, `progress`). Có `pause`, `import` gói offline (.zip).
- Angular: route splash riêng, `SetupService` giữ state, `splash.page` hiện danh sách item (pending → downloading → verifying → extracting → ready / error), tốc độ, lỗi theo mã.

## 2. Mục tiêu

| # | Mục tiêu |
|---|----------|
| G1 | Khi mở app, **splash screen** kiểm tra Git, Claude Code, Codex đã được cài **vào data dir của Procheck** chưa (đúng version trong manifest). Splash **chỉ tải Git** (bắt buộc); Claude / Codex chỉ hiện trạng thái kèm gợi ý "Tải trong Cài đặt → Tích hợp agent". |
| G2 | Thiếu thì **tải bản portable** về `<data>\tools\<id>\`: có tiến trình, tốc độ, kiểm tra sha256, tải tiếp khi mất mạng, thử lại. |
| G3 | **CLI**: Procheck chỉ dùng bản đã tải. App settings → Tích hợp agent bỏ phần dò CLI / đường dẫn tuỳ chỉnh, chỉ còn version, đăng nhập / đăng xuất, model. |
| G4 | **Git**: mọi lệnh git của Procheck dùng git đã tải, với **cấu hình riêng** của Procheck (không đọc / ghi `~/.gitconfig` của người dùng), được thiết lập ngay sau khi cài. |
| G5 | Git đã sẵn sàng → splash tự chuyển vào app (lần sau chỉ hiện chớp nhoáng), dù CLI chưa tải. |
| G6 | App settings → Tích hợp agent: nút **Tải xuống** / **Cập nhật** / **Cài lại** cho từng CLI, có tiến trình ngay trên thẻ CLI. Chat, Assistant và Generate báo "chưa tải CLI" kèm link tới đây. |

### Ngoài phạm vi
- macOS / Linux (manifest v1 chỉ có Windows x64, như dreamy-studio).
- Tự cập nhật công cụ khi có bản mới trên mạng: version **cố định trong manifest**, đổi khi phát hành Procheck mới.
- Gói offline (import .zip như dreamy-studio): để sau (Q6).
- Unit / Playwright tests.

## 3. Manifest & thư mục

`desktop/tools.manifest.json` (nhúng bằng `include_str!`), cùng định dạng với dreamy-studio:

| id | Nguồn | Định dạng | entry | Kích thước (ước tính) |
|----|-------|-----------|-------|-----------------------|
| `git` | Git for Windows release (`PortableGit-<v>-64-bit.7z.exe` hoặc `MinGit-<v>-64-bit.zip`, xem Q2) | `7z-sfx` / `zip` | `cmd\git.exe` (+ `bin\bash.exe` nếu PortableGit) | 60 MB (PortableGit) / 40 MB (MinGit) |
| `claude` | `https://downloads.claude.ai/claude-code-releases/<v>/win32-x64/claude.exe` | `raw` | `claude.exe` | ~400 MB |
| `codex` | `https://github.com/openai/codex/releases/download/rust-v<v>/codex-package-x86_64-pc-windows-msvc.tar.gz` | `tar.gz` | `bin\codex.exe` | ~220 MB |

Version và sha256 lấy từ release chính thức lúc implement (Claude / Codex có thể dùng đúng version dreamy-studio đang ghim: Claude 2.1.332, Codex 0.172.0).

```
<data dir>\
  tools\
    .downloads\              ← file .part / archive đang tải (xoá sau khi cài)
    git\    .procheck-tool.json   (marker: id, version, sha256, installedAt)
    claude\ claude.exe  .procheck-tool.json
    codex\  bin\codex.exe  .procheck-tool.json
  git\
    config                   ← cấu hình git riêng của Procheck (§5)
  cli\claude\ cli\codex\     ← CLI home (giữ nguyên)
```

- "Đã cài" = marker tồn tại **và** đúng version + sha256 của manifest **và** file `entry` tồn tại. Không chạy exe lúc kiểm tra, để splash nhanh.
- Bản portable (`shared/env.rs`) thì tools nằm cạnh exe như phần data còn lại.
- **Git đóng băng phiên bản**: đã có bản Git hợp lệ (marker + `entry` tồn tại) là dùng, kể cả khi manifest của bản Procheck sau ghi version khác. Không có luồng cập nhật Git; muốn đổi thì xoá `tools\git\` để splash tải lại.
- CLI (Claude / Codex): manifest đổi version → trạng thái "có bản mới", người dùng bấm **Cập nhật** trong App settings; cài xong mới xoá bản cũ.

## 4. Backend (Rust)

### 4.1 Module `infra/tools/` (port từ dreamy-studio, rút gọn)
- `manifest.rs`: đọc manifest, đường dẫn cài / entry / downloads.
- `download.rs`: `ureq` + rustls (dependency mới), `.part`, HTTP Range tải tiếp, sha256 khi tải, huỷ, tiến trình. Thử lần lượt các URL trong `urls`.
- `install.rs`: giải nén `zip` (crate `zip` đã có) / `tar.gz` (thêm `tar` + `flate2`) / `raw` (copy) / `7z-sfx` (chạy `PortableGit.exe -y -o<staging>` không hiện cửa sổ, nếu chọn PortableGit). Giải nén vào staging, đổi tên sang thư mục cài, ghi marker.
- `setup.rs`: `ToolsService` (Tauri state): `check() -> ToolsSnapshot`, `install(ids, channel)`, `cancel()`. Mỗi lần chỉ một tiến trình cài.
- Mã lỗi: `network`, `checksum`, `diskFull`, `extract`, `io`, `cancelled`, `busy`.

### 4.2 Đường dẫn công cụ cho toàn app
- `infra/tools::paths()` → `Tools { git: PathBuf, bash: Option<PathBuf>, claude: PathBuf, codex: PathBuf }`.
- `agents::resolve_binary` → luôn trả bản đã tải. Bỏ `custom` / `PATH` / known locations. `BinarySource` chỉ còn `Bundled`. `AgentError::NotInstalled` → "chưa tải" (UI dẫn về splash / nút "Tải lại").
- Mọi chỗ gọi `git` (`repository.rs`, `artifacts/history.rs`) đi qua một helper `infra/git.rs`: exe = git đã tải, env = cấu hình riêng (§5).
- Env khi chạy CLI:
  - Claude: `DISABLE_AUTOUPDATER=1` (bản ghim, không tự cập nhật đè lên), `CLAUDE_CODE_GIT_BASH_PATH=<tools>\git\bin\bash.exe` (Claude Code trên Windows cần Git Bash, xem Q2), thêm `<tools>\git\cmd` vào đầu `PATH` của tiến trình CLI để agent dùng đúng git.
  - Codex: tắt kiểm tra cập nhật lúc khởi động (`-c check_for_update_on_startup=false`), `PATH` như trên.

### 4.3 Commands

| Command | Input | Output |
|---------|-------|--------|
| `tools_check` | — | `ToolsSnapshot { items: ToolItem[], ready: boolean }` |
| `tools_install` | `{ ids: string[], onEvent: Channel<ToolsEvent> }` | `ToolsSnapshot` |
| `tools_cancel` | — | `bool` |

```ts
type ToolId = 'git' | 'claude' | 'codex';
type ToolState = 'missing' | 'outdated' /* chỉ CLI */ | 'pending' | 'downloading' | 'verifying' | 'extracting' | 'configuring' | 'ready' | 'error';
interface ToolItem { id: ToolId; version: string; size: number; state: ToolState; received: number; error: { code: string; message: string } | null; required: boolean }
type ToolsEvent =
  | { type: 'item'; item: ToolItem }
  | { type: 'progress'; id: ToolId; received: number; total: number; speed: number };
```

### 4.4 Chỗ bị bỏ / đổi
- App settings: bỏ `claude.binPath` / `codex.binPath` (giá trị cũ trong `settings.json` bị bỏ qua khi đọc).
- `agents_status`: không dò nữa; trả version của bản đã tải (đọc marker), trạng thái đăng nhập, models.
- `projects/repository.rs::inspect` (repo người dùng liên kết): cũng dùng git đã tải.

## 5. Thiết lập git ban đầu

Ngay sau khi cài git (state `configuring`), Procheck ghi `<data>\git\config`. Mọi lệnh git của Procheck chạy với:
- `GIT_CONFIG_GLOBAL=<data>\git\config`, `GIT_CONFIG_NOSYSTEM=1`: không đọc `~/.gitconfig` hay system config của người dùng.
- `GIT_TERMINAL_PROMPT=0`: không bao giờ treo chờ nhập.
- `HOME` / `USERPROFILE` giữ nguyên (ssh key, credential manager của người dùng vẫn dùng được nếu sau này cần push).

Nội dung `config`:
```ini
[user]
    name = Procheck
    email = procheck@local
[init]
    defaultBranch = main
[core]
    autocrlf = false        ; artifact viết bởi agent giữ nguyên LF, hash ổn định
    quotepath = false       ; đường dẫn tiếng Việt
    longpaths = true
    fsmonitor = false
[safe]
    directory = *           ; project nằm ở bất kỳ đâu, kể cả ổ khác / ổ mạng
[commit]
    gpgsign = false
[advice]
    detachedHead = false
```
- Các tham số `-c user.name=…`, `-c core.quotepath=false`… đang truyền trong `history.rs` có thể bỏ, vì config này đã có.
- Kiểm tra sau khi ghi: `git --version` + `git config --global --get user.name` với env trên.

## 6. Frontend (Angular)

### 6.1 Prototype trước
`_proto/splash.html` theo phong cách proto hiện tại (tokens, logo KMS), để review giao diện trước khi code. Gồm các trạng thái: đang kiểm tra · thiếu công cụ (danh sách + dung lượng + nút Tải) · đang tải (thanh tiến trình từng item, tốc độ, thời gian còn lại, Tạm dừng / Huỷ) · lỗi (mã lỗi, Thử lại) · xong (tự vào app).

### 6.2 App
- Route `/splash` **ngoài** `MainLayoutComponent` (không sidebar / topbar), là route mặc định khi khởi động. Guard: các route khác chuyển về splash cho tới khi **Git** `ready`.
- `features/tools/tools.service.ts` + `tools.store.ts` (state, tiến trình, lỗi).
- `pages/splash/`: logo, tên app + version, danh sách 3 công cụ (icon, tên, vai trò, version, dung lượng, trạng thái). Chỉ Git có nút **Tải xuống** / **Thử lại** / **Huỷ** và tiến trình; Claude / Codex hiện "Đã cài" hoặc "Chưa tải · tải trong Cài đặt". Git sẵn sàng → chuyển vào `/projects`.
- App settings → Tích hợp agent: bỏ ô đường dẫn, nút "Dò lại" và nhãn Custom / Detected. Thêm dòng "Phiên bản đi kèm: Claude Code 2.1.332", nút **Tải xuống** (chưa có) / **Cập nhật** (manifest đổi version) / **Cài lại**, chạy `tools_install` cho CLI đó với tiến trình, tốc độ, Huỷ ngay trên thẻ. Đăng nhập chỉ bật khi CLI đã tải.
- App settings → Lưu trữ: thêm dòng `tools\` (dung lượng) vào danh sách thư mục data.
- i18n en / vi.

## 7. Các bước thực hiện (commit dự kiến)

1. **docs(proto): splash screen prototype** (`_proto/splash.html`) → review giao diện.
2. **feat(desktop): bundled tools manifest, download and install**: `infra/tools/*`, commands.
3. **feat(desktop): use bundled CLIs and git with Procheck's git config**: `resolve_binary`, `infra/git.rs`, env khi chạy CLI, bỏ `binPath`.
4. **feat(ui): splash screen with tool setup**.
5. **feat(ui): agent settings use bundled CLIs**.
6. **docs**: `_proto/README.md`, plan.

## 8. Quyết định (review lần 1)

| # | Câu hỏi | Quyết định |
|---|---------|------------|
| Q1 | Splash tải gì? | **Chỉ Git** (bắt buộc). Claude / Codex tải trong App settings → Tích hợp agent. |
| Q2 | Git: **PortableGit** (~60 MB, có `bash.exe`) hay **MinGit** (~40 MB, không có bash)? | **PortableGit** (Git for Windows đầy đủ, bản portable): Claude Code trên Windows cần Git Bash (`CLAUDE_CODE_GIT_BASH_PATH`). Giải nén bằng chính file `.7z.exe` tự giải nén, không cần thêm thư viện 7z. Sẽ kiểm tra lại yêu cầu Git Bash với Claude Code 2.1.x lúc implement. |
| Q3 | Tự động bắt đầu tải khi mở splash, hay chờ người dùng bấm **Tải xuống**? | **Chờ bấm**, hiện rõ dung lượng. |
| Q4 | Tắt tự cập nhật của Claude / Codex để dùng đúng bản ghim? | **Có**. Version chỉ đổi khi Procheck phát hành bản mới. |
| Q9 | Cập nhật Git? | **Không**: đóng băng phiên bản Git, bỏ luồng cập nhật trên splash (review lần 2). |
| Q5 | Bản cũ (CLI người dùng tự cài trên `PATH`) có còn dùng được không, ví dụ khi tải thất bại? | **Không**, theo yêu cầu "mặc định dùng cái đã tải về". Tải lỗi thì ở lại splash với nút Thử lại. |
| Q6 | Gói offline (import .zip chứa các file cài, cho máy không có mạng / bị chặn GitHub) như dreamy-studio? | **Để sau**. |
| Q7 | Commit author trong git của Procheck: cố định `Procheck`, hay hỏi tên / email người dùng ở splash? | **Cố định `Procheck`** như hiện tại. |
| Q8 | Tests | Không viết (như các đợt trước). |
