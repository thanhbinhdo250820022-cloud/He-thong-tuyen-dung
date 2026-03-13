// HE THONG QUAN LY TUYEN DUNG - V4 UPDATED
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
  recruitmentRequests: [], candidates: [], interviews: [],
  interviewResults: [], onboardingRecords: [], history: [],
  counters: { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1, resultCounter: 1, employeeCounter: 268600 }
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
      hostname: 'api.jsonbin.io', path: path, method: method,
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_API_KEY, 'X-Bin-Versioning': 'false' }
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) { resolve(parsed); }
          else {
            if (retryCount < maxRetries) { setTimeout(function() { jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject); }, 1000 * (retryCount + 1)); }
            else { reject(new Error('JSONBin error: ' + res.statusCode)); }
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', function(err) {
      if (retryCount < maxRetries) { setTimeout(function() { jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject); }, 1000 * (retryCount + 1)); }
      else { reject(err); }
    });
    req.setTimeout(15000, function() {
      req.destroy();
      if (retryCount < maxRetries) { setTimeout(function() { jsonbinRequest(method, data, retryCount + 1).then(resolve).catch(reject); }, 1000 * (retryCount + 1)); }
      else { reject(new Error('Timeout')); }
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function loadFromJsonBin() {
  console.log('Dang doc du lieu tu JSONBin...');
  return jsonbinRequest('GET').then(function(result) {
    if (result && result.record) {
      database = result.record;
      if (!database.recruitmentRequests) database.recruitmentRequests = [];
      if (!database.candidates) database.candidates = [];
      if (!database.interviews) database.interviews = [];
      if (!database.interviewResults) database.interviewResults = [];
      if (!database.onboardingRecords) database.onboardingRecords = [];
      if (!database.history) database.history = [];
      if (!database.counters) database.counters = { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1, resultCounter: 1, employeeCounter: 268600 };
      if (!database.counters.resultCounter) database.counters.resultCounter = 1;
      if (!database.counters.employeeCounter) database.counters.employeeCounter = 268600;
      isDataLoaded = true;
      console.log('=== DOC JSONBIN THANH CONG ===');
    } else { isDataLoaded = true; }
  }).catch(function(err) { console.error('LOI DOC JSONBIN:', err.message); isDataLoaded = true; });
}

let saveTimeout = null; let isSaving = false;
function saveToJsonBin() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function() {
    if (isSaving) { setTimeout(function() { saveToJsonBin(); }, 1000); return; }
    isSaving = true;
    var dataToSave = JSON.parse(JSON.stringify(database));
    jsonbinRequest('PUT', dataToSave).then(function() { isSaving = false; console.log('=== LUU JSONBIN THANH CONG ==='); })
    .catch(function(err) { isSaving = false; console.error('LOI LUU JSONBIN:', err.message); });
  }, 500);
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end', function() { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('JSON khong hop le')); } });
    req.on('error', reject);
  });
}

function getNow() { return new Date().toISOString(); }
function generateCode(prefix, counter) { return 'PR-HR-001-001-' + prefix + String(counter).padStart(5, '0'); }

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
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
}
function formatDateTimeVN(d) {
  if (!d) return '';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return formatDateVN(d) + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
}

function generateExcelBuffer(headers, rows) {
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="UTF-8"><style>td{mso-number-format:"\\@";}</style></head><body>';
  html += '<table border="1"><thead><tr>';
  headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach(function(row) { html += '<tr>'; row.forEach(function(cell) { html += '<td>' + (cell == null ? '' : cell) + '</td>'; }); html += '</tr>'; });
  html += '</tbody></table></body></html>';
  return Buffer.from(html, 'utf-8');
}

function generatePdfHtml(type, record) {
  if (!record) return '<html><body><h1>Khong tim thay du lieu</h1></body></html>';
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PDF</title>';
  h += '<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}h1{text-align:center;color:#1a237e;border-bottom:3px solid #1a237e;padding-bottom:10px}';
  h += '.info-row{display:flex;margin-bottom:6px}.info-label{font-weight:700;min-width:220px;color:#1a237e}.info-value{flex:1}';
  h += '.signature-area{display:flex;justify-content:space-around;margin-top:50px;text-align:center}.sig-box{min-width:200px}.sig-title{font-weight:700;margin-bottom:60px}';
  h += '.btn-area{text-align:center;margin:20px 0;padding:20px;background:#f5f5f5;border-radius:8px}';
  h += '.btn{padding:12px 30px;margin:0 10px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;display:inline-block;text-decoration:none}';
  h += '.btn-edit{background:#f57c00;color:#fff}.btn-delete{background:#c62828;color:#fff}.btn-print{background:#4527a0;color:#fff}.btn-back{background:#546e7a;color:#fff}';
  h += '@media print{.no-print{display:none!important}}</style></head><body>';
  h += '<div class="no-print btn-area"><a href="/" class="btn btn-back">← Quay lai</a> <button class="btn btn-print" onclick="window.print()">In / Xuat PDF</button></div>';

  var code = record.code || record.employeeCode || '';
  var fields = [];

  if (type === 'recruitment') {
    h += '<h1>PHIEU DE XUAT NHU CAU TUYEN DUNG</h1>';
    fields = [['Ma yeu cau', record.code],['Phong ban', record.department||''],['Vi tri tuyen', record.position||''],['So luong', record.quantity||''],['Ly do tuyen', Array.isArray(record.reasons)?record.reasons.join(', '):(record.reasons||'')],['Muc luong du kien', record.salaryRange||''],['Ngay can nhan su', formatDateVN(record.needDate)],['Nguoi yeu cau', record.proposer||''],['Ngay tao', formatDateTimeVN(record.timestamp)],['Trang thai', record.status||'Dang tuyen']];
  } else if (type === 'candidate') {
    h += '<h1>PHIEU THONG TIN UNG VIEN</h1>';
    fields = [['Ma ung vien', record.code],['Ho ten', record.fullName||''],['Gioi tinh', record.gender||''],['Nam sinh', record.dob?record.dob.substring(0,4):''],['SDT', record.phone||''],['Vi tri ung tuyen', record.wish1||record.position||''],['Ma YCTD', record.recruitCode||''],['Ngay nop', formatDateVN(record.timestamp)]];
  } else if (type === 'interview') {
    h += '<h1>LICH PHONG VAN</h1>';
    var cd = database.candidates.find(function(c){return c.code===record.candidateCode;});
    fields = [['Ma lich', record.code],['Ma ung vien', record.candidateCode||''],['Ho ten', cd?cd.fullName:''],['Vi tri', record.position||''],['Ngay PV', formatDateVN(record.date)],['Gio PV', record.time||''],['Hinh thuc', record.interviewType||'Offline'],['Nguoi PV', record.interviewerName||''],['Dia diem', record.location||''],['Trang thai', record.status||'Da len lich']];
  } else if (type === 'result') {
    h += '<h1>KET QUA PHONG VAN</h1>';
    var cd2 = database.candidates.find(function(c){return c.code===record.candidateCode;});
    fields = [['Ma ket qua', record.code],['Ma ung vien', record.candidateCode||''],['Ho ten', cd2?cd2.fullName:''],['Vi tri', record.position||''],['Diem danh gia', record.totalScore!==undefined?record.totalScore+'/50':''],['Ket qua', record.conclusion||''],['Muc luong de xuat', record.proposedSalary||''],['Ngay cap nhat', formatDateTimeVN(record.timestamp)]];
  } else if (type === 'employee') {
    h += '<h1>NHAN VIEN MOI NHAN VIEC</h1>';
    fields = [['Ma nhan vien', record.employeeCode||''],['Ho ten', record.candidateName||''],['Phong ban', record.department||''],['Vi tri', record.position||''],['Ngay nhan viec', formatDateVN(record.startDate)],['Muc luong', record.salary||record.probSalary||''],['Loai hop dong', record.contractType||'Thu viec'],['Trang thai', record.status||'Dang thu viec']];
  }

  fields.forEach(function(f) { h += '<div class="info-row"><span class="info-label">' + f[0] + ':</span><span class="info-value">' + f[1] + '</span></div>'; });

  h += '<div class="signature-area"><div class="sig-box"><div class="sig-title">Nguoi lap</div><div>(Ky, ghi ro ho ten)</div></div>';
  h += '<div class="sig-box"><div class="sig-title">Truong phong nhan su</div><div>(Ky, ghi ro ho ten)</div></div>';
  h += '<div class="sig-box"><div class="sig-title">Ban Giam doc</div><div>(Ky, ghi ro ho ten)</div></div></div>';

  h += '<div class="no-print btn-area">';
  h += '<button class="btn btn-edit" onclick="doEdit()">Sua</button> ';
  h += '<button class="btn btn-delete" onclick="doDelete()">Xoa</button>';
  h += '</div>';
  h += '<script>';
  h += 'function doEdit(){fetch("/api/' + type + '/' + encodeURIComponent(code) + '",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({_action:"check"})}).then(function(r){return r.json()}).then(function(d){if(d.error){alert(d.error)}else{alert("Vui long su dung giao dien chinh de sua.")}}).catch(function(e){alert(e.message)})}';
  h += 'function doDelete(){if(!confirm("Ban co chac muon xoa?"))return;fetch("/api/' + type + '/' + encodeURIComponent(code) + '",{method:"DELETE"}).then(function(r){return r.json()}).then(function(d){if(d.error){alert(d.error)}else{alert("Da xoa thanh cong!");window.location.href="/"}}).catch(function(e){alert(e.message)})}';
  h += '<\/script></body></html>';
  return h;
}

