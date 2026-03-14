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
 interviewFormCounter: 1
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
 console.log('Bin ID: ' + JSONBIN_BIN_ID);
 console.log('API Key exists: ' + (JSONBIN_API_KEY ? 'YES' : 'NO'));
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
 if (!database.counters) database.counters = { recruitmentRequestCounter: 1, candidateCounter: 1, interviewFormCounter: 1 };
 isDataLoaded = true;
 console.log('=== DOC JSONBIN THANH CONG ===');
 console.log('recruitmentRequests: ' + database.recruitmentRequests.length);
 console.log('candidates: ' + database.candidates.length);
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
.btn-action{background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff}
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
<div class="form-row"><div class="form-group"><label>Mã nhu cầu tuyển dụng *</label><input type="text" id="candRecruitCode" placeholder="VD: P00001"></div>
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
<div class="checkbox-group"><label><input type="checkbox" name="candSource" value="Facebook"> Facebook</label><label><input type="checkbox" name="candSource" value="Người quen"> Người quen</label><label><input type="checkbox" name="candSource" value="Biển quảng cáo"> Biển quảng cáo</label><label><input type="checkbox" name="candSource" value="Đơn vị tư vấn việc làm"> Đơn vị tư vấn việc làm</label><label><input type="checkbox" name="candSource" value="Website công ty"> Website công ty</label><label><input type="checkbox" name="candSource" value="Khác"> Khác</label></div></div>
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
var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1;
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
function canEdit(record){return getEditCount(record)<MAX_EDIT_COUNT}
function canDelete(record){if(!record.editHistory||record.editHistory.length===0)return true;var lastEdit=record.editHistory[record.editHistory.length-1];var hoursSinceLastEdit=(new Date()-new Date(lastEdit.timestamp))/(1000*60*60);return hoursSinceLastEdit<DELETE_LOCK_HOURS}
function getEditCountBadge(record){var count=getEditCount(record);var cls=count===0?'edit-count-ok':(count<MAX_EDIT_COUNT?'edit-count-warn':'edit-count-max');return'<span class="edit-count-badge '+cls+'">'+count+'/'+MAX_EDIT_COUNT+' lần sửa</span>'}
function renderEditHistoryHTML(record){if(!record.editHistory||record.editHistory.length===0)return'';var h='<div class="edit-history-section"><h3>LỊCH SỬ CHỈNH SỬA '+getEditCountBadge(record)+'</h3>';record.editHistory.forEach(function(edit,idx){h+='<div class="edit-history-item">';h+='<strong>Lần sửa '+(idx+1)+'/'+MAX_EDIT_COUNT+'</strong> | ';h+='<span style="color:#1565c0">'+formatDateTime(edit.timestamp)+'</span><br>';h+='Người sửa: '+edit.employeeName+' ('+edit.employeeId+') - '+edit.employeePosition+' - '+edit.employeeDept;if(edit.changes){h+='<br>Thay đổi: '+edit.changes}h+='</div>'});if(getEditCount(record)>=MAX_EDIT_COUNT){h+='<div style="color:#c62828;font-weight:700;margin-top:8px">Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần). Không thể sửa thêm.</div>'}if(record.editHistory.length>0){var lastEdit=record.editHistory[record.editHistory.length-1];var hoursSince=(new Date()-new Date(lastEdit.timestamp))/(1000*60*60);if(hoursSince<DELETE_LOCK_HOURS){var remainHours=Math.ceil(DELETE_LOCK_HOURS-hoursSince);h+='<div style="color:#1565c0;font-weight:600;margin-top:8px">Không thể xóa trong '+remainHours+' giờ tiếp theo (kể từ lần sửa cuối).</div>'}}h+='</div>';return h}
var interviewers=[{code:'268493',name:'NGUYỄN VĂN MINH',position:'Trưởng phòng',department:'Hành chính nhân sự'},{code:'NV002',name:'TRẦN THỊ LAN',position:'Trưởng bộ phận',department:'Sản xuất 1'},{code:'NV003',name:'LÊ VĂN HẢI',position:'Trưởng nhóm',department:'Kỹ thuật 1'},{code:'NV004',name:'PHẠM THỊ HƯƠNG',position:'Trưởng phòng',department:'Kiểm soát chất lượng 1'},{code:'NV005',name:'HOÀNG VĂN ĐỨC',position:'Trưởng bộ phận',department:'Bảo trì bảo dưỡng 1'},{code:'NV006',name:'VŨ THỊ MAI',position:'Trưởng nhóm',department:'QA'},{code:'NV007',name:'ĐẶNG VĂN TÚ',position:'Nhân viên',department:'IT (hệ thống)'}];
var departments=['Sản xuất 1','Sản xuất 2.1','Sản xuất 2.2','Sản xuất 2.2 M&E','Sản xuất 3.345','Sản xuất 3.6','Sản xuất 4','Bảo trì bảo dưỡng 1','Kỹ thuật 1','Bảo trì bảo dưỡng 2','Kỹ thuật 2','Kiểm soát chất lượng 1','Kiểm soát chất lượng 2','QA','Kiểm tra 1','Kiểm tra 2','Phân tích','EHS','Hỗ trợ sản xuất','Kế toán','Hành chính nhân sự','IT (hệ thống)'];
var levels=['Công nhân','Trợ lý','Nhân viên','Kỹ sư','Trưởng nhóm','Trưởng bộ phận','Trưởng phòng'];
var educationLevels=['THCS','THPT','Trung cấp','Cao đẳng','Đại học','Thạc sĩ','Tiến sĩ'];
var currentUser=null,clockInterval=null;
function loadDataFromServer(){
 return fetch('/api/data')
 .then(function(response){return response.json()})
 .then(function(data){
 if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;
 if(data.candidates)candidates=data.candidates;
 if(data.interviews)interviews=data.interviews;
 if(data.interviewResults)interviewResults=data.interviewResults;
 if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;
 if(data.history)actionHistory=data.history;
 if(data.counters){
 recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;
 candidateCounter=data.counters.candidateCounter||1;
 interviewFormCounter=data.counters.interviewFormCounter||1;
 }
 console.log('Đã tải dữ liệu từ server');
 })
 .catch(function(err){console.error('Lỗi tải dữ liệu:',err)});
}
function saveDataToServer(){
 var payload={
 recruitmentRequests:recruitmentRequests,
 candidates:candidates,
 interviews:interviews,
 interviewResults:interviewResults,
 onboardingRecords:onboardingRecords,
 history:actionHistory,
 counters:{
 recruitmentRequestCounter:recruitmentRequestCounter,
 candidateCounter:candidateCounter,
 interviewFormCounter:interviewFormCounter
 }
 };
 fetch('/api/data',{
 method:'POST',
 headers:{'Content-Type':'application/json'},
 body:JSON.stringify(payload)
 })
 .then(function(response){return response.json()})
 .then(function(result){console.log('Đã lưu:',result.message)})
 .catch(function(err){console.error('Lỗi lưu:',err)});
}
function isAdmin(){
 if(!currentUser) return false;
 return currentUser.position === 'Trưởng phòng' && currentUser.department === 'Hành chính nhân sự';
}
function updateAdminVisibility(){var btnHistory=document.getElementById('btnGoHistory');if(isAdmin()){btnHistory.style.display='block'}else{btnHistory.style.display='none'}}
function showView(id){document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});var t=document.getElementById(id);if(t)t.classList.add('active')}
function goBack(id){showView(id)}
function generateRecruitmentCode(){return'P'+String(recruitmentRequestCounter++).padStart(5,'0')}
function generateCandidateCode(){return'C'+String(candidateCounter++).padStart(5,'0')}
function generateInterviewFormCode(){return'V'+String(interviewFormCounter++).padStart(5,'0')}
function formatDate(d){if(!d)return'';var dt=new Date(d);return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
function formatDateTime(d){if(!d)return'';var dt=new Date(d);return formatDate(d)+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')}
function getNow(){return new Date().toISOString()}
function updateClock(){var n=new Date();var el=document.getElementById('barClock');if(el)el.textContent=String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear()+' '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')}
function populateSelect(id,opts,ph){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">-- '+(ph||'Chọn')+' --</option>';opts.forEach(function(o){var opt=document.createElement('option');opt.value=o;opt.textContent=o;s.appendChild(opt)})}
function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}
function getCheckedValues(name){var r=[];document.querySelectorAll('input[name="'+name+'"]:checked').forEach(function(cb){r.push(cb.value)});return r}
function setCheckedValues(name,vals){document.querySelectorAll('input[name="'+name+'"]').forEach(function(cb){cb.checked=vals.indexOf(cb.value)!==-1})}
function getUserStamp(){if(!currentUser)return{employeeId:'',employeeName:'',employeePosition:'',employeeDept:'',timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}
function operatorInfo(r){return r.employeeName+' ('+r.employeeId+')'}
function operatorFull(r){return r.employeeName+' ('+r.employeeId+') - '+r.employeePosition+' - '+r.employeeDept}
function na(v){return v||'Không có'}
function resetForm(ids){ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==='checkbox'||el.type==='radio')el.checked=false;else if(el.tagName==='SELECT')el.selectedIndex=0;else el.value=''})}
function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||'',employeeId:currentUser?currentUser.id:'',employeeName:currentUser?currentUser.name:'',employeePosition:currentUser?currentUser.position:'',employeeDept:currentUser?currentUser.department:'',timestamp:getNow()});saveDataToServer()}
function getHiredCount(recCode){var c=0;onboardingRecords.forEach(function(ob){var cand=candidates.find(function(x){return x.code===ob.candidateCode});if(cand&&cand.recruitCode===recCode)c++});return c}
function getRemainingQuantity(rec){return Math.max(0,rec.quantity-getHiredCount(rec.code))}
function validateLogin(){var e=[];var id=document.getElementById('loginEmpId').value.trim();var name=document.getElementById('loginEmpName').value.trim();if(!id)e.push('Mã nhân viên');if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('loginEmpPosition').value)e.push('Chức vụ');if(!document.getElementById('loginEmpDept').value)e.push('Phòng ban');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateRecruitmentForm(){var e=[];if(!document.getElementById('recDepartment').value)e.push('Phòng ban');var p=document.getElementById('recProposer').value.trim();if(!p)e.push('Người đề xuất');if(p&&p!==p.toUpperCase())e.push('Người đề xuất phải IN HOA');if(!document.getElementById('recPosition').value.trim())e.push('Vị trí tuyển dụng');if(!document.getElementById('recLevel').value)e.push('Cấp bậc');if(!document.getElementById('recQuantity').value||parseInt(document.getElementById('recQuantity').value)<1)e.push('Số lượng');if(getCheckedValues('recReason').length===0)e.push('Lý do tuyển dụng');if(!document.getElementById('recNeedDate').value)e.push('Thời gian cần nhân sự');if(!document.getElementById('recReportTo').value.trim())e.push('Report to');if(getCheckedValues('recWorkplace').length===0)e.push('Địa điểm làm việc');if(getCheckedValues('recWorktime').length===0)e.push('Thời gian làm việc');if(!document.getElementById('recJobDesc').value.trim())e.push('Mô tả công việc');if(!document.getElementById('recEducation').value)e.push('Trình độ học vấn');if(!document.getElementById('recDeadline').value)e.push('Deadline tuyển dụng');if(e.length>0){alert('Vui lòng điền:\\n- '+e.join('\\n- '));return false}return true}
function validateCandidateForm(){var e=[];var name=document.getElementById('candFullName').value.trim();var phone=document.getElementById('candPhone').value.trim();var rc=document.getElementById('candRecruitCode').value.trim();var fr=recruitmentRequests.find(function(r){return r.code===rc});if(!rc)e.push('Mã nhu cầu tuyển dụng');else if(!fr)e.push('Mã nhu cầu tuyển dụng không tồn tại');if(!document.getElementById('candDepartment').value)e.push('Bộ phận');if(!document.getElementById('candInterviewDate').value)e.push('Ngày phỏng vấn');if(!name)e.push('Họ và tên');if(name&&name!==name.toUpperCase())e.push('Họ và tên phải IN HOA');if(!document.getElementById('candDob').value)e.push('Ngày sinh');if(!document.getElementById('candGender').value)e.push('Giới tính');if(!document.getElementById('candEthnicity').value.trim())e.push('Dân tộc');if(!document.getElementById('candMarital').value)e.push('Tình trạng kết hôn');if(!document.getElementById('candCCCD').value.trim())e.push('Số căn cước công dân');if(!document.getElementById('candCCCDDate').value)e.push('Ngày cấp');if(!document.getElementById('candCCCDPlace').value.trim())e.push('Nơi cấp');if(!phone)e.push('Số điện thoại');else if(!/^0\\d{9}$/.test(phone))e.push('Số điện thoại sai định dạng');else{var dup=candidates.find(function(c){return c.phone===phone&&(!editingCandidateCode||c.code!==editingCandidateCode)});if(dup)e.push('Số điện thoại đã tồn tại')}if(!document.getElementById('candPermanentAddr').value.trim())e.push('Địa chỉ thường trú');if(!document.getElementById('candEducationLevel').value)e.push('Trình độ');if(!document.getElementById('candPrevInterview').value)e.push('Đã phỏng vấn chưa');if(!document.getElementById('candAvailability').value)e.push('Thời gian đi làm');if(!document.getElementById('candWish1').value.trim())e.push('Nguyện vọng 1');if(!document.getElementById('candCommitment').checked)e.push('Cam kết thông tin');if(fr&&!editingCandidateCode){var lvl=fr.level;if(lvl==='Trợ lý'||lvl==='Nhân viên'||lvl==='Kỹ sư'){var fi=document.getElementById('candCVFile');if(!fi.files||fi.files.length===0)e.push('Upload CV bắt buộc cho vị trí '+lvl)}}if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateInterviewForm(){var e=[];if(!document.getElementById('ivCandidateSelect').value)e.push('Chọn ứng viên');var ic=document.getElementById('ivInterviewerCode').value.trim();if(!ic)e.push('Mã nhân viên người phỏng vấn');else{var iv=interviewers.find(function(i){return i.code===ic});if(!iv)e.push('Mã nhân viên không tồn tại');else{if(['Trưởng nhóm','Trưởng bộ phận','Trưởng phòng'].indexOf(iv.position)===-1)e.push('Người phỏng vấn phải từ Trưởng nhóm trở lên')}}if(!document.getElementById('ivPosition').value)e.push('Vị trí phỏng vấn');if(!document.getElementById('ivDate').value)e.push('Ngày phỏng vấn');if(!document.getElementById('ivTime').value)e.push('Giờ phỏng vấn');if(!document.getElementById('ivLocation').value)e.push('Địa điểm');if(getCheckedValues('ivTest').length===0)e.push('Bài kiểm tra');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateInterviewResultForm(el){var e=[];var ok=true;el.querySelectorAll('.score-input').forEach(function(s){var v=parseFloat(s.value);if(isNaN(v)||v<0||v>5)ok=false});if(!ok)e.push('Điểm phải từ 0 đến 5');if(!el.querySelector('input[name="resultSuitability"]:checked'))e.push('Mức độ phù hợp');if(!el.querySelector('input[name="resultConclusion"]:checked'))e.push('Kết luận');if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function validateOnboardingForm(el){var e=[];el.querySelectorAll('[data-required="true"]').forEach(function(inp){if(!inp.value.trim())e.push(inp.getAttribute('data-label')||'Trường bắt buộc')});var ph=el.querySelector('.onboard-emergency-phone');if(ph&&ph.value.trim()&&!/^0\\d{9}$/.test(ph.value.trim()))e.push('Số điện thoại khẩn cấp sai định dạng');var bhxhSel=el.querySelector('.onboard-bhxh');if(bhxhSel&&bhxhSel.value==='Rồi'){var bn=el.querySelector('.onboard-bhxh-number');if(bn&&!bn.value.trim())e.push('Số sổ bảo hiểm xã hội')}if(e.length>0){alert('Vui lòng kiểm tra:\\n- '+e.join('\\n- '));return false}return true}
function checkOnboardingExpired(){var now=new Date();interviewResults.forEach(function(r){if(r.conclusion==='Đề xuất tuyển'){var diff=(now-new Date(r.timestamp))/(1000*60*60*24);if(diff>30&&!onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode}))r.expiredStatus='Không xác nhận nhận việc'}})}
function printContent(html){var pa=document.getElementById('printArea');pa.innerHTML=html;pa.style.display='block';window.print();pa.style.display='none'}
function handleCVSectionVisibility(){var rc=document.getElementById('candRecruitCode').value.trim();var rec=recruitmentRequests.find(function(r){return r.code===rc});var sec=document.getElementById('candCVSection');if(rec&&(rec.level==='Trợ lý'||rec.level==='Nhân viên'||rec.level==='Kỹ sư'))sec.style.display='block';else sec.style.display='none'}
function collectRecFormData(){return{department:document.getElementById('recDepartment').value,proposer:document.getElementById('recProposer').value.trim(),position:document.getElementById('recPosition').value.trim(),level:document.getElementById('recLevel').value,quantity:parseInt(document.getElementById('recQuantity').value),reasons:getCheckedValues('recReason'),needDate:document.getElementById('recNeedDate').value,reportTo:document.getElementById('recReportTo').value.trim(),workplaces:getCheckedValues('recWorkplace'),worktimes:getCheckedValues('recWorktime'),environment:document.getElementById('recEnvironment').value.trim(),jobDesc:document.getElementById('recJobDesc').value.trim(),benefits:document.getElementById('recBenefits').value.trim(),salaryRange:document.getElementById('recSalaryRange').value.trim(),education:document.getElementById('recEducation').value,major:document.getElementById('recMajor').value.trim(),experience:document.getElementById('recExperience').value.trim(),techSkill:document.getElementById('recTechSkill').value.trim(),softSkill:document.getElementById('recSoftSkill').value.trim(),language:document.getElementById('recLanguage').value.trim(),certificate:document.getElementById('recCertificate').value.trim(),deadline:document.getElementById('recDeadline').value}}
function fillRecForm(r){setSelectValue('recDepartment',r.department);document.getElementById('recProposer').value=r.proposer;document.getElementById('recPosition').value=r.position;setSelectValue('recLevel',r.level);document.getElementById('recQuantity').value=r.quantity;setCheckedValues('recReason',r.reasons);document.getElementById('recNeedDate').value=r.needDate;document.getElementById('recReportTo').value=r.reportTo;setCheckedValues('recWorkplace',r.workplaces);setCheckedValues('recWorktime',r.worktimes);document.getElementById('recEnvironment').value=r.environment||'';document.getElementById('recJobDesc').value=r.jobDesc;document.getElementById('recBenefits').value=r.benefits||'';document.getElementById('recSalaryRange').value=r.salaryRange||'';setSelectValue('recEducation',r.education);document.getElementById('recMajor').value=r.major||'';document.getElementById('recExperience').value=r.experience||'';document.getElementById('recLanguage').value=r.language||'';document.getElementById('recTechSkill').value=r.techSkill||'';document.getElementById('recSoftSkill').value=r.softSkill||'';document.getElementById('recCertificate').value=r.certificate||'';document.getElementById('recDeadline').value=r.deadline}
function collectCandFormData(){var exps=[];document.querySelectorAll('#experienceRows .exp-row').forEach(function(row){var inp=row.querySelectorAll('input');if(inp[0].value.trim()||inp[1].value.trim())exps.push({period:inp[0].value.trim(),job:inp[1].value.trim(),company:inp[2].value.trim(),location:inp[3].value.trim(),salary:inp[4].value.trim()})});return{recruitCode:document.getElementById('candRecruitCode').value.trim(),department:document.getElementById('candDepartment').value,interviewDate:document.getElementById('candInterviewDate').value,fullName:document.getElementById('candFullName').value.trim(),dob:document.getElementById('candDob').value,gender:document.getElementById('candGender').value,ethnicity:document.getElementById('candEthnicity').value.trim(),marital:document.getElementById('candMarital').value,children:document.getElementById('candChildren').value,cccd:document.getElementById('candCCCD').value.trim(),cccdDate:document.getElementById('candCCCDDate').value,cccdPlace:document.getElementById('candCCCDPlace').value.trim(),cccdExpiry:document.getElementById('candCCCDExpiry').value,phone:document.getElementById('candPhone').value.trim(),relativePhone:document.getElementById('candRelativePhone').value.trim(),permanentAddr:document.getElementById('candPermanentAddr').value.trim(),tempAddr:document.getElementById('candTempAddr').value.trim(),height:document.getElementById('candHeight').value,weight:document.getElementById('candWeight').value,shoeSize:document.getElementById('candShoeSize').value.trim(),educationLevel:document.getElementById('candEducationLevel').value,schoolName:document.getElementById('candSchoolName').value.trim(),gradYear:document.getElementById('candGradYear').value.trim(),major:document.getElementById('candMajor').value.trim(),experiences:exps,prevInterview:document.getElementById('candPrevInterview').value,availability:document.getElementById('candAvailability').value,startDate:document.getElementById('candStartDate').value,smoking:document.getElementById('candSmoking').value,disease:document.getElementById('candDisease').value,sources:getCheckedValues('candSource'),bus:document.getElementById('candBus').value,busStop:document.getElementById('candBusStop').value.trim(),wish1:document.getElementById('candWish1').value.trim(),wish2:document.getElementById('candWish2').value.trim(),wish3:document.getElementById('candWish3').value.trim()}}
function fillCandForm(c){document.getElementById('candRecruitCode').value=c.recruitCode;setSelectValue('candDepartment',c.department);document.getElementById('candInterviewDate').value=c.interviewDate;document.getElementById('candFullName').value=c.fullName;document.getElementById('candDob').value=c.dob;setSelectValue('candGender',c.gender);document.getElementById('candEthnicity').value=c.ethnicity;setSelectValue('candMarital',c.marital);document.getElementById('candChildren').value=c.children;document.getElementById('candCCCD').value=c.cccd;document.getElementById('candCCCDDate').value=c.cccdDate;document.getElementById('candCCCDPlace').value=c.cccdPlace;document.getElementById('candCCCDExpiry').value=c.cccdExpiry||'';document.getElementById('candPhone').value=c.phone;document.getElementById('candRelativePhone').value=c.relativePhone||'';document.getElementById('candPermanentAddr').value=c.permanentAddr;document.getElementById('candTempAddr').value=c.tempAddr||'';document.getElementById('candHeight').value=c.height||'';document.getElementById('candWeight').value=c.weight||'';document.getElementById('candShoeSize').value=c.shoeSize||'';setSelectValue('candEducationLevel',c.educationLevel);document.getElementById('candSchoolName').value=c.schoolName||'';document.getElementById('candGradYear').value=c.gradYear||'';document.getElementById('candMajor').value=c.major||'';var expContainer=document.getElementById('experienceRows');expContainer.innerHTML='';if(c.experiences&&c.experiences.length>0){c.experiences.forEach(function(exp){var row=document.createElement('div');row.className='exp-row';row.innerHTML='<input type="text" value="'+na(exp.period)+'"><input type="text" value="'+na(exp.job)+'"><input type="text" value="'+na(exp.company)+'"><input type="text" value="'+na(exp.location)+'"><input type="text" value="'+na(exp.salary)+'">';expContainer.appendChild(row)})}else{expContainer.innerHTML='<div class="exp-row"><input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương"></div>'}setSelectValue('candPrevInterview',c.prevInterview);setSelectValue('candAvailability',c.availability);document.getElementById('candStartDate').value=c.startDate||'';setSelectValue('candSmoking',c.smoking);setSelectValue('candDisease',c.disease);setCheckedValues('candSource',c.sources||[]);setSelectValue('candBus',c.bus);document.getElementById('candBusStop').value=c.busStop||'';document.getElementById('candBusDetail').style.display=c.bus==='Có'?'flex':'none';document.getElementById('candWish1').value=c.wish1;document.getElementById('candWish2').value=c.wish2||'';document.getElementById('candWish3').value=c.wish3||'';document.getElementById('candCommitment').checked=true;handleCVSectionVisibility()}

// ===== CẬP NHẬT: BẢNG NHU CẦU TUYỂN DỤNG - Thao tác = "Tải lên thông tin ứng viên" =====
function renderRecruitmentTable(filtered){var data=filtered||recruitmentRequests;var c=document.getElementById('recruitmentTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table id="recruitmentDataTable"><thead><tr><th>STT</th><th>Mã nhu cầu tuyển dụng</th><th>Phòng ban</th><th>Vị trí</th><th>Cấp bậc</th><th>Số lượng cần</th><th>Đã tuyển</th><th>Còn lại</th><th>Lý do</th><th>Mức lương</th><th>Deadline</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(r,i){var hired=getHiredCount(r.code);var remain=Math.max(0,r.quantity-hired);h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+r.code+'" data-type="recruitment">'+r.code+'</span></td><td>'+r.department+'</td><td>'+r.position+'</td><td>'+r.level+'</td><td>'+r.quantity+'</td><td>'+hired+'</td><td>'+(remain>0?'<span class="badge badge-orange">'+remain+'</span>':'<span class="badge badge-green">Đủ</span>')+'</td><td>'+r.reasons.join(', ')+'</td><td>'+na(r.salaryRange)+'</td><td>'+formatDate(r.deadline)+'</td><td>'+getEditCountBadge(r)+'</td><td>'+operatorInfo(r)+'</td><td>'+formatDateTime(r.timestamp)+'</td>';h+='<td>'+(remain>0?'<button class="btn btn-action btn-sm btn-upload-candidate" data-code="'+r.code+'">Tải lên thông tin ứng viên</button>':'<span class="badge badge-green">Đã đủ</span>')+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.link-code[data-type="recruitment"]').forEach(function(lk){lk.addEventListener('click',function(){renderRecruitmentDetail(this.getAttribute('data-code'));showView('recruitmentDetailView')})});c.querySelectorAll('.btn-upload-candidate').forEach(function(b){b.addEventListener('click',function(){openCandidateFormFromRecruitment(this.getAttribute('data-code'))})})}

// Hàm mở form ứng viên với mã nhu cầu tuyển dụng đã điền sẵn
function openCandidateFormFromRecruitment(recCode){var rec=recruitmentRequests.find(function(r){return r.code===recCode});if(!rec)return;editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';resetForm(['candInterviewDate','candFullName','candDob','candEthnicity','candCCCD','candCCCDDate','candCCCDPlace','candCCCDExpiry','candPhone','candRelativePhone','candPermanentAddr','candTempAddr','candHeight','candWeight','candShoeSize','candSchoolName','candGradYear','candMajor','candStartDate','candWish1','candWish2','candWish3','candBusStop']);document.getElementById('candGender').selectedIndex=0;document.getElementById('candMarital').selectedIndex=0;document.getElementById('candEducationLevel').selectedIndex=0;document.getElementById('candPrevInterview').selectedIndex=0;document.getElementById('candAvailability').selectedIndex=0;document.getElementById('candSmoking').selectedIndex=0;document.getElementById('candDisease').selectedIndex=0;document.getElementById('candBus').selectedIndex=0;document.getElementById('candChildren').value='0';document.getElementById('candCommitment').checked=false;document.querySelectorAll('input[name="candSource"]').forEach(function(cb){cb.checked=false});document.getElementById('candCVFile').value='';document.getElementById('candBusDetail').style.display='none';document.getElementById('experienceRows').innerHTML='<div class="exp-row"><input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương"></div>';document.getElementById('candRecruitCode').value=recCode;setSelectValue('candDepartment',rec.department);handleCVSectionVisibility();showView('candidateFormView')}

function renderRecruitmentDetail(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;var hired=getHiredCount(r.code);var remain=Math.max(0,r.quantity-hired);var c=document.getElementById('recruitmentDetailContent');var h='<div class="pdf-preview"><h2>PHIẾU ĐỀ XUẤT NHU CẦU TUYỂN DỤNG</h2>';h+='<div class="info-row"><span class="info-label">Mã nhu cầu tuyển dụng:</span><span class="info-value">'+r.code+'</span></div>';h+='<h3>I. THÔNG TIN CHUNG</h3>';var fields=[['Phòng ban yêu cầu',r.department],['Người đề xuất',r.proposer],['Vị trí tuyển dụng',r.position],['Cấp bậc',r.level],['Số lượng cần tuyển',r.quantity],['Đã tuyển thành công',hired],['Còn cần tuyển',remain],['Lý do tuyển dụng',r.reasons.join(', ')],['Thời gian cần nhân sự',formatDate(r.needDate)]];fields.forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});h+='<h3>II. THÔNG TIN VỊ TRÍ</h3>';[['Report to',r.reportTo],['Địa điểm làm việc',r.workplaces.join(', ')],['Thời gian làm việc',r.worktimes.join(', ')],['Môi trường làm việc',na(r.environment)],['Mô tả công việc',r.jobDesc],['Chế độ phúc lợi',na(r.benefits)],['Mức lương đề xuất',na(r.salaryRange)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});h+='<h3>III. YÊU CẦU ỨNG VIÊN</h3>';[['Trình độ học vấn',r.education],['Chuyên ngành',na(r.major)],['Kinh nghiệm tối thiểu',na(r.experience)],['Kỹ năng chuyên môn',na(r.techSkill)],['Kỹ năng mềm',na(r.softSkill)],['Ngoại ngữ',na(r.language)],['Chứng chỉ',na(r.certificate)],['Deadline tuyển dụng',formatDate(r.deadline)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});h+='<br><div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorFull(r)+'</span></div>';h+='<div class="info-row"><span class="info-label">Thời gian tạo:</span><span class="info-value">'+formatDateTime(r.timestamp)+'</span></div>';h+='<div class="signature-area"><div><div class="sig-title">Người đề xuất</div><div>(Ký, ghi rõ họ tên)</div></div><div><div class="sig-title">Trưởng phòng nhân sự</div><div>(Ký, ghi rõ họ tên)</div></div><div><div class="sig-title">Ban Giám đốc</div><div>(Ký, ghi rõ họ tên)</div></div></div>';h+=renderEditHistoryHTML(r);h+='</div>';c.innerHTML=h;c.setAttribute('data-code',code);var editBtn=document.getElementById('btnEditRecruitment');var deleteBtn=document.getElementById('btnDeleteRecruitment');if(!canEdit(r)){editBtn.classList.add('btn-disabled');editBtn.disabled=true}else{editBtn.classList.remove('btn-disabled');editBtn.disabled=false}if(!canDelete(r)){deleteBtn.classList.add('btn-disabled');deleteBtn.disabled=true}else{deleteBtn.classList.remove('btn-disabled');deleteBtn.disabled=false}}
function startEditRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canEdit(r)){alert('Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần).');return}if(!acquireEditLock('recruitment',code))return;editingRecruitmentCode=code;document.getElementById('recruitmentFormTitle').textContent='Sửa nhu cầu tuyển dụng - '+code;var infoDiv=document.getElementById('recruitmentEditInfo');infoDiv.style.display='block';infoDiv.innerHTML='<div class="lock-info">Đang sửa lần '+(getEditCount(r)+1)+'/'+MAX_EDIT_COUNT+' | '+getEditCountBadge(r)+'</div>';fillRecForm(r);showView('recruitmentFormView')}
function deleteRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canDelete(r)){var lastEdit=r.editHistory[r.editHistory.length-1];var hoursLeft=Math.ceil(DELETE_LOCK_HOURS-(new Date()-new Date(lastEdit.timestamp))/(1000*60*60));alert('Không thể xóa! Cần chờ '+hoursLeft+' giờ.');return}if(!confirm('Bạn có chắc muốn xóa nhu cầu tuyển dụng '+code+'?'))return;var idx=recruitmentRequests.findIndex(function(r){return r.code===code});if(idx===-1)return;recruitmentRequests.splice(idx,1);addHistory('Xóa','Nhu cầu tuyển dụng',code,'Đã xóa nhu cầu tuyển dụng '+code);alert('Đã xóa '+code);renderRecruitmentTable()}

