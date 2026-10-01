# Gia phả gia đình

Một ứng dụng gia phả static, client-side, thiết kế để triển khai trực tiếp trên GitHub Pages. Website không có backend, không analytics, không tracking và không cần bước build.

## Chạy local

Web Crypto và `fetch()` cần một origin HTTP. Không nên mở `index.html` bằng `file://`.

```bash
python3 -m http.server 8080
```

Sau đó mở <http://localhost:8080/>.

Không có dependency npm hay framework frontend. Font hiển thị dùng Google Fonts khi có mạng; nếu offline, hệ thống sẽ tự dùng font fallback hỗ trợ tiếng Việt.

## Đăng nhập mẫu

Repository có sẵn một `data.enc` nhỏ để kiểm tra giao diện:

- Tên đăng nhập: `donghothe`
- Mật khẩu: xem thông tin được cung cấp riêng, không lưu trong repository.

Đây chỉ là dữ liệu demo. Trước khi public website thật, hãy thay toàn bộ dữ liệu và mật khẩu bằng quy trình bên dưới.

## Cập nhật dữ liệu

1. Tạo một file nguồn riêng trên máy cá nhân, ví dụ `family-data.json`. File này không được đặt trong repository public.
2. Mở `tools/encrypt.html`. Có thể mở qua web server local hoặc mở trực tiếp bằng trình duyệt; công cụ không gọi network.
3. Dán JSON, nhập mật khẩu mới hai lần và bấm **Mã hóa & tải xuống**.
4. Đổi tên file tải xuống thành `data.enc`, chép đè file `data.enc` ở thư mục gốc.
5. Commit/push chỉ `data.enc`, không commit `family-data.json` plaintext.

Mỗi lần mã hóa tạo salt và IV ngẫu nhiên mới. Mật khẩu không xuất hiện trong source JavaScript và không được lưu vào localStorage.

## Schema dữ liệu

Schema tối thiểu:

```json
{
  "auth": { "username": "ten-dang-nhap" },
  "family": {
    "name": "Tên gia đình",
    "heroTitle": "Gốc rễ của chúng ta",
    "description": "Mô tả ngắn",
    "rootPersonId": "p001"
  },
  "members": [
    {
      "id": "p001",
      "fullName": "Tên thành viên",
      "gender": "male",
      "birthDate": "1950-01-01",
      "deathDate": null,
      "birthPlace": "Địa điểm",
      "occupation": "Nghề nghiệp",
      "generation": 2,
      "fatherId": null,
      "motherId": null,
      "spouseIds": [],
      "siblingIds": [],
      "siblingOrder": 1,
      "note": ""
    }
  ]
}
```

Chỉ cần nhập `fatherId`, `motherId`, `spouseIds` và tùy chọn `siblingIds`. Ứng dụng tự suy ra con cái, anh/chị/em ruột dùng chung cha hoặc mẹ, tổ tiên, hậu duệ, thế hệ và nhánh. `spouseIds` và `siblingIds` có thể có nhiều phần tử; không có quan hệ tương ứng cũng hợp lệ.

Công cụ encrypt kiểm tra ID trùng, tham chiếu không tồn tại, tự tham chiếu, spouse trùng, vòng lặp cha/mẹ và cảnh báo spouse chưa đối xứng. Lỗi nghiêm trọng sẽ chặn mã hóa.

## Đổi mật khẩu

Mật khẩu không thể “đổi trực tiếp” trên website. Hãy dùng JSON nguồn riêng, mở `tools/encrypt.html`, nhập mật khẩu mới, tải `data.enc` mới rồi thay file cũ.

Nếu mất mật khẩu, dữ liệu đã mã hóa không thể khôi phục bằng ứng dụng. Vì vậy cần backup JSON nguồn và mật khẩu ở nơi an toàn, riêng biệt với repository.

## Deploy GitHub Pages

1. Tạo repository public/private phù hợp với nhu cầu của gia đình.
2. Push các file website và `data.enc` đã mã hóa.
3. Vào **Settings → Pages**, chọn deploy từ branch chứa source, thư mục `/ (root)`.
4. Mở URL dạng `https://USERNAME.github.io/REPOSITORY/`.

Tất cả asset trong website dùng đường dẫn tương đối (`./...`), nên hoạt động dưới subpath GitHub Pages. Không cần sửa `base URL`.

## Bảo mật và giới hạn của static site

Đây là lớp bảo vệ client-side, không phải authentication cấp server. Người biết mật khẩu vẫn có thể giải mã dữ liệu; GitHub Pages vẫn là một website public và file `data.enc` có thể được tải xuống. Mục tiêu là không để dữ liệu gia phả ở dạng plaintext trong repository và ngăn người xem thông thường mở dữ liệu.

Password dùng PBKDF2-SHA-256 để derive khóa AES-256-GCM. Dữ liệu sau khi giải mã chỉ nằm trong memory của tab, không ghi vào localStorage và reload sẽ yêu cầu đăng nhập lại. Logout xóa object dữ liệu khỏi session memory và quay về màn hình login.

