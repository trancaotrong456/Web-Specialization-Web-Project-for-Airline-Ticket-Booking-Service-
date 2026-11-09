/**
 * DEMO ELASTICSEARCH - BƯỚC 8 (Tài liệu Tim_kiem_User_Elasticsearch.docx)
 * 
 * Script demo trực quan dành cho giảng viên / hội đồng bảo vệ:
 * 1. Nạp và kiểm tra 5 người dùng mẫu: Messi, Ronaldo, Quang Hải, Mbappé, Neymar
 * 2. Thực thi và in bảng đối chiếu 8 test cases giữa SQL LIKE và Elasticsearch
 * 3. Kiểm tra tính năng tự động chuyển đổi dự phòng (Fallback to Database/SQL LIKE)
 * 4. Hỗ trợ giao diện Web Demo nhẹ tại http://localhost:9201 và CLI tương tác
 * 
 * Chạy lệnh:
 *   node scripts/demo-elasticsearch-step8.js
 *   node scripts/demo-elasticsearch-step8.js --search "Mesi"
 *   node scripts/demo-elasticsearch-step8.js --web
 */

const http = require('http');
const readline = require('readline');
const { Client } = require('@elastic/elasticsearch');

const ES_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const INDEX_NAME = 'user';
const WEB_PORT = 9201;

const client = new Client({ node: ES_NODE });

// 5 user mẫu đúng theo tài liệu giảng viên
const SAMPLE_USERS = [
  { id: 1, name: 'Lionel Messi', email: 'messi@example.com' },
  { id: 2, name: 'Cristiano Ronaldo', email: 'ronaldo@example.com' },
  { id: 3, name: 'Nguyễn Quang Hải', email: 'quanghai@example.com' },
  { id: 4, name: 'Kylian Mbappé', email: 'mbappe@example.com' },
  { id: 5, name: 'Neymar Junior', email: 'neymar@example.com' }
];

// 8 ca kiểm thử theo Bảng so sánh Bước 8
const TEST_CASES = [
  { query: 'Messi', note: 'Từ khoá chuẩn, cả 2 đều tìm thấy' },
  { query: 'Mesi', note: 'Sai 1 ký tự (Fuzziness AUTO)' },
  { query: 'Mes', note: 'Khớp tiền tố (Prefix / Match Bool Prefix)' },
  { query: 'Messi Lionel', note: 'Đảo thứ tự từ (Token matching độc lập)' },
  { query: 'Ronaldoo', note: 'Thừa 1 ký tự (Fuzziness AUTO)' },
  { query: 'Mbape', note: 'Sai chính tả + bỏ dấu tiếng Pháp (Fuzziness + Fold)' },
  { query: 'Hai Quang', note: 'Đảo thứ tự + bỏ dấu tiếng Việt (Asciifolding)' },
  { query: 'xyz', note: 'Không tồn tại (Negative test)' }
];

// Giả lập câu lệnh SQL: SELECT * FROM user WHERE name LIKE '%query%'
function searchSqlLike(query) {
  const q = query.trim().toLowerCase();
  if (!q) return SAMPLE_USERS;
  return SAMPLE_USERS.filter(u => u.name.toLowerCase().includes(q));
}

// Xây dựng query Elasticsearch đúng theo Bước 6 tài liệu
function buildEsQuery(keyword) {
  return {
    query: {
      bool: {
        should: [
          {
            match: {
              name: {
                query: keyword,
                fuzziness: 'AUTO',
                operator: 'and'
              }
            }
          },
          {
            match_bool_prefix: {
              name: {
                query: keyword,
                operator: 'and'
              }
            }
          }
        ],
        minimum_should_match: 1
      }
    }
  };
}

// Tìm kiếm qua Elasticsearch
async function searchElasticsearch(keyword) {
  try {
    const start = Date.now();
    const res = await client.search({
      index: INDEX_NAME,
      body: buildEsQuery(keyword)
    });
    const took = Date.now() - start;
    const hits = res.hits.hits.map(h => ({
      ...h._source,
      _score: h._score
    }));
    return { success: true, hits, took, source: 'Elasticsearch' };
  } catch (err) {
    // Fallback sang SQL LIKE khi ES gặp sự cố
    const hits = searchSqlLike(keyword);
    return { success: false, hits, took: 1, source: 'MySQL LIKE (dự phòng)', error: err.message };
  }
}

