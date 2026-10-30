import React, { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { Tabs } from '../../components/Tabs';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { Modal } from '../../components/Modal';

export function DesignSystemShowcasePage() {
  const [activeTab, setActiveTab] = useState('one_way');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sampleTabs = [
    { id: 'one_way', label: 'Một chiều' },
    { id: 'round_trip', label: 'Khứ hồi' },
    { id: 'multi_city', label: 'Nhiều chặng', disabled: true, badge: 'Sắp ra mắt' },
  ];

  return (
    <div className="home-experience">
      <main className="app-shell" style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        <PageHeader
          kicker="Hệ thống thiết kế Đợt 1"
          title="Bảng thành phần giao diện Serene Flightways"
          description="Rút trích trực tiếp từ ngôn ngữ thiết kế trang chủ: màu xanh rêu thương hiệu, màu cam đất nhấn, bảng màu đất ấm và kiểu chữ tương phản cao."
          actions={
            <Button variant="accent" onClick={() => setIsModalOpen(true)}>
              Mở hộp thoại mẫu
            </Button>
          }
        />

        {/* Section 1: Color Tokens */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>1. Bảng màu thương hiệu (Color Tokens)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#16382C', borderRadius: '4px', marginBottom: '8px' }} />
              <strong>Xanh rêu (Brand)</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#16382C</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#D9622B', borderRadius: '4px', marginBottom: '8px' }} />
              <strong>Cam đất (Accent)</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#D9622B</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#F4F1EA', border: '1px solid #D8D2C6', borderRadius: '4px', marginBottom: '8px' }} />
              <strong>Nền trang (Canvas)</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#F4F1EA</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#FFFFFF', border: '1px solid #D8D2C6', borderRadius: '4px', marginBottom: '8px' }} />
              <strong>Nền thẻ (Surface)</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#FFFFFF</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#EFEBE2', border: '1px solid #D8D2C6', borderRadius: '4px', marginBottom: '8px' }} />
              <strong>Dải be (Subtle)</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#EFEBE2</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#1A1A17', borderRadius: '4px', marginBottom: '8px' }} />
              <strong style={{ color: '#1A1A17' }}>Chữ chính</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#1A1A17</div>
            </Card>
            <Card style={{ padding: '16px' }}>
              <div style={{ height: '48px', backgroundColor: '#595750', borderRadius: '4px', marginBottom: '8px' }} />
              <strong style={{ color: '#595750' }}>Chữ phụ</strong>
              <div className="table-mono-cell" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>#595750</div>
            </Card>
          </div>
        </section>

        {/* Section 2: Typography */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>2. Kiểu chữ (Typography)</h2>
          <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span className="section-kicker">NHÃN PHỤ UPPERCASE (SANS-SERIF)</span>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Dùng Plus Jakarta Sans, uppercase, letter-spacing giãn nhẹ, không dùng font mono cho nhãn nhỏ.
              </p>
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>
                Tiêu đề Display: Space Grotesk Đậm Nét Tự Tin
              </h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Tiêu đề trang, section heading luôn dùng Space Grotesk.
              </p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span className="table-mono-cell" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  VN-128
                </span>
                <span className="table-mono-cell" style={{ fontSize: '1.25rem' }}>
                  08:30 → 10:45
                </span>
                <span className="table-mono-cell" style={{ fontSize: '1.25rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                  1.250.000đ
                </span>
                <span className="table-mono-cell" style={{ fontSize: '1.125rem' }}>
                  PNR: SR7890
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Font JetBrains Mono kết hợp <code>tabular-nums</code>: CHỈ dùng cho mã sân bay, giờ bay, giá vé, mã PNR và số liệu.
              </p>
            </div>
          </Card>
        </section>

        {/* Section 3: Buttons & Actions */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>3. Nút bấm (Button Variants)</h2>
          <Card style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <Button variant="primary">Nút chính xanh rêu</Button>
              <Button variant="accent">Nút điểm nhấn cam</Button>
              <Button variant="secondary">Nút phụ dải be</Button>
              <Button variant="outline">Nút viền mảnh</Button>
              <Button variant="ghost">Nút dạng chữ</Button>
              <Button variant="danger">Nút hủy / cảnh báo</Button>
              <Button variant="primary" disabled>Bị khóa</Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <Button variant="primary" size="sm">Cỡ nhỏ (sm)</Button>
              <Button variant="primary" size="md">Cỡ chuẩn (md)</Button>
              <Button variant="primary" size="lg">Cỡ lớn (lg)</Button>
            </div>
          </Card>
        </section>

        {/* Section 4: Badges & System Statuses */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>4. Nhãn trạng thái (Badges & Statuses)</h2>
          <Card style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Trạng thái Đặt chỗ (Booking):</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              <Badge variant="warning">Đang giữ chỗ (holding)</Badge>
              <Badge variant="neutral">Chờ thanh toán (pending_payment)</Badge>
              <Badge variant="success">Đã xác nhận (confirmed)</Badge>
              <Badge variant="danger">Đã hủy (cancelled)</Badge>
              <Badge variant="danger">Hết hạn (expired)</Badge>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Trạng thái Thanh toán (Payment):</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              <Badge variant="warning">Đang xử lý (pending)</Badge>
              <Badge variant="success">Thành công (success)</Badge>
              <Badge variant="danger">Thất bại (failed)</Badge>
              <Badge variant="info">Đã hoàn tiền (refunded)</Badge>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Hạng vé & Thương hiệu:</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge variant="brand">Phổ thông</Badge>
              <Badge variant="accent">Thương gia</Badge>
              <Badge variant="neutral">Tiết kiệm</Badge>
            </div>
          </Card>
        </section>

        {/* Section 5: Tabs & Forms */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>5. Chuyển tab & Nhập liệu (Tabs & Forms)</h2>
          <Card style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Kiểu chuyển tab đồng bộ trang chủ:</label>
              <Tabs tabs={sampleTabs} activeTab={activeTab} onChange={setActiveTab} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="search-field">
                <label className="search-field-label" htmlFor="sample-text">Họ và tên hành khách</label>
                <input
                  id="sample-text"
                  type="text"
                  className="search-field-input"
                  placeholder="Ví dụ: NGUYEN VAN A"
                  defaultValue="NGUYEN VAN A"
                />
                <span className="search-field-hint">Nhập không dấu như trên CCCD/Hộ chiếu</span>
              </div>

              <div className="search-field">
                <label className="search-field-label" htmlFor="sample-select">Hạng ghế</label>
                <select id="sample-select" className="search-field-select" defaultValue="economy">
                  <option value="economy">Phổ thông (Economy)</option>
                  <option value="business">Thương gia (Business)</option>
                </select>
                <span className="search-field-hint">Đã bao gồm 7kg hành lý xách tay</span>
              </div>

              <div className="search-field">
                <label className="search-field-label" htmlFor="sample-date">Ngày khởi hành</label>
                <input id="sample-date" type="date" className="search-field-input" defaultValue="2026-11-15" />
                <span className="search-field-hint">Chủ Nhật</span>
              </div>
            </div>
          </Card>
        </section>

        {/* Section 6: Data Table */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>6. Bảng dữ liệu chuyến bay (Data Table)</h2>
          <Card style={{ padding: '0', overflow: 'hidden' }}>
            <Table>
              <thead>
                <tr>
                  <th>Chuyến bay</th>
                  <th>Chặng bay</th>
                  <th>Giờ bay</th>
                  <th>Hạng vé</th>
                  <th>Giá vé</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong className="table-mono-cell">SF-102</strong></td>
                  <td><span className="table-mono-cell">HAN → SGN</span></td>
                  <td><span className="table-mono-cell">06:00 – 08:15</span></td>
                  <td>Phổ thông linh hoạt</td>
                  <td><strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>1.450.000đ</strong></td>
                  <td><Badge variant="success">Còn 12 ghế</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="accent" size="sm">Chọn chuyến</Button>
                  </td>
                </tr>
                <tr>
                  <td><strong className="table-mono-cell">SF-205</strong></td>
                  <td><span className="table-mono-cell">SGN → DAD</span></td>
                  <td><span className="table-mono-cell">14:30 – 15:50</span></td>
                  <td>Thương gia</td>
                  <td><strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>3.200.000đ</strong></td>
                  <td><Badge variant="warning">Còn 2 ghế</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="accent" size="sm">Chọn chuyến</Button>
                  </td>
                </tr>
                <tr>
                  <td><strong className="table-mono-cell">SF-308</strong></td>
                  <td><span className="table-mono-cell">DAD → HAN</span></td>
                  <td><span className="table-mono-cell">20:10 – 21:30</span></td>
                  <td>Phổ thông tiết kiệm</td>
                  <td><strong className="table-mono-cell" style={{ color: 'var(--color-text-muted)' }}>980.000đ</strong></td>
                  <td><Badge variant="danger">Hết chỗ</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="secondary" size="sm" disabled>Đã hết ghế</Button>
                  </td>
                </tr>
              </tbody>
            </Table>
          </Card>
        </section>

        {/* Section 7: Feedback & Empty States */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>7. Trạng thái rỗng & Tải dữ liệu (Empty & Skeleton)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <Card style={{ padding: '24px' }}>
              <EmptyState
                icon="✈"
                title="Không tìm thấy chuyến bay phù hợp"
                description="Rất tiếc, ngày bạn chọn hiện không còn chuyến bay trực tiếp. Bạn vui lòng đổi ngày bay hoặc chọn sân bay lân cận."
                action={<Button variant="primary" size="sm">Tìm ngày khác</Button>}
              />
            </Card>

            <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Đang tải dữ liệu chuyến bay...</h3>
              <Skeleton height="32px" width="60%" />
              <Skeleton height="18px" width="100%" />
              <Skeleton height="18px" width="80%" />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <Skeleton height="36px" width="120px" />
                <Skeleton height="36px" width="120px" />
              </div>
            </Card>
          </div>
        </section>

        {/* Modal component demo */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Xác nhận hủy đặt chỗ"
          actions={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Giữ lại vé
              </Button>
              <Button variant="danger" onClick={() => setIsModalOpen(false)}>
                Đồng ý hủy vé
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, color: 'var(--color-text)' }}>
            Bạn có chắc chắn muốn hủy đặt chỗ cho mã <strong className="table-mono-cell">SR7890</strong>? Hành động này không thể hoàn tác sau khi xác nhận.
          </p>
        </Modal>
      </main>
    </div>
  );
}