// ===== CẬP NHẬT: BẢNG THÔNG TIN ỨNG VIÊN - Thao tác = "Đặt lịch phỏng vấn" =====
function renderCandidateTable(filtered){var data=filtered||candidates;var c=document.getElementById('candidateTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table id="candidateDataTable"><thead><tr><th>STT</th><th>Mã UV</th><th>Họ và tên</th><th>Ngày sinh</th><th>Giới tính</th><th>SĐT</th><th>Trình độ</th><th>NV1</th><th>Mã nhu cầu tuyển dụng</th><th>Bộ phận</th><th style="min-width:150px">CV</th><th>Lần sửa</th><th>Người thao tác</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(c2,i){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var hasInterview=!!iv;h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+c2.code+'" data-type="candidate">'+c2.code+'</span></td><td>'+c2.fullName+'</td><td>'+formatDate(c2.dob)+'</td><td>'+c2.gender+'</td><td>'+c2.phone+'</td><td>'+c2.educationLevel+'</td><td>'+c2.wish1+'</td>';h+='<td><span class="link-code" data-code="'+c2.recruitCode+'" data-type="recruitment">'+c2.recruitCode+'</span></td><td>'+c2.department+'</td>';h+='<td class="cv-cell" style="min-width:150px;white-space:normal;word-break:break-all">'+(c2.cvName?'<span class="link-code" data-cv="'+c2.code+'">'+c2.cvName+'</span>':'Không có')+'</td>';h+='<td>'+getEditCountBadge(c2)+'</td>';h+='<td>'+operatorInfo(c2)+'</td><td>'+formatDateTime(c2.timestamp)+'</td>';h+='<td>';if(!hasInterview){h+='<button class="btn btn-action btn-sm btn-schedule-from-cand" data-code="'+c2.code+'">Đặt lịch phỏng vấn</button>'}else{h+='<span class="badge badge-green">Đã đặt lịch ('+iv.code+')</span>'}h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.link-code[data-type="candidate"]').forEach(function(lk){lk.addEventListener('click',function(){showCandidateDetailView(this.getAttribute('data-code'))})});c.querySelectorAll('.link-code[data-type="recruitment"]').forEach(function(lk){lk.addEventListener('click',function(){renderRecruitmentDetail(this.getAttribute('data-code'));showView('recruitmentDetailView')})});c.querySelectorAll('.link-code[data-cv]').forEach(function(lk){lk.addEventListener('click',function(){var cd=candidates.find(function(c){return c.code===lk.getAttribute('data-cv')});if(cd&&cd.cvURL)window.open(cd.cvURL,'_blank')})});c.querySelectorAll('.btn-schedule-from-cand').forEach(function(b){b.addEventListener('click',function(){openScheduleInterviewForm(this.getAttribute('data-code'))})})}

function showCandidateDetailView(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;var ct=document.getElementById('candidateDetailContent');var h='<div class="pdf-preview"><h2>PHIẾU THÔNG TIN ỨNG VIÊN</h2>';h+='<div class="info-row"><span class="info-label">Mã ứng viên:</span><span class="info-value">'+c.code+'</span></div>';h+='<div class="info-row"><span class="info-label">Mã nhu cầu tuyển dụng:</span><span class="info-value">'+c.recruitCode+'</span></div>';h+='<div class="info-row"><span class="info-label">Bộ phận thi tuyển:</span><span class="info-value">'+c.department+'</span></div>';h+='<h3>1. THÔNG TIN CÁ NHÂN</h3>';[['Họ và tên',c.fullName],['Ngày sinh',formatDate(c.dob)],['Giới tính',c.gender],['Dân tộc',c.ethnicity],['Tình trạng kết hôn',c.marital],['Số con',c.children],['Căn cước công dân',c.cccd],['Ngày cấp',formatDate(c.cccdDate)],['Nơi cấp',c.cccdPlace],['Số điện thoại',c.phone],['Địa chỉ thường trú',c.permanentAddr]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});h+='<h3>2. TRÌNH ĐỘ & KINH NGHIỆM</h3>';[['Trình độ học vấn',c.educationLevel],['Tên trường',na(c.schoolName)],['Chuyên ngành',na(c.major)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});if(c.experiences&&c.experiences.length>0){h+='<table><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Đơn vị</th><th>Địa điểm</th><th>Mức lương</th></tr></thead><tbody>';c.experiences.forEach(function(exp){h+='<tr><td>'+na(exp.period)+'</td><td>'+na(exp.job)+'</td><td>'+na(exp.company)+'</td><td>'+na(exp.location)+'</td><td>'+na(exp.salary)+'</td></tr>'});h+='</tbody></table>'}h+='<h3>3. NGUYỆN VỌNG</h3>';[['Nguyện vọng 1',c.wish1],['Nguyện vọng 2',na(c.wish2)],['Nguyện vọng 3',na(c.wish3)]].forEach(function(f){h+='<div class="info-row"><span class="info-label">'+f[0]+':</span><span class="info-value">'+f[1]+'</span></div>'});h+='<br><div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorFull(c)+'</span></div>';h+='<div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">'+formatDateTime(c.timestamp)+'</span></div>';h+=renderEditHistoryHTML(c);h+='</div>';ct.innerHTML=h;ct.setAttribute('data-code',code);showView('candidateDetailView');var editBtn=document.getElementById('btnEditCandidate');var deleteBtn=document.getElementById('btnDeleteCandidate');if(!canEdit(c)){editBtn.classList.add('btn-disabled');editBtn.disabled=true}else{editBtn.classList.remove('btn-disabled');editBtn.disabled=false}if(!canDelete(c)){deleteBtn.classList.add('btn-disabled');deleteBtn.disabled=true}else{deleteBtn.classList.remove('btn-disabled');deleteBtn.disabled=false}}
function startEditCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canEdit(c)){alert('Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần).');return}if(!acquireEditLock('candidate',code))return;editingCandidateCode=code;document.getElementById('candidateFormTitle').textContent='Sửa thông tin ứng viên - '+code;var infoDiv=document.getElementById('candidateEditInfo');infoDiv.style.display='block';infoDiv.innerHTML='<div class="lock-info">Đang sửa lần '+(getEditCount(c)+1)+'/'+MAX_EDIT_COUNT+' | '+getEditCountBadge(c)+'</div>';fillCandForm(c);showView('candidateFormView')}
function deleteCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canDelete(c)){var lastEdit=c.editHistory[c.editHistory.length-1];var hoursLeft=Math.ceil(DELETE_LOCK_HOURS-(new Date()-new Date(lastEdit.timestamp))/(1000*60*60));alert('Không thể xóa! Cần chờ '+hoursLeft+' giờ.');return}if(!confirm('Bạn có chắc muốn xóa ứng viên '+code+'?'))return;var idx=candidates.findIndex(function(c){return c.code===code});if(idx===-1)return;candidates.splice(idx,1);addHistory('Xóa','Ứng viên',code,'Đã xóa ứng viên '+code);alert('Đã xóa '+code);renderCandidateTable()}

