# projects.procheck

**Project Vision:** Cung cấp công cụ giúp hỗ trợ trong quy trình phát triển phần mềm. Từ giai đoạn đầu tiên gặp gỡ khách hàng cho đến giai đoạn vận hành và phát triển sản phẩm qua các mô hình quản lý phát triển phần mềm SDLC.

**Solution Idea:**
- Project Initial Phase: Thu thập, lưu trữ thông tin làm việc với khách hàng. Xây dựng các tài liệu tạo tác qua các bước để có thể finalize được quyết định phạm vi thực hiện của khách hàng với dự án.
- Project First Release: Từ các thông tin đã finalize với khách hành trên phạm vi first release của dự án. Lên technical solution chi tiết và xây dựng scaffolding, codebase, repository structure, infrastructure, pipelines,...
- Project Development: Hệ thống agentic harness kết nối vào các CLI tools như claude, codex để có thể tăng tốc độ và chất lượng của quy trình phát triền phần mềm qua các incremental delivery.

**Constrains:**
- Các chức năng cần sử dụng AI tools sẽ sử dụng CLI tools đã kết nối
- Có Assistant là wraper layer giúp tương tác với model của các CLI tools
- Khi kết nối tới CLI tools, cần isolate lại context bằng cách chuyển HOME directory.
- Có lưu lại chat history với Assistant

## Key user journeys

### Project Initial phase:
    
1. User tạo new project 
2. User có thể upload các tài liệu đang có lên
3. User có thể dùng Assisstant để nó tư vấn theo quy trình của initial phase
4. Assistant có thể giúp AI tạo mới, chỉnh sửa tài liệu artifacts
5. User có thể xem output và export các tài liệu ra các định dạng

### Project Scaffolding phase:

1. Tiếp tục trên một project hoặc tạo mới project
2. User có thể thêm tài liệu mới
3. User có thể dùng Assisstant để nó tư vấn theo quy trình của thiết kế kiến trúc
4. User có thể kết nối tới một repository đang có trên máy tính
5. Assistant có thể giúp AI xây dựng scaffolding, codebase, repo structure

### Project SDLC phase:

1. Tiếp tục trên một project hoặc tạo mới project
2. User có thể thêm tài liệu mới có thể là tài liệu về new feature
3. Project có kanban board để quản lý tasks cần làm
4. User chọn task cần làm, lên thiết kế solution và plan
5. Agent tạo worktree để implement cho task và tự verify e2e outcome
6. Human review (changes, evidence) do Agent cung cấp và quyết định promote lên PR

## Key capabilities

- Project management
- Project workflow: initial phase, first release, lifecycle
- Artifact management
- Agentic harness
- Configuration