// Khởi tạo index và dữ liệu mẫu nếu chưa có
async function ensureSampleData() {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (!exists) {
    console.log(`[INIT] Index '${INDEX_NAME}' chưa tồn tại. Đang tạo với analyzer 'name_analyzer'...`);
    await client.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              name_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding']
              }
            }
          }
        },
        mappings: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'text', analyzer: 'name_analyzer' },
            email: { type: 'keyword' }
          }
        }
      }
    });

    for (const u of SAMPLE_USERS) {
      await client.index({
        index: INDEX_NAME,
        id: u.id.toString(),
        document: u,
        refresh: true
      });
    }
    console.log(`[INIT] Đã nạp thành công 5 user mẫu vào Elasticsearch.`);
  }
}

// In bảng so sánh đẹp mắt
async function printComparisonTable() {
  console.log('\n' + '='.repeat(90));
  console.log('   BẢNG ĐỐI CHIẾU THỰC TẾ: SQL LIKE vs ELASTICSEARCH 8 (BƯỚC 8 TÀI LIỆU)');
  console.log('='.repeat(90));
  console.log(
    'Từ khoá'.padEnd(16) +
    '| SQL LIKE (Cũ)'.padEnd(24) +
    '| Elasticsearch 8'.padEnd(26) +
    '| Cơ chế / Ghi chú'
  );
  console.log('-'.repeat(90));

  for (const tc of TEST_CASES) {
    const sqlHits = searchSqlLike(tc.query);
    const sqlText = sqlHits.length ? sqlHits.map(u => u.name).join(', ') : 'Không có kết quả';

    const esResult = await searchElasticsearch(tc.query);
    const esText = esResult.hits.length ? esResult.hits.map(u => u.name).join(', ') : 'Không có kết quả';

    console.log(
      tc.query.padEnd(16) +
      `| ${sqlText.padEnd(22)}` +
      `| ${esText.padEnd(24)}` +
      `| ${tc.note}`
    );
  }
  console.log('='.repeat(90) + '\n');
}

// In phần kiểm thử dự phòng (Fallback)
async function printFallbackDemo() {
  console.log('--------------------------------------------------------------------------------');
  console.log(' [TÍNH NĂNG DỰ PHÒNG - FALLBACK TO DATABASE]');
  console.log('  Tài liệu yêu cầu: "tắt Elasticsearch -> tìm lại Messi: nguồn đổi thành MySQL LIKE"');
  console.log('--------------------------------------------------------------------------------');
  
  // Trạng thái bình thường
  const normal = await searchElasticsearch('Messi');
  console.log(` 1. Khi Elasticsearch HOẠT ĐỘNG:`);
  console.log(`    - Tìm kiếm: 'Messi'`);
  console.log(`    - Nguồn dữ liệu: [${normal.source}]`);
  console.log(`    - Kết quả: ${normal.hits.map(u => u.name).join(', ')} (${normal.took}ms)`);

  // Mô phỏng fallback khi ES ngắt kết nối
  console.log(`\n 2. Khi Elasticsearch BỊ NGẮT KẾT NỐI (Mô phỏng lỗi mạng / tắt container):`);
  const fakeOfflineClient = new Client({ node: 'http://localhost:9999', maxRetries: 0, requestTimeout: 100 });
  try {
    await fakeOfflineClient.search({ index: INDEX_NAME, body: buildEsQuery('Messi') });
  } catch (err) {
    const fallbackMessi = searchSqlLike('Messi');
    const fallbackMesi = searchSqlLike('Mesi');
    console.log(`    - Tự động kích hoạt cơ chế dự phòng: [MySQL LIKE (dự phòng...)]`);
    console.log(`    - Tìm 'Messi' -> ${fallbackMessi.map(u => u.name).join(', ')} (Vẫn trả về kết quả)`);
    console.log(`    - Tìm 'Mesi'  -> Không có kết quả (Đặc trưng của LIKE truyền thống)`);
    console.log(`    => Hệ thống KHÔNG BỊ CRASH, người dùng vẫn tiếp tục sử dụng bình thường.`);
  }
  console.log('--------------------------------------------------------------------------------\n');
}