// ===== CẬP NHẬT: BẢNG LỊCH PHỎNG VẤN - Thao tác = "Đánh giá kết quả" =====
function renderCandidateTableForInterview(filtered){var data=filtered||candidates;var c=document.getElementById('interviewCandidateTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có ứng viên</p>';return}var h='<table><thead><tr><th>STT</th><th>Mã UV</th><th>Họ và tên</th><th>SĐT</th><th>NV1</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(c2,i){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var rs=iv?interviewResults.find(function(r){return r.interviewCode===iv.code}):null;var st=iv?'<span class="badge badge-green">Đã đặt lịch</span>':'<span class="badge badge-orange">Chưa đặt lịch</span>';h+='<tr><td>'+(i+1)+'</td><td><span class="link-code" data-code="'+c2.code+'" data-type="candidate">'+c2.code+'</span></td><td>'+c2.fullName+'</td><td>'+c2.phone+'</td><td>'+c2.wish1+'</td><td>'+st+'</td><td>';if(!iv){h+='<button class="btn btn-primary btn-sm btn-schedule-iv" data-code="'+c2.code+'">Đặt lịch</button>'}else if(!rs){h+='<button class="btn btn-warning btn-sm btn-evaluate-from-list" data-ivcode="'+iv.code+'">Đánh giá kết quả</button>'}else{h+='<span class="badge badge-green">Đã đánh giá</span>'}h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-schedule-iv').forEach(function(b){b.addEventListener('click',function(){openScheduleInterviewForm(this.getAttribute('data-code'))})});c.querySelectorAll('.link-code[data-type="candidate"]').forEach(function(lk){lk.addEventListener('click',function(){showCandidateDetailView(this.getAttribute('data-code'))})});c.querySelectorAll('.btn-evaluate-from-list').forEach(function(b){b.addEventListener('click',function(){showEvaluationForm(this.getAttribute('data-ivcode'));showView('interviewResultFormView')})})}

function openScheduleInterviewForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;document.getElementById('ivCandidateSelect').innerHTML='<option value="'+cd.code+'">'+cd.code+' - '+cd.fullName+'</option>';var ps=document.getElementById('ivPosition');ps.innerHTML='<option value="">-- Chọn --</option>';recruitmentRequests.forEach(function(r){if(getRemainingQuantity(r)>0){var o=document.createElement('option');o.value=r.position+' ('+r.code+')';o.textContent=r.position+' ('+r.code+') [Còn '+getRemainingQuantity(r)+']';ps.appendChild(o)}});document.getElementById('ivInterviewerCode').value='';document.getElementById('ivInterviewerInfo').style.display='none';document.getElementById('ivDate').value='';document.getElementById('ivTime').value='';document.getElementById('ivLocation').selectedIndex=0;document.querySelectorAll('input[name="ivTest"]').forEach(function(cb){cb.checked=false});showView('scheduleInterviewFormView')}
function renderInterviewExcelTable(){var data=interviews;var c=document.getElementById('interviewExcelTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch</p>';return}var h='<table id="interviewExcelDataTable"><thead><tr><th>STT</th><th>Mã PV</th><th>Mã UV</th><th>Tên UV</th><th>Người PV</th><th>Vị trí</th><th>Ngày giờ</th><th>Địa điểm</th><th>Bài KT</th><th>Người thao tác</th><th>Thời gian</th></tr></thead><tbody>';data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});h+='<tr><td>'+(i+1)+'</td><td>'+iv.code+'</td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.interviewerName+'</td><td>'+iv.position+'</td><td>'+formatDate(iv.date)+' '+iv.time+'</td><td>'+iv.location+'</td><td>'+iv.tests.join(', ')+'</td><td>'+operatorInfo(iv)+'</td><td>'+formatDateTime(iv.timestamp)+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h}