function canEditRecord(record) {
  var editCount = (record.editHistory && record.editHistory.length) || 0;
  if (editCount >= 3) return { allowed: false, message: 'Da dat gioi han chinh sua toi da (3 lan).' };
  if (record.firstUpdateTime) {
    var hoursSince = (new Date() - new Date(record.firstUpdateTime)) / (1000 * 60 * 60);
    if (hoursSince >= 24) return { allowed: false, message: 'Da qua 24 gio ke tu lan sua dau tien.' };
  }
  return { allowed: true };
}
function canDeleteRecord(record) {
  if (record.firstUpdateTime) {
    var hoursSince = (new Date() - new Date(record.firstUpdateTime)) / (1000 * 60 * 60);
    if (hoursSince >= 24) return { allowed: false, message: 'Da qua 24 gio.' };
  }
  return { allowed: true };
}

function isDateInRange(dateStr, fromDate, toDate) {
  if (!dateStr) return false;
  var d = dateStr.substring(0, 10);
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

function handleApi(req, res) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname;
  var query = parsedUrl.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }

  if (pathname === "/api/test" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "backend running", dataLoaded: isDataLoaded, binId: JSONBIN_BIN_ID ? 'configured' : 'missing' }));
    return true;
  }
  if (pathname === "/api/data" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database));
    return true;
  }
  if (pathname === "/api/data" && req.method === "POST") {
    readBody(req).then(function(body) {
      var changed = false;
      ['recruitmentRequests','candidates','interviews','interviewResults','onboardingRecords','history','counters'].forEach(function(k) {
        if (body[k] !== undefined) { database[k] = body[k]; changed = true; }
      });
      if (changed) saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }
  if (pathname === "/api/reload" && req.method === "GET") {
    loadFromJsonBin().then(function() { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true })); });
    return true;
  }

  // === SEARCH APIs ===
  if (pathname === "/api/recruitment/search" && req.method === "GET") {
    var fromDate = query.fromDate || '', toDate = query.toDate || '';
    var filtered = database.recruitmentRequests.filter(function(r) { if (!fromDate && !toDate) return true; return isDateInRange(r.timestamp, fromDate, toDate); });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(filtered)); return true;
  }
  if (pathname === "/api/candidates/search" && req.method === "GET") {
    var fromDate = query.fromDate || '', toDate = query.toDate || '';
    var filtered = database.candidates.filter(function(c) { if (!fromDate && !toDate) return true; return isDateInRange(c.timestamp, fromDate, toDate); });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(filtered)); return true;
  }
  if (pathname === "/api/interviews/search" && req.method === "GET") {
    var fromDate = query.fromDate || '', toDate = query.toDate || '';
    var filtered = database.interviews.filter(function(iv) { if (!fromDate && !toDate) return true; return isDateInRange(iv.date, fromDate, toDate); });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(filtered)); return true;
  }
  // Ket qua phong van: Tim kiem theo thoi gian phong van (iv.date)
  if (pathname === "/api/results/search" && req.method === "GET") {
    var fromDate = query.fromDate || '', toDate = query.toDate || '';
    var filtered = database.interviewResults.filter(function(r) {
      if (!fromDate && !toDate) return true;
      var iv = database.interviews.find(function(x) { return x.code === r.interviewCode; });
      return iv ? isDateInRange(iv.date, fromDate, toDate) : false;
    });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(filtered)); return true;
  }
  // Nhan vien moi: Tim kiem theo thoi gian du kien di lam (startDate)
  if (pathname === "/api/employees/search" && req.method === "GET") {
    var fromDate = query.fromDate || '', toDate = query.toDate || '';
    var filtered = database.onboardingRecords.filter(function(e) { if (!fromDate && !toDate) return true; return isDateInRange(e.startDate, fromDate, toDate); });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(filtered)); return true;
  }

  // === PDF VIEW ===
  var pdfMatch = pathname.match(/^\/api\/pdf\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (pdfMatch && req.method === "GET") {
    var record = findRecord(pdfMatch[1], decodeURIComponent(pdfMatch[2]));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(generatePdfHtml(pdfMatch[1], record));
    return true;
  }

  // === CRUD: POST ===
  if (pathname === "/api/recruitment" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('R', database.counters.recruitmentRequestCounter); database.counters.recruitmentRequestCounter++;
      body.code = code; body.timestamp = body.timestamp || getNow(); body.editHistory = []; body.status = body.status || 'Dang tuyen';
      database.recruitmentRequests.push(body);
      database.history.push({ action: 'Tao moi', target: 'Nhu cau tuyen dung', code: code, detail: body.position||'', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, code: code }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }
  if (pathname === "/api/candidates" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('C', database.counters.candidateCounter); database.counters.candidateCounter++;
      body.code = code; body.timestamp = body.timestamp || getNow(); body.editHistory = []; body.status = body.status || 'Da cap nhat';
      database.candidates.push(body);
      database.history.push({ action: 'Tao moi', target: 'Ung vien', code: code, detail: body.fullName||'', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, code: code }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }
  if (pathname === "/api/interviews" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('T', database.counters.interviewFormCounter); database.counters.interviewFormCounter++;
      body.code = code; body.timestamp = body.timestamp || getNow(); body.editHistory = []; body.status = body.status || 'Da len lich';
      database.interviews.push(body);
      database.history.push({ action: 'Tao moi', target: 'Lich phong van', code: code, detail: body.candidateCode||'', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, code: code }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }
  if (pathname === "/api/results" && req.method === "POST") {
    readBody(req).then(function(body) {
      var code = generateCode('A', database.counters.resultCounter); database.counters.resultCounter++;
      body.code = code; body.timestamp = body.timestamp || getNow(); body.editHistory = [];
      database.interviewResults.push(body);
      database.history.push({ action: 'Tao moi', target: 'Ket qua PV', code: code, detail: body.candidateCode||'', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, code: code }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }
  if (pathname === "/api/employees" && req.method === "POST") {
    readBody(req).then(function(body) {
      var empCode = String(database.counters.employeeCounter); database.counters.employeeCounter++;
      body.employeeCode = empCode; body.code = empCode; body.timestamp = body.timestamp || getNow(); body.editHistory = []; body.status = body.status || 'Dang thu viec'; body.contractType = body.contractType || 'Thu viec';
      database.onboardingRecords.push(body);
      database.history.push({ action: 'Tao moi', target: 'Nhan vien moi', code: empCode, detail: body.candidateName||'', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, code: empCode }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }

  // === PUT (Edit) ===
  var putMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (putMatch && req.method === "PUT") {
    var editType = putMatch[1], editId = decodeURIComponent(putMatch[2]);
    readBody(req).then(function(body) {
      var record = findRecord(editType, editId);
      if (!record) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Khong tim thay" })); return; }
      if (body._action === 'check') {
        var check = canEditRecord(record);
        if (!check.allowed) { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: check.message })); }
        else { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ canEdit: true, editCount: (record.editHistory?record.editHistory.length:0) })); }
        return;
      }
      var editCheck = canEditRecord(record);
      if (!editCheck.allowed) { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: editCheck.message })); return; }
      if (!record.editHistory) record.editHistory = [];
      if (!record.firstUpdateTime) record.firstUpdateTime = getNow();
      record.editHistory.push({ employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow(), changes: body.changes||'Cap nhat' });
      Object.keys(body).forEach(function(key) { if (key !== '_action' && key !== 'editHistory' && key !== 'firstUpdateTime' && key !== 'code' && key !== 'employeeCode') { record[key] = body[key]; } });
      record.lastEditTimestamp = getNow();
      database.history.push({ action: 'Sua', target: editType, code: editId, detail: 'Lan ' + record.editHistory.length + '/3', employeeId: body.employeeId||'', employeeName: body.employeeName||'', timestamp: getNow() });
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, editCount: record.editHistory.length }));
    }).catch(function(err) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: false, message: err.message })); });
    return true;
  }

  // === DELETE ===
  var deleteMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (deleteMatch && req.method === "DELETE") {
    var delType = deleteMatch[1], delId = decodeURIComponent(deleteMatch[2]);
    var col = getTypeCollection(delType), field = getTypeIdField(delType);
    if (!col) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Type khong hop le" })); return true; }
    var idx = col.findIndex(function(r) { return r[field] === delId; });
    if (idx === -1) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Khong tim thay" })); return true; }
    var delCheck = canDeleteRecord(col[idx]);
    if (!delCheck.allowed) { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: delCheck.message })); return true; }
    col.splice(idx, 1);
    database.history.push({ action: 'Xoa', target: delType, code: delId, detail: 'Da xoa', timestamp: getNow() });
    saveToJsonBin();
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true }));
    return true;
  }

  // === EXPORT EXCEL ===
  if (pathname === "/api/export/recruitment" && req.method === "GET") {
    var headers = ['STT','Ma yeu cau','Phong ban','Vi tri','So luong','Ly do','Muc luong','Ngay can NS','Nguoi yeu cau','Ngay tao','Trang thai'];
    var rows = database.recruitmentRequests.map(function(r,i) { return [i+1,r.code,r.department,r.position,r.quantity,Array.isArray(r.reasons)?r.reasons.join(', '):'',r.salaryRange||'',formatDateVN(r.needDate),r.proposer||'',formatDateTimeVN(r.timestamp),r.status||'']; });
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': 'attachment; filename="NhuCauTuyenDung.xls"' });
    res.end(generateExcelBuffer(headers, rows)); return true;
  }
  if (pathname === "/api/export/candidates" && req.method === "GET") {
    var headers = ['STT','Ma UV','Ho ten','Gioi tinh','Nam sinh','SDT','Vi tri','Ma YCTD','Ngay nop','Trang thai'];
    var rows = database.candidates.map(function(c,i) { return [i+1,c.code,c.fullName,c.gender||'',c.dob?c.dob.substring(0,4):'',c.phone,c.wish1||c.position||'',c.recruitCode||'',formatDateVN(c.timestamp),c.status||'']; });
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': 'attachment; filename="UngVien.xls"' });
    res.end(generateExcelBuffer(headers, rows)); return true;
  }
  if (pathname === "/api/export/interviews" && req.method === "GET") {
    var headers = ['STT','Ma lich','Ma UV','Ho ten','Vi tri','Ngay PV','Gio','Hinh thuc','Nguoi PV','Dia diem','Trang thai'];
    var rows = database.interviews.map(function(iv,i) { var cd = database.candidates.find(function(c){return c.code===iv.candidateCode;}); return [i+1,iv.code,iv.candidateCode,cd?cd.fullName:'',iv.position,formatDateVN(iv.date),iv.time||'',iv.interviewType||'Offline',iv.interviewerName||'',iv.location||'',iv.status||'']; });
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': 'attachment; filename="LichPhongVan.xls"' });
    res.end(generateExcelBuffer(headers, rows)); return true;
  }
  if (pathname === "/api/export/results" && req.method === "GET") {
    var headers = ['STT','Ma KQ','Ma UV','Ho ten','Vi tri','Diem','Ket qua','Luong de xuat','Ngay cap nhat'];
    var rows = database.interviewResults.map(function(r,i) { var cd = database.candidates.find(function(c){return c.code===r.candidateCode;}); return [i+1,r.code||'',r.candidateCode,cd?cd.fullName:'',r.position,r.totalScore!==undefined?r.totalScore+'/50':'',r.conclusion||'',r.proposedSalary||'',formatDateTimeVN(r.timestamp)]; });
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': 'attachment; filename="KetQuaPhongVan.xls"' });
    res.end(generateExcelBuffer(headers, rows)); return true;
  }
  if (pathname === "/api/export/employees" && req.method === "GET") {
    var headers = ['STT','Ma NV','Ho ten','Phong ban','Vi tri','Ngay nhan viec','Muc luong','Loai HD','Trang thai'];
    var rows = database.onboardingRecords.map(function(e,i) { return [i+1,e.employeeCode||'',e.candidateName||'',e.department||'',e.position||'',formatDateVN(e.startDate),e.salary||e.probSalary||'',e.contractType||'Thu viec',e.status||'']; });
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': 'attachment; filename="NhanVienMoi.xls"' });
    res.end(generateExcelBuffer(headers, rows)); return true;
  }

  // === GET lists ===
  if (pathname === "/api/recruitment" && req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(database.recruitmentRequests)); return true; }
  if (pathname === "/api/candidates" && req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(database.candidates)); return true; }
  if (pathname === "/api/interviews" && req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(database.interviews)); return true; }
  if (pathname === "/api/results" && req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(database.interviewResults)); return true; }
  if (pathname === "/api/employees" && req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(database.onboardingRecords)); return true; }

  return false;
}

