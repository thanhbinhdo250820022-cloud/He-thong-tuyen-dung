// PHIÊN BẢN CẬP NHẬT - CÁC BẢNG HIỂN THỊ THEO YÊU CẦU MỚI
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
  interviewResultCounter: 1,
  newEmployeeCounter: 1
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
    if (!database.counters) database.counters = { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1, interviewResultCounter: 1, newEmployeeCounter: 1 };
    if (!database.counters.interviewResultCounter) database.counters.interviewResultCounter = 1;
    if (!database.counters.newEmployeeCounter) database.counters.newEmployeeCounter = 1;
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
<div><label>Từ ngày:</label><br><input type="date" id="recruitSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="recruitSearchTo"></div>
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
<div class="form-section"><h3>I. Thông tin chung</h3>
<div class="form-row"><div class="form-group"><label>Phòng ban yêu cầu *</label><select id="recDepartment"></select></div>
<div class="form-group"><label>Người yêu cầu * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Vị trí tuyển *</label><input type="text" id="recPosition"></div>
<div class="form-group"><label>Số lượng *</label><input type="number" id="recQuantity" min="1" value="1"></div></div>
<div class="form-group"><label>Lý do tuyển *</label>
<div class="checkbox-group">
<label><input type="checkbox" name="recReason" value="Mở rộng hoạt động"> Mở rộng hoạt động</label>
<label><input type="checkbox" name="recReason" value="Thay thế nhân viên nghỉ việc"> Thay thế nhân viên nghỉ việc</label>
<label><input type="checkbox" name="recReason" value="Bổ sung nhân lực"> Bổ sung nhân lực</label>
<label><input type="checkbox" name="recReason" value="Khác"> Khác</label>
</div></div>
<div class="form-group"><label>Mức lương dự kiến</label><input type="text" id="recSalaryRange" placeholder="VD: 8,000,000 - 12,000,000 VNĐ"></div>
<div class="form-group"><label>Ngày cần nhân sự *</label><input type="date" id="recNeedDate"></div>
</div>
<div class="form-section"><h3>II. Thông tin vị trí</h3>
<div class="form-group"><label>Báo cáo cho</label><input type="text" id="recReportTo" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()" placeholder="NHẬP TÊN IN HOA"></div>
<div class="form-group"><label>Địa điểm làm việc</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorkplace" value="Nhà máy 1"> Nhà máy 1</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 2"> Nhà máy 2</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 3"> Nhà máy 3</label><label><input type="checkbox" name="recWorkplace" value="Nhà máy 4"> Nhà máy 4</label></div></div>
<div class="form-group"><label>Mô tả công việc</label><textarea id="recJobDesc"></textarea></div>
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
<div><label>Từ ngày:</label><br><input type="date" id="candidateSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="candidateSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="candidateSearchText" placeholder="Nhập tên, SĐT, mã UV..."></div>
<div><label>Trạng thái:</label><br><select id="candidateSearchStatus"><option value="">Tất cả</option><option>Đã cập nhật thông tin</option><option>Đã hẹn phỏng vấn</option><option>Đã xác nhận phỏng vấn</option><option>Đạt</option><option>Không đạt</option><option>Đã xác nhận nhận việc</option></select></div>
<div><label>Nguồn tuyển:</label><br><select id="candidateSearchSource"><option value="">Tất cả</option><option>Website</option><option>Facebook</option><option>Người quen giới thiệu</option><option>Biển quảng cáo</option><option>Khác</option></select></div>
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
<div class="form-section"><h3>1. Thông tin cá nhân</h3>
<div class="form-row"><div class="form-group"><label>Mã yêu cầu tuyển dụng</label><input type="text" id="candRecruitCode" placeholder="VD: P00001"></div>
<div class="form-group"><label>Vị trí ứng tuyển *</label><input type="text" id="candPosition"></div></div>
<div class="form-row"><div class="form-group"><label>Họ và tên * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Giới tính *</label><select id="candGender"><option value="">-- Chọn --</option><option>Nam</option><option>Nữ</option></select></div></div>
<div class="form-row"><div class="form-group"><label>Năm sinh *</label><input type="number" id="candBirthYear" min="1950" max="2010" placeholder="VD: 1995"></div>
<div class="form-group"><label>SĐT *</label><input type="tel" id="candPhone" placeholder="0xxxxxxxxx"></div></div>
<div class="form-group"><label>Email</label><input type="email" id="candEmail" placeholder="email@example.com"></div>
<div class="form-group"><label>Nguồn tuyển *</label><select id="candSource"><option value="">-- Chọn --</option><option>Website</option><option>Facebook</option><option>Người quen giới thiệu</option><option>Biển quảng cáo</option><option>Khác</option></select></div>
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
<div><label>Từ ngày:</label><br><input type="date" id="interviewSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="interviewSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="interviewSearchText" placeholder="Nhập tên, mã UV, mã lịch..."></div>
<div><label>Trạng thái:</label><br><select id="interviewSearchStatus"><option value="">Tất cả</option><option>Đã lên lịch</option><option>Đã phỏng vấn</option><option>Hủy phỏng vấn</option></select></div>
<button class="btn btn-primary" id="btnSearchInterview">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportInterview">Xuất Excel</button>
<button class="btn btn-success" id="btnAddInterview">+ Tạo lịch PV</button>
</div>
<div id="interviewTableContainer" class="table-wrapper"></div>
</div>

<!-- SCHEDULE INTERVIEW FORM VIEW -->
<div id="scheduleInterviewFormView" class="view">
<button class="btn btn-back" id="btnBackFromScheduleInterview">← Quay lại</button>
<h2 id="interviewFormTitle">Tạo lịch phỏng vấn</h2>
<div class="form-section">
<div class="form-group"><label>Mã ứng viên *</label><input type="text" id="ivCandidateCode" placeholder="VD: C00001"></div>
<div id="ivCandidateInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div>
<div class="form-group"><label>Vị trí *</label><input type="text" id="ivPosition"></div>
<div class="form-row"><div class="form-group"><label>Ngày phỏng vấn *</label><input type="date" id="ivDate"></div>
<div class="form-group"><label>Giờ phỏng vấn *</label><input type="time" id="ivTime"></div></div>
<div class="form-group"><label>Hình thức *</label><select id="ivFormat"><option value="">-- Chọn --</option><option>Online</option><option>Offline</option></select></div>
<div class="form-group"><label>Người phỏng vấn *</label><input type="text" id="ivInterviewer" placeholder="Nhập tên người phỏng vấn"></div>
<div class="form-group"><label>Địa điểm *</label><input type="text" id="ivLocation" placeholder="Nhập địa điểm"></div>
</div>
<button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Lưu lịch phỏng vấn</button>
</div>

<!-- INTERVIEW RESULT VIEW -->
<div id="interviewResultFormView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewResult">← Quay lại</button>
<h2>Bảng Kết quả phỏng vấn</h2>
<div class="search-bar">
<div><label>Từ ngày:</label><br><input type="date" id="resultSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="resultSearchTo"></div>
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
<div class="form-group"><label>Mã ứng viên *</label><input type="text" id="rsltCandCode" placeholder="VD: C00001"></div>
<div id="rsltCandInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div>
<div class="form-group"><label>Vị trí *</label><input type="text" id="rsltPosition"></div>
<div class="form-group"><label>Người phỏng vấn *</label><input type="text" id="rsltInterviewer"></div>
<div class="form-group"><label>Điểm đánh giá (0-100)</label><input type="number" id="rsltScore" min="0" max="100"></div>
<div class="form-group"><label>Kết quả *</label><select id="rsltConclusion"><option value="">-- Chọn --</option><option>Đạt</option><option>Không đạt</option><option>Chờ quyết định</option></select></div>
<div class="form-group"><label>Mức lương đề xuất</label><input type="text" id="rsltSalary" placeholder="VD: 10,000,000 VNĐ"></div>
<div class="form-group"><label>Ghi chú</label><textarea id="rsltNote"></textarea></div>
</div>
<button class="btn btn-success" id="btnSubmitResult" style="width:100%;min-height:45px;font-size:16px">Lưu kết quả</button>
</div>

