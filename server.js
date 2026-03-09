// PHIÊN BẢN CẬP NHẬT - TÍNH NĂNG MỚI A,B,C,D,E
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
        if (!database.counters) database.counters = { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1, resultCounter: 1, employeeCounter: 268600 };
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
      catch (e) { reject(new Error('JSON khong hop le')); }
    });
    req.on('error', reject);
  });
}

function handleApi(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.url === "/api/test" && req.method === "GET") {
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
  if (req.url === "/api/data" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(database));
    return true;
  }
  if (req.url === "/api/data" && req.method === "POST") {
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
  if (req.url === "/api/reload" && req.method === "GET") {
    loadFromJsonBin().then(function() {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        recruitmentRequests: database.recruitmentRequests.length,
        candidates: database.candidates.length
      }));
    });
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
.btn-action{background:#1565c0;color:#fff}
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
.search-bar input,.search-bar select{padding:8px;border:1px solid #b0bec5;border-radius:6px;font-size:13px}
.form-row{display:flex;flex-wrap:wrap;gap:15px}
.form-row .form-group{flex:1;min-width:200px}
.score-input{width:70px!important;text-align:center;display:inline-block!important}
.score-table{margin:10px 0}
.score-table td{padding:8px 12px;text-align:left}
.score-table td:last-child{text-align:center}
.badge{padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}
.badge-green{background:#43a047}.badge-orange{background:#ef6c00}.badge-red{background:#c62828}.badge-blue{background:#1565c0}.badge-purple{background:#6a1b9a}.badge-gray{background:#607d8b}
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
.status-select{padding:4px 8px;border-radius:6px;border:1px solid #b0bec5;font-size:12px;cursor:pointer}
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

<!-- RECRUITMENT VIEW -->
<div id="recruitmentView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitment">← Quay lại</button>
<h2>Bảng Nhu cầu tuyển dụng</h2>
<div class="search-bar">
<div><label>Ngày tạo từ:</label><br><input type="date" id="recruitSearchFrom"></div>
<div><label>Ngày tạo đến:</label><br><input type="date" id="recruitSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="recruitSearchText" placeholder="Mã, vị trí, người yêu cầu..."></div>
<div><label>Trạng thái:</label><br><select id="recruitSearchStatus"><option value="">Tất cả</option><option>Đang tuyển</option><option>Đã tuyển đủ</option></select></div>
<button class="btn btn-primary" id="btnSearchRecruitment">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportRecruitment">Xuất Excel</button>
<button class="btn btn-success" id="btnAddRecruitment">+ Tạo mới</button>
</div>
<div id="recruitmentTableContainer" class="table-wrapper"></div>
</div>

<!-- RECRUITMENT FORM VIEW -->
<div id="recruitmentFormView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentForm">← Quay lại</button>
<h2 id="recruitmentFormTitle">Tạo nhu cầu tuyển dụng</h2>
<div id="recruitmentEditInfo" style="display:none"></div>
<div class="form-section"><h3>Thông tin tuyển dụng</h3>
<div class="form-row"><div class="form-group"><label>Phòng ban *</label><select id="recDepartment"></select></div>
<div class="form-group"><label>Vị trí tuyển *</label><input type="text" id="recPosition"></div></div>
<div class="form-row"><div class="form-group"><label>Số lượng *</label><input type="number" id="recQuantity" min="1" value="1"></div>
<div class="form-group"><label>Mức lương dự kiến</label><input type="text" id="recSalaryRange" placeholder="VD: 8,000,000 - 12,000,000 VNĐ"></div></div>
<div class="form-group"><label>Lý do tuyển *</label>
<div class="checkbox-group">
<label><input type="checkbox" name="recReason" value="Mở rộng hoạt động"> Mở rộng hoạt động</label>
<label><input type="checkbox" name="recReason" value="Thay thế nhân viên nghỉ việc"> Thay thế nhân viên nghỉ việc</label>
<label><input type="checkbox" name="recReason" value="Bổ sung nhân lực"> Bổ sung nhân lực</label>
<label><input type="checkbox" name="recReason" value="Khác"> Khác</label>
</div></div>
<div class="form-row"><div class="form-group"><label>Ngày cần nhân sự *</label><input type="date" id="recNeedDate"></div>
<div class="form-group"><label>Người yêu cầu * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>
</div>
<button class="btn btn-success" id="btnSubmitRecruitment" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
</div>

<!-- RECRUITMENT DETAIL VIEW -->
<div id="recruitmentDetailView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintRecruitment">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditRecruitment">Sửa</button>
<button class="btn btn-delete" id="btnDeleteRecruitment">Xóa</button>
</div>
<div id="recruitmentDetailContent" class="form-section"></div>
</div>

<!-- CANDIDATE VIEW -->
<div id="candidateView" class="view">
<button class="btn btn-back" id="btnBackFromCandidate">← Quay lại</button>
<h2>Bảng Thông tin ứng viên</h2>
<div class="search-bar">
<div><label>Ngày nộp từ:</label><br><input type="date" id="candidateSearchFrom"></div>
<div><label>Ngày nộp đến:</label><br><input type="date" id="candidateSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="candidateSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<div><label>Trạng thái:</label><br><select id="candidateSearchStatus"><option value="">Tất cả</option><option>Đã cập nhật thông tin</option><option>Đã hẹn phỏng vấn</option><option>Đã xác nhận phỏng vấn</option><option>Đạt</option><option>Không đạt</option><option>Đã xác nhận nhận việc</option></select></div>
<button class="btn btn-primary" id="btnSearchCandidate">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportCandidate">Xuất Excel</button>
<button class="btn btn-success" id="btnAddCandidate">+ Thêm ứng viên</button>
</div>
<div id="candidateTableContainer" class="table-wrapper"></div>
</div>

<!-- CANDIDATE FORM VIEW -->
<div id="candidateFormView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateForm">← Quay lại</button>
<h2 id="candidateFormTitle">THÔNG TIN ỨNG VIÊN</h2>
<div id="candidateEditInfo" style="display:none"></div>
<div class="form-section"><h3>Thông tin ứng viên</h3>
<div class="form-row"><div class="form-group"><label>Họ tên * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Giới tính *</label><select id="candGender"><option value="">-- Chọn --</option><option>Nam</option><option>Nữ</option></select></div></div>
<div class="form-row"><div class="form-group"><label>Năm sinh *</label><input type="number" id="candBirthYear" min="1960" max="2010" placeholder="VD: 1995"></div>
<div class="form-group"><label>SĐT *</label><input type="tel" id="candPhone" placeholder="0xxxxxxxxx"></div></div>
<div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="candEmail" placeholder="abc@email.com"></div>
<div class="form-group"><label>Vị trí ứng tuyển *</label><input type="text" id="candPosition"></div></div>
<div class="form-row"><div class="form-group"><label>Mã yêu cầu tuyển dụng *</label><input type="text" id="candRecruitCode" placeholder="VD: PR-HR-001-001-R00001"></div>
<div class="form-group"><label>Nguồn tuyển *</label><select id="candSource"><option value="">-- Chọn --</option><option>Website</option><option>Facebook</option><option>Người quen giới thiệu</option><option>Biển quảng cáo</option><option>Khác</option></select></div></div>
<div class="form-group"><label>Ngày nộp hồ sơ *</label><input type="date" id="candSubmitDate"></div>
</div>
<button class="btn btn-success" id="btnSubmitCandidate" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
</div>

<!-- CANDIDATE DETAIL VIEW -->
<div id="candidateDetailView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintCandidate">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditCandidate">Sửa</button>
<button class="btn btn-delete" id="btnDeleteCandidate">Xóa</button>
</div>
<div id="candidateDetailContent" class="form-section"></div>
</div>

<!-- INTERVIEW VIEW -->
<div id="interviewView" class="view">
<button class="btn btn-back" id="btnBackFromInterview">← Quay lại</button>
<h2>Bảng Lịch phỏng vấn</h2>
<div class="search-bar">
<div><label>Ngày PV từ:</label><br><input type="date" id="interviewSearchFrom"></div>
<div><label>Ngày PV đến:</label><br><input type="date" id="interviewSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="interviewSearchText" placeholder="Nhập tên, mã UV..."></div>
<div><label>Trạng thái:</label><br><select id="interviewSearchStatus"><option value="">Tất cả</option><option>Đã lên lịch</option><option>Đã phỏng vấn</option><option>Hủy phỏng vấn</option></select></div>
<button class="btn btn-primary" id="btnSearchInterview">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportInterview">Xuất Excel</button>
<button class="btn btn-success" id="btnAddInterview">+ Tạo lịch</button>
</div>
<div id="interviewTableContainer" class="table-wrapper"></div>
</div>

<!-- INTERVIEW FORM VIEW -->
<div id="interviewFormView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewForm">← Quay lại</button>
<h2 id="interviewFormTitle">Tạo lịch phỏng vấn</h2>
<div class="form-section">
<div class="form-row"><div class="form-group"><label>Mã ứng viên *</label><input type="text" id="ivCandCode" placeholder="VD: PR-HR-001-001-C00001"></div>
<div class="form-group"><label>Vị trí *</label><input type="text" id="ivPosition"></div></div>
<div class="form-row"><div class="form-group"><label>Ngày phỏng vấn *</label><input type="date" id="ivDate"></div>
<div class="form-group"><label>Giờ phỏng vấn *</label><input type="time" id="ivTime"></div></div>
<div class="form-row"><div class="form-group"><label>Hình thức *</label><select id="ivFormat"><option value="">-- Chọn --</option><option>Online</option><option>Offline</option></select></div>
<div class="form-group"><label>Người phỏng vấn *</label><input type="text" id="ivInterviewer" style="text-transform:uppercase"></div></div>
<div class="form-group"><label>Địa điểm *</label><input type="text" id="ivLocation" placeholder="Phòng họp A / Link Google Meet..."></div>
<div class="form-group"><label>Bài kiểm tra yêu cầu</label>
<div class="checkbox-group">
<label><input type="checkbox" name="ivTest" value="Tiếng Anh"> Tiếng Anh</label>
<label><input type="checkbox" name="ivTest" value="IQ"> IQ</label>
<label><input type="checkbox" name="ivTest" value="Nhân cách"> Nhân cách</label>
<label><input type="checkbox" name="ivTest" value="Chuyên môn"> Chuyên môn</label>
<label><input type="checkbox" name="ivTest" value="Tin học"> Tin học</label>
</div></div>
</div>
<button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Lưu lịch phỏng vấn</button>
</div>

<!-- INTERVIEW DETAIL VIEW -->
<div id="interviewDetailView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintInterview">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditInterviewDetail">Sửa</button>
<button class="btn btn-delete" id="btnDeleteInterviewDetail">Xóa</button>
</div>
<div id="interviewDetailContent" class="form-section"></div>
</div>

<!-- RESULT VIEW -->
<div id="resultView" class="view">
<button class="btn btn-back" id="btnBackFromResult">← Quay lại</button>
<h2>Bảng Kết quả phỏng vấn</h2>
<div class="search-bar">
<div><label>Ngày CN từ:</label><br><input type="date" id="resultSearchFrom"></div>
<div><label>Ngày CN đến:</label><br><input type="date" id="resultSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="resultSearchText" placeholder="Nhập tên, mã UV..."></div>
<div><label>Kết quả:</label><br><select id="resultSearchStatus"><option value="">Tất cả</option><option>Đạt</option><option>Không đạt</option><option>Chờ quyết định</option></select></div>
<button class="btn btn-primary" id="btnSearchResult">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportResult">Xuất Excel</button>
<button class="btn btn-success" id="btnAddResult">+ Thêm kết quả</button>
</div>
<div id="resultTableContainer" class="table-wrapper"></div>
</div>

<!-- RESULT FORM VIEW -->
<div id="resultFormView" class="view">
<button class="btn btn-back" id="btnBackFromResultForm">← Quay lại</button>
<h2 id="resultFormTitle">Thêm kết quả phỏng vấn</h2>
<div class="form-section">
<div class="form-row"><div class="form-group"><label>Mã ứng viên *</label><input type="text" id="resCandCode" placeholder="VD: PR-HR-001-001-C00001"></div>
<div class="form-group"><label>Vị trí *</label><input type="text" id="resPosition"></div></div>
<div class="form-row"><div class="form-group"><label>Người phỏng vấn *</label><input type="text" id="resInterviewer" style="text-transform:uppercase"></div>
<div class="form-group"><label>Điểm đánh giá * (0-100)</label><input type="number" id="resScore" min="0" max="100"></div></div>
<div id="resTestScoresContainer"></div>
<div class="form-row"><div class="form-group"><label>Kết quả *</label><select id="resConclusion"><option value="">-- Chọn --</option><option>Đạt</option><option>Không đạt</option><option>Chờ quyết định</option></select></div>
<div class="form-group"><label>Mức lương đề xuất</label><input type="text" id="resSalary" placeholder="VD: 10,000,000 VNĐ"></div></div>
<div class="form-group"><label>Ghi chú</label><textarea id="resNote"></textarea></div>
</div>
<button class="btn btn-success" id="btnSubmitResult" style="width:100%;min-height:45px;font-size:16px">Lưu kết quả</button>
</div>

<!-- RESULT DETAIL VIEW -->
<div id="resultDetailView" class="view">
<button class="btn btn-back" id="btnBackFromResultDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintResult">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditResultDetail">Sửa</button>
<button class="btn btn-delete" id="btnDeleteResultDetail">Xóa</button>
</div>
<div id="resultDetailContent" class="form-section"></div>
</div>

<!-- ONBOARDING VIEW -->
<div id="onboardingView" class="view">
<button class="btn btn-back" id="btnBackFromOnboarding">← Quay lại</button>
<h2>Bảng Nhân viên mới nhận việc</h2>
<div class="search-bar">
<div><label>Ngày NV từ:</label><br><input type="date" id="onboardSearchFrom"></div>
<div><label>Ngày NV đến:</label><br><input type="date" id="onboardSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="onboardSearchText" placeholder="Nhập tên, mã NV..."></div>
<div><label>Trạng thái:</label><br><select id="onboardSearchStatus"><option value="">Tất cả</option><option>Đang thử việc</option><option>Chính thức</option><option>Nghỉ việc</option></select></div>
<button class="btn btn-primary" id="btnSearchOnboarding">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportOnboarding">Xuất Excel</button>
<button class="btn btn-success" id="btnAddOnboarding">+ Thêm nhân viên</button>
</div>
<div id="onboardingTableContainer" class="table-wrapper"></div>
</div>

<!-- ONBOARDING FORM VIEW -->
<div id="onboardingFormView" class="view">
<button class="btn btn-back" id="btnBackFromOnboardingForm">← Quay lại</button>
<h2 id="onboardingFormTitle">Thêm nhân viên mới</h2>
<div class="form-section">
<div class="form-row"><div class="form-group"><label>Họ tên * (IN HOA)</label><input type="text" id="obFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Phòng ban *</label><select id="obDepartment"></select></div></div>
<div class="form-row"><div class="form-group"><label>Vị trí *</label><input type="text" id="obPosition"></div>
<div class="form-group"><label>Ngày nhận việc *</label><input type="date" id="obStartDate"></div></div>
<div class="form-row"><div class="form-group"><label>Mức lương *</label><input type="text" id="obSalary" placeholder="VD: 10,000,000 VNĐ"></div>
<div class="form-group"><label>Người quản lý *</label><input type="text" id="obManager" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Loại hợp đồng *</label><select id="obContractType"><option value="">-- Chọn --</option><option>Thử việc</option><option>Chính thức</option><option>Thời vụ</option></select></div>
<div class="form-group"><label>Trạng thái *</label><select id="obStatus"><option value="">-- Chọn --</option><option>Đang thử việc</option><option>Chính thức</option><option>Nghỉ việc</option></select></div></div>
</div>
<button class="btn btn-success" id="btnSubmitOnboarding" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
</div>

<!-- ONBOARDING DETAIL VIEW -->
<div id="onboardingDetailView" class="view">
<button class="btn btn-back" id="btnBackFromOnboardingDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintOnboarding">In / Xuất PDF</button>
<button class="btn btn-edit" id="btnEditOnboardingDetail">Sửa</button>
<button class="btn btn-delete" id="btnDeleteOnboardingDetail">Xóa</button>
</div>
<div id="onboardingDetailContent" class="form-section"></div>
</div>

<!-- HISTORY VIEW -->
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
// ===== THAY THẾ TỪ DÒNG "const scriptContent = ..." ĐẾN HẾT FILE =====

const fullScript = `
<script>
var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1,resultCounter=1,employeeCounter=268600;
var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[];
var actionHistory=[];
var editingRecruitmentCode=null,editingCandidateCode=null,editingInterviewCode=null,editingResultCode=null,editingOnboardingCode=null;
var MAX_EDIT_COUNT=3;
var EDIT_WINDOW_HOURS=24;
var activeEditors={};
var currentUser=null,clockInterval=null;
var departments=['Sản xuất 1','Sản xuất 2.1','Sản xuất 2.2','Sản xuất 2.2 M&E','Sản xuất 3.345','Sản xuất 3.6','Sản xuất 4','Bảo trì bảo dưỡng 1','Kỹ thuật 1','Bảo trì bảo dưỡng 2','Kỹ thuật 2','Kiểm soát chất lượng 1','Kiểm soát chất lượng 2','QA','Kiểm tra 1','Kiểm tra 2','Phân tích','EHS','Hỗ trợ sản xuất','Kế toán','Hành chính nhân sự','IT (hệ thống)'];

function loadDataFromServer(){return fetch('/api/data').then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.json()}).then(function(data){if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;if(data.candidates)candidates=data.candidates;if(data.interviews)interviews=data.interviews;if(data.interviewResults)interviewResults=data.interviewResults;if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;if(data.history)actionHistory=data.history;if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1;resultCounter=data.counters.resultCounter||1;employeeCounter=data.counters.employeeCounter||268600}console.log('Client: Da tai du lieu')}).catch(function(err){console.error('Client: Loi tai du lieu:',err)})}

function saveDataToServer(){var payload={recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter,resultCounter:resultCounter,employeeCounter:employeeCounter}};fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(result){console.log('Client: Da luu',result.message)}).catch(function(err){console.error('Client: Loi luu',err)})}

function isAdmin(){if(!currentUser)return false;return currentUser.position==='Trưởng phòng'&&currentUser.department==='Hành chính nhân sự'}
function updateAdminVisibility(){var btnHistory=document.getElementById('btnGoHistory');if(isAdmin()){btnHistory.style.display='block'}else{btnHistory.style.display='none'}}
function showView(id){document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});var t=document.getElementById(id);if(t)t.classList.add('active')}
function goBack(id){showView(id)}
function generateRecruitmentCode(){return'PR-HR-001-001-R'+String(recruitmentRequestCounter++).padStart(5,'0')}
function generateCandidateCode(){return'PR-HR-001-001-C'+String(candidateCounter++).padStart(5,'0')}
function generateInterviewCode(){return'PR-HR-001-001-T'+String(interviewFormCounter++).padStart(5,'0')}
function generateResultCode(){return'PR-HR-001-001-A'+String(resultCounter++).padStart(5,'0')}
function generateEmployeeCode(){return String(employeeCounter++)}
function formatDate(d){if(!d)return'';var dt=new Date(d);return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
function formatDateTime(d){if(!d)return'';var dt=new Date(d);return formatDate(d)+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')}
function getNow(){return new Date().toISOString()}
function na(v){return v||''}
function updateClock(){var n=new Date();var el=document.getElementById('barClock');if(el)el.textContent=String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear()+' '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')}
function populateSelect(id,opts,ph,val){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">-- '+(ph||'Chọn')+' --</option>';opts.forEach(function(o){var opt=document.createElement('option');opt.value=o;opt.textContent=o;if(val&&o===val)opt.selected=true;s.appendChild(opt)})}
function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}
function getEditCount(record){return(record.editHistory&&record.editHistory.length)||0}
function getEditCountBadge(record){var count=getEditCount(record);var cls=count===0?'edit-count-ok':(count<MAX_EDIT_COUNT?'edit-count-warn':'edit-count-max');return'<span class="edit-count-badge '+cls+'">'+count+'/'+MAX_EDIT_COUNT+'</span>'}
function getUserStamp(){if(!currentUser)return{employeeId:'',employeeName:'',employeePosition:'',employeeDept:'',timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}
function operatorInfo(r){return(r.employeeName||'')+(r.employeeId?' ('+r.employeeId+')':'')}
function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||'',employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',employeePosition:currentUser?currentUser.position:'',employeeDept:currentUser?currentUser.department:'',timestamp:getNow()});saveDataToServer()}
function getStatusBadge(status){var cls='badge-gray';if(status==='Đang tuyển'||status==='Đã lên lịch'||status==='Đã cập nhật thông tin'||status==='Đang thử việc'||status==='Chờ quyết định')cls='badge-orange';else if(status==='Đã tuyển đủ'||status==='Đạt'||status==='Đã phỏng vấn'||status==='Đã xác nhận nhận việc'||status==='Chính thức')cls='badge-green';else if(status==='Không đạt'||status==='Hủy phỏng vấn'||status==='Nghỉ việc')cls='badge-red';else if(status==='Đã hẹn phỏng vấn'||status==='Đã xác nhận phỏng vấn')cls='badge-blue';return'<span class="badge '+cls+'">'+status+'</span>'}
function printContent(html){var pa=document.getElementById('printArea');pa.innerHTML=html;pa.style.display='block';window.print();pa.style.display='none'}
function canEditRecord(record){if(!record.createdDate&&!record.timestamp)return true;var created=new Date(record.createdDate||record.timestamp);var now=new Date();var hours=(now-created)/(1000*60*60);if(hours>EDIT_WINDOW_HOURS)return false;if(getEditCount(record)>=MAX_EDIT_COUNT)return false;return true}
function canDeleteRecord(record){if(!record.createdDate&&!record.timestamp)return true;var created=new Date(record.createdDate||record.timestamp);var now=new Date();var hours=(now-created)/(1000*60*60);return hours<=EDIT_WINDOW_HOURS}

function renderRecruitmentTable(filtered){var data=filtered||recruitmentRequests;var c=document.getElementById('recruitmentTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="recruitmentDataTable"><thead><tr><th>STT</th><th>Mã yêu cầu</th><th>Phòng ban</th><th>Vị trí tuyển</th><th>Số lượng</th><th>Lý do tuyển</th><th>Mức lương dự kiến</th><th>Ngày cần nhân sự</th><th>Người yêu cầu</th><th>Ngày tạo yêu cầu</th><th>Trạng thái</th><th>Số lần chỉnh sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(r,i){var status=r.status||'Đang tuyển';
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+r.code+'" data-type="recruitment">'+r.code+'</span></td><td>'+r.department+'</td><td>'+r.position+'</td><td>'+r.quantity+'</td><td>'+(r.reasons?r.reasons.join(', '):'')+'</td><td>'+na(r.salaryRange)+'</td><td>'+formatDate(r.needDate)+'</td><td>'+na(r.proposer)+'</td><td>'+formatDate(r.createdDate||r.timestamp)+'</td><td>'+getStatusBadge(status)+'</td><td>'+getEditCountBadge(r)+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.timestamp)+'</td>';
h+='<td><button class="btn btn-action btn-sm btn-upload-cand" data-code="'+r.code+'" data-position="'+r.position+'">Tải lên UV</button> ';
h+='<select class="status-select rec-status-change" data-code="'+r.code+'"><option value="Đang tuyển"'+(status==='Đang tuyển'?' selected':'')+'>Đang tuyển</option><option value="Đã tuyển đủ"'+(status==='Đã tuyển đủ'?' selected':'')+'>Đã tuyển đủ</option></select></td></tr>'});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="recruitment"]').forEach(function(lk){lk.addEventListener('click',function(){renderRecruitmentDetail(this.getAttribute('data-code'));showView('recruitmentDetailView')})});
c.querySelectorAll('.btn-upload-cand').forEach(function(b){b.addEventListener('click',function(){var recCode=this.getAttribute('data-code');var pos=this.getAttribute('data-position');openCandidateFormForRecruitment(recCode,pos)})});
c.querySelectorAll('.rec-status-change').forEach(function(sel){sel.addEventListener('change',function(){var code=this.getAttribute('data-code');var r=recruitmentRequests.find(function(x){return x.code===code});if(r){r.status=this.value;addHistory('Cập nhật','Trạng thái nhu cầu tuyển dụng',code,'Đổi trạng thái: '+this.value)}})})}

function openCandidateFormForRecruitment(recCode,position){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';document.getElementById('candFullName').value='';document.getElementById('candGender').selectedIndex=0;document.getElementById('candBirthYear').value='';document.getElementById('candPhone').value='';document.getElementById('candEmail').value='';document.getElementById('candPosition').value=position||'';document.getElementById('candRecruitCode').value=recCode||'';document.getElementById('candSource').selectedIndex=0;document.getElementById('candSubmitDate').value='';showView('candidateFormView')}

function renderRecruitmentDetail(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;var c=document.getElementById('recruitmentDetailContent');var h='<div class="pdf-preview" id="printArea_rec"><h2>CHI TIẾT NHU CẦU TUYỂN DỤNG</h2>';
h+='<div class="info-row"><span class="info-label">Mã yêu cầu:</span><span class="info-value">'+r.code+'</span></div>';
h+='<div class="info-row"><span class="info-label">Phòng ban:</span><span class="info-value">'+r.department+'</span></div>';
h+='<div class="info-row"><span class="info-label">Vị trí tuyển:</span><span class="info-value">'+r.position+'</span></div>';
h+='<div class="info-row"><span class="info-label">Số lượng:</span><span class="info-value">'+r.quantity+'</span></div>';
h+='<div class="info-row"><span class="info-label">Lý do tuyển:</span><span class="info-value">'+(r.reasons?r.reasons.join(', '):'')+'</span></div>';
h+='<div class="info-row"><span class="info-label">Mức lương dự kiến:</span><span class="info-value">'+na(r.salaryRange)+'</span></div>';
h+='<div class="info-row"><span class="info-label">Ngày cần nhân sự:</span><span class="info-value">'+formatDate(r.needDate)+'</span></div>';
h+='<div class="info-row"><span class="info-label">Người yêu cầu:</span><span class="info-value">'+na(r.proposer)+'</span></div>';
h+='<div class="info-row"><span class="info-label">Trạng thái:</span><span class="info-value">'+getStatusBadge(r.status||'Đang tuyển')+'</span></div>';
h+='<div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorInfo(r)+'</span></div>';
h+='<div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">'+formatDateTime(r.timestamp)+'</span></div>';
if(r.editHistory&&r.editHistory.length>0){h+='<div class="edit-history-section"><h3>Lịch sử chỉnh sửa '+getEditCountBadge(r)+'</h3>';r.editHistory.forEach(function(eh){h+='<div class="edit-history-item">'+formatDateTime(eh.timestamp)+' - '+eh.employeeName+' ('+eh.employeeId+') - '+eh.changes+'</div>'});h+='</div>'}
h+='</div>';c.innerHTML=h;c.setAttribute('data-code',code);
var btnEdit=document.getElementById('btnEditRecruitment');var btnDel=document.getElementById('btnDeleteRecruitment');
if(!canEditRecord(r)){btnEdit.classList.add('btn-disabled');btnEdit.title='Đã hết thời gian cho phép sửa'}else{btnEdit.classList.remove('btn-disabled');btnEdit.title=''}
if(!canDeleteRecord(r)){btnDel.classList.add('btn-disabled');btnDel.title='Đã hết thời gian cho phép xóa'}else{btnDel.classList.remove('btn-disabled');btnDel.title=''}}

function startEditRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;
if(!canEditRecord(r)){alert('Không thể sửa! Đã hết thời gian cho phép hoặc đã sửa tối đa '+MAX_EDIT_COUNT+' lần.');return}
editingRecruitmentCode=code;document.getElementById('recruitmentFormTitle').textContent='Sửa nhu cầu tuyển dụng - '+code;
document.getElementById('recruitmentEditInfo').style.display='block';document.getElementById('recruitmentEditInfo').innerHTML='<div class="lock-info">Đang sửa '+getEditCountBadge(r)+'</div>';
setSelectValue('recDepartment',r.department);document.getElementById('recPosition').value=r.position;document.getElementById('recQuantity').value=r.quantity;document.getElementById('recSalaryRange').value=r.salaryRange||'';
if(r.reasons)document.querySelectorAll('input[name="recReason"]').forEach(function(cb){cb.checked=r.reasons.indexOf(cb.value)!==-1});
document.getElementById('recNeedDate').value=r.needDate;document.getElementById('recProposer').value=r.proposer||'';
showView('recruitmentFormView')}

function deleteRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canDeleteRecord(r)){alert('Không thể xóa! Đã quá 24 giờ kể từ lần tạo.');return}if(!confirm('Bạn có chắc muốn xóa '+code+'?'))return;var idx=recruitmentRequests.findIndex(function(x){return x.code===code});if(idx===-1)return;recruitmentRequests.splice(idx,1);addHistory('Xóa','Nhu cầu tuyển dụng',code,'Đã xóa');alert('Đã xóa '+code);renderRecruitmentTable()}

function renderCandidateTable(filtered){var data=filtered||candidates;var c=document.getElementById('candidateTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="candidateDataTable"><thead><tr><th>STT</th><th>Mã ứng viên</th><th>Họ tên</th><th>Giới tính</th><th>Năm sinh</th><th>SĐT</th><th>Email</th><th>Vị trí ứng tuyển</th><th>Mã yêu cầu TD</th><th>Nguồn tuyển</th><th>Ngày nộp hồ sơ</th><th>Trạng thái</th><th>Số lần chỉnh sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(c2,i){var status=c2.status||'Đã cập nhật thông tin';
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+c2.code+'" data-type="candidate">'+c2.code+'</span></td><td>'+c2.fullName+'</td><td>'+na(c2.gender)+'</td><td>'+na(c2.birthYear)+'</td><td>'+na(c2.phone)+'</td><td>'+na(c2.email)+'</td><td>'+na(c2.position)+'</td><td>'+na(c2.recruitCode)+'</td><td>'+na(c2.source)+'</td><td>'+formatDate(c2.submitDate)+'</td><td>'+getStatusBadge(status)+'</td><td>'+getEditCountBadge(c2)+'</td><td>'+operatorInfo(c2)+'</td><td>'+formatDateTime(c2.timestamp)+'</td>';
h+='<td><button class="btn btn-action btn-sm btn-schedule-iv" data-code="'+c2.code+'" data-position="'+na(c2.position)+'">Đặt lịch PV</button> ';
h+='<select class="status-select cand-status-change" data-code="'+c2.code+'"><option value="Đã cập nhật thông tin"'+(status==='Đã cập nhật thông tin'?' selected':'')+'>Đã cập nhật thông tin</option><option value="Đã hẹn phỏng vấn"'+(status==='Đã hẹn phỏng vấn'?' selected':'')+'>Đã hẹn phỏng vấn</option><option value="Đã xác nhận phỏng vấn"'+(status==='Đã xác nhận phỏng vấn'?' selected':'')+'>Đã xác nhận phỏng vấn</option><option value="Đạt"'+(status==='Đạt'?' selected':'')+'>Đạt</option><option value="Không đạt"'+(status==='Không đạt'?' selected':'')+'>Không đạt</option><option value="Đã xác nhận nhận việc"'+(status==='Đã xác nhận nhận việc'?' selected':'')+'>Đã xác nhận nhận việc</option></select></td></tr>'});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="candidate"]').forEach(function(lk){lk.addEventListener('click',function(){showCandidateDetail(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-schedule-iv').forEach(function(b){b.addEventListener('click',function(){var candCode=this.getAttribute('data-code');var pos=this.getAttribute('data-position');openInterviewFormForCandidate(candCode,pos)})});
c.querySelectorAll('.cand-status-change').forEach(function(sel){sel.addEventListener('change',function(){var code=this.getAttribute('data-code');var cd=candidates.find(function(x){return x.code===code});if(cd){cd.status=this.value;addHistory('Cập nhật','Trạng thái ứng viên',code,'Đổi trạng thái: '+this.value)}})})}

function openInterviewFormForCandidate(candCode,position){editingInterviewCode=null;document.getElementById('interviewFormTitle').textContent='Tạo lịch phỏng vấn';document.getElementById('ivCandCode').value=candCode||'';document.getElementById('ivPosition').value=position||'';document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';document.getElementById('ivFormat').selectedIndex=0;document.getElementById('ivInterviewer').value='';document.getElementById('ivLocation').value='';document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});showView('interviewFormView')}

function showCandidateDetail(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;var ct=document.getElementById('candidateDetailContent');var h='<div class="pdf-preview"><h2>CHI TIẾT ỨNG VIÊN</h2>';
[['Mã ứng viên',c.code],['Họ tên',c.fullName],['Giới tính',c.gender],['Năm sinh',c.birthYear],['SĐT',c.phone],['Email',na(c.email)],['Vị trí ứng tuyển',c.position],['Mã yêu cầu TD',c.recruitCode],['Nguồn tuyển',c.source],['Ngày nộp hồ sơ',formatDate(c.submitDate)],['Trạng thái',c.status||'Đã cập nhật thông tin'],['Người thao tác',operatorInfo(c)],['Thời gian',formatDateTime(c.timestamp)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
if(c.editHistory&&c.editHistory.length>0){h+='<div class="edit-history-section"><h3>Lịch sử chỉnh sửa '+getEditCountBadge(c)+'</h3>';c.editHistory.forEach(function(eh){h+='<div class="edit-history-item">'+formatDateTime(eh.timestamp)+' - '+eh.employeeName+' ('+eh.employeeId+') - '+eh.changes+'</div>'});h+='</div>'}
h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('candidateDetailView');
var btnEdit=document.getElementById('btnEditCandidate');var btnDel=document.getElementById('btnDeleteCandidate');
if(!canEditRecord(c)){btnEdit.classList.add('btn-disabled');btnEdit.title='Đã hết thời gian cho phép sửa'}else{btnEdit.classList.remove('btn-disabled');btnEdit.title=''}
if(!canDeleteRecord(c)){btnDel.classList.add('btn-disabled');btnDel.title='Đã hết thời gian cho phép xóa'}else{btnDel.classList.remove('btn-disabled');btnDel.title=''}}

function startEditCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;
if(!canEditRecord(c)){alert('Không thể sửa! Đã hết thời gian cho phép hoặc đã sửa tối đa '+MAX_EDIT_COUNT+' lần.');return}
editingCandidateCode=code;document.getElementById('candidateFormTitle').textContent='Sửa ứng viên - '+code;
document.getElementById('candidateEditInfo').style.display='block';document.getElementById('candidateEditInfo').innerHTML='<div class="lock-info">Đang sửa '+getEditCountBadge(c)+'</div>';
document.getElementById('candFullName').value=c.fullName;setSelectValue('candGender',c.gender);document.getElementById('candBirthYear').value=c.birthYear||'';document.getElementById('candPhone').value=c.phone;document.getElementById('candEmail').value=c.email||'';document.getElementById('candPosition').value=c.position||'';document.getElementById('candRecruitCode').value=c.recruitCode;setSelectValue('candSource',c.source);document.getElementById('candSubmitDate').value=c.submitDate||'';
showView('candidateFormView')}

function deleteCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canDeleteRecord(c)){alert('Không thể xóa! Đã quá 24 giờ.');return}if(!confirm('Bạn có chắc muốn xóa ứng viên '+code+'?'))return;var idx=candidates.findIndex(function(x){return x.code===code});if(idx===-1)return;candidates.splice(idx,1);addHistory('Xóa','Ứng viên',code,'Đã xóa');alert('Đã xóa '+code);renderCandidateTable()}

function renderInterviewTable(filtered){var data=filtered||interviews;var c=document.getElementById('interviewTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="interviewDataTable"><thead><tr><th>STT</th><th>Mã lịch</th><th>Mã ứng viên</th><th>Họ tên</th><th>Vị trí</th><th>Ngày phỏng vấn</th><th>Giờ phỏng vấn</th><th>Hình thức</th><th>Người phỏng vấn</th><th>Địa điểm</th><th>Bài kiểm tra</th><th>Trạng thái</th><th>Số lần chỉnh sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});var status=iv.status||'Đã lên lịch';
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+iv.code+'" data-type="interview">'+iv.code+'</span></td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+formatDate(iv.date)+'</td><td>'+na(iv.time)+'</td><td>'+na(iv.format)+'</td><td>'+na(iv.interviewer)+'</td><td>'+na(iv.location)+'</td><td>'+(iv.requiredTests?iv.requiredTests.join(', '):'')+'</td><td>'+getStatusBadge(status)+'</td><td>'+getEditCountBadge(iv)+'</td><td>'+operatorInfo(iv)+'</td><td>'+formatDateTime(iv.timestamp)+'</td>';
h+='<td><button class="btn btn-action btn-sm btn-evaluate-iv" data-code="'+iv.code+'">Đánh giá PV</button> ';
h+='<select class="status-select iv-status-change" data-code="'+iv.code+'"><option value="Đã lên lịch"'+(status==='Đã lên lịch'?' selected':'')+'>Đã lên lịch</option><option value="Đã phỏng vấn"'+(status==='Đã phỏng vấn'?' selected':'')+'>Đã phỏng vấn</option><option value="Hủy phỏng vấn"'+(status==='Hủy phỏng vấn'?' selected':'')+'>Hủy phỏng vấn</option></select></td></tr>'});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="interview"]').forEach(function(lk){lk.addEventListener('click',function(){showInterviewDetail(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-evaluate-iv').forEach(function(b){b.addEventListener('click',function(){var ivCode=this.getAttribute('data-code');openResultFormForInterview(ivCode)})});
c.querySelectorAll('.iv-status-change').forEach(function(sel){sel.addEventListener('change',function(){var code=this.getAttribute('data-code');var iv=interviews.find(function(x){return x.code===code});if(iv){iv.status=this.value;addHistory('Cập nhật','Trạng thái lịch phỏng vấn',code,'Đổi trạng thái: '+this.value)}})})}

function openResultFormForInterview(ivCode){var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;editingResultCode=null;document.getElementById('resultFormTitle').textContent='Đánh giá phỏng vấn';document.getElementById('resCandCode').value=iv.candidateCode;document.getElementById('resPosition').value=iv.position||'';document.getElementById('resInterviewer').value=iv.interviewer||'';document.getElementById('resScore').value='';document.getElementById('resConclusion').selectedIndex=0;document.getElementById('resSalary').value='';document.getElementById('resNote').value='';
buildTestScoreFields(iv.requiredTests||[]);
showView('resultFormView')}

function buildTestScoreFields(tests){var container=document.getElementById('resTestScoresContainer');if(!tests||tests.length===0){container.innerHTML='';return}
var h='<div class="form-section"><h3>Điểm bài kiểm tra</h3><table class="score-table">';
tests.forEach(function(t){h+='<tr><td><strong>'+t+'</strong></td><td><input type="number" class="score-input test-score-input" data-test="'+t+'" min="0" max="100" placeholder="0-100"></td></tr>'});
h+='</table></div>';container.innerHTML=h}

function showInterviewDetail(code){var iv=interviews.find(function(x){return x.code===code});if(!iv)return;var ct=document.getElementById('interviewDetailContent');var cd=candidates.find(function(c){return c.code===iv.candidateCode});
var h='<div class="pdf-preview"><h2>CHI TIẾT LỊCH PHỎNG VẤN</h2>';
[['Mã lịch',iv.code],['Mã ứng viên',iv.candidateCode],['Họ tên',(cd?cd.fullName:'')],['Vị trí',iv.position],['Ngày phỏng vấn',formatDate(iv.date)],['Giờ phỏng vấn',na(iv.time)],['Hình thức',na(iv.format)],['Người phỏng vấn',na(iv.interviewer)],['Địa điểm',na(iv.location)],['Bài kiểm tra',(iv.requiredTests?iv.requiredTests.join(', '):'Không có')],['Trạng thái',iv.status||'Đã lên lịch'],['Người thao tác',operatorInfo(iv)],['Thời gian',formatDateTime(iv.timestamp)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
if(iv.editHistory&&iv.editHistory.length>0){h+='<div class="edit-history-section"><h3>Lịch sử chỉnh sửa '+getEditCountBadge(iv)+'</h3>';iv.editHistory.forEach(function(eh){h+='<div class="edit-history-item">'+formatDateTime(eh.timestamp)+' - '+eh.employeeName+' ('+eh.employeeId+') - '+eh.changes+'</div>'});h+='</div>'}
h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('interviewDetailView');
var btnEdit=document.getElementById('btnEditInterviewDetail');var btnDel=document.getElementById('btnDeleteInterviewDetail');
if(!canEditRecord(iv)){btnEdit.classList.add('btn-disabled')}else{btnEdit.classList.remove('btn-disabled')}
if(!canDeleteRecord(iv)){btnDel.classList.add('btn-disabled')}else{btnDel.classList.remove('btn-disabled')}}

function startEditInterview(code){var iv=interviews.find(function(x){return x.code===code});if(!iv)return;
if(!canEditRecord(iv)){alert('Không thể sửa!');return}
editingInterviewCode=code;document.getElementById('interviewFormTitle').textContent='Sửa lịch phỏng vấn - '+code;
document.getElementById('ivCandCode').value=iv.candidateCode;document.getElementById('ivPosition').value=iv.position;document.getElementById('ivDate').value=iv.date;document.getElementById('ivTime').value=iv.time||'';setSelectValue('ivFormat',iv.format);document.getElementById('ivInterviewer').value=iv.interviewer||'';document.getElementById('ivLocation').value=iv.location||'';
document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=iv.requiredTests&&iv.requiredTests.indexOf(cb.value)!==-1});
showView('interviewFormView')}

function deleteInterview(code){var iv=interviews.find(function(x){return x.code===code});if(!iv)return;if(!canDeleteRecord(iv)){alert('Không thể xóa!');return}if(!confirm('Xóa lịch phỏng vấn '+code+'?'))return;var idx=interviews.findIndex(function(x){return x.code===code});if(idx===-1)return;interviews.splice(idx,1);addHistory('Xóa','Lịch phỏng vấn',code,'Đã xóa');alert('Đã xóa');renderInterviewTable()}

function renderResultTable(filtered){var data=filtered||interviewResults;var c=document.getElementById('resultTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="resultDataTable"><thead><tr><th>STT</th><th>Mã kết quả</th><th>Mã ứng viên</th><th>Họ tên</th><th>Vị trí</th><th>Người phỏng vấn</th><th>Điểm đánh giá</th><th>Điểm bài kiểm tra</th><th>Kết quả</th><th>Mức lương đề xuất</th><th>Ngày cập nhật</th><th>Ghi chú</th><th>Số lần chỉnh sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var conclusion=r.conclusion||'Chờ quyết định';
var testScoresStr='';if(r.testScores){var ts=r.testScores;Object.keys(ts).forEach(function(k){testScoresStr+=k+': '+ts[k]+'; '})}
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+r.code+'" data-type="result">'+r.code+'</span></td><td>'+r.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+na(r.position)+'</td><td>'+na(r.interviewer)+'</td><td>'+na(r.score)+'</td><td>'+na(testScoresStr)+'</td><td>'+getStatusBadge(conclusion)+'</td><td>'+na(r.proposedSalary)+'</td><td>'+formatDate(r.updatedDate||r.timestamp)+'</td><td>'+na(r.note)+'</td><td>'+getEditCountBadge(r)+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.timestamp)+'</td>';
h+='<td>';
if(conclusion==='Đạt'){h+='<button class="btn btn-success btn-sm btn-notify-pass" data-code="'+r.code+'">TB trúng tuyển</button> '}
h+='<select class="status-select res-status-change" data-code="'+r.code+'"><option value="Đạt"'+(conclusion==='Đạt'?' selected':'')+'>Đạt</option><option value="Không đạt"'+(conclusion==='Không đạt'?' selected':'')+'>Không đạt</option><option value="Chờ quyết định"'+(conclusion==='Chờ quyết định'?' selected':'')+'>Chờ quyết định</option></select></td></tr>'});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="result"]').forEach(function(lk){lk.addEventListener('click',function(){showResultDetail(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-notify-pass').forEach(function(b){b.addEventListener('click',function(){var resCode=this.getAttribute('data-code');notifyPassAndCreateOnboarding(resCode)})});
c.querySelectorAll('.res-status-change').forEach(function(sel){sel.addEventListener('change',function(){var code=this.getAttribute('data-code');var r=interviewResults.find(function(x){return x.code===code});if(r){r.conclusion=this.value;addHistory('Cập nhật','Kết quả phỏng vấn',code,'Đổi kết quả: '+this.value)}})})}

function notifyPassAndCreateOnboarding(resCode){var r=interviewResults.find(function(x){return x.code===resCode});if(!r)return;var cd=candidates.find(function(x){return x.code===r.candidateCode});if(!cd)return;
if(r.conclusion!=='Đạt'){alert('Chỉ có thể thông báo trúng tuyển cho ứng viên Đạt!');return}
var existing=onboardingRecords.find(function(ob){return ob.candidateCode===r.candidateCode});if(existing){alert('Ứng viên '+r.candidateCode+' đã có trong danh sách nhận việc (Mã NV: '+existing.code+')');return}
editingOnboardingCode=null;document.getElementById('onboardingFormTitle').textContent='Thêm nhân viên mới - Trúng tuyển';
document.getElementById('obFullName').value=cd.fullName||'';
var rec=recruitmentRequests.find(function(x){return x.code===cd.recruitCode});if(rec)setSelectValue('obDepartment',rec.department);
document.getElementById('obPosition').value=cd.position||r.position||'';document.getElementById('obStartDate').value='';document.getElementById('obSalary').value=r.proposedSalary||'';document.getElementById('obManager').value='';document.getElementById('obContractType').selectedIndex=0;document.getElementById('obStatus').selectedIndex=0;
cd.status='Đã xác nhận nhận việc';addHistory('Cập nhật','Trạng thái ứng viên',cd.code,'Thông báo trúng tuyển');
showView('onboardingFormView')}

function showResultDetail(code){var r=interviewResults.find(function(x){return x.code===code});if(!r)return;var ct=document.getElementById('resultDetailContent');var cd=candidates.find(function(c){return c.code===r.candidateCode});
var h='<div class="pdf-preview"><h2>CHI TIẾT KẾT QUẢ PHỎNG VẤN</h2>';
[['Mã kết quả',r.code],['Mã ứng viên',r.candidateCode],['Họ tên',(cd?cd.fullName:'')],['Vị trí',na(r.position)],['Người phỏng vấn',na(r.interviewer)],['Điểm đánh giá',na(r.score)],['Kết quả',r.conclusion||'Chờ quyết định'],['Mức lương đề xuất',na(r.proposedSalary)],['Ngày cập nhật',formatDate(r.updatedDate||r.timestamp)],['Ghi chú',na(r.note)],['Người thao tác',operatorInfo(r)],['Thời gian',formatDateTime(r.timestamp)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
if(r.testScores&&Object.keys(r.testScores).length>0){h+='<h3>Điểm bài kiểm tra</h3>';Object.keys(r.testScores).forEach(function(k){h+='<div class="info-row"><span class="info-label">'+k+':</span><span class="info-value">'+r.testScores[k]+'</span></div>'})}
if(r.editHistory&&r.editHistory.length>0){h+='<div class="edit-history-section"><h3>Lịch sử chỉnh sửa '+getEditCountBadge(r)+'</h3>';r.editHistory.forEach(function(eh){h+='<div class="edit-history-item">'+formatDateTime(eh.timestamp)+' - '+eh.employeeName+' ('+eh.employeeId+') - '+eh.changes+'</div>'});h+='</div>'}
h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('resultDetailView');
var btnEdit=document.getElementById('btnEditResultDetail');var btnDel=document.getElementById('btnDeleteResultDetail');
if(!canEditRecord(r)){btnEdit.classList.add('btn-disabled')}else{btnEdit.classList.remove('btn-disabled')}
if(!canDeleteRecord(r)){btnDel.classList.add('btn-disabled')}else{btnDel.classList.remove('btn-disabled')}}

function startEditResult(code){var r=interviewResults.find(function(x){return x.code===code});if(!r)return;
if(!canEditRecord(r)){alert('Không thể sửa!');return}
editingResultCode=code;document.getElementById('resultFormTitle').textContent='Sửa kết quả - '+code;
document.getElementById('resCandCode').value=r.candidateCode;document.getElementById('resPosition').value=r.position||'';document.getElementById('resInterviewer').value=r.interviewer||'';document.getElementById('resScore').value=r.score||'';setSelectValue('resConclusion',r.conclusion);document.getElementById('resSalary').value=r.proposedSalary||'';document.getElementById('resNote').value=r.note||'';
var iv=interviews.find(function(x){return x.candidateCode===r.candidateCode});var tests=(iv&&iv.requiredTests)?iv.requiredTests:[];buildTestScoreFields(tests);
if(r.testScores){setTimeout(function(){document.querySelectorAll('.test-score-input').forEach(function(inp){var tn=inp.getAttribute('data-test');if(r.testScores[tn])inp.value=r.testScores[tn]})},100)}
showView('resultFormView')}

function deleteResult(code){var r=interviewResults.find(function(x){return x.code===code});if(!r)return;if(!canDeleteRecord(r)){alert('Không thể xóa!');return}if(!confirm('Xóa kết quả '+code+'?'))return;var idx=interviewResults.findIndex(function(x){return x.code===code});if(idx===-1)return;interviewResults.splice(idx,1);addHistory('Xóa','Kết quả phỏng vấn',code,'Đã xóa');alert('Đã xóa');renderResultTable()}

function renderOnboardingTable(filtered){var data=filtered||onboardingRecords;var c=document.getElementById('onboardingTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="onboardingDataTable"><thead><tr><th>STT</th><th>Mã nhân viên</th><th>Họ tên</th><th>Phòng ban</th><th>Vị trí</th><th>Ngày nhận việc</th><th>Mức lương</th><th>Người quản lý</th><th>Loại hợp đồng</th><th>Trạng thái</th><th>Số lần chỉnh sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(ob,i){var status=ob.status||'Đang thử việc';
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+ob.code+'" data-type="onboarding">'+ob.code+'</span></td><td>'+ob.fullName+'</td><td>'+na(ob.department)+'</td><td>'+na(ob.position)+'</td><td>'+formatDate(ob.startDate)+'</td><td>'+na(ob.salary)+'</td><td>'+na(ob.manager)+'</td><td>'+na(ob.contractType)+'</td><td>'+getStatusBadge(status)+'</td><td>'+getEditCountBadge(ob)+'</td><td>'+operatorInfo(ob)+'</td><td>'+formatDateTime(ob.timestamp)+'</td>';
h+='<td><button class="btn btn-success btn-sm btn-confirm-onboard" data-code="'+ob.code+'">Xác nhận NV</button> ';
h+='<select class="status-select ob-status-change" data-code="'+ob.code+'"><option value="Đang thử việc"'+(status==='Đang thử việc'?' selected':'')+'>Đang thử việc</option><option value="Chính thức"'+(status==='Chính thức'?' selected':'')+'>Chính thức</option><option value="Nghỉ việc"'+(status==='Nghỉ việc'?' selected':'')+'>Nghỉ việc</option></select></td></tr>'});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="onboarding"]').forEach(function(lk){lk.addEventListener('click',function(){showOnboardingDetail(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-confirm-onboard').forEach(function(b){b.addEventListener('click',function(){var obCode=this.getAttribute('data-code');confirmOnboarding(obCode)})});
c.querySelectorAll('.ob-status-change').forEach(function(sel){sel.addEventListener('change',function(){var code=this.getAttribute('data-code');var ob=onboardingRecords.find(function(x){return x.code===code});if(ob){ob.status=this.value;addHistory('Cập nhật','Trạng thái nhân viên',code,'Đổi trạng thái: '+this.value)}})})}

function confirmOnboarding(code){var ob=onboardingRecords.find(function(x){return x.code===code});if(!ob)return;ob.status='Chính thức';addHistory('Xác nhận','Nhân viên nhận việc',code,'Xác nhận nhận việc: '+ob.fullName);alert('Đã xác nhận nhận việc cho '+ob.fullName+' ('+code+')');renderOnboardingTable()}

function showOnboardingDetail(code){var ob=onboardingRecords.find(function(x){return x.code===code});if(!ob)return;var ct=document.getElementById('onboardingDetailContent');
var h='<div class="pdf-preview"><h2>CHI TIẾT NHÂN VIÊN MỚI</h2>';
[['Mã nhân viên',ob.code],['Họ tên',ob.fullName],['Phòng ban',na(ob.department)],['Vị trí',na(ob.position)],['Ngày nhận việc',formatDate(ob.startDate)],['Mức lương',na(ob.salary)],['Người quản lý',na(ob.manager)],['Loại hợp đồng',na(ob.contractType)],['Trạng thái',ob.status||'Đang thử việc'],['Người thao tác',operatorInfo(ob)],['Thời gian',formatDateTime(ob.timestamp)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
if(ob.editHistory&&ob.editHistory.length>0){h+='<div class="edit-history-section"><h3>Lịch sử chỉnh sửa '+getEditCountBadge(ob)+'</h3>';ob.editHistory.forEach(function(eh){h+='<div class="edit-history-item">'+formatDateTime(eh.timestamp)+' - '+eh.employeeName+' ('+eh.employeeId+') - '+eh.changes+'</div>'});h+='</div>'}
h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('onboardingDetailView');
var btnEdit=document.getElementById('btnEditOnboardingDetail');var btnDel=document.getElementById('btnDeleteOnboardingDetail');
if(!canEditRecord(ob)){btnEdit.classList.add('btn-disabled')}else{btnEdit.classList.remove('btn-disabled')}
if(!canDeleteRecord(ob)){btnDel.classList.add('btn-disabled')}else{btnDel.classList.remove('btn-disabled')}}

function startEditOnboarding(code){var ob=onboardingRecords.find(function(x){return x.code===code});if(!ob)return;
if(!canEditRecord(ob)){alert('Không thể sửa!');return}
editingOnboardingCode=code;document.getElementById('onboardingFormTitle').textContent='Sửa nhân viên - '+code;
document.getElementById('obFullName').value=ob.fullName;setSelectValue('obDepartment',ob.department);document.getElementById('obPosition').value=ob.position||'';document.getElementById('obStartDate').value=ob.startDate;document.getElementById('obSalary').value=ob.salary||'';document.getElementById('obManager').value=ob.manager||'';setSelectValue('obContractType',ob.contractType);setSelectValue('obStatus',ob.status);
showView('onboardingFormView')}

function deleteOnboarding(code){var ob=onboardingRecords.find(function(x){return x.code===code});if(!ob)return;if(!canDeleteRecord(ob)){alert('Không thể xóa!');return}if(!confirm('Xóa nhân viên '+code+'?'))return;var idx=onboardingRecords.findIndex(function(x){return x.code===code});if(idx===-1)return;onboardingRecords.splice(idx,1);addHistory('Xóa','Nhân viên mới',code,'Đã xóa');alert('Đã xóa');renderOnboardingTable()}

function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById('historyTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch sử</p>';return}
var h='<table id="historyDataTable"><thead><tr><th>STT</th><th>Hành động</th><th>Đối tượng</th><th>Mã</th><th>Chi tiết</th><th>Người thao tác</th><th>Chức vụ</th><th>Phòng ban</th><th>Thời gian</th></tr></thead><tbody>';
data.slice().reverse().forEach(function(h2,i){h+='<tr><td>'+(i+1)+'</td><td><span class="badge '+(h2.action==='Xóa'?'badge-red':(h2.action==='Sửa'||h2.action==='Cập nhật'?'badge-orange':'badge-green'))+'">'+h2.action+'</span></td><td>'+h2.target+'</td><td>'+h2.code+'</td><td>'+h2.detail+'</td><td>'+h2.employeeName+' ('+h2.employeeId+')</td><td>'+h2.employeePosition+'</td><td>'+h2.employeeDept+'</td><td>'+formatDateTime(h2.timestamp)+'</td></tr>'});
h+='</tbody></table>';c.innerHTML=h}

function exportTableToExcel(tableId,fileName){var tbl=document.getElementById(tableId);if(!tbl){alert('Không có dữ liệu');return}var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{mso-number-format:"\\\\@";white-space:normal;word-wrap:break-word;max-width:200px}</style></head><body>'+tbl.outerHTML+'</body></html>';var blob=new Blob([html],{type:'application/vnd.ms-excel'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fileName+'.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}

function validateLogin(){var e=[];var id=document.getElementById('loginEmpId').value.trim();var name=document.getElementById('loginEmpName').value.trim();if(!id)e.push('Mã nhân viên');if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('loginEmpPosition').value)e.push('Chức vụ');if(!document.getElementById('loginEmpDept').value)e.push('Phòng ban');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}

function doLogin(){if(!validateLogin())return;currentUser={id:document.getElementById('loginEmpId').value.trim(),name:document.getElementById('loginEmpName').value.trim().toUpperCase(),position:document.getElementById('loginEmpPosition').value,department:document.getElementById('loginEmpDept').value};document.getElementById('barEmpId').textContent=currentUser.id;document.getElementById('barEmpName').textContent=currentUser.name;document.getElementById('barEmpPosition').textContent=currentUser.position;document.getElementById('barEmpDept').textContent=currentUser.department;document.getElementById('loginView').classList.remove('active');document.getElementById('appContainer').style.display='block';showView('mainView');updateClock();clockInterval=setInterval(updateClock,1000);addHistory('Đăng nhập','Hệ thống',currentUser.id,currentUser.name+' đã đăng nhập');updateAdminVisibility()}

function doLogout(){addHistory('Đăng xuất','Hệ thống',currentUser?currentUser.id:'','Đã đăng xuất');currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById('appContainer').style.display='none';document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});document.getElementById('loginEmpId').value='';document.getElementById('loginEmpName').value='';document.getElementById('loginEmpPosition').selectedIndex=0;document.getElementById('loginEmpDept').selectedIndex=0;showView('loginView')}

function initApp(){
populateSelect('loginEmpDept',departments,'Chọn phòng ban');
populateSelect('recDepartment',departments,'Chọn phòng ban');
populateSelect('obDepartment',departments,'Chọn phòng ban');
loadDataFromServer().then(function(){showView('loginView')}).catch(function(){showView('loginView')})}

document.getElementById('btnLogin').addEventListener('click',function(){doLogin()});
document.getElementById('loginEmpName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnLogout').addEventListener('click',function(){if(confirm('Bạn có chắc muốn đăng xuất?'))doLogout()});

document.getElementById('btnGoRecruitment').addEventListener('click',function(){renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnGoCandidate').addEventListener('click',function(){renderCandidateTable();showView('candidateView')});
document.getElementById('btnGoInterview').addEventListener('click',function(){renderInterviewTable();showView('interviewView')});
document.getElementById('btnGoResult').addEventListener('click',function(){renderResultTable();showView('resultView')});
document.getElementById('btnGoOnboarding').addEventListener('click',function(){renderOnboardingTable();showView('onboardingView')});
document.getElementById('btnGoHistory').addEventListener('click',function(){if(!isAdmin()){alert('Bạn không có quyền');return}renderHistoryTable();showView('historyView')});

document.getElementById('btnBackFromRecruitment').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromRecruitmentForm').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none';renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromRecruitmentDetail').addEventListener('click',function(){renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromCandidate').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromCandidateForm').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none';renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromCandidateDetail').addEventListener('click',function(){renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromInterview').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromInterviewForm').addEventListener('click',function(){editingInterviewCode=null;renderInterviewTable();goBack('interviewView')});
document.getElementById('btnBackFromInterviewDetail').addEventListener('click',function(){renderInterviewTable();goBack('interviewView')});
document.getElementById('btnBackFromResult').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromResultForm').addEventListener('click',function(){editingResultCode=null;renderResultTable();goBack('resultView')});
document.getElementById('btnBackFromResultDetail').addEventListener('click',function(){renderResultTable();goBack('resultView')});
document.getElementById('btnBackFromOnboarding').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromOnboardingForm').addEventListener('click',function(){editingOnboardingCode=null;renderOnboardingTable();goBack('onboardingView')});
document.getElementById('btnBackFromOnboardingDetail').addEventListener('click',function(){renderOnboardingTable();goBack('onboardingView')});
document.getElementById('btnBackFromHistory').addEventListener('click',function(){goBack('mainView')});

document.getElementById('btnPrintRecruitment').addEventListener('click',function(){printContent(document.getElementById('recruitmentDetailContent').innerHTML)});
document.getElementById('btnPrintCandidate').addEventListener('click',function(){printContent(document.getElementById('candidateDetailContent').innerHTML)});
document.getElementById('btnPrintInterview').addEventListener('click',function(){printContent(document.getElementById('interviewDetailContent').innerHTML)});
document.getElementById('btnPrintResult').addEventListener('click',function(){printContent(document.getElementById('resultDetailContent').innerHTML)});
document.getElementById('btnPrintOnboarding').addEventListener('click',function(){printContent(document.getElementById('onboardingDetailContent').innerHTML)});

document.getElementById('btnEditRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code)startEditRecruitment(code)});
document.getElementById('btnDeleteRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code){deleteRecruitment(code);showView('recruitmentView')}});
document.getElementById('btnEditCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code)startEditCandidate(code)});
document.getElementById('btnDeleteCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code){deleteCandidate(code);showView('candidateView')}});
document.getElementById('btnEditInterviewDetail').addEventListener('click',function(){var code=document.getElementById('interviewDetailContent').getAttribute('data-code');if(code)startEditInterview(code)});
document.getElementById('btnDeleteInterviewDetail').addEventListener('click',function(){var code=document.getElementById('interviewDetailContent').getAttribute('data-code');if(code){deleteInterview(code);showView('interviewView')}});
document.getElementById('btnEditResultDetail').addEventListener('click',function(){var code=document.getElementById('resultDetailContent').getAttribute('data-code');if(code)startEditResult(code)});
document.getElementById('btnDeleteResultDetail').addEventListener('click',function(){var code=document.getElementById('resultDetailContent').getAttribute('data-code');if(code){deleteResult(code);showView('resultView')}});
document.getElementById('btnEditOnboardingDetail').addEventListener('click',function(){var code=document.getElementById('onboardingDetailContent').getAttribute('data-code');if(code)startEditOnboarding(code)});
document.getElementById('btnDeleteOnboardingDetail').addEventListener('click',function(){var code=document.getElementById('onboardingDetailContent').getAttribute('data-code');if(code){deleteOnboarding(code);showView('onboardingView')}});

document.getElementById('btnAddRecruitment').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentFormTitle').textContent='Tạo nhu cầu tuyển dụng';document.getElementById('recruitmentEditInfo').style.display='none';document.getElementById('recDepartment').selectedIndex=0;document.getElementById('recPosition').value='';document.getElementById('recQuantity').value='1';document.getElementById('recSalaryRange').value='';document.querySelectorAll('input[name="recReason"]').forEach(function(cb){cb.checked=false});document.getElementById('recNeedDate').value='';document.getElementById('recProposer').value='';showView('recruitmentFormView')});

document.getElementById('btnAddCandidate').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';document.getElementById('candFullName').value='';document.getElementById('candGender').selectedIndex=0;document.getElementById('candBirthYear').value='';document.getElementById('candPhone').value='';document.getElementById('candEmail').value='';document.getElementById('candPosition').value='';document.getElementById('candRecruitCode').value='';document.getElementById('candSource').selectedIndex=0;document.getElementById('candSubmitDate').value='';showView('candidateFormView')});

document.getElementById('btnAddInterview').addEventListener('click',function(){editingInterviewCode=null;document.getElementById('interviewFormTitle').textContent='Tạo lịch phỏng vấn';document.getElementById('ivCandCode').value='';document.getElementById('ivPosition').value='';document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';document.getElementById('ivFormat').selectedIndex=0;document.getElementById('ivInterviewer').value='';document.getElementById('ivLocation').value='';document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});showView('interviewFormView')});

document.getElementById('btnAddResult').addEventListener('click',function(){editingResultCode=null;document.getElementById('resultFormTitle').textContent='Thêm kết quả phỏng vấn';document.getElementById('resCandCode').value='';document.getElementById('resPosition').value='';document.getElementById('resInterviewer').value='';document.getElementById('resScore').value='';document.getElementById('resConclusion').selectedIndex=0;document.getElementById('resSalary').value='';document.getElementById('resNote').value='';document.getElementById('resTestScoresContainer').innerHTML='';showView('resultFormView')});

document.getElementById('btnAddOnboarding').addEventListener('click',function(){editingOnboardingCode=null;document.getElementById('onboardingFormTitle').textContent='Thêm nhân viên mới';document.getElementById('obFullName').value='';document.getElementById('obDepartment').selectedIndex=0;document.getElementById('obPosition').value='';document.getElementById('obStartDate').value='';document.getElementById('obSalary').value='';document.getElementById('obManager').value='';document.getElementById('obContractType').selectedIndex=0;document.getElementById('obStatus').selectedIndex=0;showView('onboardingFormView')});

document.getElementById('resCandCode').addEventListener('change',function(){var candCode=this.value.trim();if(!candCode)return;var iv=interviews.find(function(x){return x.candidateCode===candCode});if(iv&&iv.requiredTests){buildTestScoreFields(iv.requiredTests)}else{document.getElementById('resTestScoresContainer').innerHTML=''}});
document.getElementById('resCandCode').addEventListener('blur',function(){var candCode=this.value.trim();if(!candCode)return;var iv=interviews.find(function(x){return x.candidateCode===candCode});if(iv&&iv.requiredTests){buildTestScoreFields(iv.requiredTests)}else{document.getElementById('resTestScoresContainer').innerHTML=''}});

document.getElementById('recProposer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('candFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('ivInterviewer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('resInterviewer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('obFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('obManager').addEventListener('input',function(){this.value=this.value.toUpperCase()});

document.getElementById('btnSubmitRecruitment').addEventListener('click',function(){
var e=[];if(!document.getElementById('recDepartment').value)e.push('Phòng ban');if(!document.getElementById('recPosition').value.trim())e.push('Vị trí tuyển');if(!document.getElementById('recQuantity').value)e.push('Số lượng');var reasons=[];document.querySelectorAll('input[name="recReason"]:checked').forEach(function(cb){reasons.push(cb.value)});if(reasons.length===0)e.push('Lý do tuyển');if(!document.getElementById('recNeedDate').value)e.push('Ngày cần nhân sự');var proposer=document.getElementById('recProposer').value.trim();if(!proposer)e.push('Người yêu cầu');if(e.length>0){alert('Vui lòng điền:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();
if(editingRecruitmentCode){var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});if(!rec)return;if(!rec.editHistory)rec.editHistory=[];rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật thông tin'});rec.department=document.getElementById('recDepartment').value;rec.position=document.getElementById('recPosition').value.trim();rec.quantity=parseInt(document.getElementById('recQuantity').value);rec.salaryRange=document.getElementById('recSalaryRange').value.trim();rec.reasons=reasons;rec.needDate=document.getElementById('recNeedDate').value;rec.proposer=proposer;rec.employeeId=stamp.employeeId;rec.employeeName=stamp.employeeName;rec.timestamp=stamp.timestamp;addHistory('Sửa','Nhu cầu tuyển dụng',editingRecruitmentCode,'Đã cập nhật');alert('Cập nhật thành công!');editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none'}
else{var rec={code:generateRecruitmentCode(),department:document.getElementById('recDepartment').value,position:document.getElementById('recPosition').value.trim(),quantity:parseInt(document.getElementById('recQuantity').value),salaryRange:document.getElementById('recSalaryRange').value.trim(),reasons:reasons,needDate:document.getElementById('recNeedDate').value,proposer:proposer,createdDate:getNow(),status:'Đang tuyển',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]};recruitmentRequests.push(rec);addHistory('Tạo mới','Nhu cầu tuyển dụng',rec.code,'Tạo mới: '+rec.position);alert('Tạo thành công! Mã: '+rec.code)}
renderRecruitmentTable();showView('recruitmentView')});

document.getElementById('btnSubmitCandidate').addEventListener('click',function(){
var e=[];var name=document.getElementById('candFullName').value.trim();if(!name)e.push('Họ tên');if(!document.getElementById('candGender').value)e.push('Giới tính');if(!document.getElementById('candBirthYear').value)e.push('Năm sinh');var phone=document.getElementById('candPhone').value.trim();if(!phone)e.push('SĐT');if(!document.getElementById('candPosition').value.trim())e.push('Vị trí ứng tuyển');if(!document.getElementById('candRecruitCode').value.trim())e.push('Mã yêu cầu TD');if(!document.getElementById('candSource').value)e.push('Nguồn tuyển');if(!document.getElementById('candSubmitDate').value)e.push('Ngày nộp hồ sơ');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();
if(editingCandidateCode){var c=candidates.find(function(x){return x.code===editingCandidateCode});if(!c)return;if(!c.editHistory)c.editHistory=[];c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật thông tin'});c.fullName=name;c.gender=document.getElementById('candGender').value;c.birthYear=document.getElementById('candBirthYear').value;c.phone=phone;c.email=document.getElementById('candEmail').value.trim();c.position=document.getElementById('candPosition').value.trim();c.recruitCode=document.getElementById('candRecruitCode').value.trim();c.source=document.getElementById('candSource').value;c.submitDate=document.getElementById('candSubmitDate').value;c.employeeId=stamp.employeeId;c.employeeName=stamp.employeeName;c.timestamp=stamp.timestamp;addHistory('Sửa','Ứng viên',editingCandidateCode,'Đã cập nhật: '+name);alert('Cập nhật thành công!');editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none'}
else{var c={code:generateCandidateCode(),fullName:name,gender:document.getElementById('candGender').value,birthYear:document.getElementById('candBirthYear').value,phone:phone,email:document.getElementById('candEmail').value.trim(),position:document.getElementById('candPosition').value.trim(),recruitCode:document.getElementById('candRecruitCode').value.trim(),source:document.getElementById('candSource').value,submitDate:document.getElementById('candSubmitDate').value,status:'Đã cập nhật thông tin',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdDate:getNow(),editHistory:[]};candidates.push(c);addHistory('Tạo mới','Ứng viên',c.code,'Thêm mới: '+c.fullName);alert('Lưu thành công! Mã: '+c.code)}
renderCandidateTable();showView('candidateView')});

document.getElementById('btnSubmitInterview').addEventListener('click',function(){
var e=[];if(!document.getElementById('ivCandCode').value.trim())e.push('Mã ứng viên');if(!document.getElementById('ivPosition').value.trim())e.push('Vị trí');if(!document.getElementById('ivDate').value)e.push('Ngày phỏng vấn');if(!document.getElementById('ivTime').value)e.push('Giờ phỏng vấn');if(!document.getElementById('ivFormat').value)e.push('Hình thức');if(!document.getElementById('ivInterviewer').value.trim())e.push('Người phỏng vấn');if(!document.getElementById('ivLocation').value.trim())e.push('Địa điểm');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var requiredTests=[];document.querySelectorAll('input[name="ivTest"]:checked').forEach(function(cb){requiredTests.push(cb.value)});
var stamp=getUserStamp();
if(editingInterviewCode){var iv=interviews.find(function(x){return x.code===editingInterviewCode});if(!iv)return;if(!iv.editHistory)iv.editHistory=[];iv.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật lịch'});iv.candidateCode=document.getElementById('ivCandCode').value.trim();iv.position=document.getElementById('ivPosition').value.trim();iv.date=document.getElementById('ivDate').value;iv.time=document.getElementById('ivTime').value;iv.format=document.getElementById('ivFormat').value;iv.interviewer=document.getElementById('ivInterviewer').value.trim();iv.location=document.getElementById('ivLocation').value.trim();iv.requiredTests=requiredTests;iv.employeeId=stamp.employeeId;iv.employeeName=stamp.employeeName;iv.timestamp=stamp.timestamp;addHistory('Sửa','Lịch phỏng vấn',editingInterviewCode,'Đã cập nhật');alert('Cập nhật thành công!');editingInterviewCode=null}
else{var iv={code:generateInterviewCode(),candidateCode:document.getElementById('ivCandCode').value.trim(),position:document.getElementById('ivPosition').value.trim(),date:document.getElementById('ivDate').value,time:document.getElementById('ivTime').value,format:document.getElementById('ivFormat').value,interviewer:document.getElementById('ivInterviewer').value.trim(),location:document.getElementById('ivLocation').value.trim(),requiredTests:requiredTests,status:'Đã lên lịch',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdDate:getNow(),editHistory:[]};interviews.push(iv);addHistory('Tạo mới','Lịch phỏng vấn',iv.code,'Đặt lịch PV cho '+iv.candidateCode);alert('Tạo lịch thành công! Mã: '+iv.code)}
renderInterviewTable();showView('interviewView')});

document.getElementById('btnSubmitResult').addEventListener('click',function(){
var e=[];if(!document.getElementById('resCandCode').value.trim())e.push('Mã ứng viên');if(!document.getElementById('resPosition').value.trim())e.push('Vị trí');if(!document.getElementById('resInterviewer').value.trim())e.push('Người phỏng vấn');if(!document.getElementById('resScore').value)e.push('Điểm đánh giá');if(!document.getElementById('resConclusion').value)e.push('Kết quả');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var testScores={};document.querySelectorAll('.test-score-input').forEach(function(inp){var tn=inp.getAttribute('data-test');var val=inp.value;if(val)testScores[tn]=parseInt(val)});
var stamp=getUserStamp();
if(editingResultCode){var r=interviewResults.find(function(x){return x.code===editingResultCode});if(!r)return;if(!r.editHistory)r.editHistory=[];r.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật kết quả'});r.candidateCode=document.getElementById('resCandCode').value.trim();r.position=document.getElementById('resPosition').value.trim();r.interviewer=document.getElementById('resInterviewer').value.trim();r.score=document.getElementById('resScore').value;r.conclusion=document.getElementById('resConclusion').value;r.proposedSalary=document.getElementById('resSalary').value.trim();r.note=document.getElementById('resNote').value.trim();r.testScores=testScores;r.updatedDate=getNow();r.employeeId=stamp.employeeId;r.employeeName=stamp.employeeName;r.timestamp=stamp.timestamp;addHistory('Sửa','Kết quả phỏng vấn',editingResultCode,'Đã cập nhật');alert('Cập nhật thành công!');editingResultCode=null}
else{var r={code:generateResultCode(),candidateCode:document.getElementById('resCandCode').value.trim(),position:document.getElementById('resPosition').value.trim(),interviewer:document.getElementById('resInterviewer').value.trim(),score:document.getElementById('resScore').value,conclusion:document.getElementById('resConclusion').value,proposedSalary:document.getElementById('resSalary').value.trim(),note:document.getElementById('resNote').value.trim(),testScores:testScores,updatedDate:getNow(),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdDate:getNow(),editHistory:[]};interviewResults.push(r);addHistory('Tạo mới','Kết quả phỏng vấn',r.code,'Đánh giá ứng viên '+r.candidateCode);alert('Lưu kết quả thành công! Mã: '+r.code)}
renderResultTable();showView('resultView')});

document.getElementById('btnSubmitOnboarding').addEventListener('click',function(){
var e=[];var name=document.getElementById('obFullName').value.trim();if(!name)e.push('Họ tên');if(!document.getElementById('obDepartment').value)e.push('Phòng ban');if(!document.getElementById('obPosition').value.trim())e.push('Vị trí');if(!document.getElementById('obStartDate').value)e.push('Ngày nhận việc');if(!document.getElementById('obSalary').value.trim())e.push('Mức lương');if(!document.getElementById('obManager').value.trim())e.push('Người quản lý');if(!document.getElementById('obContractType').value)e.push('Loại hợp đồng');if(!document.getElementById('obStatus').value)e.push('Trạng thái');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();
if(editingOnboardingCode){var ob=onboardingRecords.find(function(x){return x.code===editingOnboardingCode});if(!ob)return;if(!ob.editHistory)ob.editHistory=[];ob.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật thông tin'});ob.fullName=name;ob.department=document.getElementById('obDepartment').value;ob.position=document.getElementById('obPosition').value.trim();ob.startDate=document.getElementById('obStartDate').value;ob.salary=document.getElementById('obSalary').value.trim();ob.manager=document.getElementById('obManager').value.trim();ob.contractType=document.getElementById('obContractType').value;ob.status=document.getElementById('obStatus').value;ob.employeeId=stamp.employeeId;ob.employeeName=stamp.employeeName;ob.timestamp=stamp.timestamp;addHistory('Sửa','Nhân viên mới',editingOnboardingCode,'Đã cập nhật: '+name);alert('Cập nhật thành công!');editingOnboardingCode=null}
else{var ob={code:generateEmployeeCode(),fullName:name,department:document.getElementById('obDepartment').value,position:document.getElementById('obPosition').value.trim(),startDate:document.getElementById('obStartDate').value,salary:document.getElementById('obSalary').value.trim(),manager:document.getElementById('obManager').value.trim(),contractType:document.getElementById('obContractType').value,status:document.getElementById('obStatus').value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,createdDate:getNow(),editHistory:[]};onboardingRecords.push(ob);addHistory('Tạo mới','Nhân viên mới',ob.code,'Thêm mới: '+ob.fullName);alert('Thêm thành công! Mã: '+ob.code)}
renderOnboardingTable();showView('onboardingView')});

document.getElementById('btnSearchRecruitment').addEventListener('click',function(){var f=document.getElementById('recruitSearchFrom').value,t=document.getElementById('recruitSearchTo').value;var txt=(document.getElementById('recruitSearchText').value||'').trim().toLowerCase();var st=document.getElementById('recruitSearchStatus').value;renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=(r.createdDate||r.timestamp||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(r.proposer||'').toLowerCase().includes(txt)||r.position.toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);var matchStatus=!st||(r.status||'Đang tuyển')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchCandidate').addEventListener('click',function(){var f=document.getElementById('candidateSearchFrom').value,t=document.getElementById('candidateSearchTo').value;var txt=(document.getElementById('candidateSearchText').value||'').trim().toLowerCase();var st=document.getElementById('candidateSearchStatus').value;renderCandidateTable(candidates.filter(function(c){var ts=(c.submitDate||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||c.fullName.toLowerCase().includes(txt)||(c.phone&&c.phone.includes(txt))||c.code.toLowerCase().includes(txt);var matchStatus=!st||(c.status||'Đã cập nhật thông tin')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchInterview').addEventListener('click',function(){var f=document.getElementById('interviewSearchFrom').value,t=document.getElementById('interviewSearchTo').value;var txt=(document.getElementById('interviewSearchText').value||'').trim().toLowerCase();var st=document.getElementById('interviewSearchStatus').value;renderInterviewTable(interviews.filter(function(iv){var ts=(iv.date||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var cd=candidates.find(function(c){return c.code===iv.candidateCode});var matchText=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||iv.candidateCode.toLowerCase().includes(txt)||iv.code.toLowerCase().includes(txt);var matchStatus=!st||(iv.status||'Đã lên lịch')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchResult').addEventListener('click',function(){var f=document.getElementById('resultSearchFrom').value,t=document.getElementById('resultSearchTo').value;var txt=(document.getElementById('resultSearchText').value||'').trim().toLowerCase();var st=document.getElementById('resultSearchStatus').value;renderResultTable(interviewResults.filter(function(r){var ts=(r.updatedDate||r.timestamp||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var cd=candidates.find(function(c){return c.code===r.candidateCode});var matchText=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||r.candidateCode.toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);var matchStatus=!st||(r.conclusion||'Chờ quyết định')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchOnboarding').addEventListener('click',function(){var f=document.getElementById('onboardSearchFrom').value,t=document.getElementById('onboardSearchTo').value;var txt=(document.getElementById('onboardSearchText').value||'').trim().toLowerCase();var st=document.getElementById('onboardSearchStatus').value;renderOnboardingTable(onboardingRecords.filter(function(ob){var ts=(ob.startDate||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||ob.fullName.toLowerCase().includes(txt)||ob.code.toLowerCase().includes(txt);var matchStatus=!st||(ob.status||'Đang thử việc')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchHistory').addEventListener('click',function(){var f=document.getElementById('historySearchFrom').value,t=document.getElementById('historySearchTo').value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});

document.getElementById('btnExportRecruitment').addEventListener('click',function(){exportTableToExcel('recruitmentDataTable','NhuCauTuyenDung')});
document.getElementById('btnExportCandidate').addEventListener('click',function(){exportTableToExcel('candidateDataTable','ThongTinUngVien')});
document.getElementById('btnExportInterview').addEventListener('click',function(){exportTableToExcel('interviewDataTable','LichPhongVan')});
document.getElementById('btnExportResult').addEventListener('click',function(){exportTableToExcel('resultDataTable','KetQuaPhongVan')});
document.getElementById('btnExportOnboarding').addEventListener('click',function(){exportTableToExcel('onboardingDataTable','NhanVienMoi')});
document.getElementById('btnExportHistory').addEventListener('click',function(){if(!isAdmin()){alert('Không có quyền');return}exportTableToExcel('historyDataTable','LichSuThaoTac')});

document.addEventListener("DOMContentLoaded",function(){initApp()});
<\\/script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlContent + fullScript);
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
    console.log('Onboarding: ' + database.onboardingRecords.length);
    console.log('Counters: ' + JSON.stringify(database.counters));
    console.log('=================================');
  });
}).catch(function(err) {
  console.error('Loi khoi dong:', err.message);
  server.listen(PORT, function() {
    console.log('Server running on port ' + PORT + ' (NO DATA)');
  });
});