Không commit các file sau lên repository public:

- JSON gia phả plaintext.
- Ghi chú có chứa mật khẩu.
- Backup chưa mã hóa.
- Ảnh hoặc tài liệu riêng tư nếu không muốn chúng có thể được tải trực tiếp.

## Tính năng giao diện

- SVG tree tự layout theo thế hệ và quan hệ cha/mẹ/vợ/chồng.
- Pan, zoom, pinch zoom, double tap và fit tree.
- Chọn thành viên để re-center, mở drawer, xem quan hệ và highlight dòng trực hệ.
- Tìm kiếm có dấu/không dấu tiếng Việt.
- Tree View và Members View.
- Light / Dark / System theme.
- Responsive mobile với bottom sheet, touch target lớn và mobile menu.
- Keyboard navigation, focus state, Escape đóng drawer, `Cmd/Ctrl + K` mở search và hỗ trợ reduced motion.

## Ghi nhớ đăng nhập

Tùy chọn **Ghi nhớ đăng nhập** dùng một `CryptoKey` AES không extractable được lưu trong IndexedDB của đúng origin, không lưu password plaintext vào localStorage, sessionStorage hay cookie. Khi reload, ứng dụng dùng khóa này để mở lại `data.enc` tự động.

Đây chỉ là tiện lợi trên thiết bị cá nhân, không phải authentication cấp server. Người có quyền truy cập vào browser profile hoặc thiết bị có thể có khả năng truy cập session đã ghi nhớ. Dữ liệu gia phả vẫn luôn phải là `data.enc` đã mã hóa.

Logout sẽ xóa cả dữ liệu trong memory và remembered session, vì vậy lần mở tiếp theo sẽ yêu cầu nhập lại mật khẩu.

## Ảnh thành viên

Ảnh không nằm trong `data.enc`. Đặt ảnh thủ công tại `assets/members/` với tên được tính tự động từ toàn bộ họ tên không dấu và năm sinh:

```text
Nguyễn Văn Minh + birthDate 1990-05-12
→ assets/members/nguyenvanminh1990.webp
```

Logic chuẩn hóa tên nằm tập trung trong `member-image.js` và được dùng cho tree card, profile, search result và members view. Nếu thiếu `fullName`, thiếu năm sinh hợp lệ, file không tồn tại hoặc ảnh bị lỗi, giao diện tự chuyển về avatar initials mà không hiển thị broken-image icon.

Lưu ý: `assets/members/` là static public asset của GitHub Pages. Ảnh trong thư mục này không được bảo vệ bởi mã hóa của `data.enc`; không đưa ảnh cần riêng tư tuyệt đối vào đây.


### Thứ tự anh/chị/em

`member.siblingOrder` là số nguyên dương trong từng nhóm anh/chị/em. Số nhỏ hơn đứng trước và được sắp xếp từ trái sang phải; giá trị này độc lập với generation/generationOffset. Nếu thiếu hoặc không hợp lệ, ứng dụng không hiển thị badge và không tự đoán thứ tự.


`generation` là thế hệ cơ sở 1-based tùy chọn; nếu bỏ trống, graph suy ra từ cha/mẹ. Trong Editor, checkbox **Đẩy thế hệ sau** sẽ tăng 1 cho các member từ chính thế hệ đang nhập trở đi và được lưu trong Undo/Redo. `generationOffset` chỉ là offset hiển thị toàn cục.

## Cloudflare Worker / R2

Viewer ưu tiên dữ liệu mã hóa từ Worker rồi mới dùng file Git local. Cấu hình Worker URL, không có secret, tại `remote-config.js`:

```js
apiBaseUrl: 'https://family-tree-api.acerem.workers.dev',
enabled: true
```

Luồng tải là `GET /version` → `GET /data?version=...` → kiểm tra envelope → decrypt PBKDF2/AES-GCM → validate schema. Timeout request là 8 giây. HTTP lỗi, CORS, timeout, dữ liệu rỗng/hỏng, decrypt lỗi hoặc schema lỗi đều chuyển tự động sang `./data.enc`. File `data.enc` trong repository này là fallback bắt buộc và không được xóa.

Ảnh online dùng cùng filename hiện tại qua `GET /images/<filename>?version=<contentHash>`. Nếu ảnh không tồn tại, avatar initials hiện như trước.

## Offline fallback

Để kiểm tra fallback, tắt network hoặc tạm đổi `apiBaseUrl` thành endpoint không tồn tại rồi mở lại Viewer. Sau khi nhập mật khẩu, UI vẫn mở bằng `data.enc` trong Git và chỉ hiển thị trạng thái nhỏ **Dữ liệu dự phòng trong Git**. Nếu cả online và local đều không mở được, màn hình đăng nhập báo lỗi rõ ràng; app không crash trắng.

Worker/R2 được triển khai từ thư mục `../family-tree-api`; xem README của API để tạo bucket, bind R2, cấu hình CORS và secret publish.