<!-- RESULT DETAIL VIEW -->
<div id="resultDetailView" class="view">
<button class="btn btn-back" id="btnBackFromResultDetail">← Quay lại</button>
<div class="no-print" style="margin-bottom:10px"><button class="btn btn-print" id="btnPrintResult">In / Xuất PDF</button></div>
<div id="resultDetailContent" class="form-section"></div>
</div>

<!-- ONBOARDING VIEW -->
<div id="onboardingFormView" class="view">
<button class="btn btn-back" id="btnBackFromOnboarding">← Quay lại</button>
<h2>Bảng Nhân viên mới nhận việc</h2>
<div class="search-bar">
<div><label>Từ ngày:</label><br><input type="date" id="onboardSearchFrom"></div>
<div><label>Đến ngày:</label><br><input type="date" id="onboardSearchTo"></div>
<div><label>Tìm kiếm:</label><br><input type="text" id="onboardSearchText" placeholder="Nhập tên, mã NV..."></div>
<div><label>Trạng thái:</label><br><select id="onboardSearchStatus"><option value="">Tất cả</option><option>Đang thử việc</option><option>Chính thức</option><option>Nghỉ việc</option></select></div>
<button class="btn btn-primary" id="btnSearchOnboarding">Tìm kiếm</button>
<button class="btn btn-excel" id="btnExportOnboarding">Xuất Excel</button>
<button class="btn btn-success" id="btnAddOnboarding">+ Thêm nhân viên mới</button>
</div>
<div id="onboardingTableContainer" class="table-wrapper"></div>
</div>

<!-- ONBOARDING FORM VIEW -->
<div id="onboardingNewFormView" class="view">
<button class="btn btn-back" id="btnBackFromOnboardingForm">← Quay lại</button>
<h2 id="onboardingNewFormTitle">Thêm nhân viên mới nhận việc</h2>
<div class="form-section">
<div class="form-row"><div class="form-group"><label>Họ tên * (IN HOA)</label><input type="text" id="obFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Phòng ban *</label><select id="obDepartment"></select></div></div>
<div class="form-row"><div class="form-group"><label>Vị trí *</label><input type="text" id="obPosition"></div>
<div class="form-group"><label>Ngày nhận việc *</label><input type="date" id="obStartDate"></div></div>
<div class="form-row"><div class="form-group"><label>Mức lương *</label><input type="text" id="obSalary" placeholder="VD: 10,000,000 VNĐ"></div>
<div class="form-group"><label>Người quản lý</label><input type="text" id="obManager" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Loại hợp đồng *</label><select id="obContractType"><option value="">-- Chọn --</option><option>Thử việc</option><option>Chính thức</option><option>Thời vụ</option></select></div>
<div class="form-group"><label>Trạng thái *</label><select id="obStatus"><option value="">-- Chọn --</option><option>Đang thử việc</option><option>Chính thức</option><option>Nghỉ việc</option></select></div></div>
</div>
<button class="btn btn-success" id="btnSubmitOnboarding" style="width:100%;min-height:45px;font-size:16px">Lưu</button>
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