// ===== CẬP NHẬT: BẢNG KẾT QUẢ PHỎNG VẤN - Thao tác = "Thông báo trúng tuyển" =====
function renderResultInterviewTable(filtered){var data=filtered||interviews;var c=document.getElementById('resultInterviewTableContainer');document.getElementById('resultFormContainer').style.display='none';if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có dữ liệu</p>';return}var h='<table><thead><tr><th>STT</th><th>Mã PV</th><th>Mã UV</th><th>Tên UV</th><th>Vị trí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});var rs=interviewResults.find(function(r){return r.interviewCode===iv.code});var st=rs?'<span class="badge badge-green">Đã đánh giá</span>':'<span class="badge badge-orange">Chưa</span>';h+='<tr><td>'+(i+1)+'</td><td>'+iv.code+'</td><td>'+iv.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+iv.position+'</td><td>'+st+'</td><td>';if(!rs){h+='<button class="btn btn-warning btn-sm btn-evaluate" data-ivcode="'+iv.code+'">Đánh giá</button>'}else{h+='<button class="btn btn-info btn-sm btn-view-result" data-ivcode="'+iv.code+'">Xem</button>';if(rs.conclusion==='Đề xuất tuyển'){var ob=onboardingRecords.find(function(o){return o.candidateCode===rs.candidateCode});if(!ob){h+=' <button class="btn btn-success btn-sm btn-offer" data-ivcode="'+iv.code+'">Thông báo trúng tuyển</button>'}else{h+=' <span class="badge badge-green">Đã nhận việc</span>'}}}h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-evaluate').forEach(function(b){b.addEventListener('click',function(){showEvaluationForm(this.getAttribute('data-ivcode'))})});c.querySelectorAll('.btn-view-result').forEach(function(b){b.addEventListener('click',function(){showResultDetailView(this.getAttribute('data-ivcode'))})});c.querySelectorAll('.btn-offer').forEach(function(b){b.addEventListener('click',function(){showOfferForm(this.getAttribute('data-ivcode'))})})}