// === END OF PART 1 - Tiep tuc ghep voi PART 2 ===
// === PART 2 START - Ghep tiep sau PART 1 ===

const htmlContent = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>He Thong Quan Ly Tuyen Dung</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:linear-gradient(135deg,#e8f0fe,#f5f7fa);min-height:100vh;color:#333}
.container{max-width:1400px;margin:0 auto;padding:20px}
.view{display:none}.view.active{display:block}
h1,h2,h3{color:#1a237e;margin-bottom:15px}
h1{text-align:center;font-size:28px;padding:20px 0}
h2{font-size:22px;border-bottom:2px solid #1a237e;padding-bottom:8px}
.login-wrapper{display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.login-box{background:#fff;border-radius:16px;padding:40px;width:100%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,.12)}
.login-box h1{color:#1a237e;margin-bottom:25px;font-size:24px}
.login-box .form-group{margin-bottom:16px}
.login-box .form-group label{display:block;font-weight:600;margin-bottom:5px;font-size:14px}
.login-box .form-group input,.login-box .form-group select{width:100%;padding:12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px}
.login-btn{width:100%;padding:14px;background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.user-bar{background:linear-gradient(135deg,#1a237e,#283593);color:#fff;padding:12px 20px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.user-bar .user-info{font-size:14px;line-height:1.6}
.user-bar .user-info strong{color:#90caf9}
.user-bar .clock{font-size:13px;color:#bbdefb}
.user-bar .logout-btn{padding:8px 18px;background:#ef5350;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600}
.main-btn{display:block;width:100%;min-height:55px;margin:12px 0;padding:15px 25px;font-size:17px;font-weight:600;color:#fff;border:none;border-radius:12px;cursor:pointer;text-align:center}
.btn-recruitment{background:linear-gradient(135deg,#1565c0,#1976d2)}
.btn-candidate{background:linear-gradient(135deg,#00838f,#00acc1)}
.btn-interview{background:linear-gradient(135deg,#6a1b9a,#8e24aa)}
.btn-result{background:linear-gradient(135deg,#e65100,#ef6c00)}
.btn-onboarding{background:linear-gradient(135deg,#2e7d32,#43a047)}
.btn{padding:10px 22px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin:4px}
.btn-primary{background:#1976d2;color:#fff}
.btn-success{background:#43a047;color:#fff}
.btn-warning{background:#ef6c00;color:#fff}
.btn-danger{background:#c62828;color:#fff}
.btn-info{background:#00838f;color:#fff}
.btn-back{background:#546e7a;color:#fff;margin-bottom:15px}
.btn-excel{background:#1b5e20;color:#fff}
.btn-sm{padding:6px 14px;font-size:12px}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-weight:600;margin-bottom:5px;font-size:14px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px}
.form-group textarea{min-height:80px;resize:vertical}
.checkbox-group{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0}
.checkbox-group label{font-weight:normal;display:flex;align-items:center;gap:5px;font-size:14px}
.form-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.form-row{display:flex;flex-wrap:wrap;gap:15px}
.form-row .form-group{flex:1;min-width:200px}
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
.score-input{width:70px!important;text-align:center;display:inline-block!important}
.score-table{margin:10px 0}
.score-table td{padding:8px 12px;text-align:left}
.score-table td:last-child{text-align:center}
.badge{padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}
.badge-green{background:#43a047}.badge-orange{background:#ef6c00}.badge-red{background:#c62828}.badge-blue{background:#1565c0}
.exp-row{display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.exp-row input{flex:1;min-width:100px;padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}
.table-wrapper{overflow-x:auto}
.edit-count-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;margin-left:8px}
.edit-count-ok{background:#43a047}.edit-count-warn{background:#ef6c00}.edit-count-max{background:#c62828}
@media(max-width:768px){.form-row{flex-direction:column}.search-bar{flex-direction:column}table{font-size:11px}.user-bar{flex-direction:column;text-align:center}}
</style></head><body>

<!-- LOGIN -->
<div id="loginView" class="view">
<div class="login-wrapper"><div class="login-box">
<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>
<div class="form-group"><label>Ma nhan vien *</label><input type="text" id="loginEmpId"></div>
<div class="form-group"><label>Ho va ten * (IN HOA)</label><input type="text" id="loginEmpName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Chuc vu *</label><select id="loginEmpPosition"><option value="">-- Chon --</option><option>Cong nhan</option><option>Nhan vien</option><option>Ky su</option><option>Truong nhom</option><option>Truong bo phan</option><option>Truong phong</option></select></div>
<div class="form-group"><label>Phong ban *</label><select id="loginEmpDept"></select></div>
<button class="login-btn" id="btnLogin">Dang nhap</button>
</div></div></div>

<div class="container" id="appContainer" style="display:none">
<div class="user-bar">
<div class="user-info"><div><strong id="barEmpName"></strong> | Ma NV: <strong id="barEmpId"></strong></div>
<div>Chuc vu: <strong id="barEmpPosition"></strong> | Phong ban: <strong id="barEmpDept"></strong></div></div>
<div style="display:flex;align-items:center;gap:15px"><div class="clock" id="barClock"></div>
<button class="logout-btn" id="btnLogout">Dang xuat</button></div></div>

<!-- MAIN -->
<div id="mainView" class="view">
<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>
<button class="main-btn btn-recruitment" id="btnGoRecruitment">Nhu cau tuyen dung</button>
<button class="main-btn btn-candidate" id="btnGoCandidate">Thong tin ung vien</button>
<button class="main-btn btn-interview" id="btnGoInterview">Lich phong van</button>
<button class="main-btn btn-result" id="btnGoResult">Ket qua phong van</button>
<button class="main-btn btn-onboarding" id="btnGoOnboarding">Nhan vien moi nhan viec</button>
</div>

<!-- RECRUITMENT VIEW -->
<div id="recruitmentView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitment">← Quay lai</button>
<h2>Danh sach nhu cau tuyen dung</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="recruitSearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="recruitSearchTo"></div>
<div><label>Tim kiem:</label><br><input type="text" id="recruitSearchText" placeholder="Ma, vi tri..."></div>
<button class="btn btn-primary" id="btnSearchRecruitment">Tim kiem</button>
<button class="btn btn-excel" id="btnExportRecruitment">Xuat Excel</button>
<button class="btn btn-success" id="btnAddRecruitment">+ Tao moi</button>
</div>
<div id="recruitmentTableContainer" class="table-wrapper"></div>
</div>

<!-- RECRUITMENT FORM -->
<div id="recruitmentFormView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentForm">← Quay lai</button>
<h2 id="recruitmentFormTitle">Tao nhu cau tuyen dung</h2>
<div class="form-section"><h3>I. Thong tin chung</h3>
<div class="form-row"><div class="form-group"><label>Phong ban *</label><select id="recDepartment"></select></div>
<div class="form-group"><label>Nguoi de xuat * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Vi tri tuyen dung *</label><input type="text" id="recPosition"></div>
<div class="form-group"><label>Cap bac *</label><select id="recLevel"></select></div></div>
<div class="form-row"><div class="form-group"><label>So luong *</label><input type="number" id="recQuantity" min="1" value="1"></div></div>
<div class="form-group"><label>Ly do tuyen dung *</label>
<div class="checkbox-group">
<label><input type="checkbox" name="recReason" value="Mo rong hoat dong"> Mo rong hoat dong</label>
<label><input type="checkbox" name="recReason" value="Thay the NV nghi viec"> Thay the NV nghi viec</label>
<label><input type="checkbox" name="recReason" value="Bo sung nhan luc"> Bo sung nhan luc</label>
</div></div>
<div class="form-group"><label>Thoi gian can nhan su *</label><input type="date" id="recNeedDate"></div>
</div>
<div class="form-section"><h3>II. Thong tin vi tri</h3>
<div class="form-group"><label>Bao cao cho *</label><input type="text" id="recReportTo" style="text-transform:uppercase"></div>
<div class="form-group"><label>Dia diem lam viec *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorkplace" value="Nha may 1"> NM1</label><label><input type="checkbox" name="recWorkplace" value="Nha may 2"> NM2</label><label><input type="checkbox" name="recWorkplace" value="Nha may 3"> NM3</label><label><input type="checkbox" name="recWorkplace" value="Nha may 4"> NM4</label></div></div>
<div class="form-group"><label>Thoi gian lam viec *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorktime" value="Hanh chinh"> Hanh chinh</label><label><input type="checkbox" name="recWorktime" value="2 ca"> 2 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca"> 3 ca</label></div></div>
<div class="form-group"><label>Mo ta cong viec *</label><textarea id="recJobDesc"></textarea></div>
<div class="form-group"><label>Muc luong de xuat</label><input type="text" id="recSalaryRange"></div>
</div>
<div class="form-section"><h3>III. Yeu cau ung vien</h3>
<div class="form-group"><label>Trinh do hoc van *</label><select id="recEducation"></select></div>
<div class="form-group"><label>Deadline tuyen dung *</label><input type="date" id="recDeadline"></div>
</div>
<button class="btn btn-success" id="btnSubmitRecruitment" style="width:100%;min-height:45px;font-size:16px">Luu</button>
</div>

<!-- CANDIDATE VIEW -->
<div id="candidateView" class="view">
<button class="btn btn-back" id="btnBackFromCandidate">← Quay lai</button>
<h2>Danh sach ung vien</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="candidateSearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="candidateSearchTo"></div>
<div><label>Tim kiem:</label><br><input type="text" id="candidateSearchText" placeholder="Ten, SDT, ma UV..."></div>
<button class="btn btn-primary" id="btnSearchCandidate">Tim kiem</button>
<button class="btn btn-excel" id="btnExportCandidate">Xuat Excel</button>
<button class="btn btn-success" id="btnAddCandidate">+ Them ung vien</button>
</div>
<div id="candidateTableContainer" class="table-wrapper"></div>
</div>

<!-- CANDIDATE FORM -->
<div id="candidateFormView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateForm">← Quay lai</button>
<h2 id="candidateFormTitle">THONG TIN UNG VIEN</h2>
<div class="form-section"><h3>1. Thong tin ca nhan</h3>
<div class="form-row"><div class="form-group"><label>Ma nhu cau tuyen dung *</label><input type="text" id="candRecruitCode"></div>
<div class="form-group"><label>Bo phan *</label><select id="candDepartment"></select></div></div>
<div class="form-row"><div class="form-group"><label>Ho va ten * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Ngay sinh *</label><input type="date" id="candDob"></div></div>
<div class="form-row"><div class="form-group"><label>Gioi tinh *</label><select id="candGender"><option value="">-- Chon --</option><option>Nam</option><option>Nu</option></select></div>
<div class="form-group"><label>SDT *</label><input type="tel" id="candPhone"></div></div>
<div class="form-group"><label>Dia chi thuong tru *</label><input type="text" id="candPermanentAddr"></div>
<div class="form-group"><label>CCCD *</label><input type="text" id="candCCCD"></div>
</div>
<div class="form-section"><h3>2. Trinh do</h3>
<div class="form-group"><label>Trinh do hoc van *</label><select id="candEducationLevel"></select></div>
<div class="form-group"><label>Chuyen nganh</label><input type="text" id="candMajor"></div>
</div>
<div class="form-section"><h3>3. Nguyen vong</h3>
<div class="form-group"><label>Nguon tuyen</label>
<div class="checkbox-group"><label><input type="checkbox" name="candSource" value="Facebook"> Facebook</label><label><input type="checkbox" name="candSource" value="Nguoi quen"> Nguoi quen</label><label><input type="checkbox" name="candSource" value="Website"> Website</label></div></div>
<div class="form-row"><div class="form-group"><label>Nguyen vong 1 *</label><input type="text" id="candWish1"></div>
<div class="form-group"><label>Nguyen vong 2</label><input type="text" id="candWish2"></div></div>
<div class="form-group"><label>Thoi gian co the di lam *</label><input type="date" id="candStartDate"></div>
</div>
<div class="form-section"><label><input type="checkbox" id="candCommitment"> Toi xac nhan thong tin tren la dung su that. *</label></div>
<button class="btn btn-success" id="btnSubmitCandidate" style="width:100%;min-height:45px;font-size:16px">Luu</button>
</div>

<!-- INTERVIEW VIEW (Bang lich phong van tren man hinh chinh) -->
<div id="interviewView" class="view">
<button class="btn btn-back" id="btnBackFromInterview">← Quay lai</button>
<h2>Lich phong van</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="interviewSearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="interviewSearchTo"></div>
<div><label>Tim kiem:</label><br><input type="text" id="interviewSearchText" placeholder="Ten, ma UV..."></div>
<button class="btn btn-primary" id="btnSearchInterview">Tim kiem</button>
<button class="btn btn-excel" id="btnExportInterview">Xuat Excel</button>
<button class="btn btn-success" id="btnAddInterview">+ Dat lich moi</button>
</div>
<div id="interviewMainTableContainer" class="table-wrapper"></div>
</div>

<!-- SCHEDULE INTERVIEW FORM -->
<div id="scheduleInterviewFormView" class="view">
<button class="btn btn-back" id="btnBackFromScheduleInterview">← Quay lai</button>
<h2>Dat lich phong van</h2>
<div class="form-section">
<div class="form-group"><label>Ung vien</label><select id="ivCandidateSelect"></select></div>
<div class="form-group"><label>Ma NV nguoi phong van *</label><input type="text" id="ivInterviewerCode"></div>
<div id="ivInterviewerInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div>
<div class="form-group"><label>Vi tri phong van *</label><select id="ivPosition"></select></div>
<div class="form-row"><div class="form-group"><label>Ngay phong van *</label><input type="date" id="ivDate"></div>
<div class="form-group"><label>Gio *</label><input type="time" id="ivTime"></div></div>
<div class="form-group"><label>Hinh thuc *</label><select id="ivType"><option value="">-- Chon --</option><option>Online</option><option>Offline</option></select></div>
<div class="form-group"><label>Dia diem *</label><select id="ivLocation"><option value="">-- Chon --</option><option>Nha may 1</option><option>Nha may 2</option><option>Nha may 3</option><option>Nha may 4</option></select></div>
<div class="form-group"><label>Bai kiem tra *</label>
<div class="checkbox-group"><label><input type="checkbox" name="ivTest" value="Tieng Anh"> Tieng Anh</label><label><input type="checkbox" name="ivTest" value="IQ"> IQ</label><label><input type="checkbox" name="ivTest" value="Nhan cach"> Nhan cach</label></div></div>
</div>
<button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Luu lich phong van</button>
</div>

<!-- RESULT VIEW (Bang ket qua = thong tin tu lich phong van + ket qua) -->
<div id="resultView" class="view">
<button class="btn btn-back" id="btnBackFromResult">← Quay lai</button>
<h2>Ket qua phong van</h2>
<div class="search-bar">
<div><label>Tu ngay (ngay PV):</label><br><input type="date" id="resultSearchFrom"></div>
<div><label>Den ngay (ngay PV):</label><br><input type="date" id="resultSearchTo"></div>
<div><label>Tim kiem:</label><br><input type="text" id="resultSearchText" placeholder="Ten, ma UV..."></div>
<button class="btn btn-primary" id="btnSearchResult">Tim kiem</button>
<button class="btn btn-excel" id="btnExportResult">Xuat Excel</button>
</div>
<div id="resultMainTableContainer" class="table-wrapper"></div>
</div>

<!-- EVALUATE FORM -->
<div id="evaluateFormView" class="view">
<button class="btn btn-back" id="btnBackFromEvaluate">← Quay lai</button>
<h2>Danh gia ung vien</h2>
<div id="evaluateFormContent"></div>
</div>

<!-- ONBOARDING VIEW -->
<div id="onboardingView" class="view">
<button class="btn btn-back" id="btnBackFromOnboarding">← Quay lai</button>
<h2>Nhan vien moi nhan viec</h2>
<div class="search-bar">
<div><label>Tu ngay (ngay di lam):</label><br><input type="date" id="onboardSearchFrom"></div>
<div><label>Den ngay (ngay di lam):</label><br><input type="date" id="onboardSearchTo"></div>
<div><label>Tim kiem:</label><br><input type="text" id="onboardSearchText" placeholder="Ten, ma NV..."></div>
<button class="btn btn-primary" id="btnSearchOnboarding">Tim kiem</button>
<button class="btn btn-excel" id="btnExportOnboarding">Xuat Excel</button>
</div>
<div id="onboardingTableContainer" class="table-wrapper"></div>
</div>

<!-- OFFER FORM -->
<div id="offerFormView" class="view">
<button class="btn btn-back" id="btnBackFromOffer">← Quay lai</button>
<h2>Thong bao nhan viec</h2>
<div id="offerFormContent"></div>
</div>

<!-- CONFIRM ONBOARD FORM -->
<div id="confirmOnboardView" class="view">
<button class="btn btn-back" id="btnBackFromConfirmOnboard">← Quay lai</button>
<h2>Xac nhan nhan viec</h2>
<div id="confirmOnboardContent"></div>
</div>

</div>
`;

// === END OF PART 2 - Tiep tuc ghep voi PART 3 ===
// === PART 3 START - Ghep tiep sau PART 2 ===

const scriptContent = `
<script>
var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[],actionHistory=[];
var recruitmentRequestCounter=1,candidateCounter=1,interviewFormCounter=1,resultCounter=1,employeeCounter=268600;
var editingRecruitmentCode=null,editingCandidateCode=null;
var currentUser=null,clockInterval=null;

var departments=['San xuat 1','San xuat 2','Bao tri bao duong','Ky thuat','Kiem soat chat luong','QA','EHS','Ke toan','Hanh chinh nhan su','IT'];
var levels=['Cong nhan','Nhan vien','Ky su','Truong nhom','Truong bo phan','Truong phong'];
var educationLevels=['THCS','THPT','Trung cap','Cao dang','Dai hoc','Thac si'];
var interviewers=[{code:'268493',name:'NGUYEN VAN MINH',position:'Truong phong',department:'Hanh chinh nhan su'},{code:'NV002',name:'TRAN THI LAN',position:'Truong bo phan',department:'San xuat 1'}];

function loadDataFromServer(){return fetch('/api/data').then(function(r){return r.json()}).then(function(data){
  if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;
  if(data.candidates)candidates=data.candidates;
  if(data.interviews)interviews=data.interviews;
  if(data.interviewResults)interviewResults=data.interviewResults;
  if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;
  if(data.history)actionHistory=data.history;
  if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1;resultCounter=data.counters.resultCounter||1;employeeCounter=data.counters.employeeCounter||268600}
}).catch(function(e){console.error('Load error:',e)})}

function saveDataToServer(){fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
  recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,
  counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter,resultCounter:resultCounter,employeeCounter:employeeCounter}
})}).catch(function(e){console.error('Save error:',e)})}

function showView(id){document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});var t=document.getElementById(id);if(t)t.classList.add('active')}
function formatDate(d){if(!d)return'';var dt=new Date(d);if(isNaN(dt.getTime()))return d;return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
function formatDateTime(d){if(!d)return'';var dt=new Date(d);if(isNaN(dt.getTime()))return d;return formatDate(d)+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')}
function getNow(){return new Date().toISOString()}
function updateClock(){var n=new Date();var el=document.getElementById('barClock');if(el)el.textContent=String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear()+' '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')}
function populateSelect(id,opts,ph,val){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">-- '+(ph||'Chon')+' --</option>';opts.forEach(function(o){var opt=document.createElement('option');opt.value=o;opt.textContent=o;if(val&&o===val)opt.selected=true;s.appendChild(opt)})}
function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}
function getCheckedValues(name){var r=[];document.querySelectorAll('input[name="'+name+'"]:checked').forEach(function(cb){r.push(cb.value)});return r}
function setCheckedValues(name,vals){document.querySelectorAll('input[name="'+name+'"]').forEach(function(cb){cb.checked=(vals||[]).indexOf(cb.value)!==-1})}
function getUserStamp(){if(!currentUser)return{employeeId:'',employeeName:'',timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}
function getEditCount(r){return(r.editHistory&&r.editHistory.length)||0}
function canEdit(r){if(getEditCount(r)>=3)return false;if(r.firstUpdateTime){var h=(new Date()-new Date(r.firstUpdateTime))/(1000*60*60);if(h>=24)return false}return true}
function canDelete(r){if(r.firstUpdateTime){var h=(new Date()-new Date(r.firstUpdateTime))/(1000*60*60);if(h>=24)return false}return true}
function getEditBadge(r){var c=getEditCount(r);return'<span class="edit-count-badge '+(c===0?'edit-count-ok':(c<3?'edit-count-warn':'edit-count-max'))+'">'+c+'/3</span>'}
function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||'',employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',timestamp:getNow()});saveDataToServer()}
function getHiredCount(recCode){var c=0;onboardingRecords.forEach(function(ob){var cd=candidates.find(function(x){return x.code===ob.candidateCode});if(cd&&cd.recruitCode===recCode)c++});return c}
function getRemainingQty(rec){return Math.max(0,(rec.quantity||0)-getHiredCount(rec.code))}

// ===== RENDER TABLES =====

// a. Bang Nhu cau tuyen dung: Nut "Tai len thong tin ung vien"
function renderRecruitmentTable(filtered){
  var data=filtered||recruitmentRequests;
  var c=document.getElementById('recruitmentTableContainer');
  if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chua co du lieu</p>';return}
  var h='<table><thead><tr><th>STT</th><th>Ma yeu cau</th><th>Phong ban</th><th>Vi tri</th><th>SL</th><th>Ly do</th><th>Luong</th><th>Ngay can NS</th><th>Nguoi YC</th><th>Ngay tao</th><th>Trang thai</th><th>Lan sua</th><th>Thao tac</th></tr></thead><tbody>';
  data.forEach(function(r,i){
    var remain=getRemainingQty(r);var status=remain>0?'Dang tuyen':'Da tuyen du';
    h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/recruitment/'+encodeURIComponent(r.code)+'" target="_blank" class="link-code">'+r.code+'</a></td><td>'+r.department+'</td><td>'+r.position+'</td><td>'+r.quantity+'</td><td>'+((r.reasons||[]).join(', '))+'</td><td>'+(r.salaryRange||'')+'</td><td>'+formatDate(r.needDate)+'</td><td>'+(r.proposer||'')+'</td><td>'+formatDateTime(r.timestamp)+'</td><td><span class="badge '+(remain>0?'badge-orange':'badge-green')+'">'+status+'</span></td><td>'+getEditBadge(r)+'</td>';
    h+='<td><button class="btn btn-info btn-sm btn-action-upload" data-code="'+r.code+'">Tai len thong tin ung vien</button></td></tr>';
  });
  h+='</tbody></table>';c.innerHTML=h;
  c.querySelectorAll('.btn-action-upload').forEach(function(b){b.addEventListener('click',function(){
    var code=this.getAttribute('data-code');
    editingCandidateCode=null;
    document.getElementById('candRecruitCode').value=code;
    document.getElementById('candidateFormTitle').textContent='THONG TIN UNG VIEN';
    showView('candidateFormView');
  })});
}

// b. Bang Thong tin ung vien: Nut "Dat lich phong van"
function renderCandidateTable(filtered){
  var data=filtered||candidates;
  var c=document.getElementById('candidateTableContainer');
  if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chua co du lieu</p>';return}
  var h='<table><thead><tr><th>STT</th><th>Ma UV</th><th>Ho ten</th><th>Gioi tinh</th><th>Nam sinh</th><th>SDT</th><th>Vi tri</th><th>Ma YCTD</th><th>Nguon tuyen</th><th>Ngay cap nhat</th><th>Trang thai</th><th>Lan sua</th><th>Thao tac</th></tr></thead><tbody>';
  data.forEach(function(c2,i){
    h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/candidate/'+encodeURIComponent(c2.code)+'" target="_blank" class="link-code">'+c2.code+'</a></td><td>'+c2.fullName+'</td><td>'+(c2.gender||'')+'</td><td>'+(c2.dob?c2.dob.substring(0,4):'')+'</td><td>'+c2.phone+'</td><td>'+(c2.wish1||'')+'</td><td>'+(c2.recruitCode||'')+'</td><td>'+((c2.sources||[]).join(', '))+'</td><td>'+formatDateTime(c2.timestamp)+'</td><td><span class="badge badge-blue">'+(c2.status||'Da cap nhat')+'</span></td><td>'+getEditBadge(c2)+'</td>';
    var hasIv=interviews.find(function(x){return x.candidateCode===c2.code});
    if(!hasIv){h+='<td><button class="btn btn-primary btn-sm btn-action-schedule" data-code="'+c2.code+'">Dat lich phong van</button></td>'}
    else{h+='<td><span class="badge badge-green">Da dat lich</span></td>'}
    h+='</tr>';
  });
  h+='</tbody></table>';c.innerHTML=h;
  c.querySelectorAll('.btn-action-schedule').forEach(function(b){b.addEventListener('click',function(){openScheduleForm(this.getAttribute('data-code'))})});
}

// c. Bang Lich phong van: Nut "Danh gia ket qua"
function renderInterviewTable(filtered){
  var data=filtered||interviews;
  var c=document.getElementById('interviewMainTableContainer');
  if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chua co lich phong van</p>';return}
  var h='<table><thead><tr><th>STT</th><th>Ma lich</th><th>Ma UV</th><th>Ho ten</th><th>Vi tri</th><th>Ngay PV</th><th>Gio</th><th>Hinh thuc</th><th>Nguoi PV</th><th>Dia diem</th><th>Trang thai</th><th>Lan sua</th><th>Thao tac</th></tr></thead><tbody>';
  data.forEach(function(iv,i){
    var cd=candidates.find(function(x){return x.code===iv.candidateCode});
    h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/interview/'+encodeURIComponent(iv.code)+'" target="_blank" class="link-code">'+iv.code+'</a></td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+formatDate(iv.date)+'</td><td>'+(iv.time||'')+'</td><td>'+(iv.interviewType||'Offline')+'</td><td>'+(iv.interviewerName||'')+'</td><td>'+(iv.location||'')+'</td><td><span class="badge badge-blue">'+(iv.status||'Da len lich')+'</span></td><td>'+getEditBadge(iv)+'</td>';
    var rs=interviewResults.find(function(r){return r.interviewCode===iv.code});
    if(!rs){h+='<td><button class="btn btn-warning btn-sm btn-action-evaluate" data-ivcode="'+iv.code+'">Danh gia ket qua</button></td>'}
    else{h+='<td><span class="badge badge-green">Da danh gia</span></td>'}
    h+='</tr>';
  });
  h+='</tbody></table>';c.innerHTML=h;
  c.querySelectorAll('.btn-action-evaluate').forEach(function(b){b.addEventListener('click',function(){showEvaluationForm(this.getAttribute('data-ivcode'))})});
}

// d. Bang Ket qua phong van (hien thi thong tin tu lich PV): Nut "Thong bao nhan viec"
function renderResultTable(filtered){
  var data=filtered||interviewResults;
  var c=document.getElementById('resultMainTableContainer');
  if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chua co ket qua</p>';return}
  var h='<table><thead><tr><th>STT</th><th>Ma KQ</th><th>Ma lich PV</th><th>Ma UV</th><th>Ho ten</th><th>Vi tri</th><th>Ngay PV</th><th>Gio PV</th><th>Nguoi PV</th><th>Dia diem</th><th>Diem</th><th>Ket qua</th><th>Luong DX</th><th>Thao tac</th></tr></thead><tbody>';
  data.forEach(function(r,i){
    var iv=interviews.find(function(x){return x.code===r.interviewCode});
    var cd=candidates.find(function(x){return x.code===r.candidateCode});
    h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/result/'+encodeURIComponent(r.code)+'" target="_blank" class="link-code">'+(r.code||'')+'</a></td><td>'+(iv?iv.code:'')+'</td><td>'+(r.candidateCode||'')+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+(r.position||'')+'</td><td>'+(iv?formatDate(iv.date):'')+'</td><td>'+(iv?iv.time||'':'')+'</td><td>'+(iv?iv.interviewerName||'':'')+'</td><td>'+(iv?iv.location||'':'')+'</td><td>'+(r.totalScore!==undefined?r.totalScore+'/50':'')+'</td><td>'+(r.conclusion||'')+'</td><td>'+(r.proposedSalary||'')+'</td>';
    if(r.conclusion==='De xuat tuyen'){
      var alreadyHired=onboardingRecords.find(function(ob){return ob.candidateCode===r.candidateCode});
      if(!alreadyHired){h+='<td><button class="btn btn-success btn-sm btn-action-offer" data-rcode="'+r.code+'">Thong bao nhan viec</button></td>'}
      else{h+='<td><span class="badge badge-green">Da nhan viec</span></td>'}
    }else{h+='<td>'+(r.conclusion||'')+'</td>'}
    h+='</tr>';
  });
  h+='</tbody></table>';c.innerHTML=h;
  c.querySelectorAll('.btn-action-offer').forEach(function(b){b.addEventListener('click',function(){showOfferForm(this.getAttribute('data-rcode'))})});
}

// e. Bang Nhan vien moi: Nut "Xac nhan nhan viec"
function renderOnboardingTable(filtered){
  var data=filtered||onboardingRecords;
  var c=document.getElementById('onboardingTableContainer');
  if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chua co du lieu</p>';return}
  var h='<table><thead><tr><th>STT</th><th>Ma NV</th><th>Ho ten</th><th>Phong ban</th><th>Vi tri</th><th>Ngay nhan viec</th><th>Luong</th><th>Loai HD</th><th>Trang thai</th><th>Lan sua</th><th>Thao tac</th></tr></thead><tbody>';
  data.forEach(function(e,i){
    h+='<tr><td>'+(i+1)+'</td><td><a href="/api/pdf/employee/'+encodeURIComponent(e.employeeCode||e.code)+'" target="_blank" class="link-code">'+(e.employeeCode||'')+'</a></td><td>'+(e.candidateName||'')+'</td><td>'+(e.department||'')+'</td><td>'+(e.position||'')+'</td><td>'+formatDate(e.startDate)+'</td><td>'+(e.salary||e.probSalary||'')+'</td><td>'+(e.contractType||'Thu viec')+'</td><td><span class="badge badge-blue">'+(e.status||'Dang thu viec')+'</span></td><td>'+getEditBadge(e)+'</td>';
    h+='<td><button class="btn btn-success btn-sm btn-action-confirm" data-code="'+(e.employeeCode||e.code)+'">Xac nhan nhan viec</button></td></tr>';
  });
  h+='</tbody></table>';c.innerHTML=h;
  c.querySelectorAll('.btn-action-confirm').forEach(function(b){b.addEventListener('click',function(){showConfirmOnboardForm(this.getAttribute('data-code'))})});
}

// ===== FORMS =====

function openScheduleForm(candCode){
  var cd=candidates.find(function(c){return c.code===candCode});
  if(!cd)return;
  document.getElementById('ivCandidateSelect').innerHTML='<option value="'+cd.code+'">'+cd.code+' - '+cd.fullName+'</option>';
  var ps=document.getElementById('ivPosition');ps.innerHTML='<option value="">-- Chon --</option>';
  recruitmentRequests.forEach(function(r){if(getRemainingQty(r)>0){ps.innerHTML+='<option value="'+r.position+' ('+r.code+')">'+r.position+' ('+r.code+') [Con '+getRemainingQty(r)+']</option>'}});
  document.getElementById('ivInterviewerCode').value='';document.getElementById('ivInterviewerInfo').style.display='none';
  document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';
  document.getElementById('ivLocation').selectedIndex=0;document.getElementById('ivType').selectedIndex=0;
  document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});
  showView('scheduleInterviewFormView');
}

function showEvaluationForm(ivCode){
  var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;
  var cd=candidates.find(function(c){return c.code===iv.candidateCode});
  var ct=document.getElementById('evaluateFormContent');
  var tc=['Kien thuc chuyen mon','Kinh nghiem thuc te','Giai quyet van de','Tu duy logic','Ky nang cong cu'];
  var sc=['Giao tiep','Lam viec nhom','Chu dong','Kha nang hoc hoi','Phu hop van hoa'];
  var h='<div class="form-section" id="evalInner" data-ivcode="'+ivCode+'"><h3>Danh gia: '+(cd?cd.fullName:'')+' ('+iv.code+')</h3>';
  h+='<h3>I. Chuyen mon (25 diem)</h3><table class="score-table"><tbody>';
  tc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input tech-score" min="0" max="5" step="0.5" value="0"></td></tr>'});
  h+='</tbody></table><h3>II. Ky nang & thai do (25 diem)</h3><table class="score-table"><tbody>';
  sc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input soft-score" min="0" max="5" step="0.5" value="0"></td></tr>'});
  h+='</tbody></table><p>Diem tong: <strong id="totalScoreDisplay">0</strong>/50</p>';
  h+='<div class="form-group"><label>Muc luong de xuat</label><input type="text" id="evalSalary"></div>';
  h+='<div class="form-group"><label>Ket luan *</label><div class="checkbox-group">';
  ['De xuat tuyen','Du bi','Khong tuyen'].forEach(function(v){h+='<label><input type="radio" name="resultConclusion" value="'+v+'"> '+v+'</label>'});
  h+='</div></div><div class="form-group"><label>Ghi chu</label><textarea id="evalNotes"></textarea></div>';
  h+='<button class="btn btn-success" id="btnSaveEval" style="width:100%;min-height:45px;font-size:16px">Luu danh gia</button></div>';
  ct.innerHTML=h;
  ct.querySelectorAll('.score-input').forEach(function(inp){inp.addEventListener('input',function(){var t=0;ct.querySelectorAll('.tech-score,.soft-score').forEach(function(s){t+=parseFloat(s.value)||0});document.getElementById('totalScoreDisplay').textContent=t})});
  document.getElementById('btnSaveEval').addEventListener('click',function(){
    var fe=document.getElementById('evalInner');
    var concl=fe.querySelector('input[name="resultConclusion"]:checked');
    if(!concl){alert('Vui long chon ket luan');return}
    var ts=[],ss=[];fe.querySelectorAll('.tech-score').forEach(function(s){ts.push(parseFloat(s.value))});fe.querySelectorAll('.soft-score').forEach(function(s){ss.push(parseFloat(s.value))});
    var total=0;ts.forEach(function(s){total+=s});ss.forEach(function(s){total+=s});
    var stamp=getUserStamp();
    var code='PR-HR-001-001-A'+String(resultCounter++).padStart(5,'0');
    var resultData={code:code,interviewCode:ivCode,candidateCode:iv.candidateCode,position:iv.position,techScores:ts,softScores:ss,totalScore:total,conclusion:concl.value,proposedSalary:document.getElementById('evalSalary')?document.getElementById('evalSalary').value.trim():'',notes:document.getElementById('evalNotes')?document.getElementById('evalNotes').value.trim():'',employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,editHistory:[]};
    interviewResults.push(resultData);
    addHistory('Tao moi','Ket qua PV',code,'Danh gia '+iv.candidateCode);
    alert('Luu danh gia thanh cong! Ma: '+code);
    renderInterviewTable();showView('interviewView');
  });
  showView('evaluateFormView');
}

function showOfferForm(rCode){
  var rs=interviewResults.find(function(r){return r.code===rCode});if(!rs)return;
  var cd=candidates.find(function(c){return c.code===rs.candidateCode});if(!cd)return;
  var ct=document.getElementById('offerFormContent');
  var h='<div class="form-section"><h3>Thong bao nhan viec: '+cd.fullName+'</h3>';
  h+='<div class="form-group"><label>Vi tri</label><input type="text" id="offerPosition" value="'+rs.position+'"></div>';
  h+='<div class="form-group"><label>Phong ban</label><select id="offerDepartment"></select></div>';
  h+='<div class="form-group"><label>Ngay nhan viec *</label><input type="date" id="offerStartDate"></div>';
  h+='<div class="form-row"><div class="form-group"><label>Luong thu viec *</label><input type="text" id="offerProbSalary"></div>';
  h+='<div class="form-group"><label>Luong chinh thuc *</label><input type="text" id="offerOfficialSalary"></div></div>';
  h+='<div class="form-group"><label>Loai hop dong</label><select id="offerContractType"><option>Thu viec</option><option>Chinh thuc</option></select></div>';
  h+='<button class="btn btn-success" id="btnSaveOffer" style="width:100%;min-height:45px;font-size:16px">Luu va chuyen sang nhan viec</button></div>';
  ct.innerHTML=h;
  populateSelect('offerDepartment',departments,'Chon phong ban');
  showView('offerFormView');
  document.getElementById('btnSaveOffer').addEventListener('click',function(){
    if(!document.getElementById('offerStartDate').value||!document.getElementById('offerProbSalary').value){alert('Vui long dien day du');return}
    var stamp=getUserStamp();var empCode=String(employeeCounter++);
    onboardingRecords.push({candidateCode:cd.code,candidateName:cd.fullName,employeeCode:empCode,code:empCode,position:document.getElementById('offerPosition').value.trim(),department:document.getElementById('offerDepartment').value,startDate:document.getElementById('offerStartDate').value,probSalary:document.getElementById('offerProbSalary').value.trim(),salary:document.getElementById('offerOfficialSalary').value.trim(),contractType:document.getElementById('offerContractType').value,status:'Dang thu viec',employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,editHistory:[]});
    addHistory('Tao moi','Nhan vien moi',empCode,cd.fullName);
    alert('Luu thanh cong! Ma NV: '+empCode);
    renderOnboardingTable();showView('onboardingView');
  });
}

function showConfirmOnboardForm(empCode){
  var emp=onboardingRecords.find(function(e){return(e.employeeCode||e.code)===empCode});
  if(!emp){alert('Khong tim thay');return}
  var ct=document.getElementById('confirmOnboardContent');
  var h='<div class="form-section"><h3>Xac nhan nhan viec: '+(emp.candidateName||'')+'</h3>';
  h+='<div class="form-group"><label>Ma NV: '+empCode+'</label></div>';
  h+='<div class="form-group"><label>Vi tri: '+(emp.position||'')+'</label></div>';
  h+='<div class="form-group"><label>Phong ban: '+(emp.department||'')+'</label></div>';
  h+='<div class="form-group"><label>Ngay nhan viec: '+formatDate(emp.startDate)+'</label></div>';
  h+='<div class="form-group"><label>Trang thai moi</label><select id="confirmStatus"><option>Chinh thuc</option><option>Gia han thu viec</option></select></div>';
  h+='<div class="form-group"><label>Ghi chu</label><textarea id="confirmNotes"></textarea></div>';
  h+='<button class="btn btn-success" id="btnConfirmOnboard" style="width:100%;min-height:45px;font-size:16px">Xac nhan</button></div>';
  ct.innerHTML=h;
  showView('confirmOnboardView');
  document.getElementById('btnConfirmOnboard').addEventListener('click',function(){
    if(!canEdit(emp)){alert('Da dat gioi han chinh sua');return}
    if(!emp.editHistory)emp.editHistory=[];if(!emp.firstUpdateTime)emp.firstUpdateTime=getNow();
    emp.editHistory.push({employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',timestamp:getNow(),changes:'Xac nhan: '+document.getElementById('confirmStatus').value});
    emp.lastEditTimestamp=getNow();emp.status=document.getElementById('confirmStatus').value;
    if(document.getElementById('confirmStatus').value==='Chinh thuc')emp.contractType='Chinh thuc';
    addHistory('Cap nhat','Nhan vien',empCode,'Xac nhan nhan viec');
    alert('Da xac nhan thanh cong!');renderOnboardingTable();showView('onboardingView');
  });
}

// ===== EVENT LISTENERS =====
document.getElementById('btnLogin').addEventListener('click',function(){
  var id=document.getElementById('loginEmpId').value.trim(),name=document.getElementById('loginEmpName').value.trim();
  if(!id||!name||!document.getElementById('loginEmpPosition').value||!document.getElementById('loginEmpDept').value){alert('Vui long dien day du');return}
  currentUser={id:id,name:name.toUpperCase(),position:document.getElementById('loginEmpPosition').value,department:document.getElementById('loginEmpDept').value};
  document.getElementById('barEmpId').textContent=currentUser.id;document.getElementById('barEmpName').textContent=currentUser.name;
  document.getElementById('barEmpPosition').textContent=currentUser.position;document.getElementById('barEmpDept').textContent=currentUser.department;
  document.getElementById('loginView').classList.remove('active');document.getElementById('appContainer').style.display='block';
  showView('mainView');updateClock();clockInterval=setInterval(updateClock,1000);
});
document.getElementById('btnLogout').addEventListener('click',function(){if(confirm('Dang xuat?')){currentUser=null;if(clockInterval)clearInterval(clockInterval);document.getElementById('appContainer').style.display='none';document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});showView('loginView')}});
document.getElementById('loginEmpName').addEventListener('input',function(){this.value=this.value.toUpperCase()});

// Navigation
document.getElementById('btnGoRecruitment').addEventListener('click',function(){renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnGoCandidate').addEventListener('click',function(){renderCandidateTable();showView('candidateView')});
document.getElementById('btnGoInterview').addEventListener('click',function(){renderInterviewTable();showView('interviewView')});
document.getElementById('btnGoResult').addEventListener('click',function(){renderResultTable();showView('resultView')});
document.getElementById('btnGoOnboarding').addEventListener('click',function(){renderOnboardingTable();showView('onboardingView')});

// Back buttons
document.getElementById('btnBackFromRecruitment').addEventListener('click',function(){showView('mainView')});
document.getElementById('btnBackFromRecruitmentForm').addEventListener('click',function(){editingRecruitmentCode=null;renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnBackFromCandidate').addEventListener('click',function(){showView('mainView')});
document.getElementById('btnBackFromCandidateForm').addEventListener('click',function(){editingCandidateCode=null;renderCandidateTable();showView('candidateView')});
document.getElementById('btnBackFromInterview').addEventListener('click',function(){showView('mainView')});
document.getElementById('btnBackFromScheduleInterview').addEventListener('click',function(){renderInterviewTable();showView('interviewView')});
document.getElementById('btnBackFromResult').addEventListener('click',function(){showView('mainView')});
document.getElementById('btnBackFromEvaluate').addEventListener('click',function(){renderInterviewTable();showView('interviewView')});
document.getElementById('btnBackFromOnboarding').addEventListener('click',function(){showView('mainView')});
document.getElementById('btnBackFromOffer').addEventListener('click',function(){renderResultTable();showView('resultView')});
document.getElementById('btnBackFromConfirmOnboard').addEventListener('click',function(){renderOnboardingTable();showView('onboardingView')});

// Add buttons
document.getElementById('btnAddRecruitment').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentFormTitle').textContent='Tao nhu cau tuyen dung';showView('recruitmentFormView')});
document.getElementById('btnAddCandidate').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THONG TIN UNG VIEN';document.getElementById('candRecruitCode').value='';showView('candidateFormView')});
document.getElementById('btnAddInterview').addEventListener('click',function(){
  var sel=document.getElementById('ivCandidateSelect');sel.innerHTML='<option value="">-- Chon ung vien --</option>';
  candidates.forEach(function(cd){var iv=interviews.find(function(x){return x.candidateCode===cd.code});if(!iv){sel.innerHTML+='<option value="'+cd.code+'">'+cd.code+' - '+cd.fullName+'</option>'}});
  var ps=document.getElementById('ivPosition');ps.innerHTML='<option value="">-- Chon --</option>';
  recruitmentRequests.forEach(function(r){if(getRemainingQty(r)>0){ps.innerHTML+='<option value="'+r.position+' ('+r.code+')">'+r.position+' [Con '+getRemainingQty(r)+']</option>'}});
  document.getElementById('ivInterviewerCode').value='';document.getElementById('ivInterviewerInfo').style.display='none';
  document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';
  document.getElementById('ivLocation').selectedIndex=0;document.getElementById('ivType').selectedIndex=0;
  document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});
  showView('scheduleInterviewFormView');
});

// Submit recruitment
document.getElementById('btnSubmitRecruitment').addEventListener('click',function(){
  var dept=document.getElementById('recDepartment').value,pos=document.getElementById('recPosition').value.trim(),qty=document.getElementById('recQuantity').value;
  if(!dept||!pos||!qty){alert('Vui long dien day du');return}
  var stamp=getUserStamp();
  var data={department:dept,proposer:document.getElementById('recProposer').value.trim(),position:pos,level:document.getElementById('recLevel').value,quantity:parseInt(qty),reasons:getCheckedValues('recReason'),needDate:document.getElementById('recNeedDate').value,reportTo:document.getElementById('recReportTo').value.trim(),workplaces:getCheckedValues('recWorkplace'),worktimes:getCheckedValues('recWorktime'),jobDesc:document.getElementById('recJobDesc').value.trim(),salaryRange:document.getElementById('recSalaryRange').value.trim(),education:document.getElementById('recEducation').value,deadline:document.getElementById('recDeadline').value};
  if(editingRecruitmentCode){
    var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});
    if(!rec||!canEdit(rec)){alert('Khong the sua');return}
    if(!rec.editHistory)rec.editHistory=[];if(!rec.firstUpdateTime)rec.firstUpdateTime=getNow();
    rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cap nhat'});
    Object.assign(rec,data);rec.lastEditTimestamp=stamp.timestamp;
    addHistory('Sua','Nhu cau TD',editingRecruitmentCode,'Lan '+rec.editHistory.length+'/3');
    alert('Cap nhat thanh cong!');editingRecruitmentCode=null;
  }else{
    var rec=Object.assign({code:'PR-HR-001-001-R'+String(recruitmentRequestCounter++).padStart(5,'0')},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,editHistory:[],status:'Dang tuyen'});
    recruitmentRequests.push(rec);addHistory('Tao moi','Nhu cau TD',rec.code,rec.position);alert('Tao thanh cong! Ma: '+rec.code);
  }
  renderRecruitmentTable();showView('recruitmentView');
});

// Submit candidate
document.getElementById('btnSubmitCandidate').addEventListener('click',function(){
  var name=document.getElementById('candFullName').value.trim(),phone=document.getElementById('candPhone').value.trim();
  if(!name||!phone||!document.getElementById('candCommitment').checked){alert('Vui long dien day du va xac nhan');return}
  var stamp=getUserStamp();
  var data={recruitCode:document.getElementById('candRecruitCode').value.trim(),department:document.getElementById('candDepartment').value,fullName:name,dob:document.getElementById('candDob').value,gender:document.getElementById('candGender').value,phone:phone,permanentAddr:document.getElementById('candPermanentAddr').value.trim(),cccd:document.getElementById('candCCCD').value.trim(),educationLevel:document.getElementById('candEducationLevel').value,major:document.getElementById('candMajor').value.trim(),sources:getCheckedValues('candSource'),wish1:document.getElementById('candWish1').value.trim(),wish2:document.getElementById('candWish2').value.trim(),startDate:document.getElementById('candStartDate').value};
  if(editingCandidateCode){
    var c=candidates.find(function(x){return x.code===editingCandidateCode});
    if(!c||!canEdit(c)){alert('Khong the sua');return}
    if(!c.editHistory)c.editHistory=[];if(!c.firstUpdateTime)c.firstUpdateTime=getNow();
    c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cap nhat'});
    Object.assign(c,data);c.lastEditTimestamp=stamp.timestamp;
    addHistory('Sua','Ung vien',editingCandidateCode,'Lan '+c.editHistory.length+'/3');
    alert('Cap nhat thanh cong!');editingCandidateCode=null;
  }else{
    var c=Object.assign({code:'PR-HR-001-001-C'+String(candidateCounter++).padStart(5,'0')},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,editHistory:[],status:'Da cap nhat'});
    candidates.push(c);addHistory('Tao moi','Ung vien',c.code,c.fullName);alert('Luu thanh cong! Ma: '+c.code);
  }
  renderCandidateTable();showView('candidateView');
});

// Interviewer lookup
document.getElementById('ivInterviewerCode').addEventListener('input',function(){
  var code=this.value.trim();var info=document.getElementById('ivInterviewerInfo');
  var iv=interviewers.find(function(i){return i.code===code});
  if(iv){info.style.display='block';info.innerHTML='<strong>'+iv.name+'</strong> - '+iv.position+' - '+iv.department;info.style.background='#e8f5e9'}
  else{info.style.display=code.length>0?'block':'none';info.innerHTML='Khong tim thay';info.style.background='#ffebee'}
});

// Submit interview
document.getElementById('btnSubmitInterview').addEventListener('click',function(){
  var candCode=document.getElementById('ivCandidateSelect').value;
  if(!candCode||!document.getElementById('ivDate').value||!document.getElementById('ivTime').value||!document.getElementById('ivLocation').value){alert('Vui long dien day du');return}
  var ic=document.getElementById('ivInterviewerCode').value.trim();var iwr=interviewers.find(function(i){return i.code===ic});
  var stamp=getUserStamp();
  var iv={code:'PR-HR-001-001-T'+String(interviewFormCounter++).padStart(5,'0'),candidateCode:candCode,interviewerCode:ic,interviewerName:iwr?iwr.name:ic,position:document.getElementById('ivPosition').value,date:document.getElementById('ivDate').value,time:document.getElementById('ivTime').value,interviewType:document.getElementById('ivType').value||'Offline',location:document.getElementById('ivLocation').value,tests:getCheckedValues('ivTest'),employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,editHistory:[],status:'Da len lich'};
  interviews.push(iv);addHistory('Tao moi','Lich PV',iv.code,iv.candidateCode);
  alert('Dat lich thanh cong! Ma: '+iv.code);renderInterviewTable();showView('interviewView');
});

// ===== SEARCH =====
document.getElementById('btnSearchRecruitment').addEventListener('click',function(){var f=document.getElementById('recruitSearchFrom').value,t=document.getElementById('recruitSearchTo').value,txt=(document.getElementById('recruitSearchText').value||'').trim().toLowerCase();renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=r.timestamp.substring(0,10);var md=(!f||ts>=f)&&(!t||ts<=t);var mt=!txt||r.code.toLowerCase().includes(txt)||(r.position||'').toLowerCase().includes(txt)||(r.proposer||'').toLowerCase().includes(txt);return md&&mt}))});
document.getElementById('btnSearchCandidate').addEventListener('click',function(){var f=document.getElementById('candidateSearchFrom').value,t=document.getElementById('candidateSearchTo').value,txt=(document.getElementById('candidateSearchText').value||'').trim().toLowerCase();renderCandidateTable(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);var md=(!f||ts>=f)&&(!t||ts<=t);var mt=!txt||c.code.toLowerCase().includes(txt)||c.fullName.toLowerCase().includes(txt)||(c.phone||'').includes(txt);return md&&mt}))});
document.getElementById('btnSearchInterview').addEventListener('click',function(){var f=document.getElementById('interviewSearchFrom').value,t=document.getElementById('interviewSearchTo').value,txt=(document.getElementById('interviewSearchText').value||'').trim().toLowerCase();renderInterviewTable(interviews.filter(function(iv){var d=iv.date||'';var md=(!f||d>=f)&&(!t||d<=t);var cd=candidates.find(function(c){return c.code===iv.candidateCode});var mt=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||iv.candidateCode.toLowerCase().includes(txt)||iv.code.toLowerCase().includes(txt);return md&&mt}))});
// Ket qua: tim theo ngay phong van
document.getElementById('btnSearchResult').addEventListener('click',function(){var f=document.getElementById('resultSearchFrom').value,t=document.getElementById('resultSearchTo').value,txt=(document.getElementById('resultSearchText').value||'').trim().toLowerCase();renderResultTable(interviewResults.filter(function(r){var iv=interviews.find(function(x){return x.code===r.interviewCode});var d=iv?iv.date||'':'';var md=(!f||d>=f)&&(!t||d<=t);var cd=candidates.find(function(c){return c.code===r.candidateCode});var mt=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||r.candidateCode.toLowerCase().includes(txt)||(r.code&&r.code.toLowerCase().includes(txt));return md&&mt}))});
// Nhan vien moi: tim theo ngay du kien di lam
document.getElementById('btnSearchOnboarding').addEventListener('click',function(){var f=document.getElementById('onboardSearchFrom').value,t=document.getElementById('onboardSearchTo').value,txt=(document.getElementById('onboardSearchText').value||'').trim().toLowerCase();renderOnboardingTable(onboardingRecords.filter(function(e){var d=e.startDate||'';var md=(!f||d>=f)&&(!t||d<=t);var mt=!txt||(e.candidateName&&e.candidateName.toLowerCase().includes(txt))||(e.employeeCode&&e.employeeCode.includes(txt));return md&&mt}))});

// Export
document.getElementById('btnExportRecruitment').addEventListener('click',function(){window.open('/api/export/recruitment','_blank')});
document.getElementById('btnExportCandidate').addEventListener('click',function(){window.open('/api/export/candidates','_blank')});
document.getElementById('btnExportInterview').addEventListener('click',function(){window.open('/api/export/interviews','_blank')});
document.getElementById('btnExportResult').addEventListener('click',function(){window.open('/api/export/results','_blank')});
document.getElementById('btnExportOnboarding').addEventListener('click',function(){window.open('/api/export/employees','_blank')});

// Init
function initApp(){
  populateSelect('loginEmpDept',departments,'Chon phong ban');
  populateSelect('recDepartment',departments,'Chon phong ban');
  populateSelect('recLevel',levels,'Chon cap bac');
  populateSelect('recEducation',educationLevels,'Chon trinh do');
  populateSelect('candDepartment',departments,'Chon bo phan');
  populateSelect('candEducationLevel',educationLevels,'Chon trinh do');
  loadDataFromServer().then(function(){showView('loginView')}).catch(function(){showView('loginView')});
}
document.addEventListener('DOMContentLoaded',function(){initApp()});
<\\/script>
</body></html>
`;

// === SERVER CREATION ===
const server = http.createServer(function(req, res) {
  if (handleApi(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlContent + scriptContent);
});

loadFromJsonBin().then(function() {
  server.listen(PORT, function() {
    console.log('Server running on port ' + PORT);
  });
}).catch(function() {
  server.listen(PORT, function() {
    console.log('Server running on port ' + PORT + ' (no data loaded)');
  });
});
// === END OF PART 3 ===