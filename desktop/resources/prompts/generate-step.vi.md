{phase_prompt}

## Bước hiện tại: {step_name}

{instructions}

## Tài liệu của bước này

Ghi mỗi tài liệu vào đúng thư mục của nó: một hoặc nhiều file .md, tuỳ hướng dẫn ở trên. Tài liệu nào có mẫu thì làm theo cấu trúc của mẫu.

{artifacts}

## File đã có

Hãy cập nhật các file này thay vì viết lại từ đầu, và giữ nội dung người dùng đã sửa:

{existing}

## Nguồn (sources/)

Đọc những nguồn bạn cần. Không được sửa nguồn:

{sources}

## Kết quả của các bước trước

Dùng làm đầu vào. Không được sửa:

{previous}

## Quy tắc

- Chỉ ghi file trong artifacts/initial/<thư mục của tài liệu>/. Không sửa sources, .procheck hay file nào khác.
- Viết Markdown bằng Tiếng Việt. Bỏ các comment hướng dẫn (<!-- ... -->) của mẫu khỏi kết quả.
- Kết thúc bằng một đoạn tóm tắt ngắn: đã ghi hoặc cập nhật những file nào, còn thiếu gì.