function showEvaluationForm(ivCode){var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;var cd=candidates.find(function(c){return c.code===iv.candidateCode});var ct=document.getElementById('resultFormContainer');ct.style.display='block';var tc=['Kiến thức chuyên môn','Kinh nghiệm thực tế','Giải quyết vấn đề','Tư duy logic','Kỹ năng công cụ'];var sc=['Giao tiếp','Làm việc nhóm','Chủ động','Khả năng học hỏi','Phù hợp văn hóa'];var h='<div class="form-section" id="evaluationFormInner" data-ivcode="'+ivCode+'"><h3>Đánh giá: '+(cd?cd.fullName:'')+' ('+iv.code+')</h3><h3>I. Chuyên môn (25 điểm)</h3><table class="score-table"><tbody>';tc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input tech-score" min="0" max="5" step="0.5" value="0"></td></tr>'});h+='</tbody></table><h3>II. Kỹ năng & thái độ (25 điểm)</h3><table class="score-table"><tbody>';sc.forEach(function(c){h+='<tr><td>'+c+'</td><td><input type="number" class="score-input soft-score" min="0" max="5" step="0.5" value="0"></td></tr>'});h+='</tbody></table><p>Điểm tổng: <strong id="totalScoreDisplay">0</strong>/50</p><div class="form-group"><label>Mức độ phù hợp *</label><div class="checkbox-group">';['Rất phù hợp','Phù hợp','Cần cân nhắc','Không phù hợp'].forEach(function(v){h+='<label><input type="radio" name="resultSuitability" value="'+v+'"> '+v+'</label>'});h+='</div></div><h3>Kết luận *</h3><div class="checkbox-group">';['Đề xuất tuyển','Dự bị','Không tuyển'].forEach(function(v){h+='<label><input type="radio" name="resultConclusion" value="'+v+'"> '+v+'</label>'});h+='</div><br><button class="btn btn-success" id="btnSaveEval" style="width:100%;min-height:45px;font-size:16px">Lưu đánh giá</button></div>';ct.innerHTML=h;ct.querySelectorAll('.score-input').forEach(function(inp){inp.addEventListener('input',function(){var t=0;ct.querySelectorAll('.score-input').forEach(function(s){t+=parseFloat(s.value)||0});document.getElementById('totalScoreDisplay').textContent=t})});document.getElementById('btnSaveEval').addEventListener('click',function(){var fe=document.getElementById('evaluationFormInner');if(!validateInterviewResultForm(fe))return;var ts=[],ss=[];fe.querySelectorAll('.tech-score').forEach(function(s){ts.push(parseFloat(s.value))});fe.querySelectorAll('.soft-score').forEach(function(s){ss.push(parseFloat(s.value))});var total=0;ts.forEach(function(s){total+=s});ss.forEach(function(s){total+=s});var stamp=getUserStamp();interviewResults.push({interviewCode:ivCode,candidateCode:iv.candidateCode,position:iv.position,techScores:ts,softScores:ss,totalScore:total,suitability:fe.querySelector('input[name="resultSuitability"]:checked').value,conclusion:fe.querySelector('input[name="resultConclusion"]:checked').value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,expiredStatus:null,editHistory:[]});addHistory('Tạo mới','Đánh giá phỏng vấn',ivCode,'Đánh giá ứng viên '+iv.candidateCode);alert('Lưu đánh giá thành công!');ct.style.display='none';renderResultInterviewTable()})}
function showResultDetailView(ivCode){var r=interviewResults.find(function(x){return x.interviewCode===ivCode});if(!r)return;var cd=candidates.find(function(c){return c.code===r.candidateCode});var ct=document.getElementById('resultDetailContent');var h='<div class="pdf-preview"><h2>PHIẾU ĐÁNH GIÁ ỨNG VIÊN</h2>';h+='<div class="info-row"><span class="info-label">Mã phỏng vấn:</span><span class="info-value">'+r.interviewCode+'</span></div>';h+='<div class="info-row"><span class="info-label">Ứng viên:</span><span class="info-value">'+(cd?cd.fullName:'')+' ('+r.candidateCode+')</span></div>';h+='<div class="info-row"><span class="info-label">Điểm tổng:</span><span class="info-value"><strong>'+r.totalScore+'/50</strong></span></div>';h+='<div class="info-row"><span class="info-label">Mức độ phù hợp:</span><span class="info-value">'+r.suitability+'</span></div>';h+='<div class="info-row"><span class="info-label">Kết luận:</span><span class="info-value"><strong>'+r.conclusion+'</strong></span></div>';h+='<div class="info-row"><span class="info-label">Người thao tác:</span><span class="info-value">'+operatorFull(r)+'</span></div>';h+='<div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">'+formatDateTime(r.timestamp)+'</span></div>';h+=renderEditHistoryHTML(r);h+='</div>';ct.innerHTML=h;ct.setAttribute('data-ivcode',ivCode);showView('resultDetailView')}
function showOfferForm(ivCode){var rs=interviewResults.find(function(r){return r.interviewCode===ivCode});if(!rs)return;var cd=candidates.find(function(c){return c.code===rs.candidateCode});if(!cd)return;var ct=document.getElementById('offerFormContent');var h='<div class="form-section" id="offerFormInner" data-candcode="'+cd.code+'"><h3>Trúng tuyển - '+cd.fullName+'</h3><div class="form-row"><div class="form-group"><label>Lương thử việc *</label><input type="text" id="offerProbSalary"></div><div class="form-group"><label>Lương chính thức *</label><input type="text" id="offerOfficialSalary"></div></div><div class="form-group"><label>Phụ cấp</label><div class="checkbox-group">';['Ăn ca','Chuyên cần','Nhà ở','Khác'].forEach(function(v){h+='<label><input type="checkbox" name="offerAllowance" value="'+v+'"> '+v+'</label>'});h+='</div></div><div class="form-group"><label>Lương đóng bảo hiểm</label><input type="text" id="offerInsuranceSalary"></div><div class="form-group"><label>Hình thức trả lương *</label><div class="checkbox-group"><label><input type="radio" name="offerPayMethod" value="Chuyển khoản"> Chuyển khoản</label><label><input type="radio" name="offerPayMethod" value="Tiền mặt"> Tiền mặt</label></div></div><br><button class="btn btn-success" id="btnSaveOffer" style="width:100%;min-height:45px;font-size:16px">Lưu</button></div>';ct.innerHTML=h;showView('offerFormView');document.getElementById('btnSaveOffer').addEventListener('click',function(){if(!document.getElementById('offerProbSalary').value.trim()){alert('Nhập lương thử việc');return}if(!document.getElementById('offerOfficialSalary').value.trim()){alert('Nhập lương chính thức');return}var pm=document.getElementById('offerFormInner').querySelector('input[name="offerPayMethod"]:checked');if(!pm){alert('Chọn hình thức trả lương');return}var stamp=getUserStamp();cd.offer={probSalary:document.getElementById('offerProbSalary').value.trim(),officialSalary:document.getElementById('offerOfficialSalary').value.trim(),allowances:getCheckedValues('offerAllowance'),insuranceSalary:document.getElementById('offerInsuranceSalary').value.trim(),payMethod:pm.value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp};addHistory('Tạo mới','Thông báo trúng tuyển',cd.code,'Trúng tuyển: '+cd.fullName);alert('Lưu thành công!');renderProposedExcelTable();showView('proposedExcelView')})}
function renderProposedExcelTable(){checkOnboardingExpired();var data=interviewResults.filter(function(r){return r.conclusion==='Đề xuất tuyển'});var c=document.getElementById('proposedExcelTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có</p>';return}var h='<table id="proposedExcelDataTable"><thead><tr><th>STT</th><th>Mã UV</th><th>Tên UV</th><th>Vị trí</th><th>Điểm</th><th>Kết luận</th><th>Trạng thái</th></tr></thead><tbody>';data.forEach(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var st=r.expiredStatus||(ob?'Đã nhận việc':'Chờ xác nhận');var bc=ob?'badge-green':(r.expiredStatus?'badge-red':'badge-orange');h+='<tr><td>'+(i+1)+'</td><td>'+r.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+r.position+'</td><td>'+r.totalScore+'/50</td><td>'+r.conclusion+'</td><td><span class="badge '+bc+'">'+st+'</span></td></tr>'});h+='</tbody></table>';c.innerHTML=h}

// ===== CẬP NHẬT: BẢNG NHÂN VIÊN MỚI NHẬN VIỆC - Thao tác = "Xác nhận nhận việc" =====
function renderOnboardingList(filtered){checkOnboardingExpired();var data=filtered||interviewResults.filter(function(r){return r.conclusion==='Đề xuất tuyển'});var c=document.getElementById('onboardingListContainer');document.getElementById('onboardingFormContent').style.display='none';if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có</p>';return}var h='<table><thead><tr><th>STT</th><th>Mã UV</th><th>Tên UV</th><th>Vị trí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';data.forEach(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var st=r.expiredStatus||(ob?'Đã nhận việc':'Chờ xác nhận');var bc=ob?'badge-green':(r.expiredStatus?'badge-red':'badge-orange');h+='<tr><td>'+(i+1)+'</td><td>'+r.candidateCode+'</td><td>'+(cd?cd.fullName:'')+'</td><td>'+r.position+'</td><td><span class="badge '+bc+'">'+st+'</span></td><td>';if(!ob&&!r.expiredStatus)h+='<button class="btn btn-success btn-sm btn-do-onboard" data-candcode="'+r.candidateCode+'">Xác nhận nhận việc</button>';h+='</td></tr>'});h+='</tbody></table>';c.innerHTML=h;c.querySelectorAll('.btn-do-onboard').forEach(function(b){b.addEventListener('click',function(){showOnboardingForm(this.getAttribute('data-candcode'))})})}

function showOnboardingForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;var ct=document.getElementById('onboardingFormContent');ct.style.display='block';var h='<div class="form-section" id="onboardFormInner" data-candcode="'+candCode+'"><h3>Nhận việc - '+cd.fullName+'</h3>';h+='<div class="form-row"><div class="form-group"><label>Họ và tên</label><input value="'+cd.fullName+'" readonly></div><div class="form-group"><label>Mã nhân viên mới *</label><input class="onboard-new-empid" data-required="true" data-label="Mã nhân viên mới"></div></div>';h+='<div class="form-group"><label>Ngày nhận việc *</label><input type="date" class="onboard-start-date" data-required="true" data-label="Ngày nhận việc"></div>';h+='<h3>Bảo hiểm xã hội</h3><div class="form-group"><label>Đã tham gia?</label><select class="onboard-bhxh"><option value="Chưa">Chưa</option><option value="Rồi">Rồi</option></select></div><div class="form-group onboard-bhxh-number-group" style="display:none"><label>Số sổ bảo hiểm xã hội *</label><input class="onboard-bhxh-number"></div>';h+='<h3>Thuế</h3><div class="form-group"><label>Mã số thuế</label><input class="onboard-tax-code"></div>';h+='<h3>Liên hệ khẩn cấp</h3><div class="form-row"><div class="form-group"><label>Họ tên * (IN HOA)</label><input class="onboard-emergency-name uppercase-input" data-required="true" data-label="Tên liên hệ khẩn cấp" style="text-transform:uppercase"></div><div class="form-group"><label>Quan hệ</label><input class="onboard-emergency-relation"></div></div><div class="form-row"><div class="form-group"><label>Số điện thoại *</label><input class="onboard-emergency-phone" data-required="true" data-label="Số điện thoại khẩn cấp"></div><div class="form-group"><label>Địa chỉ</label><input class="onboard-emergency-addr"></div></div>';h+='<h3>Ngân hàng</h3><div class="form-row"><div class="form-group"><label>Tên ngân hàng</label><input class="onboard-bank-name"></div><div class="form-group"><label>Chi nhánh</label><input class="onboard-bank-branch"></div></div><div class="form-row"><div class="form-group"><label>Số tài khoản</label><input class="onboard-bank-account"></div><div class="form-group"><label>Chủ tài khoản (IN HOA)</label><input class="onboard-bank-owner uppercase-input" style="text-transform:uppercase"></div></div>';h+='<h3>Checklist hồ sơ</h3><div class="checkbox-group">';['Căn cước công dân','Sơ yếu lý lịch','Giấy khám sức khỏe','Bằng cấp','Giấy khai sinh'].forEach(function(v){h+='<label><input type="checkbox" name="onboardChecklist" value="'+v+'"> '+v+'</label>'});h+='</div><br><button class="btn btn-success" id="btnSaveOnboard" style="width:100%;min-height:45px;font-size:16px">Xác nhận nhận việc</button></div>';ct.innerHTML=h;var bhxhSel=ct.querySelector('.onboard-bhxh');bhxhSel.addEventListener('change',function(){ct.querySelector('.onboard-bhxh-number-group').style.display=this.value==='Rồi'?'block':'none'});ct.querySelectorAll('.uppercase-input').forEach(function(inp){inp.addEventListener('input',function(){this.value=this.value.toUpperCase()})});document.getElementById('btnSaveOnboard').addEventListener('click',function(){var fe=document.getElementById('onboardFormInner');if(!validateOnboardingForm(fe))return;var eName=fe.querySelector('.onboard-emergency-name').value.trim();if(eName&&eName!==eName.toUpperCase()){alert('Tên liên hệ khẩn cấp phải IN HOA');return}var stamp=getUserStamp();onboardingRecords.push({candidateCode:candCode,candidateName:cd.fullName,newEmployeeId:fe.querySelector('.onboard-new-empid').value.trim(),startDate:fe.querySelector('.onboard-start-date').value,bhxh:fe.querySelector('.onboard-bhxh').value,bhxhNumber:fe.querySelector('.onboard-bhxh').value==='Rồi'?fe.querySelector('.onboard-bhxh-number').value.trim():'',taxCode:fe.querySelector('.onboard-tax-code').value.trim(),emergencyName:eName,emergencyRelation:fe.querySelector('.onboard-emergency-relation').value.trim(),emergencyPhone:fe.querySelector('.onboard-emergency-phone').value.trim(),emergencyAddr:fe.querySelector('.onboard-emergency-addr').value.trim(),bankName:fe.querySelector('.onboard-bank-name').value.trim(),bankBranch:fe.querySelector('.onboard-bank-branch').value.trim(),bankAccount:fe.querySelector('.onboard-bank-account').value.trim(),bankOwner:fe.querySelector('.onboard-bank-owner').value.trim(),checklist:getCheckedValues('onboardChecklist'),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp});addHistory('Tạo mới','Xác nhận nhận việc',candCode,cd.fullName+' đã nhận việc');alert('Xác nhận nhận việc thành công!');ct.style.display='none';renderOnboardingList()})}

