// server.js - PHIÊN BẢN SỬA LỖI CHO RENDER

const http = require('http');
const https = require('https');
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

// ============================================
// SỬA LỖI 1: Thêm error handling tốt hơn cho jsonbinRequest
// ============================================
function jsonbinRequest(method, data, retryCount) {
  if (!retryCount) retryCount = 0;
  var maxRetries = 3;
  return new Promise(function(resolve, reject) {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) {
      reject(new Error('JSONBIN not configured'));
      return;
    }
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
            console.error('JSONBin error ' + res.statusCode + ':', body.substring(0, 200));
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
      console.error('JSONBin request error:', err.message);
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
        if (!database.counters) database.counters = { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1, resultCounter: 1, employeeCounter: 268600 };
        if (!database.counters.resultCounter) database.counters.resultCounter = 1;
        if (!database.counters.employeeCounter) database.counters.employeeCounter = 268600;
        isDataLoaded = true;
        console.log('=== DOC JSONBIN THANH CONG ===');
        console.log('Records: R=' + database.recruitmentRequests.length + ' C=' + database.candidates.length);
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
    var size = 0;
    req.on('data', function(chunk) {
      size += chunk.length;
      // SỬA LỖI 2: Giới hạn body size để tránh memory issue
      if (size > 10 * 1024 * 1024) {
        reject(new Error('Body too large'));
        return;
      }
      body += chunk.toString();
    });
    req.on('end', function() {
      if (!body || body.trim() === '') {
        resolve({});
        return;
      }
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('JSON khong hop le')); }
    });
    req.on('error', reject);
  });
}

function parseUrl(url) {
  var qIdx = url.indexOf('?');
  var pathname = qIdx >= 0 ? url.substring(0, qIdx) : url;
  var query = {};
  if (qIdx >= 0) {
    var qs = url.substring(qIdx + 1);
    qs.split('&').forEach(function(p) {
      var kv = p.split('=');
      if (kv.length === 2) query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    });
  }
  return { pathname: pathname, query: query };
}

function generateCode(prefix, counter) {
  return 'PR-HR-001-001-' + prefix + String(counter).padStart(5, '0');
}

function getNowISO() {
  return new Date().toISOString();
}

function formatDateForSearch(isoStr) {
  if (!isoStr) return '';
  return isoStr.substring(0, 10);
}

function canEditRecord(record) {
  if (!record.editHistory || record.editHistory.length === 0) return true;
  if (record.editHistory.length >= 3) return false;
  var firstEdit = record.editHistory[0];
  var hoursSince = (new Date() - new Date(firstEdit.timestamp)) / (1000 * 60 * 60);
  if (hoursSince >= 24) return false;
  return true;
}

function canDeleteRecord(record) {
  if (!record.createdAt) return true;
  var hoursSince = (new Date() - new Date(record.createdAt)) / (1000 * 60 * 60);
  return hoursSince < 24;
}

function generatePdfHtml(title, fields, record) {
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title>';
  h += '<style>';
  h += 'body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#333}';
  h += 'h1{text-align:center;color:#1a237e;border-bottom:3px solid #1a237e;padding-bottom:10px}';
  h += '.info-row{display:flex;margin-bottom:8px;border-bottom:1px solid #eee;padding:4px 0}';
  h += '.info-label{font-weight:700;min-width:250px;color:#1a237e}';
  h += '.info-value{flex:1}';
  h += '.section-title{background:#1a237e;color:#fff;padding:8px 12px;margin:20px 0 10px;border-radius:4px}';
  h += '.btn-bar{text-align:center;margin:30px 0;padding:20px;background:#f5f5f5;border-radius:8px}';
  h += '.btn-bar button{padding:12px 30px;margin:0 10px;border:none;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600}';
  h += '.btn-print{background:#4527a0;color:#fff}';
  h += '.btn-download{background:#1565c0;color:#fff}';
  h += '.btn-edit{background:#f57c00;color:#fff}';
  h += '.btn-delete{background:#c62828;color:#fff}';
  h += '@media print{.btn-bar,.no-print{display:none!important}}';
  h += '</style></head><body>';
  h += '<div id="printArea">';
  h += '<h1>' + title + '</h1>';
  fields.forEach(function(f) {
    if (f.section) {
      h += '<div class="section-title">' + f.section + '</div>';
    } else {
      var val = f.value;
      if (val === undefined || val === null) val = 'N/A';
      h += '<div class="info-row"><span class="info-label">' + f.label + ':</span><span class="info-value">' + val + '</span></div>';
    }
  });
  h += '</div>';
  h += '<div class="btn-bar no-print">';
  h += '<button class="btn-print" onclick="window.print()">In / Print</button>';
  h += '<button class="btn-download" onclick="window.print()">Download PDF</button>';
  h += '</div>';
  h += '</body></html>';
  return h;
}