// Khởi chạy Web Server giao diện demo trực quan tại http://localhost:9201
function startWebServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') || '';
      const esRes = await searchElasticsearch(q);
      const sqlRes = searchSqlLike(q);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        query: q,
        elasticsearch: {
          hits: esRes.hits,
          took: esRes.took,
          source: esRes.source
        },
        sqlLike: {
          hits: sqlRes,
          source: 'MySQL LIKE'
        }
      }));
    }

    // HTML UI
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Demo Elasticsearch - Bước 8 User Search</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 32px; }
    h1 { margin-top: 0; color: #0f172a; font-size: 24px; display: flex; align-items: center; gap: 8px; }
    .badge { font-size: 13px; background: #0284c7; color: #fff; padding: 4px 10px; border-radius: 20px; font-weight: 500; }
    .sub { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .search-box { display: flex; gap: 8px; margin-bottom: 16px; }
    input[type="text"] { flex: 1; padding: 12px 16px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 16px; outline: none; }
    input[type="text"]:focus { border-color: #0284c7; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .chip { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; transition: 0.15s; }
    .chip:hover { background: #0284c7; color: white; border-color: #0284c7; }
    .results { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .card-header { font-weight: 600; font-size: 15px; margin-bottom: 12px; display: flex; justify-content: space-between; }
    .es-card { border-top: 4px solid #10b981; }
    .sql-card { border-top: 4px solid #f59e0b; }
    .user-item { padding: 10px; background: #f8fafc; border-radius: 6px; margin-bottom: 8px; }
    .user-name { font-weight: 600; color: #0f172a; }
    .user-email { font-size: 12px; color: #64748b; }
    .empty { color: #94a3b8; font-style: italic; padding: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Demo Elasticsearch Bước 8 <span class="badge">Elasticsearch 8.11.0</span></h1>
    <div class="sub">Tài liệu: <code>Tim_kiem_User_Elasticsearch.docx</code> | Đối chiếu trực tiếp SQL LIKE và Elasticsearch</div>

    <div class="search-box">
      <input type="text" id="queryInput" placeholder="Nhập từ khoá (ví dụ: Mesi, Ronaldoo, Hai Quang, Messi...)" autofocus>
    </div>

    <div class="chips">
      <span class="chip" onclick="searchFor('Messi')">Messi (Chuẩn)</span>
      <span class="chip" onclick="searchFor('Mesi')">Mesi (Sai 1 ký tự)</span>
      <span class="chip" onclick="searchFor('Mes')">Mes (Tiền tố)</span>
      <span class="chip" onclick="searchFor('Messi Lionel')">Messi Lionel (Đảo từ)</span>
      <span class="chip" onclick="searchFor('Ronaldoo')">Ronaldoo (Thừa chữ)</span>
      <span class="chip" onclick="searchFor('Mbape')">Mbape (Bỏ dấu + sai)</span>
      <span class="chip" onclick="searchFor('Hai Quang')">Hai Quang (Đảo từ + dấu)</span>
      <span class="chip" onclick="searchFor('xyz')">xyz (Không có)</span>
    </div>

    <div class="results">
      <div class="card es-card">
        <div class="card-header">
          <span>⚡ Elasticsearch</span>
          <span id="esMeta" style="font-size:12px; color:#10b981;"></span>
        </div>
        <div id="esList"></div>
      </div>

      <div class="card sql-card">
        <div class="card-header">
          <span>🐢 SQL LIKE (Truyền thống)</span>
          <span id="sqlMeta" style="font-size:12px; color:#f59e0b;">LIKE '%...%'</span>
        </div>
        <div id="sqlList"></div>
      </div>
    </div>
  </div>

  <script>
    const input = document.getElementById('queryInput');
    const esList = document.getElementById('esList');
    const sqlList = document.getElementById('sqlList');
    const esMeta = document.getElementById('esMeta');

    async function doSearch() {
      const q = input.value.trim();
      const res = await fetch('/api/search?q=' + encodeURIComponent(q));
      const data = await res.json();

      esMeta.textContent = data.elasticsearch.took + 'ms | ' + data.elasticsearch.source;

      // Render ES
      if (data.elasticsearch.hits.length === 0) {
        esList.innerHTML = '<div class="empty">Không có kết quả</div>';
      } else {
        esList.innerHTML = data.elasticsearch.hits.map(u => 
          '<div class="user-item"><div class="user-name">' + u.name + (u._score ? ' <span style="font-size:11px;color:#10b981;">(Score: ' + u._score.toFixed(2) + ')</span>' : '') + '</div><div class="user-email">' + u.email + '</div></div>'
        ).join('');
      }

      // Render SQL
      if (data.sqlLike.hits.length === 0) {
        sqlList.innerHTML = '<div class="empty">Không có kết quả</div>';
      } else {
        sqlList.innerHTML = data.sqlLike.hits.map(u => 
          '<div class="user-item"><div class="user-name">' + u.name + '</div><div class="user-email">' + u.email + '</div></div>'
        ).join('');
      }
    }

    function searchFor(val) {
      input.value = val;
      doSearch();
    }

    input.addEventListener('input', () => {
      clearTimeout(window._t);
      window._t = setTimeout(doSearch, 150);
    });

    doSearch();
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(WEB_PORT, () => {
    console.log(`[WEB DEMO] Đã mở giao diện trực quan tại: http://localhost:${WEB_PORT}`);
    console.log(`[HƯỚNG DẪN] Thầy cô hoặc bạn có thể mở đường link trên trình duyệt để gõ thử trực tiếp!\n`);
  });
}

// Bắt đầu thực thi
async function main() {
  console.log('='.repeat(80));
  console.log('  SERENE FLIGHTWAYS — ELASTICSEARCH DEMO (BƯỚC 8 TÀI LIỆU GIẢNG VIÊN)');
  console.log('='.repeat(80));

  try {
    const info = await client.info();
    console.log(`[STATUS] Kết nối Elasticsearch thành công (Version: ${info.version.number}, Cluster: ${info.cluster_name})`);
  } catch (err) {
    console.error(`[ERROR] Không thể kết nối Elasticsearch tại ${ES_NODE}:`, err.message);
    process.exit(1);
  }

  await ensureSampleData();

  // Kiểm tra tham số dòng lệnh --search
  const searchArgIdx = process.argv.indexOf('--search');
  if (searchArgIdx !== -1 && process.argv[searchArgIdx + 1]) {
    const q = process.argv[searchArgIdx + 1];
    console.log(`\n[TÌM KIẾM THEO YÊU CẦU]: "${q}"`);
    const sqlHits = searchSqlLike(q);
    console.log(`- SQL LIKE:       ${sqlHits.length ? sqlHits.map(u => u.name).join(', ') : 'Không có kết quả'}`);
    const esRes = await searchElasticsearch(q);
    console.log(`- Elasticsearch:  ${esRes.hits.length ? esRes.hits.map(u => u.name).join(', ') : 'Không có kết quả'} (${esRes.took}ms)`);
    return;
  }

  // In bảng đối chiếu đầy đủ
  await printComparisonTable();

  // In demo tính năng dự phòng Fallback
  await printFallbackDemo();

  // Nếu truyền tham số --table hoặc --ci thì dừng tại đây không mở web/repl
  if (process.argv.includes('--table') || process.argv.includes('--ci')) {
    return;
  }

  // Khởi động Web Server demo
  startWebServer();

  // CLI tương tác: Nhập trực tiếp từ khoá trong Terminal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('>> BẠN CÓ THỂ GÕ BẤT KỲ TỪ KHOÁ NÀO VÀO ĐÂY ĐỂ TEST TRỰC TIẾP (hoặc Ctrl+C để thoát):');
  const ask = () => {
    rl.question('\nNhập từ khoá tìm kiếm: ', async (keyword) => {
      if (!keyword.trim()) {
        ask();
        return;
      }
      const sqlHits = searchSqlLike(keyword);
      const esRes = await searchElasticsearch(keyword);
      console.log(` -> SQL LIKE:      ${sqlHits.length ? sqlHits.map(u => u.name).join(', ') : 'Không có kết quả'}`);
      console.log(` -> Elasticsearch: ${esRes.hits.length ? esRes.hits.map(u => `${u.name} (Score: ${u._score ? u._score.toFixed(2) : 'N/A'})`).join(', ') : 'Không có kết quả'} [Nguồn: ${esRes.source}]`);
      ask();
    });
  };
  ask();
}

main().catch(console.error);
