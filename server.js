// PHIEN BAN CAP NHAT - FULL FEATURES V2
const http = require('http');
const https = require('https');
const url = require('url');
const PORT = process.env.PORT || 3000;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '';
if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) {
  console.error('CANH BAO: Chua cau hinh JSONBIN_API_KEY hoac JSONBIN_BIN_ID');
}
let database = {
  recruitmentRequests: [],
  candidates: [],
  interviews: [],
  interviewResults: [],
  onboardingRecords: [],
  history: [],
  counters: {
    recruitmentRequestCounter: 1,
    candidateCounter: 1,
    interviewFormCounter: 1,
    resultCounter: 1,
    employeeCounter: 268600
  }
};
let isDataLoaded = false;

function jsonbinRequest(method, data, retryCount) {
  if (!retryCount) retryCount = 0;
  var maxRetries = 3;
  return new Promise(function(resolve, reject) {
    var path = '/v3/b/' + JSONBIN_BIN_ID;
    if (method === 'GET') path += '/latest';
    var bodyStr = data ? JSON.stringify(data) : null;
    var options = {
      hostname: 'api.jsonbin.io',
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY,
        'X-Bin-Versioning': 'false'
      }
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            console.error('JSONBin error ' + res.statusCode + ':', body);
            if (retryCount < maxRetries) {
              setTimeout(function() {
                jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject);
              }, 1000 * (retryCount + 1));
            } else {
              reject(new Error('JSONBin error: ' + res.statusCode));
            }
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', function(err) {
      if (retryCount < maxRetries) {
        setTimeout(function() {
          jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject);
        }, 1000 * (retryCount + 1));
      } else { reject(err); }
    });
    req.setTimeout(15000, function() {
      req.destroy();
      if (retryCount < maxRetries) {
        setTimeout(function() {
          jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject);
        }, 1000 * (retryCount + 1));
      } else { reject(new Error('Timeout')); }
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function loadFromJsonBin() {
  console.log('Dang doc du lieu tu JSONBin...');
  return jsonbinRequest('GET')
    .then(function(result) {
      if (result && result.record) {
        database = result.record;
        if (!database.recruitmentRequests) database.recruitmentRequests = [];
        if (!database.candidates) database.candidates = [];
        if (!database.interviews) database.interviews = [];
        if (!database.interviewResults) database.interviewResults = [];
        if (!database.onboardingRecords) database.onboardingRecords = [];
        if (!database.history) database.history = [];
        if (!database.counters) database.counters = {
          recruitmentRequestCounter: 1,
          candidateCounter: 1,
          interviewFormCounter: 1,
          resultCounter: 1,
          employeeCounter: 268600
        };
        if (!database.counters.resultCounter) database.counters.resultCounter = 1;
        if (!database.counters.employeeCounter) database.counters.employeeCounter = 268600;
        isDataLoaded = true;
        console.log('=== DOC JSONBIN THANH CONG ===');
      } else {
        console.error('JSONBin tra ve du lieu rong');
        isDataLoaded = true;
      }
    })
    .catch(function(err) {
      console.error('LOI DOC JSONBIN:', err.message);
      isDataLoaded = true;
    });
}

let saveTimeout = null;
let isSaving = false;

function saveToJsonBin() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function() {
    if (isSaving) {
      setTimeout(function() { saveToJsonBin(); }, 1000);
      return;
    }
    isSaving = true;
    console.log('Dang luu len JSONBin...');
    var dataToSave = JSON.parse(JSON.stringify(database));
    jsonbinRequest('PUT', dataToSave)
      .then(function() {
        isSaving = false;
        console.log('=== LUU JSONBIN THANH CONG ===');
      })
      .catch(function(err) {
        isSaving = false;
        console.error('LOI LUU JSONBIN:', err.message);
      });
  }, 500);
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end', function() {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function getNow() {
  return new Date().toISOString();
}

function generateCode(prefix, counter) {
  var num = String(counter).padStart(5, '0');
  return 'PR-HR-001-001-' + prefix + num;
}

function getTypeCollection(type) {
  switch (type) {
    case 'recruitment': return database.recruitmentRequests;
    case 'candidate': return database.candidates;
    case 'interview': return database.interviews;
    case 'result': return database.interviewResults;
    case 'employee': return database.onboardingRecords;
    default: return null;
  }
}

function getTypeIdField(type) {
  switch (type) {
    case 'recruitment': return 'code';
    case 'candidate': return 'code';
    case 'interview': return 'code';
    case 'result': return 'code';
    case 'employee': return 'employeeCode';
    default: return 'code';
  }
}

function findRecord(type, id) {
  var col = getTypeCollection(type);
  var field = getTypeIdField(type);
  if (!col) return null;
  return col.find(function(r) { return r[field] === id; });
}

function formatDateVN(d) {
  if (!d) return '';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return String(dt.getDate()).padStart(2, '0') + '/' +
    String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
}

function formatDateTimeVN(d) {
  if (!d) return '';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return formatDateVN(d) + ' ' +
    String(dt.getHours()).padStart(2, '0') + ':' +
    String(dt.getMinutes()).padStart(2, '0');
}