function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById('historyTableContainer');if(!data.length){c.innerHTML='<p style="text-align:center;color:#999;padding:20px">Chưa có lịch sử</p>';return}var h='<table id="historyDataTable"><thead><tr><th>STT</th><th>Hành động</th><th>Đối tượng</th><th>Mã</th><th>Chi tiết</th><th>Người thao tác</th><th>Chức vụ</th><th>Phòng ban</th><th>Thời gian</th></tr></thead><tbody>';data.slice().reverse().forEach(function(h2,i){h+='<tr><td>'+(i+1)+'</td><td><span class="badge '+(h2.action==='Xóa'?'badge-red':(h2.action==='Sửa'?'badge-orange':'badge-green'))+'">'+h2.action+'</span></td><td>'+h2.target+'</td><td>'+h2.code+'</td><td>'+h2.detail+'</td><td>'+h2.employeeName+' ('+h2.employeeId+')</td><td>'+h2.employeePosition+'</td><td>'+h2.employeeDept+'</td><td>'+formatDateTime(h2.timestamp)+'</td></tr>'});h+='</tbody></table>';c.innerHTML=h}
function exportTableToExcel(tableId,fileName){var tbl=document.getElementById(tableId);if(!tbl){alert('Không có dữ liệu');return}var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{mso-number-format:"\\\\@";white-space:normal;word-wrap:break-word;max-width:200px}</style></head><body>'+tbl.outerHTML+'</body></html>';var blob=new Blob([html],{type:'application/vnd.ms-excel'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fileName+'.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}
function exportDataToExcel(headers,rows,fileName){var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{mso-number-format:"\\\\@";white-space:normal;word-wrap:break-word}td.cv-col{min-width:150px;width:200px}</style></head><body><table border="1"><thead><tr>';headers.forEach(function(h){html+='<th>'+h+'</th>'});html+='</tr></thead><tbody>';rows.forEach(function(row){html+='<tr>';row.forEach(function(cell,ci){var cls=headers[ci]==='CV'?' class="cv-col"':'';html+='<td'+cls+'>'+(cell===undefined||cell===null?'':cell)+'</td>'});html+='</tr>'});html+='</tbody></table></body></html>';var blob=new Blob([html],{type:'application/vnd.ms-excel'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fileName+'.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}
function doLogin(){if(!validateLogin())return;currentUser={id:document.getElementById('loginEmpId').value.trim(),name:document.getElementById('loginEmpName').value.trim().toUpperCase(),position:document.getElementById('loginEmpPosition').value,department:document.getElementById('loginEmpDept').value};document.getElementById('barEmpId').textContent=currentUser.id;document.getElementById('barEmpName').textContent=currentUser.name;document.getElementById('barEmpPosition').textContent=currentUser.position;document.getElementById('barEmpDept').textContent=currentUser.department;document.getElementById('loginView').classList.remove('active');document.getElementById('appContainer').style.display='block';showView('mainView');updateClock();clockInterval=setInterval(updateClock,1000);addHistory('Đăng nhập','Hệ thống',currentUser.id,currentUser.name+' đã đăng nhập');updateAdminVisibility()}
function doLogout(){addHistory('Đăng xuất','Hệ thống',currentUser?currentUser.id:'','Đã đăng xuất');Object.keys(activeEditors).forEach(function(key){activeEditors[key]=activeEditors[key].filter(function(e){return e.userId!==currentUser.id});if(activeEditors[key].length===0)delete activeEditors[key]});hideConcurrentUsersDisplay();currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById('appContainer').style.display='none';document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});document.getElementById('loginEmpId').value='';document.getElementById('loginEmpName').value='';document.getElementById('loginEmpPosition').selectedIndex=0;document.getElementById('loginEmpDept').selectedIndex=0;showView('loginView')}
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
document.getElementById('btnEditRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code)startEditRecruitment(code)});
document.getElementById('btnDeleteRecruitment').addEventListener('click',function(){var code=document.getElementById('recruitmentDetailContent').getAttribute('data-code');if(code){deleteRecruitment(code);showView('recruitmentView')}});
document.getElementById('btnEditCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code)startEditCandidate(code)});
document.getElementById('btnDeleteCandidate').addEventListener('click',function(){var code=document.getElementById('candidateDetailContent').getAttribute('data-code');if(code){deleteCandidate(code);showView('candidateView')}});
document.getElementById('btnAddRecruitment').addEventListener('click',function(){editingRecruitmentCode=null;document.getElementById('recruitmentFormTitle').textContent='Tạo nhu cầu tuyển dụng';document.getElementById('recruitmentEditInfo').style.display='none';resetForm(['recProposer','recPosition','recQuantity','recNeedDate','recReportTo','recEnvironment','recJobDesc','recBenefits','recSalaryRange','recMajor','recExperience','recLanguage','recTechSkill','recSoftSkill','recCertificate','recDeadline']);document.getElementById('recDepartment').selectedIndex=0;document.getElementById('recLevel').selectedIndex=0;document.getElementById('recEducation').selectedIndex=0;document.getElementById('recQuantity').value='1';document.querySelectorAll('input[name="recReason"]').forEach(function(cb){cb.checked=false});document.querySelectorAll('input[name="recWorkplace"]').forEach(function(cb){cb.checked=false});document.querySelectorAll('input[name="recWorktime"]').forEach(function(cb){cb.checked=false});showView('recruitmentFormView')});
document.getElementById('recProposer').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('btnSubmitRecruitment').addEventListener('click',function(){if(!validateRecruitmentForm())return;var stamp=getUserStamp();var data=collectRecFormData();if(editingRecruitmentCode){var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});if(!rec)return;if(!rec.editHistory)rec.editHistory=[];if(rec.editHistory.length>=MAX_EDIT_COUNT){alert('Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần).');return}rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:'Cập nhật thông tin nhu cầu tuyển dụng'});Object.assign(rec,data);rec.lastEditEmployeeId=stamp.employeeId;rec.lastEditEmployeeName=stamp.employeeName;rec.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Nhu cầu tuyển dụng',editingRecruitmentCode,'Đã cập nhật thông tin (lần '+rec.editHistory.length+'/'+MAX_EDIT_COUNT+')');alert('Cập nhật thành công! Mã: '+editingRecruitmentCode);releaseEditLock('recruitment',editingRecruitmentCode);editingRecruitmentCode=null;document.getElementById('recruitmentEditInfo').style.display='none'}else{var rec=Object.assign({code:generateRecruitmentCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});recruitmentRequests.push(rec);addHistory('Tạo mới','Nhu cầu tuyển dụng',rec.code,'Tạo mới: '+rec.position+' - '+rec.department);alert('Tạo thành công! Mã: '+rec.code)}renderRecruitmentTable();showView('recruitmentView')});
document.getElementById('btnAddCandidate').addEventListener('click',function(){editingCandidateCode=null;document.getElementById('candidateFormTitle').textContent='THÔNG TIN ỨNG VIÊN';document.getElementById('candidateEditInfo').style.display='none';resetForm(['candRecruitCode','candInterviewDate','candFullName','candDob','candEthnicity','candCCCD','candCCCDDate','candCCCDPlace','candCCCDExpiry','candPhone','candRelativePhone','candPermanentAddr','candTempAddr','candHeight','candWeight','candShoeSize','candSchoolName','candGradYear','candMajor','candStartDate','candWish1','candWish2','candWish3','candBusStop']);document.getElementById('candGender').selectedIndex=0;document.getElementById('candMarital').selectedIndex=0;document.getElementById('candDepartment').selectedIndex=0;document.getElementById('candEducationLevel').selectedIndex=0;document.getElementById('candPrevInterview').selectedIndex=0;document.getElementById('candAvailability').selectedIndex=0;document.getElementById('candSmoking').selectedIndex=0;document.getElementById('candDisease').selectedIndex=0;document.getElementById('candBus').selectedIndex=0;document.getElementById('candChildren').value='0';document.getElementById('candCommitment').checked=false;document.querySelectorAll('input[name="candSource"]').forEach(function(cb){cb.checked=false});document.getElementById('candCVFile').value='';document.getElementById('candCVSection').style.display='none';document.getElementById('candBusDetail').style.display='none';document.getElementById('experienceRows').innerHTML='<div class="exp-row"><input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương"></div>';showView('candidateFormView')});
document.getElementById('btnAddExpRow').addEventListener('click',function(){var row=document.createElement('div');row.className='exp-row';row.innerHTML='<input type="text" placeholder="Thời gian"><input type="text" placeholder="Nội dung công việc"><input type="text" placeholder="Đơn vị"><input type="text" placeholder="Địa điểm"><input type="text" placeholder="Mức lương">';document.getElementById('experienceRows').appendChild(row)});
document.getElementById('candFullName').addEventListener('input',function(){this.value=this.value.toUpperCase()});
document.getElementById('candRecruitCode').addEventListener('input',function(){handleCVSectionVisibility()});
document.getElementById('candBus').addEventListener('change',function(){document.getElementById('candBusDetail').style.display=this.value==='Có'?'flex':'none'});
document.getElementById('btnSubmitCandidate').addEventListener('click',function(){if(!validateCandidateForm())return;var stamp=getUserStamp();var data=collectCandFormData();if(editingCandidateCode){var c=candidates.find(function(x){return x.code===editingCandidateCode});if(!c)return;if(!c.editHistory)c.editHistory=[];if(c.editHistory.length>=MAX_EDIT_COUNT){alert('Đã đạt giới hạn chỉnh sửa tối đa ('+MAX_EDIT_COUNT+' lần).');return}c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:'Cập nhật thông tin ứng viên'});var oldCv={cvName:c.cvName,cvURL:c.cvURL};Object.assign(c,data);var fi=document.getElementById('candCVFile');if(fi.files&&fi.files.length>0){c.cvName=fi.files[0].name;c.cvURL=URL.createObjectURL(fi.files[0])}else{c.cvName=oldCv.cvName;c.cvURL=oldCv.cvURL}c.lastEditEmployeeId=stamp.employeeId;c.lastEditEmployeeName=stamp.employeeName;c.lastEditTimestamp=stamp.timestamp;addHistory('Sửa','Ứng viên',editingCandidateCode,'Đã cập nhật: '+c.fullName+' (lần '+c.editHistory.length+'/'+MAX_EDIT_COUNT+')');alert('Cập nhật thành công! Mã: '+editingCandidateCode);releaseEditLock('candidate',editingCandidateCode);editingCandidateCode=null;document.getElementById('candidateEditInfo').style.display='none'}else{var cvName='',cvURL='';var fi=document.getElementById('candCVFile');if(fi.files&&fi.files.length>0){cvName=fi.files[0].name;cvURL=URL.createObjectURL(fi.files[0])}var c=Object.assign({code:generateCandidateCode()},data,{cvName:cvName,cvURL:cvURL,offer:null,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});candidates.push(c);addHistory('Tạo mới','Ứng viên',c.code,'Thêm mới: '+c.fullName);alert('Lưu thành công! Mã: '+c.code)}renderCandidateTable();showView('candidateView')});
document.getElementById('ivInterviewerCode').addEventListener('input',function(){var code=this.value.trim();var info=document.getElementById('ivInterviewerInfo');var iv=interviewers.find(function(i){return i.code===code});if(iv){var allowed=['Trưởng nhóm','Trưởng bộ phận','Trưởng phòng'].indexOf(iv.position)!==-1;info.style.display='block';info.innerHTML='<strong>Tên:</strong> '+iv.name+'<br><strong>Chức vụ:</strong> '+iv.position+'<br><strong>Bộ phận:</strong> '+iv.department;if(!allowed)info.innerHTML+='<br><span style="color:red">Chức vụ không đủ</span>';info.style.background=allowed?'#e8f5e9':'#ffebee'}else{info.style.display=code.length>0?'block':'none';info.innerHTML='<span style="color:red">Không tìm thấy</span>';info.style.background='#ffebee'}});
document.getElementById('btnSubmitInterview').addEventListener('click',function(){if(!validateInterviewForm())return;var ic=document.getElementById('ivInterviewerCode').value.trim();var iwr=interviewers.find(function(i){return i.code===ic});var stamp=getUserStamp();var iv={code:generateInterviewFormCode(),candidateCode:document.getElementById('ivCandidateSelect').value,interviewerCode:ic,interviewerName:iwr.name,interviewerPosition:iwr.position,interviewerDept:iwr.department,position:document.getElementById('ivPosition').value,date:document.getElementById('ivDate').value,time:document.getElementById('ivTime').value,location:document.getElementById('ivLocation').value,tests:getCheckedValues('ivTest'),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]};interviews.push(iv);addHistory('Tạo mới','Lịch phỏng vấn',iv.code,'Đặt lịch PV cho '+iv.candidateCode);alert('Đặt lịch thành công! Mã: '+iv.code);renderInterviewExcelTable();showView('interviewExcelView')});
document.getElementById('btnSearchRecruitment').addEventListener('click',function(){var f=document.getElementById('recruitSearchFrom').value,t=document.getElementById('recruitSearchTo').value;renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=r.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnSearchCandidate').addEventListener('click',function(){var f=document.getElementById('candidateSearchFrom').value,t=document.getElementById('candidateSearchTo').value;renderCandidateTable(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnSearchInterview').addEventListener('click',function(){var f=document.getElementById('interviewSearchFrom').value,t=document.getElementById('interviewSearchTo').value;renderCandidateTableForInterview(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnSearchResult').addEventListener('click',function(){var f=document.getElementById('resultSearchFrom').value,t=document.getElementById('resultSearchTo').value;renderResultInterviewTable(interviews.filter(function(iv){var ts=iv.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnSearchOnboarding').addEventListener('click',function(){var f=document.getElementById('onboardSearchFrom').value,t=document.getElementById('onboardSearchTo').value;renderOnboardingList(interviewResults.filter(function(r){if(r.conclusion!=='Đề xuất tuyển')return false;var ts=r.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnSearchHistory').addEventListener('click',function(){var f=document.getElementById('historySearchFrom').value,t=document.getElementById('historySearchTo').value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});
document.getElementById('btnExportRecruitment').addEventListener('click',function(){var h=['STT','Mã nhu cầu tuyển dụng','Phòng ban','Người đề xuất','Vị trí','Cấp bậc','Số lượng cần','Đã tuyển','Còn lại','Lý do','Mức lương','Deadline','Lần sửa','Người thao tác','Thời gian'];var rows=recruitmentRequests.map(function(r,i){var hired=getHiredCount(r.code);return[i+1,r.code,r.department,r.proposer,r.position,r.level,r.quantity,hired,Math.max(0,r.quantity-hired),r.reasons.join(', '),na(r.salaryRange),formatDate(r.deadline),getEditCount(r)+'/'+MAX_EDIT_COUNT,operatorFull(r),formatDateTime(r.timestamp)]});exportDataToExcel(h,rows,'NhuCauTuyenDung')});
document.getElementById('btnExportCandidate').addEventListener('click',function(){var h=['STT','Mã UV','Họ và tên','Ngày sinh','Giới tính','SĐT','CCCD','Trình độ','NV1','NV2','NV3','Mã nhu cầu tuyển dụng','Bộ phận','CV','Lần sửa','Người thao tác','Thời gian'];var rows=candidates.map(function(c,i){return[i+1,c.code,c.fullName,formatDate(c.dob),c.gender,c.phone,c.cccd,c.educationLevel,c.wish1,na(c.wish2),na(c.wish3),c.recruitCode,c.department,c.cvName||'Không có',getEditCount(c)+'/'+MAX_EDIT_COUNT,operatorFull(c),formatDateTime(c.timestamp)]});exportDataToExcel(h,rows,'DanhSachUngVien')});
document.getElementById('btnExportInterview').addEventListener('click',function(){var h=['STT','Mã UV','Họ và tên','SĐT','NV1','Trạng thái'];var rows=candidates.map(function(c,i){var iv=interviews.find(function(x){return x.candidateCode===c.code});return[i+1,c.code,c.fullName,c.phone,c.wish1,iv?'Đã đặt lịch':'Chưa đặt lịch']});exportDataToExcel(h,rows,'DatLichPhongVan')});
document.getElementById('btnExportInterviewExcel').addEventListener('click',function(){var tbl=document.getElementById('interviewExcelDataTable');if(tbl)exportTableToExcel('interviewExcelDataTable','LichPhongVan');else alert('Chưa có dữ liệu')});
document.getElementById('btnExportResult').addEventListener('click',function(){var h=['STT','Mã PV','Mã UV','Tên UV','Vị trí','Điểm','Mức độ','Kết luận','Người thao tác','Thời gian'];var rows=interviewResults.map(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});return[i+1,r.interviewCode,r.candidateCode,cd?cd.fullName:'',r.position,r.totalScore+'/50',r.suitability,r.conclusion,operatorFull(r),formatDateTime(r.timestamp)]});exportDataToExcel(h,rows,'KetQuaPhongVan')});
document.getElementById('btnExportProposedExcel').addEventListener('click',function(){var tbl=document.getElementById('proposedExcelDataTable');if(tbl)exportTableToExcel('proposedExcelDataTable','DeXuatTuyenDung');else alert('Chưa có dữ liệu')});
document.getElementById('btnExportOnboarding').addEventListener('click',function(){checkOnboardingExpired();var proposed=interviewResults.filter(function(r){return r.conclusion==='Đề xuất tuyển'});var h=['STT','Mã UV','Tên UV','Vị trí','Trạng thái'];var rows=proposed.map(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var st=r.expiredStatus||(ob?'Đã nhận việc':'Chờ xác nhận');return[i+1,r.candidateCode,cd?cd.fullName:'',r.position,st]});exportDataToExcel(h,rows,'XacNhanNhanViec')});
document.getElementById('btnExportHistory').addEventListener('click',function(){if(!isAdmin()){alert('Không có quyền xuất dữ liệu lịch sử!');return}var tbl=document.getElementById('historyDataTable');if(tbl)exportTableToExcel('historyDataTable','LichSuThaoTac');else alert('Chưa có dữ liệu')});
document.addEventListener("DOMContentLoaded",function(){initApp()});
<\/script>
</body>
</html>`;

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
 console.log('Counters: ' + JSON.stringify(database.counters));
 console.log('=================================');
 });
}).catch(function(err) {
 console.error('Loi khoi dong:', err.message);
 server.listen(PORT, function() {
 console.log('Server running on port ' + PORT + ' (NO DATA)');
 });
});