// ============================================
// SỬA LỖI 3: handleApi - wrap async routes properly
// ============================================
function handleApi(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  var parsed = parseUrl(req.url);
  var pathname = parsed.pathname;
  var query = parsed.query;

  // === HEALTH CHECK - Render cần endpoint này ===
  if (pathname === "/" && req.method === "GET") {
    // Không xử lý ở đây, để server trả HTML
    return false;
  }

  // === TEST ===
  if (pathname === "/api/test" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "backend running",
      dataLoaded: isDataLoaded,
      recruitmentCount: database.recruitmentRequests.length,
      candidateCount: database.candidates.length,
      binId: JSONBIN_BIN_ID ? 'configured' : 'missing',
      apiKey: JSONBIN_API_KEY ? 'configured' : 'missing'
    }));
    return true;
  }

  // === HEALTH CHECK cho Render ===
  if (pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
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
      res.end(JSON.stringify({ success: true, message: "Da luu du lieu" }));
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
        candidates: database.candidates.length
      }));
    }).catch(function(err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // ===== SEARCH APIs =====
  if (pathname === "/api/recruitment/search" && req.method === "GET") {
    var date = query.date || '';
    var results = database.recruitmentRequests.filter(function(r) {
      if (!date) return true;
      return formatDateForSearch(r.createdAt || r.timestamp) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return true;
  }

  if (pathname === "/api/candidates/search" && req.method === "GET") {
    var date = query.date || '';
    var results = database.candidates.filter(function(c) {
      if (!date) return true;
      return formatDateForSearch(c.createdAt || c.timestamp) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return true;
  }

  if (pathname === "/api/interviews/search" && req.method === "GET") {
    var date = query.date || '';
    var results = database.interviews.filter(function(iv) {
      if (!date) return true;
      return formatDateForSearch(iv.createdAt || iv.timestamp) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return true;
  }

  if (pathname === "/api/results/search" && req.method === "GET") {
    var date = query.date || '';
    var results = database.interviewResults.filter(function(r) {
      if (!date) return true;
      return formatDateForSearch(r.createdAt || r.timestamp) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return true;
  }

  if (pathname === "/api/employees/search" && req.method === "GET") {
    var date = query.date || '';
    var results = database.onboardingRecords.filter(function(e) {
      if (!date) return true;
      return formatDateForSearch(e.createdAt || e.timestamp) === date;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return true;
  }

  // ===== CRUD APIs =====
  // --- POST /api/recruitment ---
  if (pathname === "/api/recruitment" && req.method === "POST") {
    readBody(req).then(function(body) {
      if (!database.counters.recruitmentRequestCounter) database.counters.recruitmentRequestCounter = 1;
      var code = generateCode('R', database.counters.recruitmentRequestCounter++);
      body.code = code;
      body.status = body.status || 'Dang tuyen';
      body.editCount = 0;
      body.editHistory = [];
      body.createdAt = getNowISO();
      body.timestamp = getNowISO();
      database.recruitmentRequests.push(body);
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, data: body }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // --- POST /api/candidates ---
  if (pathname === "/api/candidates" && req.method === "POST") {
    readBody(req).then(function(body) {
      if (!database.counters.candidateCounter) database.counters.candidateCounter = 1;
      var code = generateCode('C', database.counters.candidateCounter++);
      body.code = code;
      body.status = body.status || 'Da cap nhat thong tin';
      body.editCount = 0;
      body.editHistory = [];
      body.createdAt = getNowISO();
      body.timestamp = getNowISO();
      database.candidates.push(body);
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, data: body }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // --- POST /api/interviews ---
  if (pathname === "/api/interviews" && req.method === "POST") {
    readBody(req).then(function(body) {
      if (!database.counters.interviewFormCounter) database.counters.interviewFormCounter = 1;
      var code = generateCode('T', database.counters.interviewFormCounter++);
      body.code = code;
      body.status = body.status || 'Da len lich';
      body.editCount = 0;
      body.editHistory = [];
      body.createdAt = getNowISO();
      body.timestamp = getNowISO();
      database.interviews.push(body);
      var cand = database.candidates.find(function(c) { return c.code === body.candidateCode; });
      if (cand) cand.status = 'Da hen phong van';
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, data: body }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // --- POST /api/results ---
  if (pathname === "/api/results" && req.method === "POST") {
    readBody(req).then(function(body) {
      if (!database.counters.resultCounter) database.counters.resultCounter = 1;
      var code = generateCode('A', database.counters.resultCounter++);
      body.code = code;
      body.editCount = 0;
      body.editHistory = [];
      body.createdAt = getNowISO();
      body.timestamp = getNowISO();
      database.interviewResults.push(body);
      var cand = database.candidates.find(function(c) { return c.code === body.candidateCode; });
      if (cand) {
        if (body.result === 'Dat') cand.status = 'Dat';
        else if (body.result === 'Khong dat') cand.status = 'Khong dat';
      }
      var iv = database.interviews.find(function(i) { return i.code === body.interviewCode; });
      if (iv) iv.status = 'Da phong van';
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, code: code, data: body }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // --- POST /api/employees ---
  if (pathname === "/api/employees" && req.method === "POST") {
    readBody(req).then(function(body) {
      if (!database.counters.employeeCounter) database.counters.employeeCounter = 268600;
      var empCode = String(database.counters.employeeCounter++);
      body.employeeCode = empCode;
      body.status = body.status || 'Dang thu viec';
      body.contractType = body.contractType || 'Thu viec';
      body.editCount = 0;
      body.editHistory = [];
      body.createdAt = getNowISO();
      body.timestamp = getNowISO();
      database.onboardingRecords.push(body);
      var cand = database.candidates.find(function(c) { return c.code === body.candidateCode; });
      if (cand) cand.status = 'Da xac nhan nhan viec';
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, employeeCode: empCode, data: body }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // ===== PUT (Edit) APIs =====
  var putMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (putMatch && req.method === "PUT") {
    var type = putMatch[1];
    var id = decodeURIComponent(putMatch[2]);

    // Check if it's a confirm endpoint
    if (id.endsWith('/confirm')) {
      var empId = id.replace('/confirm', '');
      var rec = database.onboardingRecords.find(function(r) { return r.employeeCode === empId; });
      if (!rec) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Khong tim thay nhan vien" }));
        return true;
      }
      rec.status = 'Chinh thuc';
      rec.contractType = 'Chinh thuc';
      rec.confirmedAt = getNowISO();
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: rec }));
      return true;
    }

    readBody(req).then(function(body) {
      var collection, record;
      if (type === 'recruitment') {
        collection = database.recruitmentRequests;
        record = collection.find(function(r) { return r.code === id; });
      } else if (type === 'candidate') {
        collection = database.candidates;
        record = collection.find(function(r) { return r.code === id; });
      } else if (type === 'interview') {
        collection = database.interviews;
        record = collection.find(function(r) { return r.code === id; });
      } else if (type === 'result') {
        collection = database.interviewResults;
        record = collection.find(function(r) { return r.code === id; });
      } else if (type === 'employee') {
        collection = database.onboardingRecords;
        record = collection.find(function(r) { return r.employeeCode === id || r.code === id; });
      }

      if (!record) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Khong tim thay ban ghi" }));
        return;
      }

      if (!canEditRecord(record)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Editing time expired" }));
        return;
      }

      if (!record.editHistory) record.editHistory = [];
      record.editHistory.push({
        timestamp: getNowISO(),
        employeeId: body._editorId || '',
        employeeName: body._editorName || '',
        employeePosition: body._editorPosition || '',
        employeeDept: body._editorDept || '',
        changes: body._changes || 'Cap nhat thong tin'
      });
      record.editCount = record.editHistory.length;

      delete body._editorId;
      delete body._editorName;
      delete body._editorPosition;
      delete body._editorDept;
      delete body._changes;

      Object.keys(body).forEach(function(k) {
        if (k !== 'code' && k !== 'employeeCode' && k !== 'editHistory' && k !== 'editCount' && k !== 'createdAt') {
          record[k] = body[k];
        }
      });

      record.timestamp = getNowISO();
      saveToJsonBin();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: record }));
    }).catch(function(err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return true;
  }

  // ===== DELETE APIs =====
  var deleteMatch = pathname.match(/^\/api\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (deleteMatch && req.method === "DELETE") {
    var type = deleteMatch[1];
    var id = decodeURIComponent(deleteMatch[2]);
    var collection, idx = -1;

    if (type === 'recruitment') {
      collection = database.recruitmentRequests;
      idx = collection.findIndex(function(r) { return r.code === id; });
    } else if (type === 'candidate') {
      collection = database.candidates;
      idx = collection.findIndex(function(r) { return r.code === id; });
    } else if (type === 'interview') {
      collection = database.interviews;
      idx = collection.findIndex(function(r) { return r.code === id; });
    } else if (type === 'result') {
      collection = database.interviewResults;
      idx = collection.findIndex(function(r) { return r.code === id; });
    } else if (type === 'employee') {
      collection = database.onboardingRecords;
      idx = collection.findIndex(function(r) { return r.employeeCode === id || r.code === id; });
    }

    if (idx === -1) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Khong tim thay ban ghi" }));
      return true;
    }

    if (!canDeleteRecord(collection[idx])) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Delete time expired" }));
      return true;
    }

    collection.splice(idx, 1);
    saveToJsonBin();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Da xoa thanh cong" }));
    return true;
  }

  // ===== PDF APIs =====
  var pdfMatch = pathname.match(/^\/api\/pdf\/(recruitment|candidate|interview|result|employee)\/(.+)$/);
  if (pdfMatch && req.method === "GET") {
    var pdfType = pdfMatch[1];
    var pdfId = decodeURIComponent(pdfMatch[2]);
    var record = null;
    var title = '';
    var fields = [];

    if (pdfType === 'recruitment') {
      record = database.recruitmentRequests.find(function(r) { return r.code === pdfId; });
      if (record) {
        title = 'PHIEU DE XUAT NHU CAU TUYEN DUNG';
        fields = [
          { label: 'Ma yeu cau', value: record.code },
          { label: 'Phong ban', value: record.department },
          { label: 'Vi tri tuyen', value: record.position },
          { label: 'So luong', value: record.quantity },
          { label: 'Ly do tuyen', value: Array.isArray(record.reasons) ? record.reasons.join(', ') : record.reasons },
          { label: 'Muc luong du kien', value: record.salaryRange },
          { label: 'Ngay can nhan su', value: record.needDate },
          { label: 'Nguoi yeu cau', value: record.proposer },
          { label: 'Ngay tao', value: record.createdAt },
          { label: 'Trang thai', value: record.status },
          { label: 'So lan sua', value: record.editCount || 0 },
          { section: 'THONG TIN VI TRI' },
          { label: 'Cap bac', value: record.level },
          { label: 'Bao cao cho', value: record.reportTo },
          { label: 'Dia diem lam viec', value: Array.isArray(record.workplaces) ? record.workplaces.join(', ') : record.workplaces },
          { label: 'Mo ta cong viec', value: record.jobDesc },
          { section: 'YEU CAU UNG VIEN' },
          { label: 'Trinh do hoc van', value: record.education },
          { label: 'Chuyen nganh', value: record.major },
          { label: 'Kinh nghiem', value: record.experience },
          { label: 'Deadline', value: record.deadline }
        ];
      }
    } else if (pdfType === 'candidate') {
      record = database.candidates.find(function(r) { return r.code === pdfId; });
      if (record) {
        title = 'PHIEU THONG TIN UNG VIEN';
        fields = [
          { label: 'Ma ung vien', value: record.code },
          { label: 'Ho ten', value: record.fullName },
          { label: 'Gioi tinh', value: record.gender },
          { label: 'Nam sinh', value: record.dob },
          { label: 'SDT', value: record.phone },
          { label: 'Email', value: record.email },
          { label: 'Vi tri ung tuyen', value: record.position || record.wish1 },
          { label: 'Ma yeu cau tuyen dung', value: record.recruitCode },
          { label: 'Nguon tuyen', value: Array.isArray(record.sources) ? record.sources.join(', ') : record.sources },
          { label: 'Ngay nop', value: record.createdAt },
          { label: 'Trang thai', value: record.status },
          { section: 'THONG TIN CA NHAN' },
          { label: 'Dan toc', value: record.ethnicity },
          { label: 'CCCD', value: record.cccd },
          { label: 'Dia chi', value: record.permanentAddr },
          { section: 'TRINH DO' },
          { label: 'Trinh do hoc van', value: record.educationLevel },
          { label: 'Truong', value: record.schoolName },
          { label: 'Chuyen nganh', value: record.major }
        ];
      }
    } else if (pdfType === 'interview') {
      record = database.interviews.find(function(r) { return r.code === pdfId; });
      if (record) {
        var cand = database.candidates.find(function(c) { return c.code === record.candidateCode; });
        title = 'PHIEU LICH PHONG VAN';
        fields = [
          { label: 'Ma lich', value: record.code },
          { label: 'Ma ung vien', value: record.candidateCode },
          { label: 'Ho ten', value: cand ? cand.fullName : '' },
          { label: 'Vi tri', value: record.position },
          { label: 'Ngay phong van', value: record.date },
          { label: 'Gio', value: record.time },
          { label: 'Hinh thuc', value: record.interviewType || 'Offline' },
          { label: 'Nguoi phong van', value: record.interviewerName },
          { label: 'Dia diem', value: record.location },
          { label: 'Trang thai', value: record.status }
        ];
      }
    } else if (pdfType === 'result') {
      record = database.interviewResults.find(function(r) { return r.code === pdfId || r.interviewCode === pdfId; });
      if (record) {
        var cand = database.candidates.find(function(c) { return c.code === record.candidateCode; });
        title = 'PHIEU KET QUA PHONG VAN';
        fields = [
          { label: 'Ma ket qua', value: record.code },
          { label: 'Ma ung vien', value: record.candidateCode },
          { label: 'Ho ten', value: cand ? cand.fullName : '' },
          { label: 'Vi tri', value: record.position },
          { label: 'Diem', value: record.totalScore },
          { label: 'Ket qua', value: record.conclusion || record.result },
          { label: 'Muc luong de xuat', value: record.proposedSalary }
        ];
      }
    } else if (pdfType === 'employee') {
      record = database.onboardingRecords.find(function(r) { return r.employeeCode === pdfId; });
      if (record) {
        title = 'PHIEU NHAN VIEN MOI';
        fields = [
          { label: 'Ma nhan vien', value: record.employeeCode },
          { label: 'Ho ten', value: record.candidateName },
          { label: 'Phong ban', value: record.department },
          { label: 'Vi tri', value: record.position },
          { label: 'Ngay nhan viec', value: record.startDate },
          { label: 'Muc luong', value: record.salary || record.probSalary },
          { label: 'Loai hop dong', value: record.contractType },
          { label: 'Trang thai', value: record.status }
        ];
      }
    }

    if (!record) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<h1>Khong tim thay ban ghi</h1>');
      return true;
    }

    var html = generatePdfHtml(title, fields, record);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  // ===== EXPORT EXCEL APIs =====
  if (pathname === "/api/export/recruitment" && req.method === "GET") {
    var rows = database.recruitmentRequests.map(function(r, i) {
      return [i+1, r.code, r.department, r.position, r.quantity, Array.isArray(r.reasons)?r.reasons.join(', '):r.reasons, r.salaryRange, r.needDate, r.proposer, r.createdAt, r.status, r.editCount||0, r.employeeName, r.timestamp];
    });
    var headers = ['STT','Ma yeu cau','Phong ban','Vi tri','So luong','Ly do','Muc luong','Ngay can','Nguoi yeu cau','Ngay tao','Trang thai','So lan sua','Nguoi TT','Thoi gian'];
    var xlsHtml = '<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>';
    headers.forEach(function(h) { xlsHtml += '<th>' + h + '</th>'; });
    xlsHtml += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      xlsHtml += '<tr>';
      row.forEach(function(cell) { xlsHtml += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>'; });
      xlsHtml += '</tr>';
    });
    xlsHtml += '</tbody></table></body></html>';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename=NhuCauTuyenDung.xls'
    });
    res.end(xlsHtml);
    return true;
  }

  if (pathname === "/api/export/candidates" && req.method === "GET") {
    var headers = ['STT','Ma UV','Ho ten','Gioi tinh','Nam sinh','SDT','Email','Vi tri','Ma YC','Nguon','Ngay nop','Trang thai'];
    var rows = database.candidates.map(function(c, i) {
      return [i+1, c.code, c.fullName, c.gender, c.dob, c.phone, c.email, c.wish1||c.position, c.recruitCode, Array.isArray(c.sources)?c.sources.join(', '):c.sources, c.createdAt, c.status];
    });
    var xlsHtml = '<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>';
    headers.forEach(function(h) { xlsHtml += '<th>' + h + '</th>'; });
    xlsHtml += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      xlsHtml += '<tr>';
      row.forEach(function(cell) { xlsHtml += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>'; });
      xlsHtml += '</tr>';
    });
    xlsHtml += '</tbody></table></body></html>';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename=DanhSachUngVien.xls'
    });
    res.end(xlsHtml);
    return true;
  }

  if (pathname === "/api/export/interviews" && req.method === "GET") {
    var headers = ['STT','Ma lich','Ma UV','Ho ten','Vi tri','Ngay PV','Gio','Hinh thuc','Nguoi PV','Dia diem','Trang thai'];
    var rows = database.interviews.map(function(iv, i) {
      var cand = database.candidates.find(function(c) { return c.code === iv.candidateCode; });
      return [i+1, iv.code, iv.candidateCode, cand?cand.fullName:'', iv.position, iv.date, iv.time, iv.interviewType||'Offline', iv.interviewerName, iv.location, iv.status];
    });
    var xlsHtml = '<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>';
    headers.forEach(function(h) { xlsHtml += '<th>' + h + '</th>'; });
    xlsHtml += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      xlsHtml += '<tr>';
      row.forEach(function(cell) { xlsHtml += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>'; });
      xlsHtml += '</tr>';
    });
    xlsHtml += '</tbody></table></body></html>';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename=LichPhongVan.xls'
    });
    res.end(xlsHtml);
    return true;
  }

  if (pathname === "/api/export/results" && req.method === "GET") {
    var headers = ['STT','Ma KQ','Ma UV','Ho ten','Vi tri','Diem','Ket qua','Muc luong de xuat'];
    var rows = database.interviewResults.map(function(r, i) {
      var cand = database.candidates.find(function(c) { return c.code === r.candidateCode; });
      return [i+1, r.code, r.candidateCode, cand?cand.fullName:'', r.position, r.totalScore, r.conclusion||r.result, r.proposedSalary];
    });
    var xlsHtml = '<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>';
    headers.forEach(function(h) { xlsHtml += '<th>' + h + '</th>'; });
    xlsHtml += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      xlsHtml += '<tr>';
      row.forEach(function(cell) { xlsHtml += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>'; });
      xlsHtml += '</tr>';
    });
    xlsHtml += '</tbody></table></body></html>';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename=KetQuaPhongVan.xls'
    });
    res.end(xlsHtml);
    return true;
  }

  if (pathname === "/api/export/employees" && req.method === "GET") {
    var headers = ['STT','Ma NV','Ho ten','Phong ban','Vi tri','Ngay nhan viec','Muc luong','Loai HD','Trang thai'];
    var rows = database.onboardingRecords.map(function(e, i) {
      return [i+1, e.employeeCode, e.candidateName, e.department, e.position, e.startDate, e.salary||e.probSalary, e.contractType, e.status];
    });
    var xlsHtml = '<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>';
    headers.forEach(function(h) { xlsHtml += '<th>' + h + '</th>'; });
    xlsHtml += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      xlsHtml += '<tr>';
      row.forEach(function(cell) { xlsHtml += '<td>' + (cell === undefined || cell === null ? '' : cell) + '</td>'; });
      xlsHtml += '</tr>';
    });
    xlsHtml += '</tbody></table></body></html>';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': 'attachment; filename=NhanVienMoi.xls'
    });
    res.end(xlsHtml);
    return true;
  }

  // === GET collections ===
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

// ============================================
// SỬA LỖI 4: Tách HTML content ra function riêng
// và dùng string concatenation thay vì template literal
// để tránh lỗi encoding
// ============================================
function getHtmlContent() {
  var html = '';
  html += '<!DOCTYPE html>';
  html += '<html lang="vi">';
  html += '<head>';
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  html += '<title>He Thong Quan Ly Tuyen Dung</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#e8f0fe 0%,#f5f7fa 100%);min-height:100vh;color:#333}';
  html += '.container{max-width:1400px;margin:0 auto;padding:20px}';
  html += '.view{display:none}.view.active{display:block}';
  html += 'h1,h2,h3{color:#1a237e;margin-bottom:15px}';
  html += 'h1{text-align:center;font-size:28px;padding:20px 0}';
  html += 'h2{font-size:22px;border-bottom:2px solid #1a237e;padding-bottom:8px}';
  html += '.login-wrapper{display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}';
  html += '.login-box{background:#fff;border-radius:16px;padding:40px;width:100%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.12)}';
  html += '.login-box h1{color:#1a237e;margin-bottom:25px;font-size:24px}';
  html += '.login-box .form-group{margin-bottom:16px}';
  html += '.login-box .form-group label{display:block;font-weight:600;margin-bottom:5px;color:#37474f;font-size:14px}';
  html += '.login-box .form-group input,.login-box .form-group select{width:100%;padding:12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px}';
  html += '.login-btn{width:100%;padding:14px;background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}';
  html += '.user-bar{background:linear-gradient(135deg,#1a237e,#283593);color:#fff;padding:12px 20px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}';
  html += '.user-bar .user-info{font-size:14px;line-height:1.6}';
  html += '.user-bar .user-info strong{color:#90caf9}';
  html += '.user-bar .clock{font-size:13px;color:#bbdefb}';
  html += '.user-bar .logout-btn{padding:8px 18px;background:#ef5350;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600}';
  html += '.main-btn{display:block;width:100%;min-height:55px;margin:12px 0;padding:15px 25px;font-size:17px;font-weight:600;color:#fff;border:none;border-radius:12px;cursor:pointer;text-align:center}';
  html += '.btn-recruitment{background:linear-gradient(135deg,#1565c0,#1976d2)}';
  html += '.btn-candidate{background:linear-gradient(135deg,#00838f,#00acc1)}';
  html += '.btn-interview{background:linear-gradient(135deg,#6a1b9a,#8e24aa)}';
  html += '.btn-result{background:linear-gradient(135deg,#e65100,#ef6c00)}';
  html += '.btn-onboarding{background:linear-gradient(135deg,#2e7d32,#43a047)}';
  html += '.btn{padding:10px 22px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin:4px}';
  html += '.btn-primary{background:#1976d2;color:#fff}';
  html += '.btn-success{background:#43a047;color:#fff}';
  html += '.btn-warning{background:#ef6c00;color:#fff}';
  html += '.btn-danger{background:#c62828;color:#fff}';
  html += '.btn-info{background:#00838f;color:#fff}';
  html += '.btn-back{background:#546e7a;color:#fff;margin-bottom:15px}';
  html += '.btn-excel{background:#1b5e20;color:#fff}';
  html += '.btn-edit{background:#f57c00;color:#fff}';
  html += '.btn-delete{background:#c62828;color:#fff}';
  html += '.btn-sm{padding:6px 14px;font-size:12px}';
  html += '.btn-disabled{opacity:0.5;cursor:not-allowed!important;pointer-events:none}';
  html += '.form-group{margin-bottom:14px}';
  html += '.form-group label{display:block;font-weight:600;margin-bottom:5px;color:#37474f;font-size:14px}';
  html += '.form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;border:1px solid #b0bec5;border-radius:8px;font-size:14px}';
  html += '.form-group textarea{min-height:80px;resize:vertical}';
  html += '.checkbox-group{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0}';
  html += '.checkbox-group label{font-weight:normal;display:flex;align-items:center;gap:5px;font-size:14px}';
  html += '.form-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}';
  html += '.form-row{display:flex;flex-wrap:wrap;gap:15px}';
  html += '.form-row .form-group{flex:1;min-width:200px}';
  html += 'table{width:100%;border-collapse:collapse;margin:15px 0;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}';
  html += 'table thead th{background:#1a237e;color:#fff;padding:12px 8px;font-size:12px;text-align:center;white-space:nowrap}';
  html += 'table tbody td{padding:8px 6px;font-size:12px;text-align:center;border-bottom:1px solid #e0e0e0}';
  html += 'table tbody tr:nth-child(even){background:#f5f7fa}';
  html += 'table tbody tr:hover{background:#e3f2fd}';
  html += '.link-code{color:#1565c0;cursor:pointer;text-decoration:underline;font-weight:600}';
  html += '.search-bar{background:#fff;padding:15px;border-radius:10px;margin-bottom:15px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;box-shadow:0 2px 8px rgba(0,0,0,.08)}';
  html += '.search-bar label{font-size:13px;font-weight:600}';
  html += '.search-bar input{padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}';
  html += '.badge{padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}';
  html += '.badge-green{background:#43a047}.badge-orange{background:#ef6c00}.badge-red{background:#c62828}.badge-blue{background:#1565c0}';
  html += '.table-wrapper{overflow-x:auto}';
  html += '.score-input{width:70px!important;text-align:center;display:inline-block!important}';
  html += '.score-table{margin:10px 0}';
  html += '.score-table td{padding:8px 12px;text-align:left}';
  html += '.exp-row{display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap}';
  html += '.exp-row input{flex:1;min-width:100px;padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}';
  html += '.edit-count-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;margin-left:8px}';
  html += '.edit-count-ok{background:#43a047}.edit-count-warn{background:#ef6c00}.edit-count-max{background:#c62828}';
  html += '.lock-info{background:#e3f2fd;border-radius:8px;padding:10px;margin:10px 0;font-size:13px;border-left:3px solid #1976d2}';
  html += '.concurrent-users-bar{background:#e8f5e9;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}';
  html += '.concurrent-users-bar .user-tag{background:#1976d2;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px}';
  html += '@media print{body *{visibility:hidden}#printArea,#printArea *{visibility:visible}#printArea{position:absolute;left:0;top:0;width:100%;padding:20px}.btn,.user-bar,.search-bar,.no-print{display:none!important}}';
  html += '@media(max-width:768px){.form-row{flex-direction:column}.search-bar{flex-direction:column}table{font-size:11px}.user-bar{flex-direction:column;text-align:center}}';
  html += '</style>';
  html += '</head>';
  html += '<body>';

  // Login View
  html += '<div id="loginView" class="view">';
  html += '<div class="login-wrapper"><div class="login-box">';
  html += '<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>';
  html += '<p style="text-align:center;color:#666;margin-bottom:20px;">Vui long dang nhap de tiep tuc</p>';
  html += '<div class="form-group"><label>Ma nhan vien *</label><input type="text" id="loginEmpId" placeholder="VD: 268493"></div>';
  html += '<div class="form-group"><label>Ho va ten * (IN HOA)</label><input type="text" id="loginEmpName" placeholder="NGUYEN VAN A" style="text-transform:uppercase"></div>';
  html += '<div class="form-group"><label>Chuc vu *</label><select id="loginEmpPosition"><option value="">-- Chon --</option><option>Cong nhan</option><option>Tro ly</option><option>Nhan vien</option><option>Ky su</option><option>Truong nhom</option><option>Truong bo phan</option><option>Truong phong</option></select></div>';
  html += '<div class="form-group"><label>Phong ban *</label><select id="loginEmpDept"></select></div>';
  html += '<br><button class="login-btn" id="btnLogin">Dang nhap</button>';
  html += '</div></div></div>';

  // App Container
  html += '<div class="container" id="appContainer" style="display:none">';
  html += '<div class="user-bar">';
  html += '<div class="user-info">';
  html += '<div><strong id="barEmpName"></strong> | Ma NV: <strong id="barEmpId"></strong></div>';
  html += '<div>Chuc vu: <strong id="barEmpPosition"></strong> | Phong ban: <strong id="barEmpDept"></strong></div>';
  html += '</div>';
  html += '<div style="display:flex;align-items:center;gap:15px;">';
  html += '<div class="clock" id="barClock"></div>';
  html += '<button class="logout-btn" id="btnLogout">Dang xuat</button>';
  html += '</div></div>';

  html += '<div id="concurrentUsersBar" class="concurrent-users-bar" style="display:none">';
  html += '<span>Nguoi dang chinh sua:</span><span id="concurrentUsersList"></span>';
  html += '<span id="concurrentUsersCount" style="margin-left:auto;font-weight:700"></span></div>';

  // Main View
  html += '<div id="mainView" class="view">';
  html += '<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>';
  html += '<button class="main-btn btn-recruitment" id="btnGoRecruitment">Nhu cau tuyen dung</button>';
  html += '<button class="main-btn btn-candidate" id="btnGoCandidate">Thong tin ung vien</button>';
  html += '<button class="main-btn btn-interview" id="btnGoInterview">Lich phong van</button>';
  html += '<button class="main-btn btn-result" id="btnGoResult">Ket qua phong van</button>';
  html += '<button class="main-btn btn-onboarding" id="btnGoOnboarding">Nhan vien moi nhan viec</button>';
  html += '</div>';

  // Recruitment View
  html += '<div id="recruitmentView" class="view">';
  html += '<button class="btn btn-back" id="btnBackFromRecruitment">&larr; Quay lai</button>';
  html += '<h2>Danh sach nhu cau tuyen dung</h2>';
  html += '<div class="search-bar">';
  html += '<div><label>Tu ngay:</label><br><input type="date" id="recruitSearchFrom"></div>';
  html += '<div><label>Den ngay:</label><br><input type="date" id="recruitSearchTo"></div>';
  html += '<div><label>Tim kiem:</label><br><input type="text" id="recruitSearchText" placeholder="Ma, vi tri..."></div>';
  html += '<button class="btn btn-primary" id="btnSearchRecruitment">Tim kiem</button>';
  html += '<button class="btn btn-excel" id="btnExportRecruitment">Xuat Excel</button>';
  html += '<button class="btn btn-success" id="btnAddRecruitment">+ Tao moi</button>';
  html += '</div>';
  html += '<div id="recruitmentTableContainer" class="table-wrapper"></div>';
  html += '</div>';

  // Recruitment Form View (simplified)
  html += '<div id="recruitmentFormView" class="view">';
  html += '<button class="btn btn-back" id="btnBackFromRecruitmentForm">&larr; Quay lai</button>';
  html += '<h2 id="recruitmentFormTitle">Tao nhu cau tuyen dung</h2>';
  html += '<div id="recruitmentEditInfo" style="display:none"></div>';
  html += '<div class="form-section"><h3>I. Thong tin chung</h3>';
  html += '<div class="form-row"><div class="form-group"><label>Phong ban *</label><select id="recDepartment"></select></div>';
  html += '<div class="form-group"><label>Nguoi de xuat * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>';
  html += '<div class="form-row"><div class="form-group"><label>Vi tri tuyen dung *</label><input type="text" id="recPosition"></div>';
  html += '<div class="form-group"><label>Cap bac *</label><select id="recLevel"></select></div></div>';
  html += '<div class="form-row"><div class="form-group"><label>So luong *</label><input type="number" id="recQuantity" min="1" value="1"></div></div>';
  html += '<div class="form-group"><label>Ly do tuyen dung *</label>';
  html += '<div class="checkbox-group">';
  html += '<label><input type="checkbox" name="recReason" value="Mo rong hoat dong"> Mo rong hoat dong</label>';
  html += '<label><input type="checkbox" name="recReason" value="Thay the nhan vien nghi viec"> Thay the NV nghi viec</label>';
  html += '<label><input type="checkbox" name="recReason" value="Bo sung nhan luc"> Bo sung nhan luc</label>';
  html += '</div></div>';
  html += '<div class="form-group"><label>Ngay can nhan su *</label><input type="date" id="recNeedDate"></div>';
  html += '</div>';
  html += '<div class="form-section"><h3>II. Thong tin vi tri</h3>';
  html += '<div class="form-group"><label>Bao cao cho *</label><input type="text" id="recReportTo" style="text-transform:uppercase"></div>';
  html += '<div class="form-group"><label>Dia diem lam viec *</label>';
  html += '<div class="checkbox-group"><label><input type="checkbox" name="recWorkplace" value="Nha may 1"> Nha may 1</label><label><input type="checkbox" name="recWorkplace" value="Nha may 2"> Nha may 2</label><label><input type="checkbox" name="recWorkplace" value="Nha may 3"> Nha may 3</label><label><input type="checkbox" name="recWorkplace" value="Nha may 4"> Nha may 4</label></div></div>';
  html += '<div class="form-group"><label>Thoi gian lam viec *</label>';
  html += '<div class="checkbox-group"><label><input type="checkbox" name="recWorktime" value="Hanh chinh"> Hanh chinh</label><label><input type="checkbox" name="recWorktime" value="2 ca"> 2 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca"> 3 ca</label></div></div>';
  html += '<div class="form-group"><label>Mo ta cong viec *</label><textarea id="recJobDesc"></textarea></div>';
  html += '<div class="form-group"><label>Che do phuc loi</label><textarea id="recBenefits"></textarea></div>';
  html += '<div class="form-group"><label>Muc luong de xuat</label><input type="text" id="recSalaryRange"></div>';
  html += '</div>';
  html += '<div class="form-section"><h3>III. Yeu cau ung vien</h3>';
  html += '<div class="form-row"><div class="form-group"><label>Trinh do *</label><select id="recEducation"></select></div>';
  html += '<div class="form-group"><label>Chuyen nganh</label><input type="text" id="recMajor"></div></div>';
  html += '<div class="form-row"><div class="form-group"><label>Kinh nghiem</label><input type="text" id="recExperience"></div>';
  html += '<div class="form-group"><label>Ngoai ngu</label><input type="text" id="recLanguage"></div></div>';
  html += '<div class="form-group"><label>Ky nang chuyen mon</label><textarea id="recTechSkill"></textarea></div>';
  html += '<div class="form-group"><label>Ky nang mem</label><textarea id="recSoftSkill"></textarea></div>';
  html += '<div class="form-group"><label>Chung chi</label><input type="text" id="recCertificate"></div>';
  html += '<div class="form-group"><label>Deadline *</label><input type="date" id="recDeadline"></div>';
  html += '<div class="form-group"><label>Moi truong lam viec</label><textarea id="recEnvironment"></textarea></div>';
  html += '</div>';
  html += '<button class="btn btn-success" id="btnSubmitRecruitment" style="width:100%;min-height:45px;font-size:16px">Luu</button>';
  html += '</div>';

  // Candidate View
  html += '<div id="candidateView" class="view">';
  html += '<button class="btn btn-back" id="btnBackFromCandidate">&larr; Quay lai</button>';
  html += '<h2>Danh sach ung vien</h2>';
  html += '<div class="search-bar">';
  html += '<div><label>Tu ngay:</label><br><input type="date" id="candidateSearchFrom"></div>';
  html += '<div><label>Den ngay:</label><br><input type="date" id="candidateSearchTo"></div>';
  html += '<div><label>Tim kiem:</label><br><input type="text" id="candidateSearchText" placeholder="Ten, SDT, ma UV..."></div>';
  html += '<button class="btn btn-primary" id="btnSearchCandidate">Tim kiem</button>';
  html += '<button class="btn btn-excel" id="btnExportCandidate">Xuat Excel</button>';
  html += '<button class="btn btn-success" id="btnAddCandidate">+ Them UV</button>';
  html += '</div>';
  html += '<div id="candidateTableContainer" class="table-wrapper"></div>';
  html += '</div>';

  // Other views (simplified placeholders)
  html += '<div id="candidateFormView" class="view"><button class="btn btn-back" id="btnBackFromCandidateForm">&larr; Quay lai</button><h2 id="candidateFormTitle">THONG TIN UNG VIEN</h2><div id="candidateEditInfo" style="display:none"></div><div class="form-section"><h3>1. Thong tin ca nhan</h3><div class="form-row"><div class="form-group"><label>Ma nhu cau tuyen dung *</label><input type="text" id="candRecruitCode"></div><div class="form-group"><label>Bo phan *</label><select id="candDepartment"></select></div></div><div class="form-row"><div class="form-group"><label>Ngay phong van *</label><input type="date" id="candInterviewDate"></div></div><div class="form-row"><div class="form-group"><label>Ho ten * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div><div class="form-group"><label>Ngay sinh *</label><input type="date" id="candDob"></div></div><div class="form-row"><div class="form-group"><label>Gioi tinh *</label><select id="candGender"><option value="">-- Chon --</option><option>Nam</option><option>Nu</option></select></div><div class="form-group"><label>Dan toc *</label><input type="text" id="candEthnicity"></div></div><div class="form-row"><div class="form-group"><label>Tinh trang ket hon *</label><select id="candMarital"><option value="">-- Chon --</option><option>Doc than</option><option>Ket hon</option></select></div><div class="form-group"><label>So con</label><input type="number" id="candChildren" min="0" value="0"></div></div><div class="form-row"><div class="form-group"><label>So CCCD *</label><input type="text" id="candCCCD"></div><div class="form-group"><label>Ngay cap *</label><input type="date" id="candCCCDDate"></div></div><div class="form-row"><div class="form-group"><label>Noi cap *</label><input type="text" id="candCCCDPlace"></div><div class="form-group"><label>Han CCCD</label><input type="date" id="candCCCDExpiry"></div></div><div class="form-row"><div class="form-group"><label>SDT *</label><input type="tel" id="candPhone"></div><div class="form-group"><label>SDT nguoi than</label><input type="tel" id="candRelativePhone"></div></div><div class="form-group"><label>Dia chi thuong tru *</label><input type="text" id="candPermanentAddr"></div><div class="form-group"><label>Dia chi tam tru</label><input type="text" id="candTempAddr"></div><div class="form-row"><div class="form-group"><label>Chieu cao (cm)</label><input type="number" id="candHeight"></div><div class="form-group"><label>Can nang (kg)</label><input type="number" id="candWeight"></div><div class="form-group"><label>Co giay</label><input type="text" id="candShoeSize"></div></div></div>';
  html += '<div class="form-section"><h3>2. Trinh do</h3><div class="form-group"><label>Trinh do *</label><select id="candEducationLevel"></select></div><div class="form-row"><div class="form-group"><label>Ten truong</label><input type="text" id="candSchoolName"></div><div class="form-group"><label>Nam tot nghiep</label><input type="text" id="candGradYear"></div></div><div class="form-group"><label>Chuyen nganh</label><input type="text" id="candMajor"></div><label style="font-weight:600;margin:10px 0 5px">Kinh nghiem</label><div id="experienceRows"><div class="exp-row"><input type="text" placeholder="Thoi gian"><input type="text" placeholder="Noi dung"><input type="text" placeholder="Don vi"><input type="text" placeholder="Dia diem"><input type="text" placeholder="Luong"></div></div><button class="btn btn-info" id="btnAddExpRow">+ Them dong</button></div>';
  html += '<div class="form-section"><h3>3. Xac nhan</h3><div class="form-group"><label>Da PV o cong ty chua? *</label><select id="candPrevInterview"><option value="">-- Chon --</option><option>Chua</option><option>Da phong van</option></select></div><div class="form-row"><div class="form-group"><label>Thoi gian di lam *</label><select id="candAvailability"><option value="">-- Chon --</option><option>Di lam ngay</option><option>Theo lich hen</option></select></div><div class="form-group"><label>Di lam tu ngay</label><input type="date" id="candStartDate"></div></div><div class="form-row"><div class="form-group"><label>Hut thuoc?</label><select id="candSmoking"><option>Khong</option><option>Co</option></select></div><div class="form-group"><label>Benh tien su?</label><select id="candDisease"><option>Khong</option><option>Co</option></select></div></div><div class="form-group"><label>Biet thong tin qua?</label><div class="checkbox-group"><label><input type="checkbox" name="candSource" value="Website"> Website</label><label><input type="checkbox" name="candSource" value="Facebook"> Facebook</label><label><input type="checkbox" name="candSource" value="Nguoi quen"> Nguoi quen</label></div></div><div class="form-group"><label>Xe bus?</label><select id="candBus"><option>Khong</option><option>Co</option></select></div><div class="form-row" id="candBusDetail" style="display:none"><div class="form-group"><label>Diem don</label><input type="text" id="candBusStop"></div></div><div class="form-row"><div class="form-group"><label>Nguyen vong 1 *</label><input type="text" id="candWish1"></div><div class="form-group"><label>Nguyen vong 2</label><input type="text" id="candWish2"></div><div class="form-group"><label>Nguyen vong 3</label><input type="text" id="candWish3"></div></div></div>';
  html += '<div class="form-section" id="candCVSection" style="display:none"><h3>Upload CV (PDF) *</h3><div class="form-group"><input type="file" id="candCVFile" accept=".pdf"></div></div>';
  html += '<div class="form-section"><label><input type="checkbox" id="candCommitment"> Toi xin xac nhan thong tin tren la dung su that. *</label></div>';
  html += '<button class="btn btn-success" id="btnSubmitCandidate" style="width:100%;min-height:45px;font-size:16px">Luu</button>';
  html += '</div>';

  // Detail views
  html += '<div id="recruitmentDetailView" class="view"><button class="btn btn-back" id="btnBackFromRecruitmentDetail">&larr; Quay lai</button><div class="no-print" style="margin-bottom:10px"><button class="btn btn-edit" id="btnPrintRecruitment">In/PDF</button><button class="btn btn-edit" id="btnEditRecruitment">Sua</button><button class="btn btn-delete" id="btnDeleteRecruitment">Xoa</button></div><div id="recruitmentDetailContent" class="form-section"></div></div>';
  html += '<div id="candidateDetailView" class="view"><button class="btn btn-back" id="btnBackFromCandidateDetail">&larr; Quay lai</button><div class="no-print" style="margin-bottom:10px"><button class="btn btn-edit" id="btnPrintCandidate">In/PDF</button><button class="btn btn-edit" id="btnEditCandidate">Sua</button><button class="btn btn-delete" id="btnDeleteCandidate">Xoa</button></div><div id="candidateDetailContent" class="form-section"></div></div>';

  // Interview views
  html += '<div id="interviewView" class="view"><button class="btn btn-back" id="btnBackFromInterview">&larr; Quay lai</button><h2>Dat lich phong van</h2><div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="interviewSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="interviewSearchTo"></div><div><label>Tim kiem:</label><br><input type="text" id="interviewSearchText" placeholder="Ten, SDT..."></div><button class="btn btn-primary" id="btnSearchInterview">Tim kiem</button><button class="btn btn-excel" id="btnExportInterview">Xuat Excel</button></div><div id="interviewCandidateTableContainer" class="table-wrapper"></div></div>';

  html += '<div id="scheduleInterviewFormView" class="view"><button class="btn btn-back" id="btnBackFromScheduleInterview">&larr; Quay lai</button><h2>Dat lich phong van</h2><div class="form-section"><div class="form-group"><label>Ung vien</label><select id="ivCandidateSelect"></select></div><div class="form-group"><label>Ma NV nguoi PV *</label><input type="text" id="ivInterviewerCode"></div><div id="ivInterviewerInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div><div class="form-group"><label>Vi tri PV *</label><select id="ivPosition"></select></div><div class="form-row"><div class="form-group"><label>Ngay PV *</label><input type="date" id="ivDate"></div><div class="form-group"><label>Gio *</label><input type="time" id="ivTime"></div></div><div class="form-group"><label>Hinh thuc *</label><select id="ivInterviewType"><option value="">-- Chon --</option><option>Online</option><option>Offline</option></select></div><div class="form-group"><label>Dia diem *</label><select id="ivLocation"><option value="">-- Chon --</option><option>Nha may 1</option><option>Nha may 2</option><option>Nha may 3</option><option>Nha may 4</option></select></div><div class="form-group"><label>Bai kiem tra *</label><div class="checkbox-group"><label><input type="checkbox" name="ivTest" value="Tieng Anh"> Tieng Anh</label><label><input type="checkbox" name="ivTest" value="IQ"> IQ</label><label><input type="checkbox" name="ivTest" value="Nhan cach"> Nhan cach</label></div></div></div><button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Luu lich PV</button></div>';

  html += '<div id="interviewExcelView" class="view"><button class="btn btn-back" id="btnBackFromInterviewExcel">&larr; Quay lai</button><h2>Bang lich phong van</h2><button class="btn btn-excel" id="btnExportInterviewExcel">Xuat Excel</button><button class="btn btn-edit" id="btnPrintInterviewExcel">In</button><div id="interviewExcelTableContainer" class="table-wrapper"></div></div>';

  // Result views
  html += '<div id="interviewResultFormView" class="view"><button class="btn btn-back" id="btnBackFromInterviewResult">&larr; Quay lai</button><h2>Ket qua phong van</h2><div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="resultSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="resultSearchTo"></div><div><label>Tim kiem:</label><br><input type="text" id="resultSearchText" placeholder="Ten, SDT..."></div><button class="btn btn-primary" id="btnSearchResult">Tim kiem</button><button class="btn btn-excel" id="btnExportResult">Xuat Excel</button></div><div id="resultInterviewTableContainer" class="table-wrapper"></div><div id="resultFormContainer" style="display:none"></div></div>';

  html += '<div id="resultDetailView" class="view"><button class="btn btn-back" id="btnBackFromResultDetail">&larr; Quay lai</button><div class="no-print" style="margin-bottom:10px"><button class="btn btn-edit" id="btnPrintResult">In/PDF</button></div><div id="resultDetailContent" class="form-section"></div></div>';

  html += '<div id="proposedExcelView" class="view"><button class="btn btn-back" id="btnBackFromProposedExcel">&larr; Quay lai</button><h2>Bang de xuat</h2><button class="btn btn-excel" id="btnExportProposedExcel">Xuat Excel</button><div id="proposedExcelTableContainer" class="table-wrapper"></div></div>';

  html += '<div id="offerFormView" class="view"><button class="btn btn-back" id="btnBackFromOffer">&larr; Quay lai</button><h2>Thong bao trung tuyen</h2><div id="offerFormContent"></div></div>';

  // Onboarding
  html += '<div id="onboardingFormView" class="view"><button class="btn btn-back" id="btnBackFromOnboarding">&larr; Quay lai</button><h2>Xac nhan nhan viec</h2><div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="onboardSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="onboardSearchTo"></div><div><label>Tim kiem:</label><br><input type="text" id="onboardSearchText" placeholder="Ten, SDT..."></div><button class="btn btn-primary" id="btnSearchOnboarding">Tim kiem</button><button class="btn btn-excel" id="btnExportOnboarding">Xuat Excel</button></div><div id="onboardingListContainer" class="table-wrapper"></div><div id="onboardingFormContent" style="display:none"></div></div>';

  // History
  html += '<div id="historyView" class="view"><button class="btn btn-back" id="btnBackFromHistory">&larr; Quay lai</button><h2>Lich su thao tac</h2><div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="historySearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="historySearchTo"></div><button class="btn btn-primary" id="btnSearchHistory">Tim kiem</button><button class="btn btn-excel" id="btnExportHistory">Xuat Excel</button></div><div id="historyTableContainer" class="table-wrapper"></div></div>';

  html += '<div id="printArea" style="display:none"></div>';
  html += '</div>';

  return html;
}

// ============================================
// SỬA LỖI 5: Script content dùng string concatenation
// ============================================
function getScriptContent() {
  // Trả về script dưới dạng string, tránh template literal issues
  var s = '<script>';
  
  // Variables
  s += 'var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1,resultCounter=1,employeeCounter=268600;';
  s += 'var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[];';
  s += 'var actionHistory=[];';
  s += 'var editingRecruitmentCode=null,editingCandidateCode=null;';
  s += 'var MAX_CONCURRENT_EDITORS=10,MAX_EDIT_COUNT=3,DELETE_LOCK_HOURS=24;';
  s += 'var activeEditors={};';
  s += 'var currentUser=null,clockInterval=null;';

  // Departments and levels
  s += 'var departments=["San xuat 1","San xuat 2.1","San xuat 2.2","San xuat 2.2 M&E","San xuat 3.345","San xuat 3.6","San xuat 4","Bao tri bao duong 1","Ky thuat 1","Bao tri bao duong 2","Ky thuat 2","Kiem soat chat luong 1","Kiem soat chat luong 2","QA","Kiem tra 1","Kiem tra 2","Phan tich","EHS","Ho tro san xuat","Ke toan","Hanh chinh nhan su","IT (he thong)"];';
  s += 'var levels=["Cong nhan","Tro ly","Nhan vien","Ky su","Truong nhom","Truong bo phan","Truong phong"];';
  s += 'var educationLevels=["THCS","THPT","Trung cap","Cao dang","Dai hoc","Thac si","Tien si"];';
  s += 'var interviewers=[{code:"268493",name:"NGUYEN VAN MINH",position:"Truong phong",department:"Hanh chinh nhan su"},{code:"NV002",name:"TRAN THI LAN",position:"Truong bo phan",department:"San xuat 1"},{code:"NV003",name:"LE VAN HAI",position:"Truong nhom",department:"Ky thuat 1"}];';

  // Core functions
  s += 'function loadDataFromServer(){return fetch("/api/data").then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(data){if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;if(data.candidates)candidates=data.candidates;if(data.interviews)interviews=data.interviews;if(data.interviewResults)interviewResults=data.interviewResults;if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;if(data.history)actionHistory=data.history;if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1;resultCounter=data.counters.resultCounter||1;employeeCounter=data.counters.employeeCounter||268600}console.log("Client: Data loaded")}).catch(function(err){console.error("Client: Load error:",err)})}';

  s += 'function saveDataToServer(){var payload={recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter,resultCounter:resultCounter,employeeCounter:employeeCounter}};fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(result){console.log("Client: Saved",result.message)}).catch(function(err){console.error("Client: Save error",err)})}';

  s += 'function isAdmin(){if(!currentUser)return false;return currentUser.position==="Truong phong"&&currentUser.department==="Hanh chinh nhan su"}';
  s += 'function showView(id){document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});var t=document.getElementById(id);if(t)t.classList.add("active")}';
  s += 'function goBack(id){showView(id)}';
  s += 'function generateRecruitmentCode(){return"PR-HR-001-001-R"+String(recruitmentRequestCounter++).padStart(5,"0")}';
  s += 'function generateCandidateCode(){return"PR-HR-001-001-C"+String(candidateCounter++).padStart(5,"0")}';
  s += 'function generateInterviewFormCode(){return"PR-HR-001-001-T"+String(interviewFormCounter++).padStart(5,"0")}';
  s += 'function generateResultCode(){return"PR-HR-001-001-A"+String(resultCounter++).padStart(5,"0")}';
  s += 'function generateEmployeeCode(){return String(employeeCounter++)}';
  s += 'function formatDate(d){if(!d)return"";var dt=new Date(d);return String(dt.getDate()).padStart(2,"0")+"/"+String(dt.getMonth()+1).padStart(2,"0")+"/"+dt.getFullYear()}';
  s += 'function formatDateTime(d){if(!d)return"";var dt=new Date(d);return formatDate(d)+" "+String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0")}';
  s += 'function getNow(){return new Date().toISOString()}';
  s += 'function updateClock(){var n=new Date();var el=document.getElementById("barClock");if(el)el.textContent=String(n.getDate()).padStart(2,"0")+"/"+String(n.getMonth()+1).padStart(2,"0")+"/"+n.getFullYear()+" "+String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0")+":"+String(n.getSeconds()).padStart(2,"0")}';
  s += 'function na(v){return v||"N/A"}';

  s += 'function populateSelect(id,opts,ph,val){var s=document.getElementById(id);if(!s)return;s.innerHTML="<option value=\\"\\">"+"-- "+(ph||"Chon")+" --</option>";opts.forEach(function(o){var opt=document.createElement("option");opt.value=o;opt.textContent=o;if(val&&o===val)opt.selected=true;s.appendChild(opt)})}';
  s += 'function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}';
  s += 'function getCheckedValues(name){var r=[];document.querySelectorAll("input[name=\\""+name+"\\"]:checked").forEach(function(cb){r.push(cb.value)});return r}';
  s += 'function setCheckedValues(name,vals){document.querySelectorAll("input[name=\\""+name+"\\"]").forEach(function(cb){cb.checked=vals.indexOf(cb.value)!==-1})}';
  s += 'function getUserStamp(){if(!currentUser)return{employeeId:"",employeeName:"",employeePosition:"",employeeDept:"",timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}';
  s += 'function operatorInfo(r){return(r.employeeName||"")+" ("+(r.employeeId||"")+")"}';
  s += 'function getEditCount(record){return(record.editHistory&&record.editHistory.length)||0}';
  s += 'function canEdit(record){if(getEditCount(record)>=MAX_EDIT_COUNT)return false;if(!record.editHistory||record.editHistory.length===0)return true;var firstEdit=record.editHistory[0];var hoursSince=(new Date()-new Date(firstEdit.timestamp))/(1000*60*60);return hoursSince<24}';
  s += 'function canDelete(record){if(!record.createdAt&&!record.timestamp)return true;var created=record.createdAt||record.timestamp;var hoursSince=(new Date()-new Date(created))/(1000*60*60);return hoursSince<24}';
  s += 'function getEditCountBadge(record){var count=getEditCount(record);var cls=count===0?"edit-count-ok":(count<MAX_EDIT_COUNT?"edit-count-warn":"edit-count-max");return"<span class=\\"edit-count-badge "+cls+"\\">"+count+"/"+MAX_EDIT_COUNT+"</span>"}';
  s += 'function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||"",employeeId:currentUser?currentUser.id:"",employeeName:currentUser?currentUser.name:"",employeePosition:currentUser?currentUser.position:"",employeeDept:currentUser?currentUser.department:"",timestamp:getNow()});saveDataToServer()}';
  s += 'function resetForm(ids){ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==="checkbox"||el.type==="radio")el.checked=false;else if(el.tagName==="SELECT")el.selectedIndex=0;else el.value=""})}';
  s += 'function printContent(html){var pa=document.getElementById("printArea");pa.innerHTML=html;pa.style.display="block";window.print();pa.style.display="none"}';

  // Render functions
  s += 'function renderRecruitmentTable(filtered){var data=filtered||recruitmentRequests;var c=document.getElementById("recruitmentTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co du lieu</p>";return}var h="<table id=\\"recruitmentDataTable\\"><thead><tr><th>STT</th><th>Ma</th><th>Phong ban</th><th>Vi tri</th><th>SL</th><th>Trang thai</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(r,i){var canEditFlag=canEdit(r);var canDeleteFlag=canDelete(r);h+="<tr><td>"+(i+1)+"</td><td><a class=\\"link-code\\" href=\\"/api/pdf/recruitment/"+r.code+"\\" target=\\"_blank\\">"+r.code+"</a></td><td>"+r.department+"</td><td>"+r.position+"</td><td>"+r.quantity+"</td><td>"+(r.status||"Dang tuyen")+"</td><td><button class=\\"btn btn-edit btn-sm"+(canEditFlag?"":"\\ btn-disabled")+"\\" onclick=\\"startEditRecruitment(\'"+r.code+"\')\\""+(canEditFlag?"":"\\ disabled")+">Sua</button> <button class=\\"btn btn-delete btn-sm"+(canDeleteFlag?"":"\\ btn-disabled")+"\\" onclick=\\"deleteRecruitment(\'"+r.code+"\')\\""+(canDeleteFlag?"":"\\ disabled")+">Xoa</button></td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function renderCandidateTable(filtered){var data=filtered||candidates;var c=document.getElementById("candidateTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co du lieu</p>";return}var h="<table><thead><tr><th>STT</th><th>Ma UV</th><th>Ho ten</th><th>SDT</th><th>Vi tri</th><th>Trang thai</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(c2,i){h+="<tr><td>"+(i+1)+"</td><td><a class=\\"link-code\\" href=\\"/api/pdf/candidate/"+c2.code+"\\" target=\\"_blank\\">"+c2.code+"</a></td><td>"+c2.fullName+"</td><td>"+c2.phone+"</td><td>"+(c2.wish1||"")+"</td><td>"+(c2.status||"")+"</td><td><button class=\\"btn btn-primary btn-sm\\" onclick=\\"openScheduleFromCand(\'"+c2.code+"\')\\">"+"Dat lich PV</button></td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function openScheduleFromCand(code){openScheduleInterviewForm(code)}';

  s += 'function renderCandidateTableForInterview(filtered){var data=filtered||candidates;var c=document.getElementById("interviewCandidateTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999\\">Chua co UV</p>";return}var h="<table><thead><tr><th>STT</th><th>Ma UV</th><th>Ho ten</th><th>SDT</th><th>Vi tri</th><th>Trang thai</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(c2,i){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var st=iv?"Da dat lich":"Chua dat lich";h+="<tr><td>"+(i+1)+"</td><td>"+c2.code+"</td><td>"+c2.fullName+"</td><td>"+c2.phone+"</td><td>"+(c2.wish1||"")+"</td><td>"+st+"</td><td>";if(!iv)h+="<button class=\\"btn btn-primary btn-sm\\" onclick=\\"openScheduleInterviewForm(\'"+c2.code+"\')\\">"+"Dat lich</button>";else h+=iv.code;h+="</td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function openScheduleInterviewForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;document.getElementById("ivCandidateSelect").innerHTML="<option value=\\""+cd.code+"\\">"+cd.code+" - "+cd.fullName+"</option>";document.getElementById("ivInterviewerCode").value="";document.getElementById("ivInterviewerInfo").style.display="none";document.getElementById("ivDate").value="";document.getElementById("ivTime").value="";var ps=document.getElementById("ivPosition");ps.innerHTML="<option value=\\"\\">"+"-- Chon --</option>";recruitmentRequests.forEach(function(r){var o=document.createElement("option");o.value=r.position+" ("+r.code+")";o.textContent=r.position+" ("+r.code+")";ps.appendChild(o)});showView("scheduleInterviewFormView")}';

  s += 'function renderInterviewExcelTable(){var data=interviews;var c=document.getElementById("interviewExcelTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999\\">Chua co lich</p>";return}var h="<table id=\\"interviewExcelDataTable\\"><thead><tr><th>STT</th><th>Ma lich</th><th>Ma UV</th><th>Vi tri</th><th>Ngay</th><th>Gio</th><th>Trang thai</th></tr></thead><tbody>";data.forEach(function(iv,i){h+="<tr><td>"+(i+1)+"</td><td>"+iv.code+"</td><td>"+iv.candidateCode+"</td><td>"+iv.position+"</td><td>"+formatDate(iv.date)+"</td><td>"+iv.time+"</td><td>"+(iv.status||"")+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function renderResultInterviewTable(filtered){var data=filtered||interviews;var c=document.getElementById("resultInterviewTableContainer");document.getElementById("resultFormContainer").style.display="none";if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999\\">Chua co du lieu</p>";return}var h="<table><thead><tr><th>STT</th><th>Ma PV</th><th>Ma UV</th><th>Vi tri</th><th>Trang thai</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(iv,i){var rs=interviewResults.find(function(r){return r.interviewCode===iv.code});var st=rs?"Da danh gia":"Chua";h+="<tr><td>"+(i+1)+"</td><td>"+iv.code+"</td><td>"+iv.candidateCode+"</td><td>"+iv.position+"</td><td>"+st+"</td><td>";if(!rs)h+="<button class=\\"btn btn-warning btn-sm\\" onclick=\\"showEvaluationForm(\'"+iv.code+"\')\\">"+"Danh gia</button>";else h+="<button class=\\"btn btn-info btn-sm\\" onclick=\\"showResultDetailView(\'"+iv.code+"\')\\">"+"Xem</button>";h+="</td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function showEvaluationForm(ivCode){var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;var cd=candidates.find(function(c){return c.code===iv.candidateCode});var ct=document.getElementById("resultFormContainer");ct.style.display="block";ct.innerHTML="<div class=\\"form-section\\" id=\\"evaluationFormInner\\" data-ivcode=\\""+ivCode+"\\"><h3>Danh gia: "+(cd?cd.fullName:"")+"</h3><h3>Diem bai test</h3><table class=\\"score-table\\"><tbody><tr><td>Tieng Anh</td><td><input type=\\"number\\" class=\\"score-input tech-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr><tr><td>IQ</td><td><input type=\\"number\\" class=\\"score-input tech-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr><tr><td>Chuyen mon</td><td><input type=\\"number\\" class=\\"score-input soft-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr><tr><td>Ky nang mem</td><td><input type=\\"number\\" class=\\"score-input soft-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr></tbody></table><p>Diem tong: <strong id=\\"totalScoreDisplay\\">0</strong>/20</p><div class=\\"form-group\\"><label>Diem manh</label><textarea id=\\"evalStrengths\\"></textarea></div><div class=\\"form-group\\"><label>Diem yeu</label><textarea id=\\"evalWeaknesses\\"></textarea></div><div class=\\"form-row\\"><div class=\\"form-group\\"><label>Vi tri de xuat</label><input type=\\"text\\" id=\\"evalProposedPosition\\" value=\\""+iv.position+"\\"></div><div class=\\"form-group\\"><label>Muc luong de xuat</label><input type=\\"text\\" id=\\"evalProposedSalary\\"></div></div><h3>Ket luan *</h3><div class=\\"checkbox-group\\"><label><input type=\\"radio\\" name=\\"resultConclusion\\" value=\\"De xuat tuyen\\"> De xuat tuyen</label><label><input type=\\"radio\\" name=\\"resultConclusion\\" value=\\"Du bi\\"> Du bi</label><label><input type=\\"radio\\" name=\\"resultConclusion\\" value=\\"Khong tuyen\\"> Khong tuyen</label></div><br><button class=\\"btn btn-success\\" id=\\"btnSaveEval\\" style=\\"width:100%;min-height:45px;font-size:16px\\">Luu danh gia</button></div>";ct.querySelectorAll(".score-input").forEach(function(inp){inp.addEventListener("input",function(){var t=0;ct.querySelectorAll(".tech-score, .soft-score").forEach(function(s){t+=parseFloat(s.value)||0});document.getElementById("totalScoreDisplay").textContent=t})});document.getElementById("btnSaveEval").addEventListener("click",function(){var fe=document.getElementById("evaluationFormInner");var concl=fe.querySelector("input[name=\\"resultConclusion\\"]:checked");if(!concl){alert("Vui long chon ket luan!");return}var ts=[],ss=[];fe.querySelectorAll(".tech-score").forEach(function(s){ts.push(parseFloat(s.value))});fe.querySelectorAll(".soft-score").forEach(function(s){ss.push(parseFloat(s.value))});var total=0;ts.forEach(function(s){total+=s});ss.forEach(function(s){total+=s});var stamp=getUserStamp();var resultCode=generateResultCode();var resultData={code:resultCode,interviewCode:ivCode,candidateCode:iv.candidateCode,position:iv.position,techScores:ts,softScores:ss,totalScore:total,conclusion:concl.value,result:concl.value==="De xuat tuyen"?"Dat":(concl.value==="Khong tuyen"?"Khong dat":"Cho quyet dinh"),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdAt:stamp.timestamp,editHistory:[],editCount:0,strengths:document.getElementById("evalStrengths").value.trim(),weaknesses:document.getElementById("evalWeaknesses").value.trim(),proposedPosition:document.getElementById("evalProposedPosition").value.trim(),proposedSalary:document.getElementById("evalProposedSalary").value.trim()};interviewResults.push(resultData);addHistory("Tao moi","Danh gia PV",resultCode,"Danh gia UV "+iv.candidateCode);if(resultData.conclusion==="De xuat tuyen"){alert("UV DAT! Chuyen sang offer.");ct.style.display="none";showOfferForm(ivCode)}else{alert("Luu thanh cong!");ct.style.display="none";renderResultInterviewTable()}})}';

  s += 'function showResultDetailView(ivCode){var r=interviewResults.find(function(x){return x.interviewCode===ivCode});if(!r)return;var ct=document.getElementById("resultDetailContent");ct.innerHTML="<h2>KET QUA PHONG VAN</h2><p>Ma: "+r.code+"</p><p>Diem: "+r.totalScore+"</p><p>Ket luan: <strong>"+r.conclusion+"</strong></p>";ct.setAttribute("data-ivcode",ivCode);showView("resultDetailView")}';

  s += 'function showOfferForm(ivCode){var rs=interviewResults.find(function(r){return r.interviewCode===ivCode});if(!rs)return;var cd=candidates.find(function(c){return c.code===rs.candidateCode});if(!cd)return;var ct=document.getElementById("offerFormContent");ct.innerHTML="<div class=\\"form-section\\"><h3>Thong bao trung tuyen: "+cd.fullName+"</h3><div class=\\"form-group\\"><label>Ngay nhan viec *</label><input type=\\"date\\" id=\\"offerStartDate\\"></div><div class=\\"form-row\\"><div class=\\"form-group\\"><label>Luong thu viec *</label><input type=\\"text\\" id=\\"offerProbSalary\\"></div><div class=\\"form-group\\"><label>Luong chinh thuc</label><input type=\\"text\\" id=\\"offerOfficialSalary\\"></div></div><div class=\\"form-group\\"><label>Nguoi quan ly</label><input type=\\"text\\" id=\\"offerManager\\"></div><br><button class=\\"btn btn-success\\" id=\\"btnSaveOffer\\" style=\\"width:100%;min-height:45px\\">Luu va Chuyen nhan viec</button></div>";showView("offerFormView");document.getElementById("btnSaveOffer").addEventListener("click",function(){if(!document.getElementById("offerStartDate").value||!document.getElementById("offerProbSalary").value){alert("Vui long dien ngay va luong");return}var stamp=getUserStamp();var empCode=generateEmployeeCode();var obRecord={candidateCode:cd.code,candidateName:cd.fullName,employeeCode:empCode,department:rs.proposedDepartment||cd.department,position:rs.proposedPosition||rs.position,startDate:document.getElementById("offerStartDate").value,salary:document.getElementById("offerOfficialSalary").value.trim(),probSalary:document.getElementById("offerProbSalary").value.trim(),manager:document.getElementById("offerManager").value.trim(),contractType:"Thu viec",status:"Dang thu viec",employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdAt:stamp.timestamp,editHistory:[],editCount:0};onboardingRecords.push(obRecord);cd.status="Da xac nhan nhan viec";addHistory("Tao moi","Nhan vien moi",empCode,cd.fullName+" da nhan viec");alert("Xac nhan thanh cong! Ma NV: "+empCode);renderOnboardingList();showView("onboardingFormView")})}';

  s += 'function renderOnboardingList(filtered){var data=filtered||onboardingRecords;var c=document.getElementById("onboardingListContainer");document.getElementById("onboardingFormContent").style.display="none";if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999\\">Chua co</p>";return}var h="<table><thead><tr><th>STT</th><th>Ma NV</th><th>Ho ten</th><th>Phong ban</th><th>Vi tri</th><th>Ngay nhan viec</th><th>Trang thai</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(ob,i){h+="<tr><td>"+(i+1)+"</td><td><a class=\\"link-code\\" href=\\"/api/pdf/employee/"+ob.employeeCode+"\\" target=\\"_blank\\">"+ob.employeeCode+"</a></td><td>"+ob.candidateName+"</td><td>"+(ob.department||"")+"</td><td>"+(ob.position||"")+"</td><td>"+formatDate(ob.startDate)+"</td><td>"+(ob.status||"")+"</td><td>";if(ob.status==="Dang thu viec")h+="<button class=\\"btn btn-success btn-sm\\" onclick=\\"confirmOnboarding(\'"+ob.employeeCode+"\')\\">"+"Xac nhan chinh thuc</button>";h+="</td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  s += 'function confirmOnboarding(empCode){var rec=onboardingRecords.find(function(r){return r.employeeCode===empCode});if(!rec)return;rec.status="Chinh thuc";rec.contractType="Chinh thuc";addHistory("Cap nhat","Nhan vien",empCode,"Chuyen chinh thuc");alert("Da xac nhan chinh thuc!");saveDataToServer();renderOnboardingList()}';

  s += 'function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById("historyTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999\\">Chua co lich su</p>";return}var h="<table id=\\"historyDataTable\\"><thead><tr><th>STT</th><th>Hanh dong</th><th>Doi tuong</th><th>Ma</th><th>Chi tiet</th><th>Nguoi TT</th><th>Thoi gian</th></tr></thead><tbody>";data.slice().reverse().forEach(function(h2,i){h+="<tr><td>"+(i+1)+"</td><td>"+h2.action+"</td><td>"+h2.target+"</td><td>"+h2.code+"</td><td>"+h2.detail+"</td><td>"+h2.employeeName+" ("+h2.employeeId+")</td><td>"+formatDateTime(h2.timestamp)+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h}';

  // Edit/Delete functions
  s += 'function startEditRecruitment(code){alert("Chuc nang sua - " + code)}';
  s += 'function deleteRecruitment(code){if(!confirm("Ban co chac muon xoa "+code+"?"))return;var idx=recruitmentRequests.findIndex(function(r){return r.code===code});if(idx===-1)return;recruitmentRequests.splice(idx,1);addHistory("Xoa","Nhu cau tuyen dung",code,"Da xoa");alert("Da xoa "+code);renderRecruitmentTable()}';

  // Collect form data
  s += 'function collectRecFormData(){return{department:document.getElementById("recDepartment").value,proposer:document.getElementById("recProposer").value.trim(),position:document.getElementById("recPosition").value.trim(),level:document.getElementById("recLevel").value,quantity:parseInt(document.getElementById("recQuantity").value),reasons:getCheckedValues("recReason"),needDate:document.getElementById("recNeedDate").value,reportTo:document.getElementById("recReportTo").value.trim(),workplaces:getCheckedValues("recWorkplace"),worktimes:getCheckedValues("recWorktime"),environment:document.getElementById("recEnvironment").value.trim(),jobDesc:document.getElementById("recJobDesc").value.trim(),benefits:document.getElementById("recBenefits").value.trim(),salaryRange:document.getElementById("recSalaryRange").value.trim(),education:document.getElementById("recEducation").value,major:document.getElementById("recMajor").value.trim(),experience:document.getElementById("recExperience").value.trim(),techSkill:document.getElementById("recTechSkill").value.trim(),softSkill:document.getElementById("recSoftSkill").value.trim(),language:document.getElementById("recLanguage").value.trim(),certificate:document.getElementById("recCertificate").value.trim(),deadline:document.getElementById("recDeadline").value}}';

  s += 'function collectCandFormData(){return{recruitCode:document.getElementById("candRecruitCode").value.trim(),department:document.getElementById("candDepartment").value,interviewDate:document.getElementById("candInterviewDate").value,fullName:document.getElementById("candFullName").value.trim(),dob:document.getElementById("candDob").value,gender:document.getElementById("candGender").value,ethnicity:document.getElementById("candEthnicity").value.trim(),marital:document.getElementById("candMarital").value,children:document.getElementById("candChildren").value,cccd:document.getElementById("candCCCD").value.trim(),cccdDate:document.getElementById("candCCCDDate").value,cccdPlace:document.getElementById("candCCCDPlace").value.trim(),cccdExpiry:document.getElementById("candCCCDExpiry").value,phone:document.getElementById("candPhone").value.trim(),relativePhone:document.getElementById("candRelativePhone").value.trim(),permanentAddr:document.getElementById("candPermanentAddr").value.trim(),tempAddr:document.getElementById("candTempAddr").value.trim(),height:document.getElementById("candHeight").value,weight:document.getElementById("candWeight").value,shoeSize:document.getElementById("candShoeSize").value.trim(),educationLevel:document.getElementById("candEducationLevel").value,schoolName:document.getElementById("candSchoolName").value.trim(),gradYear:document.getElementById("candGradYear").value.trim(),major:document.getElementById("candMajor").value.trim(),prevInterview:document.getElementById("candPrevInterview").value,availability:document.getElementById("candAvailability").value,startDate:document.getElementById("candStartDate").value,smoking:document.getElementById("candSmoking").value,disease:document.getElementById("candDisease").value,sources:getCheckedValues("candSource"),bus:document.getElementById("candBus").value,busStop:document.getElementById("candBusStop").value.trim(),wish1:document.getElementById("candWish1").value.trim(),wish2:document.getElementById("candWish2").value.trim(),wish3:document.getElementById("candWish3").value.trim()}}';

  // Login/Logout
  s += 'function doLogin(){var id=document.getElementById("loginEmpId").value.trim();var name=document.getElementById("loginEmpName").value.trim().toUpperCase();var pos=document.getElementById("loginEmpPosition").value;var dept=document.getElementById("loginEmpDept").value;if(!id||!name||!pos||!dept){alert("Vui long dien day du thong tin");return}currentUser={id:id,name:name,position:pos,department:dept};document.getElementById("barEmpId").textContent=currentUser.id;document.getElementById("barEmpName").textContent=currentUser.name;document.getElementById("barEmpPosition").textContent=currentUser.position;document.getElementById("barEmpDept").textContent=currentUser.department;document.getElementById("loginView").classList.remove("active");document.getElementById("appContainer").style.display="block";showView("mainView");updateClock();clockInterval=setInterval(updateClock,1000);addHistory("Dang nhap","He thong",currentUser.id,currentUser.name+" da dang nhap")}';

  s += 'function doLogout(){addHistory("Dang xuat","He thong",currentUser?currentUser.id:"","Da dang xuat");currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById("appContainer").style.display="none";document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});document.getElementById("loginEmpId").value="";document.getElementById("loginEmpName").value="";document.getElementById("loginEmpPosition").selectedIndex=0;document.getElementById("loginEmpDept").selectedIndex=0;showView("loginView")}';

  // Init
  s += 'function initApp(){populateSelect("loginEmpDept",departments,"Chon phong ban");populateSelect("recDepartment",departments,"Chon phong ban");populateSelect("recLevel",levels,"Chon cap bac");populateSelect("recEducation",educationLevels,"Chon trinh do");populateSelect("candDepartment",departments,"Chon bo phan");populateSelect("candEducationLevel",educationLevels,"Chon trinh do");loadDataFromServer().then(function(){showView("loginView")}).catch(function(){showView("loginView")})}';

  // Event listeners
  s += 'document.getElementById("btnLogin").addEventListener("click",function(){doLogin()});';
  s += 'document.getElementById("loginEmpName").addEventListener("input",function(){this.value=this.value.toUpperCase()});';
  s += 'document.getElementById("btnLogout").addEventListener("click",function(){if(confirm("Ban co chac muon dang xuat?"))doLogout()});';
  s += 'document.getElementById("btnGoRecruitment").addEventListener("click",function(){renderRecruitmentTable();showView("recruitmentView")});';
  s += 'document.getElementById("btnGoCandidate").addEventListener("click",function(){renderCandidateTable();showView("candidateView")});';
  s += 'document.getElementById("btnGoInterview").addEventListener("click",function(){renderCandidateTableForInterview();showView("interviewView")});';
  s += 'document.getElementById("btnGoResult").addEventListener("click",function(){renderResultInterviewTable();showView("interviewResultFormView")});';
  s += 'document.getElementById("btnGoOnboarding").addEventListener("click",function(){renderOnboardingList();showView("onboardingFormView")});';
  s += 'document.getElementById("btnBackFromRecruitment").addEventListener("click",function(){goBack("mainView")});';
  s += 'document.getElementById("btnBackFromRecruitmentForm").addEventListener("click",function(){editingRecruitmentCode=null;renderRecruitmentTable();goBack("recruitmentView")});';
  s += 'document.getElementById("btnBackFromRecruitmentDetail").addEventListener("click",function(){renderRecruitmentTable();goBack("recruitmentView")});';
  s += 'document.getElementById("btnBackFromCandidate").addEventListener("click",function(){goBack("mainView")});';
  s += 'document.getElementById("btnBackFromCandidateForm").addEventListener("click",function(){editingCandidateCode=null;renderCandidateTable();goBack("candidateView")});';
  s += 'document.getElementById("btnBackFromCandidateDetail").addEventListener("click",function(){renderCandidateTable();goBack("candidateView")});';
  s += 'document.getElementById("btnBackFromInterview").addEventListener("click",function(){goBack("mainView")});';
  s += 'document.getElementById("btnBackFromScheduleInterview").addEventListener("click",function(){renderCandidateTableForInterview();goBack("interviewView")});';
  s += 'document.getElementById("btnBackFromInterviewExcel").addEventListener("click",function(){renderCandidateTableForInterview();goBack("interviewView")});';
  s += 'document.getElementById("btnBackFromInterviewResult").addEventListener("click",function(){goBack("mainView")});';
  s += 'document.getElementById("btnBackFromResultDetail").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});';
  s += 'document.getElementById("btnBackFromProposedExcel").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});';
  s += 'document.getElementById("btnBackFromOffer").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});';
  s += 'document.getElementById("btnBackFromOnboarding").addEventListener("click",function(){goBack("mainView")});';
  s += 'document.getElementById("btnBackFromHistory").addEventListener("click",function(){goBack("mainView")});';

  // Add recruitment
  s += 'document.getElementById("btnAddRecruitment").addEventListener("click",function(){editingRecruitmentCode=null;document.getElementById("recruitmentFormTitle").textContent="Tao nhu cau tuyen dung";resetForm(["recProposer","recPosition","recQuantity","recNeedDate","recReportTo","recEnvironment","recJobDesc","recBenefits","recSalaryRange","recMajor","recExperience","recLanguage","recTechSkill","recSoftSkill","recCertificate","recDeadline"]);document.getElementById("recDepartment").selectedIndex=0;document.getElementById("recLevel").selectedIndex=0;document.getElementById("recEducation").selectedIndex=0;document.getElementById("recQuantity").value="1";showView("recruitmentFormView")});';

  s += 'document.getElementById("recProposer").addEventListener("input",function(){this.value=this.value.toUpperCase()});';

  s += 'document.getElementById("btnSubmitRecruitment").addEventListener("click",function(){var dept=document.getElementById("recDepartment").value;var pos=document.getElementById("recPosition").value.trim();if(!dept||!pos){alert("Vui long dien phong ban va vi tri");return}var stamp=getUserStamp();var data=collectRecFormData();var rec=Object.assign({code:generateRecruitmentCode(),status:"Dang tuyen"},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdAt:stamp.timestamp,editHistory:[],editCount:0});recruitmentRequests.push(rec);addHistory("Tao moi","Nhu cau tuyen dung",rec.code,"Tao moi: "+rec.position);alert("Tao thanh cong! Ma: "+rec.code);renderRecruitmentTable();showView("recruitmentView")});';

  // Add candidate
  s += 'document.getElementById("btnAddCandidate").addEventListener("click",function(){editingCandidateCode=null;document.getElementById("candidateFormTitle").textContent="THONG TIN UNG VIEN";resetForm(["candRecruitCode","candInterviewDate","candFullName","candDob","candEthnicity","candCCCD","candCCCDDate","candCCCDPlace","candCCCDExpiry","candPhone","candRelativePhone","candPermanentAddr","candTempAddr","candHeight","candWeight","candShoeSize","candSchoolName","candGradYear","candMajor","candStartDate","candWish1","candWish2","candWish3","candBusStop"]);document.getElementById("candGender").selectedIndex=0;document.getElementById("candMarital").selectedIndex=0;document.getElementById("candDepartment").selectedIndex=0;document.getElementById("candEducationLevel").selectedIndex=0;document.getElementById("candChildren").value="0";document.getElementById("candCommitment").checked=false;showView("candidateFormView")});';

  s += 'document.getElementById("candFullName").addEventListener("input",function(){this.value=this.value.toUpperCase()});';
  s += 'document.getElementById("candBus").addEventListener("change",function(){document.getElementById("candBusDetail").style.display=this.value==="Co"?"flex":"none"});';
  s += 'document.getElementById("btnAddExpRow").addEventListener("click",function(){var row=document.createElement("div");row.className="exp-row";row.innerHTML="<input type=\\"text\\" placeholder=\\"Thoi gian\\"><input type=\\"text\\" placeholder=\\"Noi dung\\"><input type=\\"text\\" placeholder=\\"Don vi\\"><input type=\\"text\\" placeholder=\\"Dia diem\\"><input type=\\"text\\" placeholder=\\"Luong\\">";document.getElementById("experienceRows").appendChild(row)});';

  s += 'document.getElementById("btnSubmitCandidate").addEventListener("click",function(){var name=document.getElementById("candFullName").value.trim();var phone=document.getElementById("candPhone").value.trim();if(!name||!phone){alert("Vui long dien ho ten va SDT");return}var stamp=getUserStamp();var data=collectCandFormData();var c=Object.assign({code:generateCandidateCode(),status:"Da cap nhat"},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdAt:stamp.timestamp,editHistory:[],editCount:0});candidates.push(c);addHistory("Tao moi","Ung vien",c.code,"Them: "+c.fullName);alert("Luu thanh cong! Ma: "+c.code);renderCandidateTable();showView("candidateView")});';

  // Submit interview
  s += 'document.getElementById("ivInterviewerCode").addEventListener("input",function(){var code=this.value.trim();var info=document.getElementById("ivInterviewerInfo");var iv=interviewers.find(function(i){return i.code===code});if(iv){info.style.display="block";info.innerHTML="<strong>"+iv.name+"</strong> - "+iv.position+" - "+iv.department;info.style.background="#e8f5e9"}else{info.style.display=code.length>0?"block":"none";info.innerHTML="<span style=\\"color:red\\">Khong tim thay</span>";info.style.background="#ffebee"}});';

  s += 'document.getElementById("btnSubmitInterview").addEventListener("click",function(){var candCode=document.getElementById("ivCandidateSelect").value;var ic=document.getElementById("ivInterviewerCode").value.trim();var iwr=interviewers.find(function(i){return i.code===ic});if(!candCode||!ic||!iwr){alert("Vui long dien day du thong tin");return}var stamp=getUserStamp();var iv={code:generateInterviewFormCode(),candidateCode:candCode,interviewerCode:ic,interviewerName:iwr.name,interviewerPosition:iwr.position,interviewerDept:iwr.department,position:document.getElementById("ivPosition").value,date:document.getElementById("ivDate").value,time:document.getElementById("ivTime").value,interviewType:document.getElementById("ivInterviewType").value,location:document.getElementById("ivLocation").value,tests:getCheckedValues("ivTest"),status:"Da len lich",employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdAt:stamp.timestamp,editHistory:[],editCount:0};interviews.push(iv);var cand=candidates.find(function(c){return c.code===iv.candidateCode});if(cand)cand.status="Da hen PV";addHistory("Tao moi","Lich PV",iv.code,"Dat lich PV cho "+iv.candidateCode);alert("Dat lich thanh cong! Ma: "+iv.code);renderInterviewExcelTable();showView("interviewExcelView")});';

  // Search handlers
  s += 'document.getElementById("btnSearchRecruitment").addEventListener("click",function(){var f=document.getElementById("recruitSearchFrom").value,t=document.getElementById("recruitSearchTo").value;var txt=(document.getElementById("recruitSearchText").value||"").trim().toLowerCase();renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=(r.createdAt||r.timestamp||"").substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(r.position||"").toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);return matchDate&&matchText}))});';
  s += 'document.getElementById("btnSearchCandidate").addEventListener("click",function(){var f=document.getElementById("candidateSearchFrom").value,t=document.getElementById("candidateSearchTo").value;var txt=(document.getElementById("candidateSearchText").value||"").trim().toLowerCase();renderCandidateTable(candidates.filter(function(c){var ts=(c.createdAt||c.timestamp||"").substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||c.fullName.toLowerCase().includes(txt)||(c.phone&&c.phone.includes(txt))||c.code.toLowerCase().includes(txt);return matchDate&&matchText}))});';
  s += 'document.getElementById("btnSearchInterview").addEventListener("click",function(){var txt=(document.getElementById("interviewSearchText").value||"").trim().toLowerCase();renderCandidateTableForInterview(candidates.filter(function(c){return!txt||c.fullName.toLowerCase().includes(txt)||c.code.toLowerCase().includes(txt)}))});';
  s += 'document.getElementById("btnSearchResult").addEventListener("click",function(){renderResultInterviewTable()});';
  s += 'document.getElementById("btnSearchOnboarding").addEventListener("click",function(){renderOnboardingList()});';
  s += 'document.getElementById("btnSearchHistory").addEventListener("click",function(){var f=document.getElementById("historySearchFrom").value,t=document.getElementById("historySearchTo").value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});';

  // Export buttons
  s += 'document.getElementById("btnExportRecruitment").addEventListener("click",function(){window.open("/api/export/recruitment","_blank")});';
  s += 'document.getElementById("btnExportCandidate").addEventListener("click",function(){window.open("/api/export/candidates","_blank")});';
  s += 'document.getElementById("btnExportInterview").addEventListener("click",function(){window.open("/api/export/interviews","_blank")});';
  s += 'document.getElementById("btnExportInterviewExcel").addEventListener("click",function(){window.open("/api/export/interviews","_blank")});';
  s += 'document.getElementById("btnExportResult").addEventListener("click",function(){window.open("/api/export/results","_blank")});';
  s += 'document.getElementById("btnExportOnboarding").addEventListener("click",function(){window.open("/api/export/employees","_blank")});';
  s += 'document.getElementById("btnExportHistory").addEventListener("click",function(){alert("Chua ho tro")});';
  s += 'document.getElementById("btnExportProposedExcel").addEventListener("click",function(){alert("Chua ho tro")});';

  // Print/Edit/Delete buttons for detail views
  s += 'document.getElementById("btnPrintRecruitment").addEventListener("click",function(){printContent(document.getElementById("recruitmentDetailContent").innerHTML)});';
  s += 'document.getElementById("btnPrintCandidate").addEventListener("click",function(){printContent(document.getElementById("candidateDetailContent").innerHTML)});';
  s += 'document.getElementById("btnPrintResult").addEventListener("click",function(){printContent(document.getElementById("resultDetailContent").innerHTML)});';
  s += 'document.getElementById("btnPrintInterviewExcel").addEventListener("click",function(){var tbl=document.getElementById("interviewExcelDataTable");if(tbl)printContent(tbl.outerHTML)});';
  s += 'document.getElementById("btnEditRecruitment").addEventListener("click",function(){alert("Chuc nang sua")});';
  s += 'document.getElementById("btnDeleteRecruitment").addEventListener("click",function(){alert("Chuc nang xoa")});';
  s += 'document.getElementById("btnEditCandidate").addEventListener("click",function(){alert("Chuc nang sua")});';
  s += 'document.getElementById("btnDeleteCandidate").addEventListener("click",function(){alert("Chuc nang xoa")});';

  // Init on DOM loaded
  s += 'document.addEventListener("DOMContentLoaded",function(){initApp()});';

  s += '<';
  s += '/script>';
  s += '</body></html>';
  
  return s;
}

// ============================================
// SỬA LỖI 6: Server startup - đảm bảo server listen ngay
// Render yêu cầu server phải bind port trong vòng vài giây
// ============================================
const server = http.createServer(function(req, res) {
  try {
    if (handleApi(req, res)) return;
    
    // Serve HTML
    var fullHtml = getHtmlContent() + getScriptContent();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fullHtml);
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// SỬA QUAN TRỌNG: Listen port TRƯỚC, load data SAU
// Render sẽ kill process nếu không bind port trong 60s
server.listen(PORT, function() {
  console.log('=================================');
  console.log('Server running on port ' + PORT);
  console.log('=================================');
  
  // Load data sau khi server đã running
  loadFromJsonBin().then(function() {
    console.log('Data loaded successfully');
    console.log('Recruitment: ' + database.recruitmentRequests.length);
    console.log('Candidates: ' + database.candidates.length);
  }).catch(function(err) {
    console.error('Data load error:', err.message);
  });
});

// Handle uncaught errors
process.on('uncaughtException', function(err) {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', function(reason) {
  console.error('Unhandled rejection:', reason);
});