// ===== EXCEL EXPORT using simple HTML table =====
function generateExcelBuffer(headers, rows, sheetName) {
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="UTF-8"><style>td{mso-number-format:"\\@";}</style></head><body>';
  html += '<table border="1"><thead><tr>';
  headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach(function(row) {
    html += '<tr>';
    row.forEach(function(cell) {
      html += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></body></html>';
  return Buffer.from(html, 'utf-8');
}

// ===== PDF Generation using HTML =====
function generatePdfHtml(type, record) {
  if (!record) return '<html><body><h1>Không tìm thấy dữ liệu</h1></body></html>';

  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PDF Document</title>';
  h += '<style>';
  h += 'body{font-family:Arial,sans-serif;margin:20px;color:#333}';
  h += 'h1{text-align:center;color:#1a237e;border-bottom:3px solid #1a237e;padding-bottom:10px}';
  h += 'h2{color:#283593;border-bottom:1px solid #ccc;padding-bottom:5px;margin-top:20px}';
  h += '.info-row{display:flex;margin-bottom:6px}.info-label{font-weight:700;min-width:220px;color:#1a237e}.info-value{flex:1}';
  h += '.signature-area{display:flex;justify-content:space-around;margin-top:50px;text-align:center}';
  h += '.sig-box{min-width:200px}.sig-title{font-weight:700;margin-bottom:60px}';
  h += 'table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background:#1a237e;color:#fff}';
  h += '.btn-area{text-align:center;margin:20px 0;padding:20px;background:#f5f5f5;border-radius:8px}';
  h += '.btn{padding:12px 30px;margin:0 10px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}';
  h += '.btn-edit{background:#f57c00;color:#fff}.btn-delete{background:#c62828;color:#fff}.btn-print{background:#4527a0;color:#fff}.btn-back{background:#546e7a;color:#fff}';
  h += '@media print{.no-print{display:none!important}}';
  h += '</style></head><body>';

  h += '<div class="no-print btn-area">';
  h += '<a href="/" class="btn btn-back">← Quay lại</a> ';
  h += '<button class="btn btn-print" onclick="window.print()">In / Xuất PDF</button>';
  h += '</div>';

  if (type === 'recruitment') {
    h += '<h1>PHIẾU ĐỀ XUẤT NHU CẦU TUYỂN DỤNG</h1>';
    var fields = [
      ['Mã yêu cầu', record.code],
      ['Phòng ban', record.department || ''],
      ['Vị trí tuyển', record.position || ''],
      ['Số lượng', record.quantity || ''],
      ['Lý do tuyển', Array.isArray(record.reasons) ? record.reasons.join(', ') : (record.reasons || '')],
      ['Mức lương dự kiến', record.salaryRange || ''],
      ['Ngày cần nhân sự', formatDateVN(record.needDate)],
      ['Người yêu cầu', record.proposer || ''],
      ['Ngày tạo yêu cầu', formatDateTimeVN(record.timestamp)],
      ['Trạng thái', record.status || 'Đang tuyển'],
      ['Số lần chỉnh sửa', (record.editHistory ? record.editHistory.length : 0) + '/3'],
      ['Người thao tác', (record.employeeName || '') + ' (' + (record.employeeId || '') + ')'],
      ['Thời gian thao tác', formatDateTimeVN(record.lastEditTimestamp || record.timestamp)]
    ];
    fields.forEach(function(f) {
      h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>';
    });
    if (record.reportTo) h += '<div class="info-row"><span class="info-label">Báo cáo cho:</span><span class="info-value">' + record.reportTo + '</span></div>';
    if (record.workplaces) h += '<div class="info-row"><span class="info-label">Địa điểm làm việc:</span><span class="info-value">' + (Array.isArray(record.workplaces) ? record.workplaces.join(', ') : record.workplaces) + '</span></div>';
    if (record.worktimes) h += '<div class="info-row"><span class="info-label">Thời gian làm việc:</span><span class="info-value">' + (Array.isArray(record.worktimes) ? record.worktimes.join(', ') : record.worktimes) + '</span></div>';
    if (record.jobDesc) h += '<div class="info-row"><span class="info-label">Mô tả công việc:</span><span class="info-value">' + record.jobDesc + '</span></div>';
    if (record.education) h += '<div class="info-row"><span class="info-label">Trình độ học vấn:</span><span class="info-value">' + record.education + '</span></div>';
    if (record.deadline) h += '<div class="info-row"><span class="info-label">Deadline:</span><span class="info-value">' + formatDateVN(record.deadline) + '</span></div>';
  } else if (type === 'candidate') {
    h += '<h1>PHIẾU THÔNG TIN ỨNG VIÊN</h1>';
    var cfields = [
      ['Mã ứng viên', record.code],
      ['Họ tên', record.fullName || ''],
      ['Giới tính', record.gender || ''],
      ['Năm sinh', record.dob ? record.dob.substring(0, 4) : ''],
      ['SĐT', record.phone || ''],
      ['Email', record.email || ''],
      ['Vị trí ứng tuyển', record.wish1 || record.position || ''],
      ['Mã yêu cầu tuyển dụng', record.recruitCode || ''],
      ['Nguồn tuyển', Array.isArray(record.sources) ? record.sources.join(', ') : (record.sources || '')],
      ['Ngày nộp hồ sơ', formatDateVN(record.timestamp)],
      ['Trạng thái', record.status || 'Đã cập nhật thông tin'],
      ['Số lần chỉnh sửa', (record.editHistory ? record.editHistory.length : 0) + '/3'],
      ['Người thao tác', (record.employeeName || '') + ' (' + (record.employeeId || '') + ')'],
      ['Thời gian thao tác', formatDateTimeVN(record.lastEditTimestamp || record.timestamp)]
    ];
    cfields.forEach(function(f) {
      h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>';
    });
    if (record.permanentAddr) h += '<div class="info-row"><span class="info-label">Địa chỉ:</span><span class="info-value">' + record.permanentAddr + '</span></div>';
    if (record.educationLevel) h += '<div class="info-row"><span class="info-label">Trình độ:</span><span class="info-value">' + record.educationLevel + '</span></div>';
  } else if (type === 'interview') {
    h += '<h1>LỊCH PHỎNG VẤN</h1>';
    var cd = database.candidates.find(function(c) { return c.code === record.candidateCode; });
    var ifields = [
      ['Mã lịch', record.code],
      ['Mã ứng viên', record.candidateCode || ''],
      ['Họ tên', cd ? cd.fullName : ''],
      ['Vị trí', record.position || ''],
      ['Ngày phỏng vấn', formatDateVN(record.date)],
      ['Giờ phỏng vấn', record.time || ''],
      ['Hình thức', record.interviewType || (record.location ? 'Offline' : 'Online')],
      ['Người phỏng vấn', record.interviewerName || ''],
      ['Địa điểm', record.location || ''],
      ['Trạng thái', record.status || 'Đã lên lịch'],
      ['Số lần chỉnh sửa', (record.editHistory ? record.editHistory.length : 0) + '/3'],
      ['Người thao tác', (record.employeeName || '') + ' (' + (record.employeeId || '') + ')'],
      ['Thời gian thao tác', formatDateTimeVN(record.timestamp)]
    ];
    ifields.forEach(function(f) {
      h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>';
    });
    if (record.tests && record.tests.length > 0) {
      h += '<div class="info-row"><span class="info-label">Bài kiểm tra:</span><span class="info-value">' + record.tests.join(', ') + '</span></div>';
    }
  } else if (type === 'result') {
    h += '<h1>KẾT QUẢ PHỎNG VẤN</h1>';
    var cd2 = database.candidates.find(function(c) { return c.code === record.candidateCode; });
    var rfields = [
      ['Mã kết quả', record.code],
      ['Mã ứng viên', record.candidateCode || ''],
      ['Họ tên', cd2 ? cd2.fullName : ''],
      ['Vị trí', record.position || ''],
      ['Người phỏng vấn', record.employeeName || ''],
      ['Điểm đánh giá', record.totalScore !== undefined ? record.totalScore + '/50' : ''],
      ['Kết quả', record.conclusion || ''],
      ['Mức lương đề xuất', record.proposedSalary || record.salaryRange || ''],
      ['Ngày cập nhật', formatDateTimeVN(record.timestamp)],
      ['Ghi chú', record.notes || record.strengths || ''],
      ['Số lần chỉnh sửa', (record.editHistory ? record.editHistory.length : 0) + '/3'],
      ['Người thao tác', (record.employeeName || '') + ' (' + (record.employeeId || '') + ')'],
      ['Thời gian thao tác', formatDateTimeVN(record.timestamp)]
    ];
    rfields.forEach(function(f) {
      h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>';
    });
    if (record.testScores) {
      h += '<h2>Điểm bài test</h2>';
      Object.keys(record.testScores).forEach(function(k) {
        h += '<div class="info-row"><span class="info-label">' + k + ':</span><span class="info-value">' + record.testScores[k] + '</span></div>';
      });
    }
  } else if (type === 'employee') {
    h += '<h1>NHÂN VIÊN MỚI NHẬN VIỆC</h1>';
    var efields = [
      ['Mã nhân viên', record.employeeCode || record.newEmployeeId || ''],
      ['Họ tên', record.candidateName || ''],
      ['Phòng ban', record.department || ''],
      ['Vị trí', record.position || ''],
      ['Ngày nhận việc', formatDateVN(record.startDate)],
      ['Mức lương', record.salary || record.probSalary || ''],
      ['Người quản lý', record.manager || ''],
      ['Loại hợp đồng', record.contractType || 'Thử việc'],
      ['Trạng thái', record.status || 'Đang thử việc'],
      ['Số lần chỉnh sửa', (record.editHistory ? record.editHistory.length : 0) + '/3'],
      ['Người thao tác', (record.employeeName || '') + ' (' + (record.employeeId || '') + ')'],
      ['Thời gian thao tác', formatDateTimeVN(record.timestamp)]
    ];
    efields.forEach(function(f) {
      h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>';
    });
  }

  h += '<div class="signature-area">';
  h += '<div class="sig-box"><div class="sig-title">Người lập</div><div>(Ký, ghi rõ họ tên)</div></div>';
  h += '<div class="sig-box"><div class="sig-title">Trưởng phòng nhân sự</div><div>(Ký, ghi rõ họ tên)</div></div>';
  h += '<div class="sig-box"><div class="sig-title">Ban Giám đốc</div><div>(Ký, ghi rõ họ tên)</div></div>';
  h += '</div>';

  // Edit/Delete buttons below PDF
  h += '<div class="no-print btn-area">';
  h += '<a href="/api/pdf/' + type + '/' + (record.code || record.employeeCode || '') + '" class="btn btn-print">Xem lại</a> ';
  h += '<button class="btn btn-edit" onclick="doEdit()">Edit</button> ';
  h += '<button class="btn btn-delete" onclick="doDelete()">Delete</button>';
  h += '</div>';

  h += '<script>';
  h += 'function doEdit(){';
  h += 'fetch("/api/' + type + '/' + (record.code || record.employeeCode || '') + '",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({_action:"check"})})';
  h += '.then(function(r){return r.json()}).then(function(d){if(d.error){alert(d.error)}else{alert("Sử dụng giao diện chính để sửa.")}}).catch(function(e){alert(e.message)})}';
  h += 'function doDelete(){';
  h += 'if(!confirm("Bạn có chắc muốn xóa?"))return;';
  h += 'fetch("/api/' + type + '/' + (record.code || record.employeeCode || '') + '",{method:"DELETE"})';
  h += '.then(function(r){return r.json()}).then(function(d){if(d.error){alert(d.error)}else{alert("Đã xóa thành công!");window.location.href="/"}}).catch(function(e){alert(e.message)})}';
  h += '<\/script>';

  h += '</body></html>';
  return h;
}

function canEditRecord(record) {
  var editCount = (record.editHistory && record.editHistory.length) || 0;
  if (editCount >= 3) return { allowed: false, message: 'Editing time expired. Đã đạt giới hạn chỉnh sửa tối đa (3 lần).' };
  if (record.firstUpdateTime) {
    var hoursSince = (new Date() - new Date(record.firstUpdateTime)) / (1000 * 60 * 60);
    if (hoursSince >= 24) return { allowed: false, message: 'Editing time expired. Đã quá 24 giờ kể từ lần sửa đầu tiên.' };
  }
  return { allowed: true };
}

function canDeleteRecord(record) {
  if (record.firstUpdateTime) {
    var hoursSince = (new Date() - new Date(record.firstUpdateTime)) / (1000 * 60 * 60);
    if (hoursSince >= 24) return { allowed: false, message: 'Delete time expired. Đã quá 24 giờ.' };
  }
  return { allowed: true };
}

function handleApi(req, res) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname;
  var query = parsedUrl.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // === TEST ===
  if (pathname === "/api/test" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "backend running",
      dataLoaded: isDataLoaded,
      recruitmentCount: database.recruitmentRequests.length,
      candidateCount: database.candidates.length,
      interviewCount: database.interviews.length,
      resultCount: database.interviewResults.length,
      employeeCount: database.onboardingRecords.length,
      binId: JSONBIN_BIN_ID ? 'configured' : 'missing',
      apiKey: JSONBIN_API_KEY ? 'configured' : 'missing'
    }));
    return true;
  }

  // === GET ALL DATA ===
  if (pathname === "/api/data" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database));
    return true;
  }

  // === POST DATA (save) ===
  if (pathname === "/api/data" && req.method === "POST") {
    readBody(req).then(function(body) {
      var changed = false;
      if (body.recruitmentRequests !== undefined) { database.recruitmentRequests = body.recruitmentRequests; changed = true; }
      if (body.candidates !== undefined) { database.candidates = body.candidates; changed = true; }
      if (body.interviews !== undefined) { database.interviews = body.interviews; changed = true; }
      if (body.interviewResults !== undefined) { database.interviewResults = body.interviewResults; changed = true; }
      if (body.onboardingRecords !== undefined) { database.onboardingRecords = body.onboardingRecords; changed = true; }
      if (body.history !== undefined) { database.history = body.history; changed = true; }
      if (body.counters !== undefined) { database.counters = body.counters; changed = true; }
      if (changed) saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Đã lưu dữ liệu" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // === RELOAD ===
  if (pathname === "/api/reload" && req.method === "GET") {
    loadFromJsonBin().then(function() {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        recruitmentRequests: database.recruitmentRequests.length,
        candidates: database.candidates.length,
        interviews: database.interviews.length,
        interviewResults: database.interviewResults.length,
        onboardingRecords: database.onboardingRecords.length
      }));
    });
    return true;
  }

  // === SEARCH BY DATE ===
  if (pathname === "/api/recruitment/search" && req.method === "GET") {
    var date = query.date || '';
    var filtered = database.recruitmentRequests.filter(function(r) {
      if (!date) return true;
      return (r.timestamp && r.timestamp.substring(0, 10) === date) ||
        (r.needDate && r.needDate === date) ||
        (r.deadline && r.deadline === date);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return true;
  }

  if (pathname === "/api/candidates/search" && req.method === "GET") {
    var date = query.date || '';
    var filtered = database.candidates.filter(function(c) {
      if (!date) return true;
      return (c.timestamp && c.timestamp.substring(0, 10) === date) ||
        (c.interviewDate && c.interviewDate === date);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return true;
  }

  if (pathname === "/api/interviews/search" && req.method === "GET") {
    var date = query.date || '';
    var filtered = database.interviews.filter(function(iv) {
      if (!date) return true;
      return (iv.timestamp && iv.timestamp.substring(0, 10) === date) ||
        (iv.date && iv.date === date);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return true;
  }

  if (pathname === "/api/results/search" && req.method === "GET") {
    var date = query.date || '';
    var filtered = database.interviewResults.filter(function(r) {
      if (!date) return true;
      return r.timestamp && r.timestamp.substring(0, 10) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return true;
  }

  if (pathname === "/api/employees/search" && req.method === "GET") {
    var date = query.date || '';
    var filtered = database.onboardingRecords.filter(function(e) {
      if (!date) return true;
      return (e.timestamp && e.timestamp.substring(0, 10) === date) ||
        (e.startDate && e.startDate === date);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return true;
  }

  // === PDF VIEW ===
  var pdfMatch = pathname.match(/^\/api\/pdf\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (pdfMatch && req.method === "GET") {
    var pdfType = pdfMatch[1];
    var pdfId = decodeURIComponent(pdfMatch[2]);
    var record = findRecord(pdfType, pdfId);
    var html = generatePdfHtml(pdfType, record);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  // === GET INTERVIEW TESTS FOR A CANDIDATE (for dynamic test scores) ===
  var testsMatch = pathname.match(/^\/api\/interviews\/tests\/(.+)$/);
  if (testsMatch && req.method === "GET") {
    var candCode = decodeURIComponent(testsMatch[1]);
    var iv = database.interviews.find(function(x) { return x.candidateCode === candCode; });
    if (iv && iv.tests) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tests: iv.tests, interviewCode: iv.code }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tests: [], interviewCode: null }));
    }
    return true;
  }

  // === CRUD APIs ===

  // POST /api/recruitment (create new)
  if (pathname === "/api/recruitment" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('R', database.counters.recruitmentRequestCounter);
      database.counters.recruitmentRequestCounter++;
      body.code = code;
      body.timestamp = body.timestamp || getNow();
      body.editHistory = [];
      body.status = body.status || 'Đang tuyển';
      database.recruitmentRequests.push(body);
      database.history.push({
        action: 'Tạo mới', target: 'Nhu cầu tuyển dụng', code: code,
        detail: 'Tạo mới: ' + (body.position || '') + ' - ' + (body.department || ''),
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, message: "Đã tạo nhu cầu tuyển dụng" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // POST /api/candidates
  if (pathname === "/api/candidates" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('C', database.counters.candidateCounter);
      database.counters.candidateCounter++;
      body.code = code;
      body.timestamp = body.timestamp || getNow();
      body.editHistory = [];
      body.status = body.status || 'Đã cập nhật thông tin';
      database.candidates.push(body);
      database.history.push({
        action: 'Tạo mới', target: 'Ứng viên', code: code,
        detail: 'Thêm mới: ' + (body.fullName || ''),
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, message: "Đã tạo ứng viên" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // POST /api/interviews
  if (pathname === "/api/interviews" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('T', database.counters.interviewFormCounter);
      database.counters.interviewFormCounter++;
      body.code = code;
      body.timestamp = body.timestamp || getNow();
      body.editHistory = [];
      body.status = body.status || 'Đã lên lịch';
      database.interviews.push(body);
      database.history.push({
        action: 'Tạo mới', target: 'Lịch phỏng vấn', code: code,
        detail: 'Đặt lịch PV cho ' + (body.candidateCode || ''),
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, message: "Đã tạo lịch phỏng vấn" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // POST /api/results
  if (pathname === "/api/results" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('A', database.counters.resultCounter);
      database.counters.resultCounter++;
      body.code = code;
      body.timestamp = body.timestamp || getNow();
      body.editHistory = [];

      // Dynamic test scores
      if (body.interviewCode) {
        var iv = database.interviews.find(function(x) { return x.code === body.interviewCode; });
        if (iv && iv.tests && body.scores) {
          var testScores = {};
          iv.tests.forEach(function(testName) {
            var key = testName.toLowerCase().replace(/\s+/g, '_');
            if (body.scores[key] !== undefined) {
              testScores[key] = Number(body.scores[key]);
            }
          });
          body.testScores = testScores;
        }
      }

      database.interviewResults.push(body);
      database.history.push({
        action: 'Tạo mới', target: 'Kết quả phỏng vấn', code: code,
        detail: 'Đánh giá ứng viên ' + (body.candidateCode || ''),
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, message: "Đã lưu kết quả" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // POST /api/employees
  if (pathname === "/api/employees" && req.method === "POST") {
    readBody(req).then(function(body) {
      var empCode = String(database.counters.employeeCounter);
      database.counters.employeeCounter++;
      body.employeeCode = empCode;
      body.code = empCode;
      body.timestamp = body.timestamp || getNow();
      body.editHistory = [];
      body.status = body.status || 'Đang thử việc';
      body.contractType = body.contractType || 'Thử việc';
      database.onboardingRecords.push(body);
      database.history.push({
        action: 'Tạo mới', target: 'Nhân viên mới', code: empCode,
        detail: 'Nhận việc: ' + (body.candidateName || ''),
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: empCode, message: "Đã xác nhận nhận việc" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // PUT /api/employees/:id/confirm
  var confirmMatch = pathname.match(/^\/api\/employees\/(.+)\/confirm$/);
  if (confirmMatch && req.method === "PUT") {
    var empId = decodeURIComponent(confirmMatch[1]);
    readBody(req).then(function(body) {
      var emp = database.onboardingRecords.find(function(e) {
        return e.employeeCode === empId || e.newEmployeeId === empId || e.code === empId;
      });
      if (!emp) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Không tìm thấy nhân viên" }));
        return;
      }
      emp.status = body.status || 'Chính thức';
      emp.contractType = body.contractType || emp.contractType;
      if (!emp.editHistory) emp.editHistory = [];
      emp.editHistory.push({
        employeeId: body.employeeId || '',
        employeeName: body.employeeName || '',
        timestamp: getNow(),
        changes: 'Xác nhận onboarding'
      });
      if (!emp.firstUpdateTime) emp.firstUpdateTime = getNow();
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Đã xác nhận" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // PUT /api/:type/:id (Edit with rules)
  var putMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (putMatch && req.method === "PUT") {
    var editType = putMatch[1];
    var editId = decodeURIComponent(putMatch[2]);
    readBody(req).then(function(body) {
      var record = findRecord(editType, editId);
      if (!record) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Không tìm thấy bản ghi" }));
        return;
      }

      // Check action
      if (body._action === 'check') {
        var check = canEditRecord(record);
        if (!check.allowed) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: check.message }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ canEdit: true, editCount: (record.editHistory ? record.editHistory.length : 0) }));
        }
        return;
      }

      var editCheck = canEditRecord(record);
      if (!editCheck.allowed) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: editCheck.message }));
        return;
      }

      // Apply edit
      if (!record.editHistory) record.editHistory = [];
      if (!record.firstUpdateTime) record.firstUpdateTime = getNow();

      record.editHistory.push({
        employeeId: body.employeeId || '',
        employeeName: body.employeeName || '',
        employeePosition: body.employeePosition || '',
        employeeDept: body.employeeDept || '',
        timestamp: getNow(),
        changes: body.changes || 'Cập nhật thông tin'
      });

      // Merge fields
      Object.keys(body).forEach(function(key) {
        if (key !== '_action' && key !== 'editHistory' && key !== 'firstUpdateTime' && key !== 'code' && key !== 'employeeCode') {
          record[key] = body[key];
        }
      });

      record.lastEditTimestamp = getNow();

      database.history.push({
        action: 'Sửa', target: editType, code: editId,
        detail: 'Cập nhật lần ' + record.editHistory.length + '/3',
        employeeId: body.employeeId || '', employeeName: body.employeeName || '',
        timestamp: getNow()
      });

      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, editCount: record.editHistory.length, message: "Đã cập nhật" }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // DELETE /api/:type/:id
  var deleteMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (deleteMatch && req.method === "DELETE") {
    var delType = deleteMatch[1];
    var delId = decodeURIComponent(deleteMatch[2]);
    var col = getTypeCollection(delType);
    var field = getTypeIdField(delType);

    if (!col) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Type không hợp lệ" }));
      return true;
    }

    var idx = col.findIndex(function(r) { return r[field] === delId; });
    if (idx === -1) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Không tìm thấy bản ghi" }));
      return true;
    }

    var delCheck = canDeleteRecord(col[idx]);
    if (!delCheck.allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: delCheck.message }));
      return true;
    }

    col.splice(idx, 1);
    database.history.push({
      action: 'Xóa', target: delType, code: delId,
      detail: 'Đã xóa bản ghi',
      timestamp: getNow()
    });
    saveToJsonBin();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Đã xóa" }));
    return true;
  }

  // === EXPORT EXCEL ===
  if (pathname === "/api/export/recruitment" && req.method === "GET") {
    var headers = ['STT', 'Mã yêu cầu', 'Phòng ban', 'Vị trí tuyển', 'Số lượng', 'Lý do tuyển',
      'Mức lương dự kiến', 'Ngày cần nhân sự', 'Người yêu cầu', 'Ngày tạo yêu cầu',
      'Trạng thái', 'Số lần chỉnh sửa', 'Người thao tác', 'Thời gian thao tác'];
    var rows = database.recruitmentRequests.map(function(r, i) {
      return [i + 1, r.code, r.department, r.position, r.quantity,
        Array.isArray(r.reasons) ? r.reasons.join(', ') : (r.reasons || ''),
        r.salaryRange || '', formatDateVN(r.needDate), r.proposer || '',
        formatDateTimeVN(r.timestamp), r.status || 'Đang tuyển',
        (r.editHistory ? r.editHistory.length : 0) + '/3',
        (r.employeeName || '') + ' (' + (r.employeeId || '') + ')',
        formatDateTimeVN(r.lastEditTimestamp || r.timestamp)];
    });
    var buf = generateExcelBuffer(headers, rows, 'NhuCauTuyenDung');
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename="NhuCauTuyenDung.xls"'
    });
    res.end(buf);
    return true;
  }

  if (pathname === "/api/export/candidates" && req.method === "GET") {
    var headers = ['STT', 'Mã ứng viên', 'Họ tên', 'Giới tính', 'Năm sinh', 'SĐT', 'Email',
      'Vị trí ứng tuyển', 'Mã yêu cầu tuyển dụng', 'Nguồn tuyển', 'Ngày nộp hồ sơ',
      'Trạng thái', 'Số lần chỉnh sửa', 'Người thao tác', 'Thời gian thao tác'];
    var rows = database.candidates.map(function(c, i) {
      return [i + 1, c.code, c.fullName, c.gender, c.dob ? c.dob.substring(0, 4) : '',
        c.phone, c.email || '', c.wish1 || c.position || '', c.recruitCode || '',
        Array.isArray(c.sources) ? c.sources.join(', ') : (c.sources || ''),
        formatDateVN(c.timestamp), c.status || 'Đã cập nhật thông tin',
        (c.editHistory ? c.editHistory.length : 0) + '/3',
        (c.employeeName || '') + ' (' + (c.employeeId || '') + ')',
        formatDateTimeVN(c.lastEditTimestamp || c.timestamp)];
    });
    var buf = generateExcelBuffer(headers, rows, 'UngVien');
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename="UngVien.xls"'
    });
    res.end(buf);
    return true;
  }

  if (pathname === "/api/export/interviews" && req.method === "GET") {
    var headers = ['STT', 'Mã lịch', 'Mã ứng viên', 'Họ tên', 'Vị trí', 'Ngày phỏng vấn',
      'Giờ phỏng vấn', 'Hình thức', 'Người phỏng vấn', 'Địa điểm',
      'Trạng thái', 'Số lần chỉnh sửa', 'Người thao tác', 'Thời gian thao tác'];
    var rows = database.interviews.map(function(iv, i) {
      var cd = database.candidates.find(function(c) { return c.code === iv.candidateCode; });
      return [i + 1, iv.code, iv.candidateCode, cd ? cd.fullName : '', iv.position,
        formatDateVN(iv.date), iv.time || '',
        iv.interviewType || 'Offline', iv.interviewerName || '', iv.location || '',
        iv.status || 'Đã lên lịch',
        (iv.editHistory ? iv.editHistory.length : 0) + '/3',
        (iv.employeeName || '') + ' (' + (iv.employeeId || '') + ')',
        formatDateTimeVN(iv.timestamp)];
    });
    var buf = generateExcelBuffer(headers, rows, 'LichPhongVan');
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename="LichPhongVan.xls"'
    });
    res.end(buf);
    return true;
  }

  if (pathname === "/api/export/results" && req.method === "GET") {
    var headers = ['STT', 'Mã kết quả', 'Mã ứng viên', 'Họ tên', 'Vị trí', 'Người phỏng vấn',
      'Điểm đánh giá', 'Kết quả', 'Mức lương đề xuất', 'Ngày cập nhật', 'Ghi chú',
      'Số lần chỉnh sửa', 'Người thao tác', 'Thời gian thao tác'];
    var rows = database.interviewResults.map(function(r, i) {
      var cd = database.candidates.find(function(c) { return c.code === r.candidateCode; });
      return [i + 1, r.code || '', r.candidateCode, cd ? cd.fullName : '', r.position,
        r.employeeName || '', r.totalScore !== undefined ? r.totalScore + '/50' : '',
        r.conclusion || '', r.proposedSalary || r.salaryRange || '',
        formatDateTimeVN(r.timestamp), r.notes || r.strengths || '',
        (r.editHistory ? r.editHistory.length : 0) + '/3',
        (r.employeeName || '') + ' (' + (r.employeeId || '') + ')',
        formatDateTimeVN(r.timestamp)];
    });
    var buf = generateExcelBuffer(headers, rows, 'KetQuaPhongVan');
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename="KetQuaPhongVan.xls"'
    });
    res.end(buf);
    return true;
  }

  if (pathname === "/api/export/employees" && req.method === "GET") {
    var headers = ['STT', 'Mã nhân viên', 'Họ tên', 'Phòng ban', 'Vị trí', 'Ngày nhận việc',
      'Mức lương', 'Người quản lý', 'Loại hợp đồng', 'Trạng thái',
      'Số lần chỉnh sửa', 'Người thao tác', 'Thời gian thao tác'];
    var rows = database.onboardingRecords.map(function(e, i) {
      return [i + 1, e.employeeCode || e.newEmployeeId || '', e.candidateName || '',
        e.department || '', e.position || '', formatDateVN(e.startDate),
        e.salary || e.probSalary || '', e.manager || '',
        e.contractType || 'Thử việc', e.status || 'Đang thử việc',
        (e.editHistory ? e.editHistory.length : 0) + '/3',
        (e.employeeName || '') + ' (' + (e.employeeId || '') + ')',
        formatDateTimeVN(e.timestamp)];
    });
    var buf = generateExcelBuffer(headers, rows, 'NhanVienMoi');
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename="NhanVienMoi.xls"'
    });
    res.end(buf);
    return true;
  }

  // === GET lists ===
  if (pathname === "/api/recruitment" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database.recruitmentRequests));
    return true;
  }

  if (pathname === "/api/candidates" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database.candidates));
    return true;
  }

  if (pathname === "/api/interviews" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database.interviews));
    return true;
  }

  if (pathname === "/api/results" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database.interviewResults));
    return true;
  }

  if (pathname === "/api/employees" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database.onboardingRecords));
    return true;
  }

  return false;
}
const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hệ Thống Quản Lý Tuyển Dụng</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#e8f0fe 0%,#f5f7fa 100%);min-height:100vh;color:#333}
.container{max-width:1400px;margin:0 auto;padding:20px}
.view{display:none}.view.active{display:block}
h1,h2,h3{color:#1a237e;margin-bottom:15px}
h1{text-align:center;font-size:28px;padding:20px 0}
h2{font-size:22px;border-bottom:2px solid #1a237e;padding-bottom:8px}
h3{font-size:18px;color:#283593;margin-top:15px}
.login-wrapper{display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.login-box{background:#fff;border-radius:16px;padding:40px;width:100%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.12)}
.login-box h1{color:#1a237e;margin-bottom:25px;font-size:24px}
.login-box .form-group{margin-bottom:16px}
.login-box .form-group label{display:block;font-weight:600;margin-bottom:5px;color:#37474f;font-size:14px}
.login-box .form-group input,.login-box .form-group select{width:100%;padding:12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px}
.login-box .form-group input:focus,.login-box .form-group select:focus{outline:none;border-color:#1976d2;box-shadow:0 0 0 2px rgba(25,118,210,.15)}
.login-btn{width:100%;padding:14px;background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:all .3s}
.login-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.2)}
.user-bar{background:linear-gradient(135deg,#1a237e,#283593);color:#fff;padding:12px 20px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.user-bar .user-info{font-size:14px;line-height:1.6}
.user-bar .user-info strong{color:#90caf9}
.user-bar .clock{font-size:13px;color:#bbdefb;text-align:right}
.user-bar .logout-btn{padding:8px 18px;background:#ef5350;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;transition:all .3s}
.user-bar .logout-btn:hover{background:#c62828}
.main-btn{display:block;width:100%;min-height:55px;margin:12px 0;padding:15px 25px;font-size:17px;font-weight:600;color:#fff;border:none;border-radius:12px;cursor:pointer;transition:all .3s;text-align:center}
.main-btn:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.2)}
.btn-recruitment{background:linear-gradient(135deg,#1565c0,#1976d2)}
.btn-candidate{background:linear-gradient(135deg,#00838f,#00acc1)}
.btn-interview{background:linear-gradient(135deg,#6a1b9a,#8e24aa)}
.btn-result{background:linear-gradient(135deg,#e65100,#ef6c00)}
.btn-onboarding{background:linear-gradient(135deg,#2e7d32,#43a047)}
.btn-history{background:linear-gradient(135deg,#455a64,#607d8b)}
.btn{padding:10px 22px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .3s;margin:4px}
.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.15)}
.btn-primary{background:#1976d2;color:#fff}
.btn-success{background:#43a047;color:#fff}
.btn-warning{background:#ef6c00;color:#fff}
.btn-danger{background:#c62828;color:#fff}
.btn-info{background:#00838f;color:#fff}
.btn-back{background:#546e7a;color:#fff;margin-bottom:15px}
.btn-excel{background:#1b5e20;color:#fff}
.btn-print{background:#4527a0;color:#fff}
.btn-edit{background:#f57c00;color:#fff}
.btn-delete{background:#c62828;color:#fff}
.btn-sm{padding:6px 14px;font-size:12px}
.btn-disabled{opacity:0.5;cursor:not-allowed!important;pointer-events:none}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-weight:600;margin-bottom:5px;color:#37474f;font-size:14px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px;transition:border-color .3s}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:#1976d2;box-shadow:0 0 0 2px rgba(25,118,210,.15)}
.form-group textarea{min-height:80px;resize:vertical}
.checkbox-group{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0}
.checkbox-group label{font-weight:normal;display:flex;align-items:center;gap:5px;font-size:14px}
.form-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
table{width:100%;border-collapse:collapse;margin:15px 0;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
table thead th{background:#1a237e;color:#fff;padding:12px 8px;font-size:12px;text-align:center;white-space:nowrap}
table tbody td{padding:8px 6px;font-size:12px;text-align:center;border-bottom:1px solid #e0e0e0;word-break:break-word;max-width:200px}
table tbody tr:nth-child(even){background:#f5f7fa}
table tbody tr:hover{background:#e3f2fd}
.link-code{color:#1565c0;cursor:pointer;text-decoration:underline;font-weight:600}
.link-code:hover{color:#0d47a1}
.search-bar{background:#fff;padding:15px;border-radius:10px;margin-bottom:15px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.search-bar label{font-size:13px;font-weight:600}
.search-bar input{padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}
.form-row{display:flex;flex-wrap:wrap;gap:15px}
.form-row .form-group{flex:1;min-width:200px}
.score-input{width:70px!important;text-align:center;display:inline-block!important}
.score-table{margin:10px 0}
.score-table td{padding:8px 12px;text-align:left}
.score-table td:last-child{text-align:center}
.badge{padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}
.badge-green{background:#43a047}.badge-orange{background:#ef6c00}.badge-red{background:#c62828}.badge-blue{background:#1565c0}
.exp-row{display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.exp-row input{flex:1;min-width:100px;padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}
.pdf-preview{background:#fff;padding:30px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);margin-top:15px;font-size:14px;line-height:1.7}
.pdf-preview h2{text-align:center;border-bottom:3px solid #1a237e;padding-bottom:10px;margin-bottom:20px}
.pdf-preview h3{border-bottom:1px solid #ccc;padding-bottom:5px;margin:18px 0 10px}
.pdf-preview .info-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}
.pdf-preview .info-row .info-label{font-weight:700;min-width:200px;color:#1a237e}
.pdf-preview .info-row .info-value{flex:1}
.pdf-preview .signature-area{display:flex;justify-content:space-around;margin-top:40px;text-align:center}
.pdf-preview .signature-area div{min-width:200px}
.pdf-preview .signature-area .sig-title{font-weight:700;margin-bottom:60px}
.table-wrapper{overflow-x:auto}
.history-log{background:#f5f5f5;border-radius:8px;padding:15px;margin-top:15px;max-height:300px;overflow-y:auto}
.history-item{padding:8px;border-bottom:1px solid #e0e0e0;font-size:13px}
.history-item:last-child{border-bottom:none}
.history-item .history-time{color:#1565c0;font-weight:600}
.history-item .history-action{color:#e65100;font-weight:600}
.cv-cell{min-width:120px;white-space:nowrap}
.edit-history-section{margin-top:30px;border-top:2px solid #1a237e;padding-top:15px}
.edit-history-section h3{color:#e65100;border-bottom:1px solid #e65100}
.edit-history-item{background:#fff3e0;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:12px;border-left:3px solid #ef6c00}
.edit-count-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;margin-left:8px}
.edit-count-ok{background:#43a047}
.edit-count-warn{background:#ef6c00}
.edit-count-max{background:#c62828}
.lock-info{background:#e3f2fd;border-radius:8px;padding:10px;margin:10px 0;font-size:13px;border-left:3px solid #1976d2}
.concurrent-users-bar{background:#e8f5e9;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.concurrent-users-bar .user-tag{background:#1976d2;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px}
@media print{body *{visibility:hidden}#printArea,#printArea *{visibility:visible}#printArea{position:absolute;left:0;top:0;width:100%;padding:20px}.btn,.user-bar,.search-bar,.no-print{display:none!important}}
@media(max-width:768px){.form-row{flex-direction:column}.search-bar{flex-direction:column}table{font-size:11px}table thead th,table tbody td{padding:5px 3px}.user-bar{flex-direction:column;text-align:center}}
</style>
</head>
<body>
<div id="loginView" class="view">
<div class="login-wrapper"><div class="login-box">
<h1>HỆ THỐNG QUẢN LÝ<br>TUYỂN DỤNG</h1>
<p style="text-align:center;color:#666;margin-bottom:20px;">Vui lòng đăng nhập để tiếp tục</p>
<div class="form-group"><label>Mã nhân viên *</label><input type="text" id="loginEmpId" placeholder="VD: 268493"></div>
<div class="form-group"><label>Họ và tên * (IN HOA)</label><input type="text" id="loginEmpName" placeholder="NGUYỄN VĂN A" style="text-transform:uppercase"></div>
<div class="form-group"><label>Chức vụ *</label><select id="loginEmpPosition"><option value="">-- Chọn --</option><option>Công nhân</option><option>Trợ lý</option><option>Nhân viên</option><option>Kỹ sư</option><option>Trưởng nhóm</option><option>Trưởng bộ phận</option><option>Trưởng phòng</option></select></div>
<div class="form-group"><label>Phòng ban *</label><select id="loginEmpDept"></select></div>
<br><button class="login-btn" id="btnLogin">Đăng nhập</button>
</div></div></div>
<div class="container" id="appContainer" style="display:none">
<div class="user-bar">
<div class="user-info">
<div><strong id="barEmpName"></strong> | Mã nhân viên: <strong id="barEmpId"></strong></div>
<div>Chức vụ: <strong id="barEmpPosition"></strong> | Phòng ban: <strong id="barEmpDept"></strong></div>
</div>
<div style="display:flex;align-items:center;gap:15px;">
<div class="clock" id="barClock"></div>
<button class="logout-btn" id="btnLogout">Đăng xuất</button>
</div></div>
<div id="concurrentUsersBar" class="concurrent-users-bar" style="display:none">
<span>Người đang chỉnh sửa đồng thời:</span>
<span id="concurrentUsersList"></span>
<span id="concurrentUsersCount" style="margin-left:auto;font-weight:700"></span>
</div>
<div id="mainView" class="view">
<h1>HỆ THỐNG QUẢN LÝ<br>TUYỂN DỤNG</h1>
<button class="main-btn btn-recruitment" id="btnGoRecruitment">Nhu cầu tuyển dụng</button>
<button class="main-btn btn-candidate" id="btnGoCandidate">Thông tin ứng viên</button>
<button class="main-btn btn-interview" id="btnGoInterview">Lịch phỏng vấn</button>
<button class="main-btn btn-result" id="btnGoResult">Kết quả phỏng vấn</button>
<button class="main-btn btn-onboarding" id="btnGoOnboarding">Nhân viên mới nhận việc</button>
<button class="main-btn btn-history" id="btnGoHistory" style="display:none">Lịch sử thao tác</button>
</div>
<div id="recruitmentView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitment">← Quay lại</button>
<h2>Danh sách nhu cầu tuyển dụng</h2>
<div class="search-bar">
<div><label>Từ ngày:</label><br><input type="date" id="recruitSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="recruitSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="recruitSearchText" placeholder="Mã, vị trí, người đề xuất..."></div>
<button class="btn btn-primary" id="btnSearchRecruitment">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportRecruitment">Xuất Excel</button>
<button class="btn btn-success" id="btnAddRecruitment">+ Tạo mới</button>
</div>
<div id="recruitmentTableContainer" class="table-wrapper"></div>
</div>
<div id="recruitmentFormView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentForm">← Quay lại</button>
<h2 id="recruitmentFormTitle">Tạo nhu cầu tuyển dụng</h2>
<div id="recruitmentEditInfo" style="display:none"></div>
<div class="form-section"><h3>I. Thông tin chung</h3>
<div class="form-row"><div class="form-group"><label>Phòng ban yêu cầu *</label><select id="recDepartment"></select></div>
<div class="form-group"><label>Người đề xuất * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Vị trí tuyển dụng *</label><input type="text" id="recPosition"></div>
<div class="form-group"><label>Cấp bậc *</label><select id="recLevel"></select></div></div>
<div class="form-row"><div class="form-group"><label>Số lượng *</label><input type="number" id="recQuantity" min="1" value="1"></div></div>
<div class="form-group"><label>Lý do tuyển dụng *</label>
<div class="checkbox-group">
<label><input type="checkbox" name="recReason" value="Mở rộng hoạt động"> Mở rộng hoạt động</label>
<label><input type="checkbox" name="recReason" value="Thay thế nhân viên nghỉ việc"> Thay thế nhân viên nghỉ việc</label>
<label><input type="checkbox" name="recReason" value="Bổ sung nhân lực"> Bổ sung nhân lực</label>
<label><input type="checkbox" name="recReason" value="Khác"> Khác</label>
</div></div>
<div class="form-group"><label>Thời gian cần nhân sự *</label><input type="date" id="recNeedDate"></div>
</div>
<div class="form-section"><h3>II. Thông tin vị trí</h3>
<div class="form-group"><label>Báo cáo cho *</label><input type="text" id="recReportTo" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()" placeholder="NHẬP TÊN IN HOA"></div>
<div class="form-group"><label>Địa điểm làm việc *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorkplace" value="Nhà máy 1"> Nhà máy 1</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 2"> Nhà máy 2</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 3"> Nhà máy 3</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 4"> Nhà máy 4</label></div></div>
<div class="form-group"><label>Thời gian làm việc *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorktime" value="Hành chính"> Hành chính</label><label><input type="checkbox" name="recWorktime" value="Hành chính kíp"> Hành chính kíp</label><label><input type="checkbox" name="recWorktime" value="2 ca"> 2 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca"> 3 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca kíp"> 3 ca kíp</label></div></div>
<div class="form-group"><label>Môi trường làm việc</label><textarea id="recEnvironment"></textarea></div>
<div class="form-group"><label>Mô tả công việc *</label><textarea id="recJobDesc"></textarea></div>
<div class="form-group"><label>Chế độ phúc lợi</label><textarea id="recBenefits"></textarea></div>
<div class="form-group"><label>Mức lương đề xuất</label><input type="text" id="recSalaryRange" placeholder="VD: 8,000,000 - 12,000,000 VNĐ"></div>
</div>
<div class="form-section"><h3>III. Yêu cầu ứng viên</h3>
<div class="form-row"><div class="form-group"><label>Trình độ học vấn *</label><select id="recEducation"></select></div>
<div class="form-group"><label>Chuyên ngành</label><input type="text" id="recMajor"></div></div>
<div class="form-row"><div class="form-group"><label>Kinh nghiệm tối thiểu</label><input type="text" id="recExperience"></div>
<div class="form-group"><label>Ngoại ngữ</label><input type="text" id="recLanguage"></div></div>
<div class="form-group"><label>Kỹ năng chuyên môn</label><textarea id="recTechSkill"></textarea></div>
<div class="form-group"><label>Kỹ năng mềm</label><textarea id="recSoftSkill"></textarea></div>
<div class="form-group"><label>Chứng chỉ</label><input type="text" id="recCertificate"></div>
<div class="form-group"><label>Deadline tuyển dụng *</label><input type="date" id="recDeadline"></div>
</div>
<button class="btn btn-success" id="btnSubmitRecruitment" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
</div>
<div id="recruitmentDetailView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintRecruitment">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditRecruitment">Sửa</button>
<button class="btn btn-delete" id="btnDeleteRecruitment">Xóa</button>
</div>
<div id="recruitmentDetailContent" class="form-section"></div>
</div>
<div id="candidateView" class="view">
<button class="btn btn-back" id="btnBackFromCandidate">← Quay lại</button>
<h2>Danh sách ứng viên</h2>
<div class="search-bar">
<div><label>Từ ngày:</label><br><input type="date" id="candidateSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="candidateSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="candidateSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<button class="btn btn-primary" id="btnSearchCandidate">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportCandidate">Xuất Excel</button>
<button class="btn btn-success" id="btnAddCandidate">+ Thêm ứng viên</button>
</div>
<div id="candidateTableContainer" class="table-wrapper"></div>
</div>
<div id="candidateFormView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateForm">← Quay lại</button>
<h2 id="candidateFormTitle">THÔNG TIN ỨNG VIÊN</h2>
<div id="candidateEditInfo" style="display:none"></div>
<div class="form-section"><h3>1. Thông tin cá nhân</h3>
<div class="form-row"><div class="form-group"><label>Mã nhu cầu tuyển dụng *</label><input type="text" id="candRecruitCode" placeholder="VD: PR-HR-001-001-R00001"></div>
<div class="form-group"><label>Bộ phận thi tuyển *</label><select id="candDepartment"></select></div></div>
<div class="form-row"><div class="form-group"><label>Ngày phỏng vấn *</label><input type="date" id="candInterviewDate"></div></div>
<div class="form-row"><div class="form-group"><label>Họ và tên * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Ngày sinh *</label><input type="date" id="candDob"></div></div>
<div class="form-row"><div class="form-group"><label>Giới tính *</label><select id="candGender"><option value="">-- Chọn --</option><option>Nam</option><option>Nữ</option></select></div>
<div class="form-group"><label>Dân tộc *</label><input type="text" id="candEthnicity"></div></div>
<div class="form-row"><div class="form-group"><label>Tình trạng kết hôn *</label><select id="candMarital"><option value="">-- Chọn --</option><option>Độc thân</option><option>Kết hôn</option></select></div>
<div class="form-group"><label>Số con</label><input type="number" id="candChildren" min="0" value="0"></div></div>
<div class="form-row"><div class="form-group"><label>Số căn cước công dân *</label><input type="text" id="candCCCD"></div>
<div class="form-group"><label>Ngày cấp *</label><input type="date" id="candCCCDDate"></div></div>
<div class="form-row"><div class="form-group"><label>Nơi cấp *</label><input type="text" id="candCCCDPlace"></div>
<div class="form-group"><label>Hạn căn cước</label><input type="date" id="candCCCDExpiry"></div></div>
<div class="form-row"><div class="form-group"><label>Số điện thoại *</label><input type="tel" id="candPhone" placeholder="0xxxxxxxxx"></div>
<div class="form-group"><label>Số điện thoại người thân</label><input type="tel" id="candRelativePhone"></div></div>
<div class="form-group"><label>Địa chỉ thường trú *</label><input type="text" id="candPermanentAddr"></div>
<div class="form-group"><label>Địa chỉ tạm trú</label><input type="text" id="candTempAddr"></div>
<div class="form-row"><div class="form-group"><label>Chiều cao (cm)</label><input type="number" id="candHeight"></div>
<div class="form-group"><label>Cân nặng (kg)</label><input type="number" id="candWeight"></div>
<div class="form-group"><label>Cỡ giày</label><input type="text" id="candShoeSize"></div></div>
</div>
<div class="form-section"><h3>2. Trình độ & Kinh nghiệm</h3>
<div class="form-group"><label>Trình độ học vấn *</label><select id="candEducationLevel"></select></div>
<div class="form-row"><div class="form-group"><label>Tên trường</label><input type="text" id="candSchoolName"></div>
<div class="form-group"><label>Năm tốt nghiệp</label><input type="text" id="candGradYear"></div></div>
<div class="form-group"><label>Chuyên ngành</label><input type="text" id="candMajor"></div>
<label style="font-weight:600;margin:10px 0 5px">Kinh nghiệm làm việc</label>
<div id="experienceRows"><div class="exp-row"><input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương"></div></div>
<button class="btn btn-info" id="btnAddExpRow">+ Thêm dòng</button>
</div>
<div class="form-section"><h3>3. Xác nhận & Nguyện vọng</h3>
<div class="form-group"><label>Đã phỏng vấn ở công ty chưa? *</label><select id="candPrevInterview"><option value="">-- Chọn --</option><option>Chưa</option><option>Đã phỏng vấn</option></select></div>
<div class="form-row"><div class="form-group"><label>Thời gian có thể đi làm *</label><select id="candAvailability"><option value="">-- Chọn --</option><option>Đi làm ngay</option><option>Theo lịch hẹn</option></select></div>
<div class="form-group"><label>Đi làm từ ngày</label><input type="date" id="candStartDate"></div></div>
<div class="form-row"><div class="form-group"><label>Hút thuốc?</label><select id="candSmoking"><option>Không</option><option>Có</option></select></div>
<div class="form-group"><label>Bệnh tiền sử?</label><select id="candDisease"><option>Không</option><option>Có</option></select></div></div>
<div class="form-group"><label>Biết thông tin tuyển dụng qua đâu?</label>
<div class="checkbox-group"><label><input type="checkbox" name="candSource" value="Facebook"> Facebook</label><label><input type="checkbox" name="candSource" value="Người quen giới thiệu"> Người quen giới thiệu</label><label><input type="checkbox" name="candSource" value="Biển quảng cáo"> Biển quảng cáo</label><label><input type="checkbox" name="candSource" value="Website"> Website</label><label><input type="checkbox" name="candSource" value="Khác"> Khác</label></div></div>
<div class="form-group"><label>Đăng ký xe bus?</label><select id="candBus"><option>Không</option><option>Có</option></select></div>
<div class="form-row" id="candBusDetail" style="display:none"><div class="form-group"><label>Điểm đón</label><input type="text" id="candBusStop"></div></div>
<div class="form-row"><div class="form-group"><label>Nguyện vọng 1 *</label><input type="text" id="candWish1"></div>
<div class="form-group"><label>Nguyện vọng 2</label><input type="text" id="candWish2"></div>
<div class="form-group"><label>Nguyện vọng 3</label><input type="text" id="candWish3"></div></div>
</div>
<div class="form-section" id="candCVSection" style="display:none"><h3>Upload CV (PDF) *</h3>
<div class="form-group"><input type="file" id="candCVFile" accept=".pdf"></div></div>
<div class="form-section"><label><input type="checkbox" id="candCommitment"> Tôi xin xác nhận thông tin trên là đúng sự thật. *</label></div>
<button class="btn btn-success" id="btnSubmitCandidate" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
</div>
<div id="candidateDetailView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintCandidate">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditCandidate">Sửa</button>
<button class="btn btn-delete" id="btnDeleteCandidate">Xóa</button>
</div>
<div id="candidateDetailContent" class="form-section"></div>
</div>
<div id="interviewView" class="view">
<button class="btn btn-back" id="btnBackFromInterview">← Quay lại</button>
<h2>Đặt lịch phỏng vấn</h2>
<div class="search-bar"><div><label>Từ ngày:</label><br><input type="date" id="interviewSearchFrom"></div><div><label>Đến ngày:</label><br><input type="date" id="interviewSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="interviewSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<button class="btn btn-primary" id="btnSearchInterview">Tìm kiếm</button><button class="btn btn-excel" id="btnExportInterview">Xuất Excel</button></div>
<div id="interviewCandidateTableContainer" class="table-wrapper"></div>
</div>
<div id="scheduleInterviewFormView" class="view">
<button class="btn btn-back" id="btnBackFromScheduleInterview">← Quay lại</button>
<h2>Đặt lịch phỏng vấn</h2>
<div class="form-section">
<div class="form-group"><label>Ứng viên</label><select id="ivCandidateSelect"></select></div>
<div class="form-group"><label>Mã nhân viên người phỏng vấn *</label><input type="text" id="ivInterviewerCode"></div>
<div id="ivInterviewerInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div>
<div class="form-group"><label>Vị trí phỏng vấn *</label><select id="ivPosition"></select></div>
<div class="form-row"><div class="form-group"><label>Ngày phỏng vấn *</label><input type="date" id="ivDate"></div>
<div class="form-group"><label>Giờ *</label><input type="time" id="ivTime"></div></div>
<div class="form-group"><label>Hình thức *</label><select id="ivType"><option value="">-- Chọn --</option><option>Online</option><option>Offline</option></select></div>
<div class="form-group"><label>Địa điểm *</label><select id="ivLocation"><option value="">-- Chọn --</option><option>Nhà máy 1</option><option>Nhà máy 2</option><option>Nhà máy 3</option><option>Nhà máy 4</option></select></div>
<div class="form-group"><label>Bài kiểm tra (ít nhất 1) *</label>
<div class="checkbox-group"><label><input type="checkbox" name="ivTest" value="Tiếng Anh"> Tiếng Anh</label><label><input type="checkbox" name="ivTest" value="IQ"> IQ</label><label><input type="checkbox" name="ivTest" value="Nhân cách"> Nhân cách</label></div></div>
</div>
<button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Lưu lịch phỏng vấn</button>
</div>
<div id="interviewExcelView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewExcel">← Quay lại</button>
<h2>Bảng lịch phỏng vấn</h2>
<button class="btn btn-excel" id="btnExportInterviewExcel">Xuất Excel</button>
<button class="btn btn-print" id="btnPrintInterviewExcel">In</button>
<div id="interviewExcelTableContainer" class="table-wrapper"></div>
</div>
<div id="interviewResultFormView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewResult">← Quay lại</button>
<h2>Kết quả phỏng vấn</h2>
<div class="search-bar"><div><label>Từ ngày:</label><br><input type="date" id="resultSearchFrom"></div><div><label>Đến ngày:</label><br><input type="date" id="resultSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="resultSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<button class="btn btn-primary" id="btnSearchResult">Tìm kiếm</button><button class="btn btn-excel" id="btnExportResult">Xuất Excel</button></div>
<div id="resultInterviewTableContainer" class="table-wrapper"></div>
<div id="resultFormContainer" style="display:none"></div>
</div>
<div id="resultDetailView" class="view">
<button class="btn btn-back" id="btnBackFromResultDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px"><button class="btn btn-print" id="btnPrintResult">In / Xuất PDF</button></div>
<div id="resultDetailContent" class="form-section"></div>
</div>
<div id="proposedExcelView" class="view">
<button class="btn btn-back" id="btnBackFromProposedExcel">← Quay lại</button>
<h2>Bảng đề xuất tuyển dụng</h2>
<button class="btn btn-excel" id="btnExportProposedExcel">Xuất Excel</button>
<div id="proposedExcelTableContainer" class="table-wrapper"></div>
</div>
<div id="offerFormView" class="view">
<button class="btn btn-back" id="btnBackFromOffer">← Quay lại</button>
<h2>Thông báo trúng tuyển</h2>
<div id="offerFormContent"></div>
</div>
<div id="onboardingFormView" class="view">
<button class="btn btn-back" id="btnBackFromOnboarding">← Quay lại</button>
<h2>Xác nhận nhận việc</h2>
<div class="search-bar"><div><label>Từ ngày:</label><br><input type="date" id="onboardSearchFrom"></div><div><label>Đến ngày:</label><br><input type="date" id="onboardSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="onboardSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<button class="btn btn-primary" id="btnSearchOnboarding">Tìm kiếm</button><button class="btn btn-excel" id="btnExportOnboarding">Xuất Excel</button></div>
<div id="onboardingListContainer" class="table-wrapper"></div>
<div id="onboardingFormContent" style="display:none"></div>
</div>
<div id="historyView" class="view">
<button class="btn btn-back" id="btnBackFromHistory">← Quay lại</button>
<h2>Lịch sử thao tác</h2>
<div class="search-bar">
<div><label>Từ ngày:</label><br><input type="date" id="historySearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="historySearchTo"></div>
<button class="btn btn-primary" id="btnSearchHistory">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportHistory">Xuất Excel</button>
</div>
<div id="historyTableContainer" class="table-wrapper"></div>
</div>
<div id="printArea" style="display:none"></div>
</div>
`;
const scriptContent = `
<script>
var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1,resultCounter=1,employeeCounter=268600;
var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[];
var actionHistory=[];
var editingRecruitmentCode=null,editingCandidateCode=null;
var MAX_CONCURRENT_EDITORS=10;
var MAX_EDIT_COUNT=3;
var DELETE_LOCK_HOURS=24;
var activeEditors={};
function getEditorKey(type,code){return type+':'+code}
function acquireEditLock(type,code){var key=getEditorKey(type,code);if(!activeEditors[key])activeEditors[key]=[];var now=new Date();activeEditors[key]=activeEditors[key].filter(function(e){return(now-new Date(e.timestamp))<30*60*1000});var existing=activeEditors[key].find(function(e){return e.userId===currentUser.id});if(existing){existing.timestamp=now.toISOString();updateConcurrentUsersDisplay(key);return true}if(activeEditors[key].length>=MAX_CONCURRENT_EDITORS){alert('Đã đạt tối đa '+MAX_CONCURRENT_EDITORS+' người đang chỉnh sửa đồng thời.');return false}activeEditors[key].push({userId:currentUser.id,userName:currentUser.name,timestamp:now.toISOString()});updateConcurrentUsersDisplay(key);return true}
function releaseEditLock(type,code){var key=getEditorKey(type,code);if(!activeEditors[key])return;activeEditors[key]=activeEditors[key].filter(function(e){return e.userId!==currentUser.id});if(activeEditors[key].length===0)delete activeEditors[key];hideConcurrentUsersDisplay()}
function updateConcurrentUsersDisplay(key){var bar=document.getElementById('concurrentUsersBar');var list=document.getElementById('concurrentUsersList');var count=document.getElementById('concurrentUsersCount');if(!activeEditors[key]||activeEditors[key].length<=1){bar.style.display='none';return}bar.style.display='flex';var html='';activeEditors[key].forEach(function(e){html+='<span class="user-tag">'+e.userName+' ('+e.userId+')</span>'});list.innerHTML=html;count.textContent=activeEditors[key].length+'/'+MAX_CONCURRENT_EDITORS+' người'}
function hideConcurrentUsersDisplay(){document.getElementById('concurrentUsersBar').style.display='none'}
function getEditCount(record){return(record.editHistory&&record.editHistory.length)||0}
function canEdit(record){var count=getEditCount(record);if(count>=MAX_EDIT_COUNT)return false;if(record.firstUpdateTime){var hours=(new Date()-new Date(record.firstUpdateTime))/(1000*60*60);if(hours>=24)return false}return true}
function canDelete(record){if(record.firstUpdateTime){var hours=(new Date()-new Date(record.firstUpdateTime))/(1000*60*60);if(hours>=24)return false}return true}
function getEditCountBadge(record){var count=getEditCount(record);var cls=count===0?'edit-count-ok':(count<MAX_EDIT_COUNT?'edit-count-warn':'edit-count-max');return'<span class="edit-count-badge '+cls+'">'+count+'/'+MAX_EDIT_COUNT+' lần sửa</span>'}
function renderEditHistoryHTML(record){if(!record.editHistory||record.editHistory.length===0)return"";var h='<div class="edit-history-section"><h3>LỊCH SỬ CHỈNH SỬA '+getEditCountBadge(record)+'</h3>';record.editHistory.forEach(function(edit,idx){h+='<div class="edit-history-item">';h+='<strong>Lần sửa '+(idx+1)+'/'+MAX_EDIT_COUNT+'</strong> | ';h+='<span style="color:#1565c0">'+formatDateTime(edit.timestamp)+'</span><br>';h+='Người sửa: '+edit.employeeName+' ('+edit.employeeId+')';if(edit.changes){h+='<br>Thay đổi: '+edit.changes}h+='</div>'});if(getEditCount(record)>=MAX_EDIT_COUNT){h+='<div style="color:#c62828;font-weight:700;margin-top:8px">Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần).</div>'}h+='</div>';return h}
var interviewers=[{code:'268493',name:'NGUYỄN VĂN MINH',position:'Trưởng phòng',department:'Hành chính nhân sự'},{code:'NV002',name:'TRẦN THỊ LAN',position:'Trưởng bộ phận',department:'Sản xuất 1'},{code:'NV003',name:'LÊ VĂN HẢI',position:'Trưởng nhóm',department:'Kỹ thuật 1'},{code:'NV004',name:'PHẠM THỊ HƯƠNG',position:'Trưởng phòng',department:'Kiểm soát chất lượng 1'},{code:'NV005',name:'HOÀNG VĂN ĐỨC',position:'Trưởng bộ phận',department:'Bảo trì bảo dưỡng 1'},{code:'NV006',name:'VŨ THỊ MAI',position:'Trưởng nhóm',department:'QA'},{code:'NV007',name:'ĐẶNG VĂN TÚ',position:'Nhân viên',department:'IT (hệ thống)'}];
var departments=['Sản xuất 1','Sản xuất 2.1','Sản xuất 2.2','Sản xuất 2.2 M&E','Sản xuất 3.345','Sản xuất 3.6','Sản xuất 4','Bảo trì bảo dưỡng 1','Kỹ thuật 1','Bảo trì bảo dưỡng 2','Kỹ thuật 2','Kiểm soát chất lượng 1','Kiểm soát chất lượng 2','QA','Kiểm tra 1','Kiểm tra 2','Phân tích','EHS','Hỗ trợ sản xuất','Kế toán','Hành chính nhân sự','IT (hệ thống)'];
var levels=['Công nhân','Trợ lý','Nhân viên','Kỹ sư','Trưởng nhóm','Trưởng bộ phận','Trưởng phòng'];
var educationLevels=['THCS','THPT','Trung cấp','Cao đẳng','Đại học','Thạc sĩ','Tiến sĩ'];
var currentUser=null,clockInterval=null;
function loadDataFromServer(){return fetch('/api/data').then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.json()}).then(function(data){if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;if(data.candidates)candidates=data.candidates;if(data.interviews)interviews=data.interviews;if(data.interviewResults)interviewResults=data.interviewResults;if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;if(data.history)actionHistory=data.history;if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1;resultCounter=data.counters.resultCounter||1;employeeCounter=data.counters.employeeCounter||268600}console.log('Client: Đã tải dữ liệu')}).catch(function(err){console.error('Client: Lỗi tải dữ liệu:',err)})}
function saveDataToServer(){var payload={recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter,resultCounter:resultCounter,employeeCounter:employeeCounter}};fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(result){console.log('Client: Đã lưu',result.message)}).catch(function(err){console.error('Client: Lỗi lưu',err)})}
function isAdmin(){if(!currentUser)return false;return currentUser.position==='Trưởng phòng'&&currentUser.department==='Hành chính nhân sự'}
function updateAdminVisibility(){var btnHistory=document.getElementById('btnGoHistory');if(isAdmin()){btnHistory.style.display='block'}else{btnHistory.style.display='none'}}
function showView(id){document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});var t=document.getElementById(id);if(t)t.classList.add('active')}
function goBack(id){showView(id)}
function generateRecruitmentCode(){return'PR-HR-001-001-R'+String(recruitmentRequestCounter++).padStart(5,'0')}
function generateCandidateCode(){return'PR-HR-001-001-C'+String(candidateCounter++).padStart(5,'0')}
function generateInterviewFormCode(){return'PR-HR-001-001-T'+String(interviewFormCounter++).padStart(5,'0')}
function generateResultCode(){return'PR-HR-001-001-A'+String(resultCounter++).padStart(5,'0')}
function generateEmployeeCode(){return String(employeeCounter++)}
function formatDate(d){if(!d)return'';var dt=new Date(d);if(isNaN(dt.getTime()))return d;return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
function formatDateTime(d){if(!d)return'';var dt=new Date(d);if(isNaN(dt.getTime()))return d;return formatDate(d)+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')}
function getNow(){return new Date().toISOString()}
function updateClock(){var n=new Date();var el=document.getElementById('barClock');if(el)el.textContent=String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear()+' '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')}
function populateSelect(id,opts,ph,val){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">-- '+(ph||'Chọn')+' --</option>';opts.forEach(function(o){var opt=document.createElement('option');opt.value=o;opt.textContent=o;if(val&&o===val)opt.selected=true;s.appendChild(opt)})}
function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}
function getCheckedValues(name){var r=[];document.querySelectorAll('input[name="'+name+'"]:checked').forEach(function(cb){r.push(cb.value)});return r}
function setCheckedValues(name,vals){document.querySelectorAll('input[name="'+name+'"]').forEach(function(cb){cb.checked=vals.indexOf(cb.value)!==-1})}
function getUserStamp(){if(!currentUser)return{employeeId:'',employeeName:'',employeePosition:'',employeeDept:'',timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}
function operatorInfo(r){return(r.employeeName||'')+' ('+(r.employeeId||'')+')'}
function operatorFull(r){return(r.employeeName||'')+' ('+(r.employeeId||'')+') - '+(r.employeePosition||'')+' - '+(r.employeeDept||'')}
function na(v){return v||'Không có'}
function resetForm(ids){ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==='checkbox'||el.type==='radio')el.checked=false;else if(el.tagName==='SELECT')el.selectedIndex=0;else el.value=''})}
function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||'',employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',employeePosition:currentUser?currentUser.position:'',employeeDept:currentUser?currentUser.department:'',timestamp:getNow()});saveDataToServer()}
function getHiredCount(recCode){var c=0;onboardingRecords.forEach(function(ob){var cand=candidates.find(function(x){return x.code===ob.candidateCode});if(cand&&cand.recruitCode===recCode)c++});return c}
function getRemainingQuantity(rec){return Math.max(0,rec.quantity-getHiredCount(rec.code))}
function validateLogin(){var e=[];var id=document.getElementById('loginEmpId').value.trim();var name=document.getElementById('loginEmpName').value.trim();if(!id)e.push('Mã nhân viên');if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('loginEmpPosition').value)e.push('Chức vụ');if(!document.getElementById('loginEmpDept').value)e.push('Phòng ban');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateRecruitmentForm(){var e=[];if(!document.getElementById('recDepartment').value)e.push('Phòng ban');var p=document.getElementById('recProposer').value.trim();if(!p)e.push('Người đề xuất');if(p&&p!==p.toUpperCase())e.push('Người đề xuất phải IN HOA');if(!document.getElementById('recPosition').value.trim())e.push('Vị trí tuyển dụng');if(!document.getElementById('recLevel').value)e.push('Cấp bậc');if(!document.getElementById('recQuantity').value||parseInt(document.getElementById('recQuantity').value)<1)e.push('Số lượng');if(getCheckedValues('recReason').length===0)e.push('Lý do tuyển dụng');if(!document.getElementById('recNeedDate').value)e.push('Thời gian cần nhân sự');if(!document.getElementById('recReportTo').value.trim())e.push('Báo cáo cho');if(getCheckedValues('recWorkplace').length===0)e.push('Địa điểm làm việc');if(getCheckedValues('recWorktime').length===0)e.push('Thời gian làm việc');if(!document.getElementById('recJobDesc').value.trim())e.push('Mô tả công việc');if(!document.getElementById('recEducation').value)e.push('Trình độ học vấn');if(!document.getElementById('recDeadline').value)e.push('Deadline tuyển dụng');if(e.length>0){alert('Vui lòng điền:\\n- '+e.join('\\n- '));return false}return true}
function validateCandidateForm(){var e=[];var name=document.getElementById('candFullName').value.trim();var phone=document.getElementById('candPhone').value.trim();var rc=document.getElementById('candRecruitCode').value.trim();if(!rc)e.push('Mã nhu cầu tuyển dụng');if(!document.getElementById('candDepartment').value)e.push('Bộ phận');if(!document.getElementById('candInterviewDate').value)e.push('Ngày phỏng vấn');if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('candDob').value)e.push('Ngày sinh');if(!document.getElementById('candGender').value)e.push('Giới tính');if(!document.getElementById('candEthnicity').value.trim())e.push('Dân tộc');if(!document.getElementById('candMarital').value)e.push('Tình trạng kết hôn');if(!document.getElementById('candCCCD').value.trim())e.push('Số căn cước công dân');if(!document.getElementById('candCCCDDate').value)e.push('Ngày cấp');if(!document.getElementById('candCCCDPlace').value.trim())e.push('Nơi cấp');if(!phone)e.push('Số điện thoại');if(!document.getElementById('candPermanentAddr').value.trim())e.push('Địa chỉ thường trú');if(!document.getElementById('candEducationLevel').value)e.push('Trình độ');if(!document.getElementById('candPrevInterview').value)e.push('Đã phỏng vấn chưa');if(!document.getElementById('candAvailability').value)e.push('Thời gian đi làm');if(!document.getElementById('candWish1').value.trim())e.push('Nguyện vọng 1');if(!document.getElementById('candCommitment').checked)e.push('Cam kết thông tin');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateInterviewForm(){var e=[];if(!document.getElementById('ivCandidateSelect').value)e.push('Chọn ứng viên');var ic=document.getElementById('ivInterviewerCode').value.trim();if(!ic)e.push('Mã nhân viên người phỏng vấn');if(!document.getElementById('ivPosition').value)e.push('Vị trí phỏng vấn');if(!document.getElementById('ivDate').value)e.push('Ngày phỏng vấn');if(!document.getElementById('ivTime').value)e.push('Giờ phỏng vấn');if(!document.getElementById('ivLocation').value)e.push('Địa điểm');if(getCheckedValues('ivTest').length===0)e.push('Bài kiểm tra');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function printContent(html){var pa=document.getElementById('printArea');pa.innerHTML=html;pa.style.display='block';window.print();pa.style.display='none'}
function handleCVSectionVisibility(){var rc=document.getElementById('candRecruitCode').value.trim();var rec=recruitmentRequests.find(function(r){return r.code===rc});var sec=document.getElementById('candCVSection');if(rec&&(rec.level==='Trợ lý'||rec.level==='Nhân viên'||rec.level==='Kỹ sư'))sec.style.display='block';else sec.style.display='none'}
function collectRecFormData(){return{department:document.getElementById('recDepartment').value,proposer:document.getElementById('recProposer').value.trim(),position:document.getElementById('recPosition').value.trim(),level:document.getElementById('recLevel').value,quantity:parseInt(document.getElementById('recQuantity').value),reasons:getCheckedValues('recReason'),needDate:document.getElementById('recNeedDate').value,reportTo:document.getElementById('recReportTo').value.trim(),workplaces:getCheckedValues('recWorkplace'),worktimes:getCheckedValues('recWorktime'),environment:document.getElementById('recEnvironment').value.trim(),jobDesc:document.getElementById('recJobDesc').value.trim(),benefits:document.getElementById('recBenefits').value.trim(),salaryRange:document.getElementById('recSalaryRange').value.trim(),education:document.getElementById('recEducation').value,major:document.getElementById('recMajor').value.trim(),experience:document.getElementById('recExperience').value.trim(),techSkill:document.getElementById('recTechSkill').value.trim(),softSkill:document.getElementById('recSoftSkill').value.trim(),language:document.getElementById('recLanguage').value.trim(),certificate:document.getElementById('recCertificate').value.trim(),deadline:document.getElementById('recDeadline').value}}
function fillRecForm(r){setSelectValue('recDepartment',r.department);document.getElementById('recProposer').value=r.proposer;document.getElementById('recPosition').value=r.position;setSelectValue('recLevel',r.level);document.getElementById('recQuantity').value=r.quantity;setCheckedValues('recReason',r.reasons);document.getElementById('recNeedDate').value=r.needDate;document.getElementById('recReportTo').value=r.reportTo;setCheckedValues('recWorkplace',r.workplaces);setCheckedValues('recWorktime',r.worktimes);document.getElementById('recEnvironment').value=r.environment||'';document.getElementById('recJobDesc').value=r.jobDesc;document.getElementById('recBenefits').value=r.benefits||'';document.getElementById('recSalaryRange').value=r.salaryRange||'';setSelectValue('recEducation',r.education);document.getElementById('recMajor').value=r.major||'';document.getElementById('recExperience').value=r.experience||'';document.getElementById('recLanguage').value=r.language||'';document.getElementById('recTechSkill').value=r.techSkill||'';document.getElementById('recSoftSkill').value=r.softSkill||'';document.getElementById('recCertificate').value=r.certificate||'';document.getElementById('recDeadline').value=r.deadline}
function collectCandFormData(){var exps=[];document.querySelectorAll('#experienceRows .exp-row').forEach(function(row){var inp=row.querySelectorAll('input');if(inp[0].value.trim()||inp[1].value.trim())exps.push({period:inp[0].value.trim(),job:inp[1].value.trim(),company:inp[2].value.trim(),location:inp[3].value.trim(),salary:inp[4].value.trim()})});return{recruitCode:document.getElementById('candRecruitCode').value.trim(),department:document.getElementById('candDepartment').value,interviewDate:document.getElementById('candInterviewDate').value,fullName:document.getElementById('candFullName').value.trim(),dob:document.getElementById('candDob').value,gender:document.getElementById('candGender').value,ethnicity:document.getElementById('candEthnicity').value.trim(),marital:document.getElementById('candMarital').value,children:document.getElementById('candChildren').value,cccd:document.getElementById('candCCCD').value.trim(),cccdDate:document.getElementById('candCCCDDate').value,cccdPlace:document.getElementById('candCCCDPlace').value.trim(),cccdExpiry:document.getElementById('candCCCDExpiry').value,phone:document.getElementById('candPhone').value.trim(),relativePhone:document.getElementById('candRelativePhone').value.trim(),permanentAddr:document.getElementById('candPermanentAddr').value.trim(),tempAddr:document.getElementById('candTempAddr').value.trim(),height:document.getElementById('candHeight').value,weight:document.getElementById('candWeight').value,shoeSize:document.getElementById('candShoeSize').value.trim(),educationLevel:document.getElementById('candEducationLevel').value,schoolName:document.getElementById('candSchoolName').value.trim(),gradYear:document.getElementById('candGradYear').value.trim(),major:document.getElementById('candMajor').value.trim(),experiences:exps,prevInterview:document.getElementById('candPrevInterview').value,availability:document.getElementById('candAvailability').value,startDate:document.getElementById('candStartDate').value,smoking:document.getElementById('candSmoking').value,disease:document.getElementById('candDisease').value,sources:getCheckedValues('candSource'),bus:document.getElementById('candBus').value,busStop:document.getElementById('candBusStop').value.trim(),wish1:document.getElementById('candWish1').value.trim(),wish2:document.getElementById('candWish2').value.trim(),wish3:document.getElementById('candWish3').value.trim()}}
function fillCandForm(c){document.getElementById('candRecruitCode').value=c.recruitCode;setSelectValue('candDepartment',c.department);document.getElementById('candInterviewDate').value=c.interviewDate;document.getElementById('candFullName').value=c.fullName;document.getElementById('candDob').value=c.dob;setSelectValue('candGender',c.gender);document.getElementById('candEthnicity').value=c.ethnicity;setSelectValue('candMarital',c.marital);document.getElementById('candChildren').value=c.children;document.getElementById('candCCCD').value=c.cccd;document.getElementById('candCCCDDate').value=c.cccdDate;document.getElementById('candCCCDPlace').value=c.cccdPlace;document.getElementById('candCCCDExpiry').value=c.cccdExpiry||'';document.getElementById('candPhone').value=c.phone;document.getElementById('candRelativePhone').value=c.relativePhone||'';document.getElementById('candPermanentAddr').value=c.permanentAddr;document.getElementById('candTempAddr').value=c.tempAddr||'';document.getElementById('candHeight').value=c.height||'';document.getElementById('candWeight').value=c.weight||'';document.getElementById('candShoeSize').value=c.shoeSize||'';setSelectValue('candEducationLevel',c.educationLevel);document.getElementById('candSchoolName').value=c.schoolName||'';document.getElementById('candGradYear').value=c.gradYear||'';document.getElementById('candMajor').value=c.major||'';var expContainer=document.getElementById('experienceRows');expContainer.innerHTML='';if(c.experiences&&c.experiences.length>0){c.experiences.forEach(function(exp){var row=document.createElement('div');row.className='exp-row';row.innerHTML='<input type="text" value="'+na(exp.period)+'"><input type="text" value="'+na(exp.job)+'"><input type="text" value="'+na(exp.company)+'"><input type="text" value="'+na(exp.location)+'"><input type="text" value="'+na(exp.salary)+'">';expContainer.appendChild(row)})}else{expContainer.innerHTML='<div class="exp-row"><input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương"></div>'}setSelectValue('candPrevInterview',c.prevInterview);setSelectValue('candAvailability',c.availability);document.getElementById('candStartDate').value=c.startDate||'';setSelectValue('candSmoking',c.smoking);setSelectValue('candDisease',c.disease);setCheckedValues('candSource',c.sources||[]);setSelectValue('candBus',c.bus);document.getElementById('candBusStop').value=c.busStop||'';document.getElementById('candBusDetail').style.display=c.bus==='Có'?'flex':'none';document.getElementById('candWish1').value=c.wish1;document.getElementById('candWish2').value=c.wish2||'';document.getElementById('candWish3').value=c.wish3||'';document.getElementById('candCommitment').checked=true;handleCVSectionVisibility()}
function renderRecruitmentTable(filtered){var data=filtered||recruitmentRequests;var c=document.getElementById('recruitmentTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table id="recruitmentDataTable"><thead><tr><th>STT</th><th>Mã yêu cầu</th><th>Phòng ban</th><th>Vị trí</th><th>Số lượng</th><th>Lý do</th><th>Mức lương</th><th>Ngày cần NS</th><th>Người yêu cầu</th><th>Ngày tạo</th><th>Trạng thái</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(r,i){var hired=getHiredCount(r.code);var remain=Math.max(0,r.quantity-hired);var status=remain>0?'Đang tuyển':'Đã tuyển đủ';h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/recruitment/'+encodeURIComponent(r.code)+'" target="_blank" class="link-code">'+r.code+'</a></td><td>'+r.department+'</td><td>'+r.position+'</td><td>'+r.quantity+'</td><td>'+(r.reasons||[]).join(', ')+'</td><td>'+na(r.salaryRange)+'</td><td>'+formatDate(r.needDate)+'</td><td>'+(r.proposer||'')+'</td><td>'+formatDateTime(r.timestamp)+'</td><td><span class="badge '+(remain>0?'badge-orange':'badge-green')+'">'+status+'</span></td><td>'+getEditCountBadge(r)+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.lastEditTimestamp||r.timestamp)+'</td>';h+='<td><button class="btn btn-info btn-sm btn-upload-cand" data-code="'+r.code+'">Upload Candidate</button></td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-upload-cand').forEach(function(b){b.addEventListener('click',function(){var code=this.getAttribute('data-code');document.getElementById('candRecruitCode').value=code;editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';showView('candidateFormView')})})}
function renderCandidateTable(filtered){var data=filtered||candidates;var c=document.getElementById('candidateTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table id="candidateDataTable"><thead><tr><th>STT</th><th>Mã UV</th><th>Họ tên</th><th>Giới tính</th><th>Năm sinh</th><th>SĐT</th><th>Email</th><th>Vị trí</th><th>Mã YCTD</th><th>Nguồn tuyển</th><th>Ngày nộp</th><th>Trạng thái</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(c2,i){h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/candidate/'+encodeURIComponent(c2.code)+'" target="_blank" class="link-code">'+c2.code+'</a></td><td>'+c2.fullName+'</td><td>'+(c2.gender||'')+'</td><td>'+(c2.dob?c2.dob.substring(0,4):'')+'</td><td>'+c2.phone+'</td><td>'+(c2.email||'')+'</td><td>'+(c2.wish1||'')+'</td><td>'+(c2.recruitCode||'')+'</td><td>'+((c2.sources||[]).join(', '))+'</td><td>'+formatDate(c2.timestamp)+'</td><td><span class="badge badge-blue">'+(c2.status||'Đã cập nhật')+'</span></td><td>'+getEditCountBadge(c2)+'</td><td>'+operatorInfo(c2)+'</td><td>'+formatDateTime(c2.lastEditTimestamp||c2.timestamp)+'</td>';h+='<td><button class="btn btn-primary btn-sm btn-schedule-from-cand" data-code="'+c2.code+'">Schedule Interview</button></td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-schedule-from-cand').forEach(function(b){b.addEventListener('click',function(){openScheduleInterviewForm(this.getAttribute('data-code'))})})}
function renderCandidateTableForInterview(filtered){var data=filtered||candidates;var c=document.getElementById('interviewCandidateTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có ứng viên</p>';return}var h='<table><thead><tr><th>STT</th><th>Mã UV</th><th>Họ và tên</th><th>SĐT</th><th>NV1</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(c2,i){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var st=iv?'<span class="badge badge-green">Đã đặt lịch</span>':'<span class="badge badge-orange">Chưa đặt lịch</span>';h+='<tr><td>'+(i+1)+'</td><td>'+c2.code+'</td><td>'+c2.fullName+'</td><td>'+c2.phone+'</td><td>'+c2.wish1+'</td><td>'+st+'</td><td>';if(!iv)h+='<button class="btn btn-primary btn-sm btn-schedule-iv" data-code="'+c2.code+'">Schedule Interview</button>';else h+='<span class="link-code" data-iv="'+iv.code+'">'+iv.code+'</span>';h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-schedule-iv').forEach(function(b){b.addEventListener('click',function(){openScheduleInterviewForm(this.getAttribute('data-code'))})})}
function openScheduleInterviewForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;document.getElementById('ivCandidateSelect').innerHTML='<option value="'+cd.code+'">'+cd.code+' - '+cd.fullName+'</option>';var ps=document.getElementById('ivPosition');ps.innerHTML='<option value="">-- Chọn --</option>';recruitmentRequests.forEach(function(r){if(getRemainingQuantity(r)>0){var o=document.createElement('option');o.value=r.position+' ('+r.code+')';o.textContent=r.position+' ('+r.code+') [Còn '+getRemainingQuantity(r)+']';ps.appendChild(o)}});document.getElementById('ivInterviewerCode').value='';document.getElementById('ivInterviewerInfo').style.display='none';document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';document.getElementById('ivLocation').selectedIndex=0;if(document.getElementById('ivType'))document.getElementById('ivType').selectedIndex=0;document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});showView('scheduleInterviewFormView')}
function renderInterviewExcelTable(){var data=interviews;var c=document.getElementById('interviewExcelTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch</p>';return}var h='<table id="interviewExcelDataTable"><thead><tr><th>STT</th><th>Mã lịch</th><th>Mã UV</th><th>Họ tên</th><th>Vị trí</th><th>Ngày PV</th><th>Giờ</th><th>Hình thức</th><th>Người PV</th><th>Địa điểm</th><th>Trạng thái</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th></tr></thead><tbody>';data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/interview/'+encodeURIComponent(iv.code)+'" target="_blank" class="link-code">'+iv.code+'</a></td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+formatDate(iv.date)+'</td><td>'+(iv.time||'')+'</td><td>'+(iv.interviewType||'Offline')+'</td><td>'+iv.interviewerName+'</td><td>'+iv.location+'</td><td><span class="badge badge-blue">'+(iv.status||'Đã lên lịch')+'</span></td><td>'+getEditCountBadge(iv)+'</td><td>'+operatorInfo(iv)+'</td><td>'+formatDateTime(iv.timestamp)+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h}
function renderResultInterviewTable(filtered){var data=filtered||interviews;var c=document.getElementById('resultInterviewTableContainer');document.getElementById('resultFormContainer').style.display='none';if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table><thead><tr><th>STT</th><th>Mã PV</th><th>Mã UV</th><th>Tên UV</th><th>Vị trí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});var rs=interviewResults.find(function(r){return r.interviewCode===iv.code});var st=rs?'<span class="badge badge-green">Đã đánh giá</span>':'<span class="badge badge-orange">Chưa</span>';h+='<tr><td>'+(i+1)+'</td><td>'+iv.code+'</td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+st+'</td><td>';if(!rs)h+='<button class="btn btn-warning btn-sm btn-evaluate" data-ivcode="'+iv.code+'">Evaluate Interview</button>';else{h+='<button class="btn btn-info btn-sm btn-view-result" data-ivcode="'+iv.code+'">Xem</button>';if(rs.conclusion==='Đề xuất tuyển')h+=' <button class="btn btn-success btn-sm btn-offer" data-ivcode="'+iv.code+'">Send Offer</button>'}h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-evaluate').forEach(function(b){b.addEventListener('click',function(){showEvaluationForm(this.getAttribute('data-ivcode'))})});c.querySelectorAll('.btn-view-result').forEach(function(b){b.addEventListener('click',function(){showResultDetailView(this.getAttribute('data-ivcode'))})});c.querySelectorAll('.btn-offer').forEach(function(b){b.addEventListener('click',function(){showOfferForm(this.getAttribute('data-ivcode'))})})}
function showEvaluationForm(ivCode){var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;var cd=candidates.find(function(c){return c.code===iv.candidateCode});var ct=document.getElementById('resultFormContainer');ct.style.display='block';var tc=['Kiến thức chuyên môn','Kinh nghiệm thực tế','Giải quyết vấn đề','Tư duy logic','Kỹ năng công cụ'];var sc=['Giao tiếp','Làm việc nhóm','Chủ động','Khả năng học hỏi','Phù hợp văn hóa'];var h='<div class="form-section" id="evaluationFormInner" data-ivcode="'+ivCode+'"><h3>Đánh giá: '+(cd?cd.fullName:'')+' ('+iv.code+')</h3>';if(iv.tests&&iv.tests.length>0){h+='<h3>Điểm bài test</h3><table class="score-table"><tbody>';iv.tests.forEach(function(t){var key=t.toLowerCase().replace(/\\s+/g,'_');h+='<tr><td>'+t+'</td><td><input type="number" class="score-input dynamic-test-score" data-test="'+key+'" min="0" max="100" step="1" value="0"></td></tr>'});h+='</tbody></table>'}h+='<h3>I. Chuyên môn (25 điểm)</h3><table class="score-table"><tbody>';tc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input tech-score" min="0" max="5" step="0.5" value="0"></td></tr>'});h+='</tbody></table>';h+='<h3>II. Kỹ năng & thái độ (25 điểm)</h3><table class="score-table"><tbody>';sc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input soft-score" min="0" max="5" step="0.5" value="0"></td></tr>'});h+='</tbody></table>';h+='<p>Điểm tổng: <strong id="totalScoreDisplay">0</strong>/50</p>';h+='<div class="form-group"><label>Điểm mạnh</label><textarea id="evalStrengths"></textarea></div>';h+='<div class="form-group"><label>Điểm yếu</label><textarea id="evalWeaknesses"></textarea></div>';h+='<div class="form-row"><div class="form-group"><label>Vị trí đề xuất</label><input type="text" id="evalProposedPosition" value="'+iv.position+'"></div><div class="form-group"><label>Cấp bậc đề xuất</label><select id="evalProposedLevel"></select></div></div>';h+='<div class="form-group"><label>Bộ phận đề xuất</label><select id="evalProposedDepartment"></select></div>';h+='<div class="form-group"><label>Mức độ phù hợp *</label><div class="checkbox-group">';['Rất phù hợp','Phù hợp','Cần cân nhắc','Không phù hợp'].forEach(function(v){h+='<label><input type="radio" name="resultSuitability" value="'+v+'"> '+v+'</label>'});h+='</div></div><h3>Kết luận *</h3><div class="checkbox-group">';['Đề xuất tuyển','Dự bị','Không tuyển'].forEach(function(v){h+='<label><input type="radio" name="resultConclusion" value="'+v+'"> '+v+'</label>'});h+='</div><br><button class="btn btn-success" id="btnSaveEval" style="width:100%;min-height:45px;font-size:16px">Lưu đánh giá</button></div>';ct.innerHTML=h;populateSelect('evalProposedLevel',levels,'Chọn cấp bậc');populateSelect('evalProposedDepartment',departments,'Chọn bộ phận');ct.querySelectorAll('.score-input').forEach(function(inp){inp.addEventListener('input',function(){var t=0;ct.querySelectorAll('.tech-score, .soft-score').forEach(function(s){t+=parseFloat(s.value)||0});document.getElementById('totalScoreDisplay').textContent=t})});document.getElementById('btnSaveEval').addEventListener('click',function(){var fe=document.getElementById('evaluationFormInner');var ts=[],ss=[];fe.querySelectorAll('.tech-score').forEach(function(s){ts.push(parseFloat(s.value))});fe.querySelectorAll('.soft-score').forEach(function(s){ss.push(parseFloat(s.value))});var total=0;ts.forEach(function(s){total+=s});ss.forEach(function(s){total+=s});if(!fe.querySelector('input[name="resultSuitability"]:checked')||!fe.querySelector('input[name="resultConclusion"]:checked')){alert('Vui lòng chọn mức độ phù hợp và kết luận');return}var stamp=getUserStamp();var testScores={};fe.querySelectorAll('.dynamic-test-score').forEach(function(inp){testScores[inp.getAttribute('data-test')]=parseFloat(inp.value)||0});var resultData={code:generateResultCode(),interviewCode:ivCode,candidateCode:iv.candidateCode,position:iv.position,techScores:ts,softScores:ss,totalScore:total,suitability:fe.querySelector('input[name="resultSuitability"]:checked').value,conclusion:fe.querySelector('input[name="resultConclusion"]:checked').value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[],testScores:testScores,strengths:document.getElementById('evalStrengths').value.trim(),weaknesses:document.getElementById('evalWeaknesses').value.trim(),proposedPosition:document.getElementById('evalProposedPosition').value.trim(),proposedLevel:document.getElementById('evalProposedLevel').value,proposedDepartment:document.getElementById('evalProposedDepartment').value};interviewResults.push(resultData);addHistory('Tạo mới','Đánh giá phỏng vấn',ivCode,'Đánh giá ứng viên '+iv.candidateCode);if(resultData.conclusion==='Đề xuất tuyển'){alert('Ứng viên ĐẠT! Vui lòng điền form thông báo trúng tuyển.');ct.style.display='none';showOfferForm(ivCode)}else{alert('Lưu đánh giá thành công!');ct.style.display='none';renderResultInterviewTable()}})}
function showResultDetailView(ivCode){var r=interviewResults.find(function(x){return x.interviewCode===ivCode});if(!r)return;var cd=candidates.find(function(c){return c.code===r.candidateCode});var ct=document.getElementById('resultDetailContent');var h='<div class="pdf-preview"><h2>PHIẾU ĐÁNH GIÁ ỨNG VIÊN</h2>';h+='<div class="info-row"><span class="info-label">Mã kết quả:</span><span class="info-value">'+(r.code||'')+'</span></div>';h+='<div class="info-row"><span class="info-label">Mã phỏng vấn:</span><span class="info-value">'+r.interviewCode+'</span></div>';h+='<div class="info-row"><span class="info-label">Ứng viên:</span><span class="info-value">'+(cd?cd.fullName:'')+' ('+r.candidateCode+')</span></div>';h+='<div class="info-row"><span class="info-label">Vị trí:</span><span class="info-value">'+r.position+'</span></div>';if(r.testScores){h+='<h3>Điểm bài test</h3>';Object.keys(r.testScores).forEach(function(k){h+='<div class="info-row"><span class="info-label">'+k+':</span><span class="info-value">'+r.testScores[k]+'</span></div>'})}h+='<div class="info-row"><span class="info-label">Điểm tổng:</span><span class="info-value"><strong>'+r.totalScore+'/50</strong></span></div>';h+='<div class="info-row"><span class="info-label">Kết luận:</span><span class="info-value"><strong>'+r.conclusion+'</strong></span></div>';h+='<div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorFull(r)+'</span></div>';h+='<div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">'+formatDateTime(r.timestamp)+'</span></div>';h+=renderEditHistoryHTML(r);h+='</div>';ct.innerHTML=h;ct.setAttribute('data-ivcode',ivCode);showView('resultDetailView')}
function showOfferForm(ivCode){var rs=interviewResults.find(function(r){return r.interviewCode===ivCode});if(!rs)return;var cd=candidates.find(function(c){return c.code===rs.candidateCode});if(!cd)return;var ct=document.getElementById('offerFormContent');var h='<div class="form-section" id="offerFormInner" data-candcode="'+cd.code+'"><h3>Thông báo trúng tuyển: '+cd.fullName+'</h3>';h+='<div class="form-row"><div class="form-group"><label>Vị trí trúng tuyển</label><input type="text" id="offerPosition" value="'+(rs.proposedPosition||rs.position)+'"></div><div class="form-group"><label>Cấp bậc</label><select id="offerLevel"></select></div></div>';h+='<div class="form-group"><label>Bộ phận</label><select id="offerDepartment"></select></div>';h+='<div class="form-group"><label>Ngày nhận việc *</label><input type="date" id="offerStartDate"></div>';h+='<div class="form-row"><div class="form-group"><label>Lương thử việc *</label><input type="text" id="offerProbSalary"></div><div class="form-group"><label>Lương chính thức *</label><input type="text" id="offerOfficialSalary"></div></div>';h+='<div class="form-group"><label>Loại hợp đồng</label><select id="offerContractType"><option>Thử việc</option><option>Chính thức</option><option>Thời vụ</option></select></div>';h+='<br><button class="btn btn-success" id="btnSaveOffer" style="width:100%;min-height:45px;font-size:16px">Lưu và Chuyển sang nhận việc</button></div>';ct.innerHTML=h;populateSelect('offerLevel',levels,'Chọn cấp bậc',rs.proposedLevel);populateSelect('offerDepartment',departments,'Chọn bộ phận',rs.proposedDepartment);showView('offerFormView');document.getElementById('btnSaveOffer').addEventListener('click',function(){if(!document.getElementById('offerStartDate').value||!document.getElementById('offerProbSalary').value||!document.getElementById('offerOfficialSalary').value){alert('Vui lòng điền các trường bắt buộc');return}var stamp=getUserStamp();var empCode=generateEmployeeCode();onboardingRecords.push({candidateCode:cd.code,candidateName:cd.fullName,employeeCode:empCode,code:empCode,newEmployeeId:empCode,position:document.getElementById('offerPosition').value.trim(),department:document.getElementById('offerDepartment').value,startDate:document.getElementById('offerStartDate').value,probSalary:document.getElementById('offerProbSalary').value.trim(),salary:document.getElementById('offerOfficialSalary').value.trim(),contractType:document.getElementById('offerContractType').value,status:'Đang thử việc',manager:'',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});addHistory('Tạo mới','Nhân viên mới',empCode,cd.fullName+' đã nhận việc');alert('Lưu thành công! Mã nhân viên: '+empCode);renderOnboardingList();showView('onboardingFormView')})}
function renderOnboardingList(filtered){var data=filtered||onboardingRecords;var c=document.getElementById('onboardingListContainer');document.getElementById('onboardingFormContent').style.display='none';if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table id="onboardingDataTable"><thead><tr><th>STT</th><th>Mã NV</th><th>Họ tên</th><th>Phòng ban</th><th>Vị trí</th><th>Ngày nhận việc</th><th>Mức lương</th><th>Người quản lý</th><th>Loại HĐ</th><th>Trạng thái</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(e,i){h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/employee/'+encodeURIComponent(e.employeeCode||e.code||e.newEmployeeId)+'" target="_blank" class="link-code">'+(e.employeeCode||e.newEmployeeId||'')+'</a></td><td>'+(e.candidateName||'')+'</td><td>'+(e.department||'')+'</td><td>'+(e.position||'')+'</td><td>'+formatDate(e.startDate)+'</td><td>'+(e.salary||e.probSalary||'')+'</td><td>'+(e.manager||'')+'</td><td>'+(e.contractType||'Thử việc')+'</td><td><span class="badge badge-blue">'+(e.status||'Đang thử việc')+'</span></td><td>'+getEditCountBadge(e)+'</td><td>'+operatorInfo(e)+'</td><td>'+formatDateTime(e.timestamp)+'</td><td><button class="btn btn-success btn-sm btn-confirm-onboard" data-code="'+(e.employeeCode||e.code||e.newEmployeeId)+'">Confirm Onboarding</button></td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-confirm-onboard').forEach(function(b){b.addEventListener('click',function(){var code=this.getAttribute('data-code');var emp=onboardingRecords.find(function(e){return(e.employeeCode||e.code||e.newEmployeeId)===code});if(emp){emp.status='Chính thức';emp.contractType='Chính thức';addHistory('Cập nhật','Nhân viên',code,'Xác nhận onboarding');alert('Đã xác nhận onboarding cho '+code);renderOnboardingList()}})})}
function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById('historyTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch sử</p>';return}var h='<table id="historyDataTable"><thead><tr><th>STT</th><th>Hành động</th><th>Đối tượng</th><th>Mã</th><th>Chi tiết</th><th>Người thao tác</th><th>Thời gian</th></tr></thead><tbody>';data.slice().reverse().forEach(function(h2,i){h+='<tr><td>'+(i+1)+'</td><td><span class="badge '+(h2.action==='Xóa'?'badge-red':(h2.action==='Sửa'?'badge-orange':'badge-green'))+'">'+h2.action+'</span></td><td>'+h2.target+'</td><td>'+h2.code+'</td><td>'+h2.detail+'</td><td>'+(h2.employeeName||'')+' ('+(h2.employeeId||'')+')</td><td>'+formatDateTime(h2.timestamp)+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h}
function exportTableToExcel(tableId,fileName){var tbl=document.getElementById(tableId);if(!tbl){alert('Không có dữ liệu');return}var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{mso-number-format:"\\\\@"}</style></head><body>'+tbl.outerHTML+'</body></html>';var blob=new Blob([html],{type:'application/vnd.ms-excel'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fileName+'.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}
function doLogin(){if(!validateLogin())return;currentUser={id:document.getElementById('loginEmpId').value.trim(),name:document.getElementById('loginEmpName').value.trim().toUpperCase(),position:document.getElementById('loginEmpPosition').value,department:document.getElementById('loginEmpDept').value};document.getElementById('barEmpId').textContent=currentUser.id;document.getElementById('barEmpName').textContent=currentUser.name;document.getElementById('barEmpPosition').textContent=currentUser.position;document.getElementById('barEmpDept').textContent=currentUser.department;document.getElementById('loginView').classList.remove('active');document.getElementById('appContainer').style.display='block';showView('mainView');updateClock();clockInterval=setInterval(updateClock,1000);addHistory('Đăng nhập','Hệ thống',currentUser.id,currentUser.name+' đã đăng nhập');updateAdminVisibility()}
function doLogout(){addHistory('Đăng xuất','Hệ thống',currentUser?currentUser.id:'','Đã đăng xuất');currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById('appContainer').style.display='none';document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});document.getElementById('loginEmpId').value='';document.getElementById('loginEmpName').value='';document.getElementById('loginEmpPosition').selectedIndex=0;document.getElementById('loginEmpDept').selectedIndex=0;showView('loginView')}
function initApp(){populateSelect('loginEmpDept',departments,'Chọn phòng ban');populateSelect('recDepartment',departments,'Chọn phòng ban');populateSelect('recLevel',levels,'Chọn cấp bậc');populateSelect('recEducation',educationLevels,'Chọn trình độ');populateSelect('candDepartment',departments,'Chọn bộ phận');populateSelect('candEducationLevel',educationLevels,'Chọn trình độ');loadDataFromServer().then(function(){showView('loginView')}).catch(function(){showView('loginView')})}
document.getElementById('btnLogin').addEventListener('click',function(){doLogin()});
document.getElementById('loginEmpName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnLogout').addEventListener('click',function(){if(confirm('Bạn có chắc muốn đăng xuất?'))doLogout()});
document.getElementById('btnGoRecruitment').addEventListener('click',function(){renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnGoCandidate').addEventListener('click',function(){renderCandidateTable();showView('candidateView')});
document.getElementById('btnGoInterview').addEventListener('click',function(){renderCandidateTableForInterview();showView('interviewView')});
document.getElementById('btnGoResult').addEventListener('click',function(){renderResultInterviewTable();showView('interviewResultFormView')});
document.getElementById('btnGoOnboarding').addEventListener('click',function(){renderOnboardingList();showView('onboardingFormView')});
document.getElementById('btnGoHistory').addEventListener('click',function(){if(!isAdmin()){alert('Bạn không có quyền truy cập chức năng này.');return}renderHistoryTable();showView('historyView')});
document.getElementById('btnBackFromRecruitment').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromRecruitmentForm').addEventListener('click',function(){if(editingRecruitmentCode)releaseEditLock('recruitment',editingRecruitmentCode);editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none';renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromRecruitmentDetail').addEventListener('click',function(){renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromCandidate').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromCandidateForm').addEventListener('click',function(){if(editingCandidateCode)releaseEditLock('candidate',editingCandidateCode);editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none';renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromCandidateDetail').addEventListener('click',function(){renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromInterview').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromScheduleInterview').addEventListener('click',function(){renderCandidateTableForInterview();goBack('interviewView')});
document.getElementById('btnBackFromInterviewExcel').addEventListener('click',function(){renderCandidateTableForInterview();goBack('interviewView')});
document.getElementById('btnBackFromInterviewResult').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromResultDetail').addEventListener('click',function(){renderResultInterviewTable();goBack('interviewResultFormView')});
document.getElementById('btnBackFromProposedExcel').addEventListener('click',function(){renderResultInterviewTable();goBack('interviewResultFormView')});
document.getElementById('btnBackFromOffer').addEventListener('click',function(){renderResultInterviewTable();goBack('interviewResultFormView')});
document.getElementById('btnBackFromOnboarding').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromHistory').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnPrintRecruitment').addEventListener('click',function(){printContent(document.getElementById('recruitmentDetailContent').innerHTML)});
document.getElementById('btnPrintCandidate').addEventListener('click',function(){printContent(document.getElementById('candidateDetailContent').innerHTML)});
document.getElementById('btnPrintResult').addEventListener('click',function(){printContent(document.getElementById('resultDetailContent').innerHTML)});
document.getElementById('btnPrintInterviewExcel').addEventListener('click',function(){var tbl=document.getElementById('interviewExcelDataTable');if(tbl)printContent('<h2 style="text-align:center">BẢNG LỊCH PHỎNG VẤN</h2>'+tbl.outerHTML)});
document.getElementById('btnEditRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(r&&!canEdit(r)){alert('Editing time expired');return}editingRecruitmentCode=code;fillRecForm(r);document.getElementById('recruitmentFormTitle').textContent='Sửa nhu cầu tuyển dụng - '+code;showView('recruitmentFormView')}});
document.getElementById('btnDeleteRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(r&&!canDelete(r)){alert('Delete time expired');return}if(!confirm('Bạn có chắc muốn xóa '+code+'?'))return;var idx=recruitmentRequests.findIndex(function(x){return x.code===code});if(idx!==-1){recruitmentRequests.splice(idx,1);addHistory('Xóa','Nhu cầu tuyển dụng',code,'Đã xóa');alert('Đã xóa '+code);renderRecruitmentTable();showView('recruitmentView')}}});
document.getElementById('btnEditCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code){var c=candidates.find(function(x){return x.code===code});if(c&&!canEdit(c)){alert('Editing time expired');return}editingCandidateCode=code;fillCandForm(c);document.getElementById('candidateFormTitle').textContent='Sửa thông tin ứng viên - '+code;showView('candidateFormView')}});
document.getElementById('btnDeleteCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code){var c=candidates.find(function(x){return x.code===code});if(c&&!canDelete(c)){alert('Delete time expired');return}if(!confirm('Bạn có chắc muốn xóa '+code+'?'))return;var idx=candidates.findIndex(function(x){return x.code===code});if(idx!==-1){candidates.splice(idx,1);addHistory('Xóa','Ứng viên',code,'Đã xóa');alert('Đã xóa '+code);renderCandidateTable();showView('candidateView')}}});
document.getElementById('btnAddRecruitment').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentFormTitle').textContent='Tạo nhu cầu tuyển dụng';document.getElementById('recruitmentEditInfo').style.display='none';resetForm(['recProposer','recPosition','recQuantity','recNeedDate','recReportTo','recEnvironment','recJobDesc','recBenefits','recSalaryRange','recMajor','recExperience','recLanguage','recTechSkill','recSoftSkill','recCertificate','recDeadline']);document.getElementById('recDepartment').selectedIndex=0;document.getElementById('recLevel').selectedIndex=0;document.getElementById('recEducation').selectedIndex=0;document.getElementById('recQuantity').value='1';document.querySelectorAll('input[name="recReason"]').forEach(function(cb){cb.checked=false});document.querySelectorAll('input[name="recWorkplace"]').forEach(function(cb){cb.checked=false});document.querySelectorAll('input[name="recWorktime"]').forEach(function(cb){cb.checked=false});showView('recruitmentFormView')});
document.getElementById('recProposer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnSubmitRecruitment').addEventListener('click',function(){if(!validateRecruitmentForm())return;var stamp=getUserStamp();var data=collectRecFormData();if(editingRecruitmentCode){var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});if(!rec)return;if(!rec.editHistory)rec.editHistory=[];if(!canEdit(rec)){alert('Editing time expired');return}if(!rec.firstUpdateTime)rec.firstUpdateTime=getNow();rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:'Cập nhật thông tin nhu cầu tuyển dụng'});Object.assign(rec,data);rec.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Nhu cầu tuyển dụng',editingRecruitmentCode,'Đã cập nhật (lần '+rec.editHistory.length+'/3)');alert('Cập nhật thành công! Mã: '+editingRecruitmentCode);editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none'}else{var rec=Object.assign({code:generateRecruitmentCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[],status:'Đang tuyển'});recruitmentRequests.push(rec);addHistory('Tạo mới','Nhu cầu tuyển dụng',rec.code,'Tạo mới: '+rec.position+' - '+rec.department);alert('Tạo thành công! Mã: '+rec.code)}renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnAddCandidate').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';resetForm(['candRecruitCode','candInterviewDate','candFullName','candDob','candEthnicity','candCCCD','candCCCDDate','candCCCDPlace','candCCCDExpiry','candPhone','candRelativePhone','candPermanentAddr','candTempAddr','candHeight','candWeight','candShoeSize','candSchoolName','candGradYear','candMajor','candStartDate','candWish1','candWish2','candWish3','candBusStop']);document.getElementById('candGender').selectedIndex=0;document.getElementById('candMarital').selectedIndex=0;document.getElementById('candDepartment').selectedIndex=0;document.getElementById('candEducationLevel').selectedIndex=0;document.getElementById('candPrevInterview').selectedIndex=0;document.getElementById('candAvailability').selectedIndex=0;document.getElementById('candSmoking').selectedIndex=0;document.getElementById('candDisease').selectedIndex=0;document.getElementById('candBus').selectedIndex=0;document.getElementById('candChildren').value='0';document.getElementById('candCommitment').checked=false;document.querySelectorAll('input[name="candSource"]').forEach(function(cb){cb.checked=false});showView('candidateFormView')});
document.getElementById('btnAddExpRow').addEventListener('click',function(){var row=document.createElement('div');row.className='exp-row';row.innerHTML='<input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương">';document.getElementById('experienceRows').appendChild(row)});
document.getElementById('candFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('candRecruitCode').addEventListener('input',function(){handleCVSectionVisibility()});
document.getElementById('candBus').addEventListener('change',function(){document.getElementById('candBusDetail').style.display=this.value==='Có'?'flex':'none'});
document.getElementById('btnSubmitCandidate').addEventListener('click',function(){if(!validateCandidateForm())return;var stamp=getUserStamp();var data=collectCandFormData();if(editingCandidateCode){var c=candidates.find(function(x){return x.code===editingCandidateCode});if(!c)return;if(!c.editHistory)c.editHistory=[];if(!canEdit(c)){alert('Editing time expired');return}if(!c.firstUpdateTime)c.firstUpdateTime=getNow();c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:'Cập nhật thông tin ứng viên'});Object.assign(c,data);c.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Ứng viên',editingCandidateCode,'Đã cập nhật (lần '+c.editHistory.length+'/3)');alert('Cập nhật thành công!');editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none'}else{var c=Object.assign({code:generateCandidateCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[],status:'Đã cập nhật thông tin'});candidates.push(c);addHistory('Tạo mới','Ứng viên',c.code,'Thêm mới: '+c.fullName);alert('Lưu thành công! Mã: '+c.code)}renderCandidateTable();showView('candidateView')});
document.getElementById('ivInterviewerCode').addEventListener('input',function(){var code=this.value.trim();var info=document.getElementById('ivInterviewerInfo');var iv=interviewers.find(function(i){return i.code===code});if(iv){info.style.display='block';info.innerHTML='<strong>Tên:</strong> '+iv.name+'<br><strong>Chức vụ:</strong> '+iv.position+'<br><strong>Bộ phận:</strong> '+iv.department;info.style.background='#e8f5e9'}else{info.style.display=code.length>0?'block':'none';info.innerHTML='<span style="color:red">Không tìm thấy</span>';info.style.background='#ffebee'}});
document.getElementById('btnSubmitInterview').addEventListener('click',function(){if(!validateInterviewForm())return;var ic=document.getElementById('ivInterviewerCode').value.trim();var iwr=interviewers.find(function(i){return i.code===ic});var stamp=getUserStamp();var iv={code:generateInterviewFormCode(),candidateCode:document.getElementById('ivCandidateSelect').value,interviewerCode:ic,interviewerName:iwr?iwr.name:ic,interviewerPosition:iwr?iwr.position:'',interviewerDept:iwr?iwr.department:'',position:document.getElementById('ivPosition').value,date:document.getElementById('ivDate').value,time:document.getElementById('ivTime').value,interviewType:document.getElementById('ivType')?document.getElementById('ivType').value:'Offline',location:document.getElementById('ivLocation').value,tests:getCheckedValues('ivTest'),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[],status:'Đã lên lịch'};interviews.push(iv);addHistory('Tạo mới','Lịch phỏng vấn',iv.code,'Đặt lịch PV cho '+iv.candidateCode);alert('Đặt lịch thành công! Mã: '+iv.code);renderInterviewExcelTable();showView('interviewExcelView')});
document.getElementById('btnSearchRecruitment').addEventListener('click',function(){var f=document.getElementById('recruitSearchFrom').value,t=document.getElementById('recruitSearchTo').value;var txt=(document.getElementById('recruitSearchText').value||'').trim().toLowerCase();renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=r.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||r.proposer.toLowerCase().includes(txt)||r.position.toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);return matchDate&&matchText}))});
document.getElementById('btnSearchCandidate').addEventListener('click',function(){var f=document.getElementById('candidateSearchFrom').value,t=document.getElementById('candidateSearchTo').value;var txt=(document.getElementById('candidateSearchText').value||'').trim().toLowerCase();renderCandidateTable(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||c.fullName.toLowerCase().includes(txt)||(c.phone&&c.phone.includes(txt))||c.code.toLowerCase().includes(txt);return matchDate&&matchText}))});
document.getElementById('btnSearchInterview').addEventListener('click',function(){var f=document.getElementById('interviewSearchFrom').value,t=document.getElementById('interviewSearchTo').value;var txt=(document.getElementById('interviewSearchText').value||'').trim().toLowerCase();renderCandidateTableForInterview(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||c.fullName.toLowerCase().includes(txt)||(c.phone&&c.phone.includes(txt))||c.code.toLowerCase().includes(txt);return matchDate&&matchText}))});
document.getElementById('btnSearchResult').addEventListener('click',function(){var f=document.getElementById('resultSearchFrom').value,t=document.getElementById('resultSearchTo').value;var txt=(document.getElementById('resultSearchText').value||'').trim().toLowerCase();renderResultInterviewTable(interviews.filter(function(iv){var ts=iv.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var cd=candidates.find(function(c){return c.code===iv.candidateCode});var matchText=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||iv.candidateCode.toLowerCase().includes(txt);return matchDate&&matchText}))});
document.getElementById('btnSearchOnboarding').addEventListener('click',function(){var f=document.getElementById('onboardSearchFrom').value,t=document.getElementById('onboardSearchTo').value;var txt=(document.getElementById('onboardSearchText').value||'').trim().toLowerCase();renderOnboardingList(onboardingRecords.filter(function(e){var ts=(e.timestamp||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(e.candidateName&&e.candidateName.toLowerCase().includes(txt))||(e.employeeCode&&e.employeeCode.includes(txt));return matchDate&&matchText}))});
document.getElementById('btnSearchHistory').addEventListener('click',function(){var f=document.getElementById('historySearchFrom').value,t=document.getElementById('historySearchTo').value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnExportRecruitment').addEventListener('click',function(){window.open('/api/export/recruitment','_blank')});
document.getElementById('btnExportCandidate').addEventListener('click',function(){window.open('/api/export/candidates','_blank')});
document.getElementById('btnExportInterview').addEventListener('click',function(){window.open('/api/export/interviews','_blank')});
document.getElementById('btnExportInterviewExcel').addEventListener('click',function(){window.open('/api/export/interviews','_blank')});
document.getElementById('btnExportResult').addEventListener('click',function(){window.open('/api/export/results','_blank')});
document.getElementById('btnExportOnboarding').addEventListener('click',function(){window.open('/api/export/employees','_blank')});
document.getElementById('btnExportProposedExcel').addEventListener('click',function(){window.open('/api/export/results','_blank')});
document.getElementById('btnExportHistory').addEventListener('click',function(){if(!isAdmin()){alert('Không có quyền');return}var tbl=document.getElementById('historyDataTable');if(tbl)exportTableToExcel('historyDataTable','LichSuThaoTac');else alert('Chưa có dữ liệu')});
document.addEventListener("DOMContentLoaded",function(){initApp()});
<\/script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return;
  // Serve main HTML
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlContent + scriptContent);
});

loadFromJsonBin().then(function() {
  server.listen(PORT, function() {
    console.log('=================================');
    console.log('Server running on port ' + PORT);
    console.log('Data loaded: ' + isDataLoaded);
    console.log('Recruitment: ' + database.recruitmentRequests.length);
    console.log('Candidates: ' + database.candidates.length);
    console.log('Interviews: ' + database.interviews.length);
    console.log('Results: ' + database.interviewResults.length);
    console.log('Employees: ' + database.onboardingRecords.length);
    console.log('Counters: ' + JSON.stringify(database.counters));
    console.log('=================================');
  });
}).catch(function(err) {
  console.error('Loi khoi dong:', err.message);
  server.listen(PORT, function() {
    console.log('Server running on port ' + PORT + ' (NO DATA)');
  });
});