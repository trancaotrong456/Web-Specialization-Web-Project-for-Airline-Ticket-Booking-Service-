import { useEffect, useState } from 'react';
import { classifyQrValue, renderQrDataUrl } from './paymentQr';

export function PaymentQr({ value }) {
  const classification = classifyQrValue(value);
  const [generated, setGenerated] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setGenerated(null);
    setFailed(false);
    if (classification.type !== 'payload') return () => { active = false; };
    renderQrDataUrl(classification.value)
      .then((dataUrl) => { if (active) setGenerated(dataUrl); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [classification.type, classification.value]);

  if (classification.type === 'image') return <img src={classification.value} alt="Mã QR do payOS trả về" />;
  if (classification.type === 'payload' && generated) return <img src={generated} alt="Mã QR do payOS trả về" />;
  return <p role="status" className="field-hint">Không thể hiển thị mã QR. Bạn vẫn có thể mở liên kết thanh toán nếu có.</p>;
}
