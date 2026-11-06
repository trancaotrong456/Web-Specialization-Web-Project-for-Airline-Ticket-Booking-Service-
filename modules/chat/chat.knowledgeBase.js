'use strict';

/**
 * Serene Flightways Passenger Policy & Knowledge Base Chunks
 * Trích xuất từ Sổ tay Quy định Hành khách Serene Flightways (Phiên bản 2026)
 * Tương thích cấu trúc LangChain Document Chunks: { id, title, section, page, content, keywords }
 */
const KNOWLEDGE_DOCUMENTS = [
  {
    id: 'baggage-carry-on',
    title: 'Quy định Hành lý Xách tay',
    section: 'Điều 1.1 - Hành lý xách tay tiêu chuẩn',
    page: 4,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Mục Hành lý',
    keywords: ['hành lý', 'xách tay', 'kích thước', 'trọng lượng', '7kg', 'balo', 'vali', 'carry-on', 'balo nhỏ'],
    content: `Hành khách được phép mang 01 kiện hành lý xách tay chính (trọng lượng tối đa 7kg, kích thước không vượt quá 56cm x 36cm x 23cm) và 01 túi xách phụ nhỏ (như túi máy tính xách tay, túi đeo chéo cá nhân không quá 40cm x 30cm x 10cm). Tổng trọng lượng không vượt quá 7kg đối với hạng Phổ thông (Eco) và 10kg đối với hạng Thương gia (Business). Tất cả hành lý xách tay phải để vừa vào ngăn chứa hành lý phía trên hoặc dưới gầm ghế phía trước.`
  },
  {
    id: 'baggage-checked',
    title: 'Quy định Hành lý Ký gửi',
    section: 'Điều 1.2 - Hành lý ký gửi và phí cước',
    page: 5,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Mục Hành lý',
    keywords: ['hành lý ký gửi', 'ký gửi', 'kiện', '20kg', '25kg', '30kg', '40kg', 'mua thêm', 'quá cước', 'checked bag'],
    content: `Hành lý ký gửi tiêu chuẩn: Mỗi kiện không được vượt quá 32kg và tổng kích thước 3 chiều không quá 158cm để đảm bảo an toàn lao động cho nhân viên mặt đất. Khách hàng có thể mua thêm các gói hành lý ký gửi 15kg, 20kg, 25kg, 30kg, 40kg trong quá trình đặt vé hoặc trước giờ bay ít nhất 3 tiếng trên website với mức giá ưu đãi hơn 50% so với mua trực tiếp tại quầy sân bay.`
  },
  {
    id: 'baggage-liquids-dangerous',
    title: 'Chất lỏng và Vật phẩm Nguy hiểm',
    section: 'Điều 1.3 - Vật phẩm hạn chế và chất lỏng',
    page: 6,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - An toàn bay',
    keywords: ['chất lỏng', 'nước', 'pin sạc', 'sạc dự phòng', 'vật sắc nhọn', 'dao kéo', 'cấm mang', 'hàng nguy hiểm'],
    content: `Chất lỏng trên các chuyến bay quốc tế: Mỗi bình chứa tối đa 100ml, tất cả phải được đựng trong túi nhựa trong suốt có khóa zip dung tích tối đa 1 lít. Pin sạc dự phòng (Powerbank) tối đa 100Wh - 160Wh BẮT BUỘC để trong hành lý xách tay, TUYỆT ĐỐI KHÔNG để trong hành lý ký gửi. Nghiêm cấm mang theo vũ khí, vật sắc nhọn, chất dễ cháy nổ, bình xịt hơi cay và các hóa chất độc hại.`
  },
  {
    id: 'booking-15-minute-hold',
    title: 'Chính sách Giữ chỗ và Khóa giá 15 phút',
    section: 'Điều 2.1 - Thời hạn thanh toán và giữ chỗ tạm thời',
    page: 8,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Đặt chỗ & Thanh toán',
    keywords: ['giữ chỗ', '15 phút', 'thời hạn', 'khóa giá', 'hết hạn', 'tạm giữ', 'hold booking', 'thanh toán sau'],
    content: `Khi bạn chọn chuyến bay và tiến hành tạo đơn đặt chỗ, Serene Flightways tự động áp dụng chính sách 'Khóa giá & Giữ chỗ 15 phút'. Trong khoảng thời gian 15 phút này, ghế ngồi và mức giá vé của bạn được đảm bảo 100%, không bị tăng giá hoặc người khác đặt mất. Nếu bạn không hoàn tất thanh toán trong vòng 15 phút (qua VNPay hoặc payOS), đơn đặt chỗ sẽ tự động bị hủy (EXPIRED) và ghế được mở lại cho hành khách khác.`
  },
  {
    id: 'payment-methods',
    title: 'Phương thức Thanh toán và Xác nhận',
    section: 'Điều 2.2 - Cổng thanh toán trực tuyến',
    page: 9,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Đặt chỗ & Thanh toán',
    keywords: ['thanh toán', 'vnpay', 'payos', 'thẻ', 'qr code', 'chuyển khoản', 'ngân hàng', 'hóa đơn', 'payment'],
    content: `Serene Flightways hỗ trợ các cổng thanh toán trực tuyến an toàn bao gồm VNPay (QR Pay, thẻ ATM nội địa, thẻ quốc tế Visa/MasterCard/JCB) và payOS (chuyển khoản ngân hàng tức thì qua VietQR chuẩn NAPAS 24/7). Sau khi giao dịch thành công, hệ thống tự động xác nhận đơn hàng sang trạng thái CONFIRMED và gửi vé điện tử (E-ticket) kèm hóa đơn về địa chỉ email của bạn trong vòng 30 giây.`
  },
  {
    id: 'cancellation-refund',
    title: 'Chính sách Hoàn vé và Hủy chuyến của Hành khách',
    section: 'Điều 3.1 - Điều kiện hoàn trả và đổi vé',
    page: 11,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Hủy đổi & Hoàn tiền',
    keywords: ['hủy vé', 'hoàn tiền', 'đổi vé', 'phí hủy', 'hoàn vé', 'trả vé', 'refund', 'cancellation', 'đổi ngày bay'],
    content: `Chính sách hoàn/đổi vé áp dụng theo từng hạng vé:
- Hạng Eco Saver: Không áp dụng hoàn vé hoặc đổi tên hành khách. Có thể đổi ngày bay trước 24 giờ với phí 350.000 VNĐ + chênh lệch giá vé (nếu có).
- Hạng Eco Standard: Được phép hoàn vé trước 24 giờ bay với mức phí 450.000 VNĐ/chặng. Đổi ngày bay mất phí 300.000 VNĐ + chênh lệch.
- Hạng Business / Premium Flex: Miễn phí đổi ngày bay không giới hạn số lần (chỉ thu chênh lệch vé nếu có). Được hoàn vé trước 24 giờ với phí chỉ 10% giá trị vé.
Thời gian hoàn tiền: Từ 3 - 7 ngày làm việc đối với thẻ nội địa/chuyển khoản, hoặc 7 - 14 ngày làm việc đối với thẻ tín dụng quốc tế.`
  },
  {
    id: 'checkin-online-airport',
    title: 'Thủ tục Làm thủ tục Bay (Check-in)',
    section: 'Điều 4.1 - Check-in trực tuyến và tại sân bay',
    page: 14,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Thủ tục bay',
    keywords: ['checkin', 'check in', 'làm thủ tục', 'mấy tiếng', 'thời gian', 'sân bay', 'quầy', 'online checkin'],
    content: `Thời gian làm thủ tục:
- Check-in Online: Mở trước 24 giờ và đóng trước 60 phút so với giờ khởi hành. Quý khách có thể tự chọn chỗ ngồi và nhận thẻ lên tàu bay (Boarding Pass) điện tử vào điện thoại.
- Check-in tại quầy sân bay:
  + Chuyến bay nội địa: Mở trước 2 tiếng và đóng quầy trước 45 phút so với giờ khởi hành.
  + Chuyến bay quốc tế: Mở trước 3 tiếng và đóng quầy trước 50 phút so với giờ khởi hành.
- Cửa ra máy bay (Boarding Gate): Đóng trước 15 - 20 phút trước giờ khởi hành. Quý khách vui lòng có mặt tại cửa khởi hành đúng giờ.`
  },
  {
    id: 'flight-delays-reschedule',
    title: 'Quy định Chậm hủy chuyến và Quyền lợi Bồi thường',
    section: 'Điều 5.1 - Trách nhiệm của hãng hàng không khi hoãn chuyến',
    page: 17,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Quyền lợi hành khách',
    keywords: ['chậm chuyến', 'hoãn chuyến', 'hủy chuyến', 'bồi thường', 'delay', 'chậm giờ', 'quyền lợi'],
    content: `Trường hợp chuyến bay bị chậm do lỗi của hãng:
- Chậm từ 2 giờ trở lên: Phục vụ nước uống và hỗ trợ đổi chuyến bay miễn phí sang chuyến bay gần nhất còn chỗ.
- Chậm từ 3 giờ trở lên: Phục vụ bữa ăn theo ca (sáng, trưa, tối).
- Chậm từ 6 giờ trở lên (từ 22:00 hôm trước đến 07:00 hôm sau): Bố trí chỗ nghỉ khách sạn và xe đưa đón phù hợp.
- Bồi thường ứng trước không hoàn lại theo quy định của Bộ Giao thông Vận tải đối với các chuyến bay chậm từ 4 giờ trở lên hoặc hủy chuyến mà không thông báo trước 24 giờ.`
  },
  {
    id: 'ancillaries-services',
    title: 'Dịch vụ Bổ trợ: Chỗ ngồi, Suất ăn & Phòng chờ VIP',
    section: 'Điều 6.1 - Các gói tiện ích gia tăng',
    page: 20,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Dịch vụ bổ trợ',
    keywords: ['dịch vụ', 'suất ăn', 'chỗ ngồi', 'ghế ngồi', 'phòng chờ', 'priority pass', 'lounge', 'tiện ích'],
    content: `Serene Flightways cung cấp nhiều dịch vụ gia tăng trải nghiệm bay:
- Chọn chỗ ngồi: Ghế để chân rộng (Extra Legroom), ghế cạnh cửa sổ ngắm cảnh hoặc lối đi thuận tiện di chuyển.
- Suất ăn nóng cao cấp: Thực đơn phong phú gồm Bún bò Huế, Cơm gà Hội An, Mì xào bò sốt tiêu, Suất ăn chay thanh đạm.
- Phòng chờ thương gia (Priority Pass / Serene Lounge): Tận hưởng không gian làm việc yên tĩnh, buffet ẩm thực Á - Âu, ghế massage và đồ uống cao cấp tại các sân bay lớn (SGN, HAN, DAD, CXR).`
  },
  {
    id: 'pnr-lookup-guest',
    title: 'Tra cứu Thông tin Đặt chỗ và Mã PNR',
    section: 'Điều 7.1 - Tra cứu cho khách vãng lai và thành viên',
    page: 22,
    source: 'Sổ tay Hành khách Serene Flightways 2026 - Tra cứu chuyến bay',
    keywords: ['tra cứu', 'pnr', 'mã đặt chỗ', 'vé vãng lai', 'tìm vé', 'xem vé', 'booking code'],
    content: `Hành khách không cần đăng nhập vẫn có thể tra cứu toàn bộ chi tiết hành trình bằng cách:
1. Truy cập mục 'Tra cứu mã đặt chỗ' (Booking Lookup) trên thanh điều hướng.
2. Nhập Mã đặt chỗ (PNR gồm 6 ký tự viết hoa, ví dụ: 'SR89AK').
3. Nhập Email hoặc Họ tên hành khách đã dùng khi đặt vé.
Hệ thống sẽ hiển thị trạng thái thanh toán, thời gian bay, số hiệu chuyến bay, ghế ngồi và cho phép tải lại Vé điện tử (E-ticket PDF).`
  }
];

const QUICK_PROMPTS = [
  'Quy định hành lý xách tay và ký gửi?',
  'Chính sách giữ chỗ 15 phút là gì?',
  'Chính sách hủy vé và hoàn tiền như thế nào?',
  'Thời gian check-in online và tại sân bay?',
  'Làm sao để tra cứu vé bằng mã PNR?',
  'Dịch vụ phòng chờ Priority Pass và suất ăn?'
];

module.exports = {
  KNOWLEDGE_DOCUMENTS,
  QUICK_PROMPTS
};