const scriptContent = `
<script>
var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1,interviewResultCounter=1,newEmployeeCounter=1;
var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[];
var actionHistory=[];
var editingRecruitmentCode=null,editingCandidateCode=null,editingInterviewCode=null,editingResultCode=null,editingOnboardCode=null;
var MAX_EDIT_COUNT=3;
var currentUser=null,clockInterval=null;

var departments=['Sản xuất 1','Sản xuất 2.1','Sản xuất 2.2','Sản xuất 2.2 M&E','Sản xuất 3.345','Sản xuất 3.6','Sản xuất 4','Bảo trì bảo dưỡng 1','Kỹ thuật 1','Bảo trì bảo dưỡng 2','Kỹ thuật 2','Kiểm soát chất lượng 1','Kiểm soát chất lượng 2','QA','Kiểm tra 1','Kiểm tra 2','Phân tích','EHS','Hỗ trợ sản xuất','Kế toán','Hành chính nhân sự','IT (hệ thống)'];

function loadDataFromServer(){return fetch('/api/data').then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.json()}).then(function(data){if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;if(data.candidates)candidates=data.candidates;if(data.interviews)interviews=data.interviews;if(data.interviewResults)interviewResults=data.interviewResults;if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;if(data.history)actionHistory=data.history;if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1;interviewResultCounter=data.counters.interviewResultCounter||1;newEmployeeCounter=data.counters.newEmployeeCounter||1}console.log('Client: Da tai du lieu')}).catch(function(err){console.error('Client: Loi tai du lieu:',err)})}

function saveDataToServer(){var payload={recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter,interviewResultCounter:interviewResultCounter,newEmployeeCounter:newEmployeeCounter}};fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(result){console.log('Client: Da luu',result.message)}).catch(function(err){console.error('Client: Loi luu',err)})}

function isAdmin(){if(!currentUser)return false;return currentUser.position==='Trưởng phòng'&&currentUser.department==='Hành chính nhân sự'}
function updateAdminVisibility(){var btnHistory=document.getElementById('btnGoHistory');if(isAdmin()){btnHistory.style.display='block'}else{btnHistory.style.display='none'}}

function showView(id){document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});var t=document.getElementById(id);if(t)t.classList.add('active')}
function goBack(id){showView(id)}

function generateRecruitmentCode(){return'P'+String(recruitmentRequestCounter++).padStart(5,'0')}
function generateCandidateCode(){return'C'+String(candidateCounter++).padStart(5,'0')}
function generateInterviewCode(){return'L'+String(interviewFormCounter++).padStart(5,'0')}
function generateResultCode(){return'R'+String(interviewResultCounter++).padStart(5,'0')}
function generateEmployeeCode(){return'NV'+String(newEmployeeCounter++).padStart(5,'0')}

function formatDate(d){if(!d)return'';var dt=new Date(d);return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
function formatDateTime(d){if(!d)return'';var dt=new Date(d);return formatDate(d)+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')}
function getNow(){return new Date().toISOString()}
function updateClock(){var n=new Date();var el=document.getElementById('barClock');if(el)el.textContent=String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear()+' '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')}

function populateSelect(id,opts,ph,val){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">-- '+(ph||'Chọn')+' --</option>';opts.forEach(function(o){var opt=document.createElement('option');opt.value=o;opt.textContent=o;if(val&&o===val)opt.selected=true;s.appendChild(opt)})}
function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}
function getCheckedValues(name){var r=[];document.querySelectorAll('input[name="'+name+'"]:checked').forEach(function(cb){r.push(cb.value)});return r}
function setCheckedValues(name,vals){document.querySelectorAll('input[name="'+name+'"]').forEach(function(cb){cb.checked=vals.indexOf(cb.value)!==-1})}

function getUserStamp(){if(!currentUser)return{employeeId:'',employeeName:'',employeePosition:'',employeeDept:'',timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}
function operatorInfo(r){return(r.employeeName||'')+(r.employeeId?' ('+r.employeeId+')':'')}
function na(v){return v||'—'}

function getEditCount(record){return(record.editHistory&&record.editHistory.length)||0}
function canEdit(record){return getEditCount(record)<MAX_EDIT_COUNT}

function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||'',employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',employeePosition:currentUser?currentUser.position:'',employeeDept:currentUser?currentUser.department:'',timestamp:getNow()});saveDataToServer()}

function getStatusBadge(status){
var cls='badge-gray';
if(status==='Đang tuyển'||status==='Đã lên lịch'||status==='Đang thử việc'||status==='Đã cập nhật thông tin')cls='badge-blue';
else if(status==='Đã tuyển đủ'||status==='Đã phỏng vấn'||status==='Chính thức'||status==='Đạt'||status==='Đã xác nhận nhận việc'||status==='Đã xác nhận phỏng vấn')cls='badge-green';
else if(status==='Hủy phỏng vấn'||status==='Không đạt'||status==='Nghỉ việc')cls='badge-red';
else if(status==='Chờ quyết định'||status==='Đã hẹn phỏng vấn')cls='badge-orange';
return '<span class="badge '+cls+'">'+status+'</span>';
}

function printContent(html){var pa=document.getElementById('printArea');pa.innerHTML=html;pa.style.display='block';window.print();pa.style.display='none'}

// ===================== RECRUITMENT =====================
function getRecruitmentStatus(r){
var hiredCount=0;
onboardingRecords.forEach(function(ob){if(ob.recruitCode===r.code)hiredCount++});
return hiredCount>=r.quantity?'Đã tuyển đủ':'Đang tuyển';
}

function renderRecruitmentTable(filtered){
var data=filtered||recruitmentRequests;
var c=document.getElementById('recruitmentTableContainer');
if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="recruitmentDataTable"><thead><tr><th>STT</th><th>Mã yêu cầu</th><th>Phòng ban</th><th>Vị trí tuyển</th><th>Số lượng</th><th>Lý do tuyển</th><th>Mức lương dự kiến</th><th>Ngày cần nhân sự</th><th>Người yêu cầu</th><th>Ngày tạo</th><th>Trạng thái</th><th>Số lần sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(r,i){
var status=getRecruitmentStatus(r);
var editCount=getEditCount(r);
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+r.code+'" data-type="recruitment">'+r.code+'</span></td><td>'+r.department+'</td><td>'+r.position+'</td><td>'+r.quantity+'</td><td>'+(r.reasons||[]).join(', ')+'</td><td>'+na(r.salaryRange)+'</td><td>'+formatDate(r.needDate)+'</td><td>'+na(r.proposer)+'</td><td>'+formatDate(r.timestamp)+'</td><td>'+getStatusBadge(status)+'</td><td>'+editCount+'/'+MAX_EDIT_COUNT+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.lastEditTimestamp||r.timestamp)+'</td>';
h+='<td><button class="btn btn-edit btn-sm btn-edit-rec" data-code="'+r.code+'">Sửa</button> <button class="btn btn-delete btn-sm btn-delete-rec" data-code="'+r.code+'">Xóa</button></td></tr>';
});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="recruitment"]').forEach(function(lk){lk.addEventListener('click',function(){renderRecruitmentDetail(this.getAttribute('data-code'));showView('recruitmentDetailView')})});
c.querySelectorAll('.btn-edit-rec').forEach(function(b){b.addEventListener('click',function(){startEditRecruitment(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-delete-rec').forEach(function(b){b.addEventListener('click',function(){deleteRecruitment(this.getAttribute('data-code'))})});
}

function renderRecruitmentDetail(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;var c=document.getElementById('recruitmentDetailContent');var status=getRecruitmentStatus(r);var h='<div class="pdf-preview"><h2>PHIẾU NHU CẦU TUYỂN DỤNG</h2>';h+='<div class="info-row"><span class="info-label">Mã yêu cầu:</span><span class="info-value">'+r.code+'</span></div>';
[['Phòng ban',r.department],['Vị trí tuyển',r.position],['Số lượng',r.quantity],['Lý do tuyển',(r.reasons||[]).join(', ')],['Mức lương dự kiến',na(r.salaryRange)],['Ngày cần nhân sự',formatDate(r.needDate)],['Người yêu cầu',na(r.proposer)],['Trạng thái',status]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
h+='<br><div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorInfo(r)+'</span></div>';h+='<div class="info-row"><span class="info-label">Thời gian tạo:</span><span class="info-value">'+formatDateTime(r.timestamp)+'</span></div>';h+='</div>';c.innerHTML=h;c.setAttribute('data-code',code)}

function startEditRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canEdit(r)){alert('Đã đạt giới hạn chỉnh sửa tối đa.');return}editingRecruitmentCode=code;document.getElementById('recruitmentFormTitle').textContent='Sửa nhu cầu tuyển dụng - '+code;document.getElementById('recruitmentEditInfo').style.display='block';document.getElementById('recruitmentEditInfo').innerHTML='<div class="lock-info">Đang sửa lần '+(getEditCount(r)+1)+'/'+MAX_EDIT_COUNT+'</div>';
setSelectValue('recDepartment',r.department);document.getElementById('recProposer').value=r.proposer||'';document.getElementById('recPosition').value=r.position;document.getElementById('recQuantity').value=r.quantity;setCheckedValues('recReason',r.reasons||[]);document.getElementById('recSalaryRange').value=r.salaryRange||'';document.getElementById('recNeedDate').value=r.needDate||'';document.getElementById('recReportTo').value=r.reportTo||'';setCheckedValues('recWorkplace',r.workplaces||[]);document.getElementById('recJobDesc').value=r.jobDesc||'';
showView('recruitmentFormView')}

function deleteRecruitment(code){if(!confirm('Bạn có chắc muốn xóa '+code+'?'))return;var idx=recruitmentRequests.findIndex(function(r){return r.code===code});if(idx===-1)return;recruitmentRequests.splice(idx,1);addHistory('Xóa','Nhu cầu tuyển dụng',code,'Đã xóa');alert('Đã xóa '+code);renderRecruitmentTable()}

// ===================== CANDIDATES =====================
function getCandidateStatus(c){
var ob=onboardingRecords.find(function(o){return o.candidateCode===c.code});
if(ob)return'Đã xác nhận nhận việc';
var rs=interviewResults.find(function(r){return r.candidateCode===c.code});
if(rs){if(rs.conclusion==='Đạt')return'Đạt';if(rs.conclusion==='Không đạt')return'Không đạt';return'Chờ quyết định'}
var iv=interviews.find(function(x){return x.candidateCode===c.code});
if(iv){if(iv.status==='Đã phỏng vấn')return'Đã xác nhận phỏng vấn';return'Đã hẹn phỏng vấn'}
return c.status||'Đã cập nhật thông tin';
}

function renderCandidateTable(filtered){
var data=filtered||candidates;
var c=document.getElementById('candidateTableContainer');
if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="candidateDataTable"><thead><tr><th>STT</th><th>Mã ứng viên</th><th>Họ tên</th><th>Giới tính</th><th>Năm sinh</th><th>SĐT</th><th>Email</th><th>Vị trí ứng tuyển</th><th>Mã YCTD</th><th>Nguồn tuyển</th><th>Ngày nộp HS</th><th>Trạng thái</th><th>Số lần sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(c2,i){
var status=getCandidateStatus(c2);
var editCount=getEditCount(c2);
h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+c2.code+'" data-type="candidate">'+c2.code+'</span></td><td>'+c2.fullName+'</td><td>'+(c2.gender||'')+'</td><td>'+(c2.birthYear||'')+'</td><td>'+(c2.phone||'')+'</td><td>'+na(c2.email)+'</td><td>'+(c2.position||'')+'</td><td>'+na(c2.recruitCode)+'</td><td>'+(c2.source||'')+'</td><td>'+formatDate(c2.submitDate)+'</td><td>'+getStatusBadge(status)+'</td><td>'+editCount+'/'+MAX_EDIT_COUNT+'</td><td>'+operatorInfo(c2)+'</td><td>'+formatDateTime(c2.lastEditTimestamp||c2.timestamp)+'</td>';
h+='<td><button class="btn btn-edit btn-sm btn-edit-cand" data-code="'+c2.code+'">Sửa</button> <button class="btn btn-delete btn-sm btn-delete-cand" data-code="'+c2.code+'">Xóa</button></td></tr>';
});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.link-code[data-type="candidate"]').forEach(function(lk){lk.addEventListener('click',function(){showCandidateDetail(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-edit-cand').forEach(function(b){b.addEventListener('click',function(){startEditCandidate(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-delete-cand').forEach(function(b){b.addEventListener('click',function(){deleteCandidate(this.getAttribute('data-code'))})});
}

function showCandidateDetail(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;var ct=document.getElementById('candidateDetailContent');var status=getCandidateStatus(c);var h='<div class="pdf-preview"><h2>THÔNG TIN ỨNG VIÊN</h2>';
[['Mã ứng viên',c.code],['Họ tên',c.fullName],['Giới tính',c.gender],['Năm sinh',c.birthYear],['SĐT',c.phone],['Email',na(c.email)],['Vị trí ứng tuyển',c.position],['Mã YCTD',na(c.recruitCode)],['Nguồn tuyển',c.source],['Ngày nộp hồ sơ',formatDate(c.submitDate)],['Trạng thái',status]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});
h+='<br><div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorInfo(c)+'</span></div>';h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('candidateDetailView')}

function startEditCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canEdit(c)){alert('Đã đạt giới hạn chỉnh sửa.');return}editingCandidateCode=code;document.getElementById('candidateFormTitle').textContent='Sửa ứng viên - '+code;document.getElementById('candidateEditInfo').style.display='block';document.getElementById('candidateEditInfo').innerHTML='<div class="lock-info">Đang sửa lần '+(getEditCount(c)+1)+'/'+MAX_EDIT_COUNT+'</div>';
document.getElementById('candRecruitCode').value=c.recruitCode||'';document.getElementById('candPosition').value=c.position||'';document.getElementById('candFullName').value=c.fullName;setSelectValue('candGender',c.gender);document.getElementById('candBirthYear').value=c.birthYear||'';document.getElementById('candPhone').value=c.phone;document.getElementById('candEmail').value=c.email||'';setSelectValue('candSource',c.source);document.getElementById('candSubmitDate').value=c.submitDate||'';
showView('candidateFormView')}

function deleteCandidate(code){if(!confirm('Bạn có chắc muốn xóa ứng viên '+code+'?'))return;var idx=candidates.findIndex(function(c){return c.code===code});if(idx===-1)return;candidates.splice(idx,1);addHistory('Xóa','Ứng viên',code,'Đã xóa');alert('Đã xóa '+code);renderCandidateTable()}

// ===================== INTERVIEWS =====================
function renderInterviewTable(filtered){
var data=filtered||interviews;
var c=document.getElementById('interviewTableContainer');
if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="interviewDataTable"><thead><tr><th>STT</th><th>Mã lịch</th><th>Mã ứng viên</th><th>Họ tên</th><th>Vị trí</th><th>Ngày PV</th><th>Giờ PV</th><th>Hình thức</th><th>Người PV</th><th>Địa điểm</th><th>Trạng thái</th><th>Số lần sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(iv,i){
var cd=candidates.find(function(x){return x.code===iv.candidateCode});
var editCount=getEditCount(iv);
h+='<tr><td>'+(i+1)+'</td><td>'+iv.code+'</td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+formatDate(iv.date)+'</td><td>'+(iv.time||'')+'</td><td>'+(iv.format||'')+'</td><td>'+(iv.interviewer||'')+'</td><td>'+(iv.location||'')+'</td><td>'+getStatusBadge(iv.status||'Đã lên lịch')+'</td><td>'+editCount+'/'+MAX_EDIT_COUNT+'</td><td>'+operatorInfo(iv)+'</td><td>'+formatDateTime(iv.lastEditTimestamp||iv.timestamp)+'</td>';
h+='<td><button class="btn btn-edit btn-sm btn-edit-iv" data-code="'+iv.code+'">Sửa</button> <button class="btn btn-delete btn-sm btn-delete-iv" data-code="'+iv.code+'">Xóa</button>';
if(iv.status==='Đã lên lịch')h+=' <button class="btn btn-success btn-sm btn-done-iv" data-code="'+iv.code+'">Đã PV</button> <button class="btn btn-danger btn-sm btn-cancel-iv" data-code="'+iv.code+'">Hủy</button>';
h+='</td></tr>';
});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.btn-edit-iv').forEach(function(b){b.addEventListener('click',function(){startEditInterview(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-delete-iv').forEach(function(b){b.addEventListener('click',function(){deleteInterview(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-done-iv').forEach(function(b){b.addEventListener('click',function(){var code=this.getAttribute('data-code');var iv=interviews.find(function(x){return x.code===code});if(iv){iv.status='Đã phỏng vấn';iv.lastEditTimestamp=getNow();addHistory('Cập nhật','Lịch phỏng vấn',code,'Đã phỏng vấn');renderInterviewTable()}})});
c.querySelectorAll('.btn-cancel-iv').forEach(function(b){b.addEventListener('click',function(){var code=this.getAttribute('data-code');var iv=interviews.find(function(x){return x.code===code});if(iv){iv.status='Hủy phỏng vấn';iv.lastEditTimestamp=getNow();addHistory('Cập nhật','Lịch phỏng vấn',code,'Hủy phỏng vấn');renderInterviewTable()}})});
}

function startEditInterview(code){var iv=interviews.find(function(x){return x.code===code});if(!iv)return;if(!canEdit(iv)){alert('Đã đạt giới hạn chỉnh sửa.');return}editingInterviewCode=code;document.getElementById('interviewFormTitle').textContent='Sửa lịch phỏng vấn - '+code;
document.getElementById('ivCandidateCode').value=iv.candidateCode;document.getElementById('ivPosition').value=iv.position;document.getElementById('ivDate').value=iv.date;document.getElementById('ivTime').value=iv.time||'';setSelectValue('ivFormat',iv.format);document.getElementById('ivInterviewer').value=iv.interviewer||'';document.getElementById('ivLocation').value=iv.location||'';
showView('scheduleInterviewFormView')}

function deleteInterview(code){if(!confirm('Xóa lịch phỏng vấn '+code+'?'))return;var idx=interviews.findIndex(function(x){return x.code===code});if(idx===-1)return;interviews.splice(idx,1);addHistory('Xóa','Lịch phỏng vấn',code,'Đã xóa');alert('Đã xóa');renderInterviewTable()}

// ===================== INTERVIEW RESULTS =====================
function renderResultTable(filtered){
var data=filtered||interviewResults;
var c=document.getElementById('resultTableContainer');
if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="resultDataTable"><thead><tr><th>STT</th><th>Mã kết quả</th><th>Mã ứng viên</th><th>Họ tên</th><th>Vị trí</th><th>Người PV</th><th>Điểm</th><th>Kết quả</th><th>Mức lương đề xuất</th><th>Ngày cập nhật</th><th>Ghi chú</th><th>Số lần sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(r,i){
var cd=candidates.find(function(x){return x.code===r.candidateCode});
var editCount=getEditCount(r);
h+='<tr><td>'+(i+1)+'</td><td>'+r.code+'</td><td>'+r.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+(r.position||'')+'</td><td>'+(r.interviewer||'')+'</td><td>'+(r.score!=null?r.score:'')+'</td><td>'+getStatusBadge(r.conclusion)+'</td><td>'+na(r.proposedSalary)+'</td><td>'+formatDate(r.timestamp)+'</td><td>'+na(r.note)+'</td><td>'+editCount+'/'+MAX_EDIT_COUNT+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.lastEditTimestamp||r.timestamp)+'</td>';
h+='<td><button class="btn btn-edit btn-sm btn-edit-rslt" data-code="'+r.code+'">Sửa</button> <button class="btn btn-delete btn-sm btn-delete-rslt" data-code="'+r.code+'">Xóa</button></td></tr>';
});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.btn-edit-rslt').forEach(function(b){b.addEventListener('click',function(){startEditResult(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-delete-rslt').forEach(function(b){b.addEventListener('click',function(){deleteResult(this.getAttribute('data-code'))})});
}

function startEditResult(code){var r=interviewResults.find(function(x){return x.code===code});if(!r)return;if(!canEdit(r)){alert('Đã đạt giới hạn chỉnh sửa.');return}editingResultCode=code;document.getElementById('resultFormTitle').textContent='Sửa kết quả - '+code;
document.getElementById('rsltCandCode').value=r.candidateCode;document.getElementById('rsltPosition').value=r.position||'';document.getElementById('rsltInterviewer').value=r.interviewer||'';document.getElementById('rsltScore').value=r.score!=null?r.score:'';setSelectValue('rsltConclusion',r.conclusion);document.getElementById('rsltSalary').value=r.proposedSalary||'';document.getElementById('rsltNote').value=r.note||'';
showView('resultFormView')}

function deleteResult(code){if(!confirm('Xóa kết quả '+code+'?'))return;var idx=interviewResults.findIndex(function(x){return x.code===code});if(idx===-1)return;interviewResults.splice(idx,1);addHistory('Xóa','Kết quả phỏng vấn',code,'Đã xóa');alert('Đã xóa');renderResultTable()}

// ===================== ONBOARDING =====================
function renderOnboardingTable(filtered){
var data=filtered||onboardingRecords;
var c=document.getElementById('onboardingTableContainer');
if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}
var h='<table id="onboardingDataTable"><thead><tr><th>STT</th><th>Mã nhân viên</th><th>Họ tên</th><th>Phòng ban</th><th>Vị trí</th><th>Ngày nhận việc</th><th>Mức lương</th><th>Người quản lý</th><th>Loại HĐ</th><th>Trạng thái</th><th>Số lần sửa</th><th>Người thao tác</th><th>Thời gian thao tác</th><th>Thao tác</th></tr></thead><tbody>';
data.forEach(function(ob,i){
var editCount=getEditCount(ob);
h+='<tr><td>'+(i+1)+'</td><td>'+ob.code+'</td><td>'+ob.fullName+'</td><td>'+(ob.department||'')+'</td><td>'+(ob.position||'')+'</td><td>'+formatDate(ob.startDate)+'</td><td>'+na(ob.salary)+'</td><td>'+na(ob.manager)+'</td><td>'+(ob.contractType||'')+'</td><td>'+getStatusBadge(ob.status||'Đang thử việc')+'</td><td>'+editCount+'/'+MAX_EDIT_COUNT+'</td><td>'+operatorInfo(ob)+'</td><td>'+formatDateTime(ob.lastEditTimestamp||ob.timestamp)+'</td>';
h+='<td><button class="btn btn-edit btn-sm btn-edit-ob" data-code="'+ob.code+'">Sửa</button> <button class="btn btn-delete btn-sm btn-delete-ob" data-code="'+ob.code+'">Xóa</button></td></tr>';
});
h+='</tbody></table>';c.innerHTML=h;
c.querySelectorAll('.btn-edit-ob').forEach(function(b){b.addEventListener('click',function(){startEditOnboarding(this.getAttribute('data-code'))})});
c.querySelectorAll('.btn-delete-ob').forEach(function(b){b.addEventListener('click',function(){deleteOnboarding(this.getAttribute('data-code'))})});
}

function startEditOnboarding(code){var ob=onboardingRecords.find(function(x){return x.code===code});if(!ob)return;if(!canEdit(ob)){alert('Đã đạt giới hạn chỉnh sửa.');return}editingOnboardCode=code;document.getElementById('onboardingNewFormTitle').textContent='Sửa nhân viên - '+code;
document.getElementById('obFullName').value=ob.fullName;setSelectValue('obDepartment',ob.department);document.getElementById('obPosition').value=ob.position||'';document.getElementById('obStartDate').value=ob.startDate||'';document.getElementById('obSalary').value=ob.salary||'';document.getElementById('obManager').value=ob.manager||'';setSelectValue('obContractType',ob.contractType);setSelectValue('obStatus',ob.status);
showView('onboardingNewFormView')}

function deleteOnboarding(code){if(!confirm('Xóa nhân viên '+code+'?'))return;var idx=onboardingRecords.findIndex(function(x){return x.code===code});if(idx===-1)return;onboardingRecords.splice(idx,1);addHistory('Xóa','Nhân viên mới',code,'Đã xóa');alert('Đã xóa');renderOnboardingTable()}

// ===================== HISTORY =====================
function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById('historyTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch sử</p>';return}var h='<table id="historyDataTable"><thead><tr><th>STT</th><th>Hành động</th><th>Đối tượng</th><th>Mã</th><th>Chi tiết</th><th>Người thao tác</th><th>Chức vụ</th><th>Phòng ban</th><th>Thời gian</th></tr></thead><tbody>';data.slice().reverse().forEach(function(h2,i){h+='<tr><td>'+(i+1)+'</td><td><span class="badge '+(h2.action==='Xóa'?'badge-red':(h2.action==='Sửa'?'badge-orange':'badge-green'))+'">'+h2.action+'</span></td><td>'+h2.target+'</td><td>'+h2.code+'</td><td>'+h2.detail+'</td><td>'+h2.employeeName+' ('+h2.employeeId+')</td><td>'+h2.employeePosition+'</td><td>'+h2.employeeDept+'</td><td>'+formatDateTime(h2.timestamp)+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h}

// ===================== EXCEL EXPORT =====================
function exportTableToExcel(tableId,fileName){var tbl=document.getElementById(tableId);if(!tbl){alert('Không có dữ liệu');return}var clone=tbl.cloneNode(true);var rows=clone.querySelectorAll('tr');rows.forEach(function(row){var cells=row.querySelectorAll('th,td');if(cells.length>0){var last=cells[cells.length-1];if(last.textContent.trim()==='Thao tác'||last.querySelector('.btn'))last.remove()}});var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{mso-number-format:"\\\\@"}</style></head><body>'+clone.outerHTML+'</body></html>';var blob=new Blob([html],{type:'application/vnd.ms-excel'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fileName+'.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}

// ===================== LOGIN / LOGOUT =====================
function validateLogin(){var e=[];if(!document.getElementById('loginEmpId').value.trim())e.push('Mã nhân viên');var name=document.getElementById('loginEmpName').value.trim();if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('loginEmpPosition').value)e.push('Chức vụ');if(!document.getElementById('loginEmpDept').value)e.push('Phòng ban');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}

function doLogin(){if(!validateLogin())return;currentUser={id:document.getElementById('loginEmpId').value.trim(),name:document.getElementById('loginEmpName').value.trim().toUpperCase(),position:document.getElementById('loginEmpPosition').value,department:document.getElementById('loginEmpDept').value};document.getElementById('barEmpId').textContent=currentUser.id;document.getElementById('barEmpName').textContent=currentUser.name;document.getElementById('barEmpPosition').textContent=currentUser.position;document.getElementById('barEmpDept').textContent=currentUser.department;document.getElementById('loginView').classList.remove('active');document.getElementById('appContainer').style.display='block';showView('mainView');updateClock();clockInterval=setInterval(updateClock,1000);addHistory('Đăng nhập','Hệ thống',currentUser.id,currentUser.name+' đã đăng nhập');updateAdminVisibility()}

function doLogout(){addHistory('Đăng xuất','Hệ thống',currentUser?currentUser.id:'','Đã đăng xuất');currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById('appContainer').style.display='none';document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});document.getElementById('loginEmpId').value='';document.getElementById('loginEmpName').value='';document.getElementById('loginEmpPosition').selectedIndex=0;document.getElementById('loginEmpDept').selectedIndex=0;showView('loginView')}

// ===================== INIT & EVENT LISTENERS =====================
function initApp(){
populateSelect('loginEmpDept',departments,'Chọn phòng ban');
populateSelect('recDepartment',departments,'Chọn phòng ban');
populateSelect('obDepartment',departments,'Chọn phòng ban');
loadDataFromServer().then(function(){showView('loginView')}).catch(function(){showView('loginView')});
}

document.getElementById('btnLogin').addEventListener('click',function(){doLogin()});
document.getElementById('loginEmpName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnLogout').addEventListener('click',function(){if(confirm('Bạn có chắc muốn đăng xuất?'))doLogout()});

// Navigation
document.getElementById('btnGoRecruitment').addEventListener('click',function(){renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnGoCandidate').addEventListener('click',function(){renderCandidateTable();showView('candidateView')});
document.getElementById('btnGoInterview').addEventListener('click',function(){renderInterviewTable();showView('interviewView')});
document.getElementById('btnGoResult').addEventListener('click',function(){renderResultTable();showView('interviewResultFormView')});
document.getElementById('btnGoOnboarding').addEventListener('click',function(){renderOnboardingTable();showView('onboardingFormView')});
document.getElementById('btnGoHistory').addEventListener('click',function(){if(!isAdmin()){alert('Bạn không có quyền.');return}renderHistoryTable();showView('historyView')});

// Back buttons
document.getElementById('btnBackFromRecruitment').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromRecruitmentForm').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none';renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromRecruitmentDetail').addEventListener('click',function(){renderRecruitmentTable();goBack('recruitmentView')});
document.getElementById('btnBackFromCandidate').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromCandidateForm').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none';renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromCandidateDetail').addEventListener('click',function(){renderCandidateTable();goBack('candidateView')});
document.getElementById('btnBackFromInterview').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromScheduleInterview').addEventListener('click',function(){editingInterviewCode=null;renderInterviewTable();goBack('interviewView')});
document.getElementById('btnBackFromInterviewResult').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromResultForm').addEventListener('click',function(){editingResultCode=null;renderResultTable();goBack('interviewResultFormView')});
document.getElementById('btnBackFromResultDetail').addEventListener('click',function(){renderResultTable();goBack('interviewResultFormView')});
document.getElementById('btnBackFromOnboarding').addEventListener('click',function(){goBack('mainView')});
document.getElementById('btnBackFromOnboardingForm').addEventListener('click',function(){editingOnboardCode=null;renderOnboardingTable();goBack('onboardingFormView')});
document.getElementById('btnBackFromHistory').addEventListener('click',function(){goBack('mainView')});

// Print
document.getElementById('btnPrintRecruitment').addEventListener('click',function(){printContent(document.getElementById('recruitmentDetailContent').innerHTML)});
document.getElementById('btnPrintCandidate').addEventListener('click',function(){printContent(document.getElementById('candidateDetailContent').innerHTML)});
document.getElementById('btnPrintResult').addEventListener('click',function(){printContent(document.getElementById('resultDetailContent').innerHTML)});

// Edit/Delete from detail
document.getElementById('btnEditRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code)startEditRecruitment(code)});
document.getElementById('btnDeleteRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code){deleteRecruitment(code);showView('recruitmentView')}});
document.getElementById('btnEditCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code)startEditCandidate(code)});
document.getElementById('btnDeleteCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code){deleteCandidate(code);showView('candidateView')}});

// Add buttons
document.getElementById('btnAddRecruitment').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentFormTitle').textContent='Tạo nhu cầu tuyển dụng';document.getElementById('recruitmentEditInfo').style.display='none';document.getElementById('recDepartment').selectedIndex=0;document.getElementById('recProposer').value='';document.getElementById('recPosition').value='';document.getElementById('recQuantity').value='1';document.querySelectorAll('input[name="recReason"]').forEach(function(cb){cb.checked=false});document.getElementById('recSalaryRange').value='';document.getElementById('recNeedDate').value='';document.getElementById('recReportTo').value='';document.querySelectorAll('input[name="recWorkplace"]').forEach(function(cb){cb.checked=false});document.getElementById('recJobDesc').value='';showView('recruitmentFormView')});

document.getElementById('btnAddCandidate').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';document.getElementById('candRecruitCode').value='';document.getElementById('candPosition').value='';document.getElementById('candFullName').value='';document.getElementById('candGender').selectedIndex=0;document.getElementById('candBirthYear').value='';document.getElementById('candPhone').value='';document.getElementById('candEmail').value='';document.getElementById('candSource').selectedIndex=0;document.getElementById('candSubmitDate').value='';showView('candidateFormView')});

document.getElementById('btnAddInterview').addEventListener('click',function(){editingInterviewCode=null;document.getElementById('interviewFormTitle').textContent='Tạo lịch phỏng vấn';document.getElementById('ivCandidateCode').value='';document.getElementById('ivCandidateInfo').style.display='none';document.getElementById('ivPosition').value='';document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';document.getElementById('ivFormat').selectedIndex=0;document.getElementById('ivInterviewer').value='';document.getElementById('ivLocation').value='';showView('scheduleInterviewFormView')});

document.getElementById('btnAddResult').addEventListener('click',function(){editingResultCode=null;document.getElementById('resultFormTitle').textContent='Thêm kết quả phỏng vấn';document.getElementById('rsltCandCode').value='';document.getElementById('rsltCandInfo').style.display='none';document.getElementById('rsltPosition').value='';document.getElementById('rsltInterviewer').value='';document.getElementById('rsltScore').value='';document.getElementById('rsltConclusion').selectedIndex=0;document.getElementById('rsltSalary').value='';document.getElementById('rsltNote').value='';showView('resultFormView')});

document.getElementById('btnAddOnboarding').addEventListener('click',function(){editingOnboardCode=null;document.getElementById('onboardingNewFormTitle').textContent='Thêm nhân viên mới nhận việc';document.getElementById('obFullName').value='';document.getElementById('obDepartment').selectedIndex=0;document.getElementById('obPosition').value='';document.getElementById('obStartDate').value='';document.getElementById('obSalary').value='';document.getElementById('obManager').value='';document.getElementById('obContractType').selectedIndex=0;document.getElementById('obStatus').selectedIndex=0;showView('onboardingNewFormView')});

// Submit Recruitment
document.getElementById('recProposer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnSubmitRecruitment').addEventListener('click',function(){
var e=[];if(!document.getElementById('recDepartment').value)e.push('Phòng ban');if(!document.getElementById('recPosition').value.trim())e.push('Vị trí tuyển');if(!document.getElementById('recQuantity').value||parseInt(document.getElementById('recQuantity').value)<1)e.push('Số lượng');if(getCheckedValues('recReason').length===0)e.push('Lý do tuyển');if(!document.getElementById('recNeedDate').value)e.push('Ngày cần nhân sự');if(e.length>0){alert('Vui lòng điền:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();var data={department:document.getElementById('recDepartment').value,proposer:document.getElementById('recProposer').value.trim(),position:document.getElementById('recPosition').value.trim(),quantity:parseInt(document.getElementById('recQuantity').value),reasons:getCheckedValues('recReason'),salaryRange:document.getElementById('recSalaryRange').value.trim(),needDate:document.getElementById('recNeedDate').value,reportTo:document.getElementById('recReportTo').value.trim(),workplaces:getCheckedValues('recWorkplace'),jobDesc:document.getElementById('recJobDesc').value.trim()};
if(editingRecruitmentCode){var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});if(!rec)return;if(!rec.editHistory)rec.editHistory=[];rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật'});Object.assign(rec,data);rec.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Nhu cầu tuyển dụng',editingRecruitmentCode,'Đã cập nhật');alert('Cập nhật thành công!');editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none'}else{var rec=Object.assign({code:generateRecruitmentCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});recruitmentRequests.push(rec);addHistory('Tạo mới','Nhu cầu tuyển dụng',rec.code,'Tạo mới: '+rec.position);alert('Tạo thành công! Mã: '+rec.code)}renderRecruitmentTable();showView('recruitmentView')});

// Submit Candidate
document.getElementById('candFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnSubmitCandidate').addEventListener('click',function(){
var e=[];var name=document.getElementById('candFullName').value.trim();if(!name)e.push('Họ tên');if(name&&name!==name.toUpperCase())e.push('Họ tên phải IN HOA');if(!document.getElementById('candGender').value)e.push('Giới tính');if(!document.getElementById('candBirthYear').value)e.push('Năm sinh');var phone=document.getElementById('candPhone').value.trim();if(!phone)e.push('SĐT');else if(!/^0\\d{9}$/.test(phone))e.push('SĐT sai định dạng');if(!document.getElementById('candSource').value)e.push('Nguồn tuyển');if(!document.getElementById('candSubmitDate').value)e.push('Ngày nộp hồ sơ');if(!document.getElementById('candPosition').value.trim())e.push('Vị trí ứng tuyển');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();var data={recruitCode:document.getElementById('candRecruitCode').value.trim(),position:document.getElementById('candPosition').value.trim(),fullName:name,gender:document.getElementById('candGender').value,birthYear:document.getElementById('candBirthYear').value,phone:phone,email:document.getElementById('candEmail').value.trim(),source:document.getElementById('candSource').value,submitDate:document.getElementById('candSubmitDate').value};
if(editingCandidateCode){var c=candidates.find(function(x){return x.code===editingCandidateCode});if(!c)return;if(!c.editHistory)c.editHistory=[];c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật'});Object.assign(c,data);c.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Ứng viên',editingCandidateCode,'Đã cập nhật: '+c.fullName);alert('Cập nhật thành công!');editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none'}else{var c=Object.assign({code:generateCandidateCode()},data,{status:'Đã cập nhật thông tin',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});candidates.push(c);addHistory('Tạo mới','Ứng viên',c.code,'Thêm: '+c.fullName);alert('Lưu thành công! Mã: '+c.code)}renderCandidateTable();showView('candidateView')});

// Candidate code lookup for interview
document.getElementById('ivCandidateCode').addEventListener('input',function(){var code=this.value.trim();var cd=candidates.find(function(c){return c.code===code});var info=document.getElementById('ivCandidateInfo');if(cd){info.style.display='block';info.innerHTML='<strong>'+cd.fullName+'</strong> | '+cd.phone+' | '+cd.position;if(!document.getElementById('ivPosition').value)document.getElementById('ivPosition').value=cd.position||''}else{info.style.display=code.length>3?'block':'none';if(code.length>3)info.innerHTML='<span style="color:red">Không tìm thấy</span>'}});

// Submit Interview
document.getElementById('btnSubmitInterview').addEventListener('click',function(){
var e=[];if(!document.getElementById('ivCandidateCode').value.trim())e.push('Mã ứng viên');if(!document.getElementById('ivPosition').value.trim())e.push('Vị trí');if(!document.getElementById('ivDate').value)e.push('Ngày PV');if(!document.getElementById('ivTime').value)e.push('Giờ PV');if(!document.getElementById('ivFormat').value)e.push('Hình thức');if(!document.getElementById('ivInterviewer').value.trim())e.push('Người PV');if(!document.getElementById('ivLocation').value.trim())e.push('Địa điểm');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();var data={candidateCode:document.getElementById('ivCandidateCode').value.trim(),position:document.getElementById('ivPosition').value.trim(),date:document.getElementById('ivDate').value,time:document.getElementById('ivTime').value,format:document.getElementById('ivFormat').value,interviewer:document.getElementById('ivInterviewer').value.trim(),location:document.getElementById('ivLocation').value.trim()};
if(editingInterviewCode){var iv=interviews.find(function(x){return x.code===editingInterviewCode});if(!iv)return;if(!iv.editHistory)iv.editHistory=[];iv.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật'});Object.assign(iv,data);iv.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Lịch phỏng vấn',editingInterviewCode,'Đã cập nhật');alert('Cập nhật thành công!');editingInterviewCode=null}else{var iv=Object.assign({code:generateInterviewCode()},data,{status:'Đã lên lịch',employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});interviews.push(iv);addHistory('Tạo mới','Lịch phỏng vấn',iv.code,'Đặt lịch PV cho '+iv.candidateCode);alert('Tạo lịch thành công! Mã: '+iv.code)}renderInterviewTable();showView('interviewView')});

// Result candidate lookup
document.getElementById('rsltCandCode').addEventListener('input',function(){var code=this.value.trim();var cd=candidates.find(function(c){return c.code===code});var info=document.getElementById('rsltCandInfo');if(cd){info.style.display='block';info.innerHTML='<strong>'+cd.fullName+'</strong> | '+cd.position;if(!document.getElementById('rsltPosition').value)document.getElementById('rsltPosition').value=cd.position||''}else{info.style.display=code.length>3?'block':'none';if(code.length>3)info.innerHTML='<span style="color:red">Không tìm thấy</span>'}});

// Submit Result
document.getElementById('btnSubmitResult').addEventListener('click',function(){
var e=[];if(!document.getElementById('rsltCandCode').value.trim())e.push('Mã ứng viên');if(!document.getElementById('rsltPosition').value.trim())e.push('Vị trí');if(!document.getElementById('rsltInterviewer').value.trim())e.push('Người PV');if(!document.getElementById('rsltConclusion').value)e.push('Kết quả');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();var data={candidateCode:document.getElementById('rsltCandCode').value.trim(),position:document.getElementById('rsltPosition').value.trim(),interviewer:document.getElementById('rsltInterviewer').value.trim(),score:document.getElementById('rsltScore').value?parseInt(document.getElementById('rsltScore').value):null,conclusion:document.getElementById('rsltConclusion').value,proposedSalary:document.getElementById('rsltSalary').value.trim(),note:document.getElementById('rsltNote').value.trim()};
if(editingResultCode){var r=interviewResults.find(function(x){return x.code===editingResultCode});if(!r)return;if(!r.editHistory)r.editHistory=[];r.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật'});Object.assign(r,data);r.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Kết quả PV',editingResultCode,'Đã cập nhật');alert('Cập nhật thành công!');editingResultCode=null}else{var r=Object.assign({code:generateResultCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});interviewResults.push(r);addHistory('Tạo mới','Kết quả PV',r.code,'KQ: '+r.candidateCode+' - '+r.conclusion);alert('Lưu thành công! Mã: '+r.code)}renderResultTable();showView('interviewResultFormView')});

// Submit Onboarding
document.getElementById('obFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('obManager').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnSubmitOnboarding').addEventListener('click',function(){
var e=[];if(!document.getElementById('obFullName').value.trim())e.push('Họ tên');if(!document.getElementById('obDepartment').value)e.push('Phòng ban');if(!document.getElementById('obPosition').value.trim())e.push('Vị trí');if(!document.getElementById('obStartDate').value)e.push('Ngày nhận việc');if(!document.getElementById('obSalary').value.trim())e.push('Mức lương');if(!document.getElementById('obContractType').value)e.push('Loại hợp đồng');if(!document.getElementById('obStatus').value)e.push('Trạng thái');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return}
var stamp=getUserStamp();var data={fullName:document.getElementById('obFullName').value.trim(),department:document.getElementById('obDepartment').value,position:document.getElementById('obPosition').value.trim(),startDate:document.getElementById('obStartDate').value,salary:document.getElementById('obSalary').value.trim(),manager:document.getElementById('obManager').value.trim(),contractType:document.getElementById('obContractType').value,status:document.getElementById('obStatus').value};
if(editingOnboardCode){var ob=onboardingRecords.find(function(x){return x.code===editingOnboardCode});if(!ob)return;if(!ob.editHistory)ob.editHistory=[];ob.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,timestamp:stamp.timestamp,changes:'Cập nhật'});Object.assign(ob,data);ob.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Nhân viên mới',editingOnboardCode,'Đã cập nhật');alert('Cập nhật thành công!');editingOnboardCode=null}else{var ob=Object.assign({code:generateEmployeeCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});onboardingRecords.push(ob);addHistory('Tạo mới','Nhân viên mới',ob.code,'Thêm: '+ob.fullName);alert('Lưu thành công! Mã: '+ob.code)}renderOnboardingTable();showView('onboardingFormView')});

// Search handlers
document.getElementById('btnSearchRecruitment').addEventListener('click',function(){var f=document.getElementById('recruitSearchFrom').value,t=document.getElementById('recruitSearchTo').value;var txt=(document.getElementById('recruitSearchText').value||'').trim().toLowerCase();var st=document.getElementById('recruitSearchStatus').value;renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=r.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(r.proposer||'').toLowerCase().includes(txt)||r.position.toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);var matchStatus=!st||getRecruitmentStatus(r)===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchCandidate').addEventListener('click',function(){var f=document.getElementById('candidateSearchFrom').value,t=document.getElementById('candidateSearchTo').value;var txt=(document.getElementById('candidateSearchText').value||'').trim().toLowerCase();var st=document.getElementById('candidateSearchStatus').value;var src=document.getElementById('candidateSearchSource').value;renderCandidateTable(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||c.fullName.toLowerCase().includes(txt)||(c.phone&&c.phone.includes(txt))||c.code.toLowerCase().includes(txt);var matchStatus=!st||getCandidateStatus(c)===st;var matchSource=!src||c.source===src;return matchDate&&matchText&&matchStatus&&matchSource}))});

document.getElementById('btnSearchInterview').addEventListener('click',function(){var f=document.getElementById('interviewSearchFrom').value,t=document.getElementById('interviewSearchTo').value;var txt=(document.getElementById('interviewSearchText').value||'').trim().toLowerCase();var st=document.getElementById('interviewSearchStatus').value;renderInterviewTable(interviews.filter(function(iv){var ts=(iv.date||iv.timestamp||'').substring(0,10);var cd=candidates.find(function(c){return c.code===iv.candidateCode});var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||iv.candidateCode.toLowerCase().includes(txt)||iv.code.toLowerCase().includes(txt);var matchStatus=!st||(iv.status||'Đã lên lịch')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchResult').addEventListener('click',function(){var f=document.getElementById('resultSearchFrom').value,t=document.getElementById('resultSearchTo').value;var txt=(document.getElementById('resultSearchText').value||'').trim().toLowerCase();var st=document.getElementById('resultSearchStatus').value;renderResultTable(interviewResults.filter(function(r){var ts=r.timestamp.substring(0,10);var cd=candidates.find(function(c){return c.code===r.candidateCode});var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||(cd&&cd.fullName.toLowerCase().includes(txt))||r.candidateCode.toLowerCase().includes(txt)||r.code.toLowerCase().includes(txt);var matchStatus=!st||r.conclusion===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchOnboarding').addEventListener('click',function(){var f=document.getElementById('onboardSearchFrom').value,t=document.getElementById('onboardSearchTo').value;var txt=(document.getElementById('onboardSearchText').value||'').trim().toLowerCase();var st=document.getElementById('onboardSearchStatus').value;renderOnboardingTable(onboardingRecords.filter(function(ob){var ts=(ob.startDate||ob.timestamp||'').substring(0,10);var matchDate=(!f||ts>=f)&&(!t||ts<=t);var matchText=!txt||ob.fullName.toLowerCase().includes(txt)||ob.code.toLowerCase().includes(txt);var matchStatus=!st||(ob.status||'Đang thử việc')===st;return matchDate&&matchText&&matchStatus}))});

document.getElementById('btnSearchHistory').addEventListener('click',function(){var f=document.getElementById('historySearchFrom').value,t=document.getElementById('historySearchTo').value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});

// Export Excel
document.getElementById('btnExportRecruitment').addEventListener('click',function(){exportTableToExcel('recruitmentDataTable','NhuCauTuyenDung')});
document.getElementById('btnExportCandidate').addEventListener('click',function(){exportTableToExcel('candidateDataTable','ThongTinUngVien')});
document.getElementById('btnExportInterview').addEventListener('click',function(){exportTableToExcel('interviewDataTable','LichPhongVan')});
document.getElementById('btnExportResult').addEventListener('click',function(){exportTableToExcel('resultDataTable','KetQuaPhongVan')});
document.getElementById('btnExportOnboarding').addEventListener('click',function(){exportTableToExcel('onboardingDataTable','NhanVienMoi')});
document.getElementById('btnExportHistory').addEventListener('click',function(){if(!isAdmin()){alert('Không có quyền!');return}exportTableToExcel('historyDataTable','LichSuThaoTac')});

document.addEventListener("DOMContentLoaded",function(){initApp()});
<\/script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
 if (handleApi(req, res)) return;
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
  console.log('Onboarding: ' + database.onboardingRecords.length);
  console.log('=================================');
 });
}).catch(function(err) {
 console.error('Loi khoi dong:', err.message);
 server.listen(PORT, function() {
  console.log('Server running on port ' + PORT + ' (NO DATA)');
 });
});