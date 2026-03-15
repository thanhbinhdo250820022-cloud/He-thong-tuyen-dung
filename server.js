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
<title>He Thong Quan Ly Tuyen Dung</title>
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
<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>
<p style="text-align:center;color:#666;margin-bottom:20px;">Vui long dang nhap de tiep tuc</p>
<div class="form-group"><label>Ma nhan vien *</label><input type="text" id="loginEmpId" placeholder="VD: 268493"></div>
<div class="form-group"><label>Ho va ten * (IN HOA)</label><input type="text" id="loginEmpName" placeholder="NGUYEN VAN A" style="text-transform:uppercase"></div>
<div class="form-group"><label>Chuc vu *</label><select id="loginEmpPosition"><option value="">-- Chon --</option><option>Cong nhan</option><option>Tro ly</option><option>Nhan vien</option><option>Ky su</option><option>Truong nhom</option><option>Truong bo phan</option><option>Truong phong</option></select></div>
<div class="form-group"><label>Phong ban *</label><select id="loginEmpDept"></select></div>
<br><button class="login-btn" id="btnLogin">Dang nhap</button>
</div></div></div>
<div class="container" id="appContainer" style="display:none">
<div class="user-bar">
<div class="user-info">
<div><strong id="barEmpName"></strong> | Ma nhan vien: <strong id="barEmpId"></strong></div>
<div>Chuc vu: <strong id="barEmpPosition"></strong> | Phong ban: <strong id="barEmpDept"></strong></div>
</div>
<div style="display:flex;align-items:center;gap:15px;">
<div class="clock" id="barClock"></div>
<button class="logout-btn" id="btnLogout">Dang xuat</button>
</div></div>
<div id="concurrentUsersBar" class="concurrent-users-bar" style="display:none">
<span>Nguoi dang chinh sua dong thoi:</span>
<span id="concurrentUsersList"></span>
<span id="concurrentUsersCount" style="margin-left:auto;font-weight:700"></span>
</div>
<div id="mainView" class="view">
<h1>HE THONG QUAN LY<br>TUYEN DUNG</h1>
<button class="main-btn btn-recruitment" id="btnGoRecruitment">Nhu cau tuyen dung</button>
<button class="main-btn btn-candidate" id="btnGoCandidate">Thong tin ung vien</button>
<button class="main-btn btn-interview" id="btnGoInterview">Lich phong van</button>
<button class="main-btn btn-result" id="btnGoResult">Ket qua phong van</button>
<button class="main-btn btn-onboarding" id="btnGoOnboarding">Nhan vien moi nhan viec</button>
<button class="main-btn btn-history" id="btnGoHistory" style="display:none">Lich su thao tac</button>
</div>
<div id="recruitmentView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitment">← Quay lai</button>
<h2>Danh sach nhu cau tuyen dung</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="recruitSearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="recruitSearchTo"></div>
<button class="btn btn-primary" id="btnSearchRecruitment">Tim kiem</button>
<button class="btn btn-excel" id="btnExportRecruitment">Xuat Excel</button>
<button class="btn btn-success" id="btnAddRecruitment">+ Tao moi</button>
</div>
<div id="recruitmentTableContainer" class="table-wrapper"></div>
</div>
<div id="recruitmentFormView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentForm">← Quay lai</button>
<h2 id="recruitmentFormTitle">Tao nhu cau tuyen dung</h2>
<div id="recruitmentEditInfo" style="display:none"></div>
<div class="form-section"><h3>I. Thong tin chung</h3>
<div class="form-row"><div class="form-group"><label>Phong ban yeu cau *</label><select id="recDepartment"></select></div>
<div class="form-group"><label>Nguoi de xuat * (IN HOA)</label><input type="text" id="recProposer" style="text-transform:uppercase"></div></div>
<div class="form-row"><div class="form-group"><label>Vi tri tuyen dung *</label><input type="text" id="recPosition"></div>
<div class="form-group"><label>Cap bac *</label><select id="recLevel"></select></div></div>
<div class="form-row"><div class="form-group"><label>So luong *</label><input type="number" id="recQuantity" min="1" value="1"></div></div>
<div class="form-group"><label>Ly do tuyen dung *</label>
<div class="checkbox-group">
<label><input type="checkbox" name="recReason" value="Mo rong hoat dong"> Mo rong hoat dong</label>
<label><input type="checkbox" name="recReason" value="Thay the nhan vien nghi viec"> Thay the nhan vien nghi viec</label>
<label><input type="checkbox" name="recReason" value="Bo sung nhan luc"> Bo sung nhan luc</label>
<label><input type="checkbox" name="recReason" value="Khac"> Khac</label>
</div></div>
<div class="form-group"><label>Thoi gian can nhan su *</label><input type="date" id="recNeedDate"></div>
</div>
<div class="form-section"><h3>II. Thong tin vi tri</h3>
<div class="form-group"><label>Bao cao cho *</label><input type="text" id="recReportTo" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()" placeholder="NHAP TEN IN HOA"></div>
<div class="form-group"><label>Dia diem lam viec *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorkplace" value="Nha may 1"> Nha may 1</label><label><input type="checkbox" name="recWorkplace" value="Nha may 2"> Nha may 2</label><label><input type="checkbox" name="recWorkplace" value="Nha may 3"> Nha may 3</label><label><input type="checkbox" name="recWorkplace" value="Nha may 4"> Nha may 4</label></div></div>
<div class="form-group"><label>Thoi gian lam viec *</label>
<div class="checkbox-group"><label><input type="checkbox" name="recWorktime" value="Hanh chinh"> Hanh chinh</label><label><input type="checkbox" name="recWorktime" value="Hanh chinh kip"> Hanh chinh kip</label><label><input type="checkbox" name="recWorktime" value="2 ca"> 2 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca"> 3 ca</label><label><input type="checkbox" name="recWorktime" value="3 ca kip"> 3 ca kip</label></div></div>
<div class="form-group"><label>Moi truong lam viec</label><textarea id="recEnvironment"></textarea></div>
<div class="form-group"><label>Mo ta cong viec *</label><textarea id="recJobDesc"></textarea></div>
<div class="form-group"><label>Che do phuc loi</label><textarea id="recBenefits"></textarea></div>
<div class="form-group"><label>Muc luong de xuat</label><input type="text" id="recSalaryRange" placeholder="VD: 8,000,000 - 12,000,000 VND"></div>
</div>
<div class="form-section"><h3>III. Yeu cau ung vien</h3>
<div class="form-row"><div class="form-group"><label>Trinh do hoc van *</label><select id="recEducation"></select></div>
<div class="form-group"><label>Chuyen nganh</label><input type="text" id="recMajor"></div></div>
<div class="form-row"><div class="form-group"><label>Kinh nghiem toi thieu</label><input type="text" id="recExperience"></div>
<div class="form-group"><label>Ngoai ngu</label><input type="text" id="recLanguage"></div></div>
<div class="form-group"><label>Ky nang chuyen mon</label><textarea id="recTechSkill"></textarea></div>
<div class="form-group"><label>Ky nang mem</label><textarea id="recSoftSkill"></textarea></div>
<div class="form-group"><label>Chung chi</label><input type="text" id="recCertificate"></div>
<div class="form-group"><label>Deadline tuyen dung *</label><input type="date" id="recDeadline"></div>
</div>
<button class="btn btn-success" id="btnSubmitRecruitment" style="width:100%;min-height:45px;font-size:16px">Luu</button>
</div>
<div id="recruitmentDetailView" class="view">
<button class="btn btn-back" id="btnBackFromRecruitmentDetail">← Quay lai</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintRecruitment">In / Xuat PDF</button>
<button class="btn btn-edit" id="btnEditRecruitment">Sua</button>
<button class="btn btn-delete" id="btnDeleteRecruitment">Xoa</button>
</div>
<div id="recruitmentDetailContent" class="form-section"></div>
</div>
<div id="candidateView" class="view">
<button class="btn btn-back" id="btnBackFromCandidate">← Quay lai</button>
<h2>Danh sach ung vien</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="candidateSearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="candidateSearchTo"></div>
<button class="btn btn-primary" id="btnSearchCandidate">Tim kiem</button>
<button class="btn btn-excel" id="btnExportCandidate">Xuat Excel</button>
<button class="btn btn-success" id="btnAddCandidate">+ Them ung vien</button>
</div>
<div id="candidateTableContainer" class="table-wrapper"></div>
</div>
<div id="candidateFormView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateForm">← Quay lai</button>
<h2 id="candidateFormTitle">THONG TIN UNG VIEN</h2>
<div id="candidateEditInfo" style="display:none"></div>
<div class="form-section"><h3>1. Thong tin ca nhan</h3>
<div class="form-row"><div class="form-group"><label>Ma nhu cau tuyen dung *</label><input type="text" id="candRecruitCode" placeholder="VD: P00001"></div>
<div class="form-group"><label>Bo phan thi tuyen *</label><select id="candDepartment"></select></div></div>
<div class="form-row"><div class="form-group"><label>Ngay phong van *</label><input type="date" id="candInterviewDate"></div></div>
<div class="form-row"><div class="form-group"><label>Ho va ten * (IN HOA)</label><input type="text" id="candFullName" style="text-transform:uppercase"></div>
<div class="form-group"><label>Ngay sinh *</label><input type="date" id="candDob"></div></div>
<div class="form-row"><div class="form-group"><label>Gioi tinh *</label><select id="candGender"><option value="">-- Chon --</option><option>Nam</option><option>Nu</option></select></div>
<div class="form-group"><label>Dan toc *</label><input type="text" id="candEthnicity"></div></div>
<div class="form-row"><div class="form-group"><label>Tinh trang ket hon *</label><select id="candMarital"><option value="">-- Chon --</option><option>Doc than</option><option>Ket hon</option></select></div>
<div class="form-group"><label>So con</label><input type="number" id="candChildren" min="0" value="0"></div></div>
<div class="form-row"><div class="form-group"><label>So can cuoc cong dan *</label><input type="text" id="candCCCD"></div>
<div class="form-group"><label>Ngay cap *</label><input type="date" id="candCCCDDate"></div></div>
<div class="form-row"><div class="form-group"><label>Noi cap *</label><input type="text" id="candCCCDPlace"></div>
<div class="form-group"><label>Han can cuoc</label><input type="date" id="candCCCDExpiry"></div></div>
<div class="form-row"><div class="form-group"><label>So dien thoai *</label><input type="tel" id="candPhone" placeholder="0xxxxxxxxx"></div>
<div class="form-group"><label>So dien thoai nguoi than</label><input type="tel" id="candRelativePhone"></div></div>
<div class="form-group"><label>Dia chi thuong tru *</label><input type="text" id="candPermanentAddr"></div>
<div class="form-group"><label>Dia chi tam tru</label><input type="text" id="candTempAddr"></div>
<div class="form-row"><div class="form-group"><label>Chieu cao (cm)</label><input type="number" id="candHeight"></div>
<div class="form-group"><label>Can nang (kg)</label><input type="number" id="candWeight"></div>
<div class="form-group"><label>Co giay</label><input type="text" id="candShoeSize"></div></div>
</div>
<div class="form-section"><h3>2. Trinh do & Kinh nghiem</h3>
<div class="form-group"><label>Trinh do hoc van *</label><select id="candEducationLevel"></select></div>
<div class="form-row"><div class="form-group"><label>Ten truong</label><input type="text" id="candSchoolName"></div>
<div class="form-group"><label>Nam tot nghiep</label><input type="text" id="candGradYear"></div></div>
<div class="form-group"><label>Chuyen nganh</label><input type="text" id="candMajor"></div>
<label style="font-weight:600;margin:10px 0 5px">Kinh nghiem lam viec</label>
<div id="experienceRows"><div class="exp-row"><input type="text" placeholder="Thoi gian"><input type="text" placeholder="Noi dung cong viec"><input type="text" placeholder="Don vi"><input type="text" placeholder="Dia diem"><input type="text" placeholder="Muc luong"></div></div>
<button class="btn btn-info" id="btnAddExpRow">+ Them dong</button>
</div>
<div class="form-section"><h3>3. Xac nhan & Nguyen vong</h3>
<div class="form-group"><label>Da phong van o cong ty chua? *</label><select id="candPrevInterview"><option value="">-- Chon --</option><option>Chua</option><option>Da phong van</option></select></div>
<div class="form-row"><div class="form-group"><label>Thoi gian co the di lam *</label><select id="candAvailability"><option value="">-- Chon --</option><option>Di lam ngay</option><option>Theo lich hen</option></select></div>
<div class="form-group"><label>Di lam tu ngay</label><input type="date" id="candStartDate"></div></div>
<div class="form-row"><div class="form-group"><label>Hut thuoc?</label><select id="candSmoking"><option>Khong</option><option>Co</option></select></div>
<div class="form-group"><label>Benh tien su?</label><select id="candDisease"><option>Khong</option><option>Co</option></select></div></div>
<div class="form-group"><label>Biet thong tin tuyen dung qua dau?</label>
<div class="checkbox-group"><label><input type="checkbox" name="candSource" value="Facebook"> Facebook</label><label><input type="checkbox" name="candSource" value="Nguoi quen"> Nguoi quen</label><label><input type="checkbox" name="candSource" value="Bien quang cao"> Bien quang cao</label><label><input type="checkbox" name="candSource" value="Don vi tu van viec lam"> Don vi tu van viec lam</label><label><input type="checkbox" name="candSource" value="Website cong ty"> Website cong ty</label><label><input type="checkbox" name="candSource" value="Khac"> Khac</label></div></div>
<div class="form-group"><label>Dang ky xe bus?</label><select id="candBus"><option>Khong</option><option>Co</option></select></div>
<div class="form-row" id="candBusDetail" style="display:none"><div class="form-group"><label>Diem don</label><input type="text" id="candBusStop"></div></div>
<div class="form-row"><div class="form-group"><label>Nguyen vong 1 *</label><input type="text" id="candWish1"></div>
<div class="form-group"><label>Nguyen vong 2</label><input type="text" id="candWish2"></div>
<div class="form-group"><label>Nguyen vong 3</label><input type="text" id="candWish3"></div></div>
</div>
<div class="form-section" id="candCVSection" style="display:none"><h3>Upload CV (PDF) *</h3>
<div class="form-group"><input type="file" id="candCVFile" accept=".pdf"></div></div>
<div class="form-section"><label><input type="checkbox" id="candCommitment"> Toi xin xac nhan thong tin tren la dung su that. *</label></div>
<button class="btn btn-success" id="btnSubmitCandidate" style="width:100%;min-height:45px;font-size:16px">Luu</button>
</div>
<div id="candidateDetailView" class="view">
<button class="btn btn-back" id="btnBackFromCandidateDetail">← Quay lai</button>
<div class="no-print" style="margin-bottom:10px">
<button class="btn btn-print" id="btnPrintCandidate">In / Xuat PDF</button>
<button class="btn btn-edit" id="btnEditCandidate">Sua</button>
<button class="btn btn-delete" id="btnDeleteCandidate">Xoa</button>
</div>
<div id="candidateDetailContent" class="form-section"></div>
</div>
<div id="interviewView" class="view">
<button class="btn btn-back" id="btnBackFromInterview">← Quay lai</button>
<h2>Dat lich phong van</h2>
<div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="interviewSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="interviewSearchTo"></div>
<button class="btn btn-primary" id="btnSearchInterview">Tim kiem</button><button class="btn btn-excel" id="btnExportInterview">Xuat Excel</button></div>
<div id="interviewCandidateTableContainer" class="table-wrapper"></div>
</div>
<div id="scheduleInterviewFormView" class="view">
<button class="btn btn-back" id="btnBackFromScheduleInterview">← Quay lai</button>
<h2>Dat lich phong van</h2>
<div class="form-section">
<div class="form-group"><label>Ung vien</label><select id="ivCandidateSelect"></select></div>
<div class="form-group"><label>Ma nhan vien nguoi phong van *</label><input type="text" id="ivInterviewerCode"></div>
<div id="ivInterviewerInfo" style="display:none;background:#e8f5e9;padding:10px;border-radius:8px;margin:10px 0"></div>
<div class="form-group"><label>Vi tri phong van *</label><select id="ivPosition"></select></div>
<div class="form-row"><div class="form-group"><label>Ngay phong van *</label><input type="date" id="ivDate"></div>
<div class="form-group"><label>Gio *</label><input type="time" id="ivTime"></div></div>
<div class="form-group"><label>Dia diem *</label><select id="ivLocation"><option value="">-- Chon --</option><option>Nha may 1</option><option>Nha may 2</option><option>Nha may 3</option><option>Nha may 4</option></select></div>
<div class="form-group"><label>Bai kiem tra (it nhat 1) *</label>
<div class="checkbox-group"><label><input type="checkbox" name="ivTest" value="Tieng Anh"> Tieng Anh</label><label><input type="checkbox" name="ivTest" value="IQ"> IQ</label><label><input type="checkbox" name="ivTest" value="Nhan cach"> Nhan cach</label></div></div>
</div>
<button class="btn btn-success" id="btnSubmitInterview" style="width:100%;min-height:45px;font-size:16px">Luu lich phong van</button>
</div>
<div id="interviewExcelView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewExcel">← Quay lai</button>
<h2>Bang lich phong van</h2>
<button class="btn btn-excel" id="btnExportInterviewExcel">Xuat Excel</button>
<button class="btn btn-print" id="btnPrintInterviewExcel">In</button>
<div id="interviewExcelTableContainer" class="table-wrapper"></div>
</div>
<div id="interviewResultFormView" class="view">
<button class="btn btn-back" id="btnBackFromInterviewResult">← Quay lai</button>
<h2>Ket qua phong van</h2>
<div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="resultSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="resultSearchTo"></div>
<button class="btn btn-primary" id="btnSearchResult">Tim kiem</button><button class="btn btn-excel" id="btnExportResult">Xuat Excel</button></div>
<div id="resultInterviewTableContainer" class="table-wrapper"></div>
<div id="resultFormContainer" style="display:none"></div>
</div>
<div id="resultDetailView" class="view">
<button class="btn btn-back" id="btnBackFromResultDetail">← Quay lai</button>
<div class="no-print" style="margin-bottom:10px"><button class="btn btn-print" id="btnPrintResult">In / Xuat PDF</button></div>
<div id="resultDetailContent" class="form-section"></div>
</div>
<div id="proposedExcelView" class="view">
<button class="btn btn-back" id="btnBackFromProposedExcel">← Quay lai</button>
<h2>Bang de xuat tuyen dung</h2>
<button class="btn btn-excel" id="btnExportProposedExcel">Xuat Excel</button>
<div id="proposedExcelTableContainer" class="table-wrapper"></div>
</div>
<div id="offerFormView" class="view">
<button class="btn btn-back" id="btnBackFromOffer">← Quay lai</button>
<h2>Thong bao trung tuyen</h2>
<div id="offerFormContent"></div>
</div>
<div id="onboardingFormView" class="view">
<button class="btn btn-back" id="btnBackFromOnboarding">← Quay lai</button>
<h2>Xac nhan nhan viec</h2>
<div class="search-bar"><div><label>Tu ngay:</label><br><input type="date" id="onboardSearchFrom"></div><div><label>Den ngay:</label><br><input type="date" id="onboardSearchTo"></div>
<button class="btn btn-primary" id="btnSearchOnboarding">Tim kiem</button><button class="btn btn-excel" id="btnExportOnboarding">Xuat Excel</button></div>
<div id="onboardingListContainer" class="table-wrapper"></div>
<div id="onboardingFormContent" style="display:none"></div>
</div>
<div id="historyView" class="view">
<button class="btn btn-back" id="btnBackFromHistory">← Quay lai</button>
<h2>Lich su thao tac</h2>
<div class="search-bar">
<div><label>Tu ngay:</label><br><input type="date" id="historySearchFrom"></div>
<div><label>Den ngay:</label><br><input type="date" id="historySearchTo"></div>
<button class="btn btn-primary" id="btnSearchHistory">Tim kiem</button>
<button class="btn btn-excel" id="btnExportHistory">Xuat Excel</button>
</div>
<div id="historyTableContainer" class="table-wrapper"></div>
</div>
<div id="printArea" style="display:none"></div>
</div>
`;

const scriptContent = '<script>\n' +
'var recruitmentRequestCounter=1,interviewFormCounter=1,candidateCounter=1;\n' +
'var recruitmentRequests=[],candidates=[],interviews=[],interviewResults=[],onboardingRecords=[];\n' +
'var actionHistory=[];\n' +
'var editingRecruitmentCode=null,editingCandidateCode=null;\n' +
'var MAX_CONCURRENT_EDITORS=10;\n' +
'var MAX_EDIT_COUNT=3;\n' +
'var DELETE_LOCK_HOURS=24;\n' +
'var activeEditors={};\n' +
'function getEditorKey(type,code){return type+":"+code}\n' +
'function acquireEditLock(type,code){var key=getEditorKey(type,code);if(!activeEditors[key])activeEditors[key]=[];var now=new Date();activeEditors[key]=activeEditors[key].filter(function(e){return(now-new Date(e.timestamp))<30*60*1000});var existing=activeEditors[key].find(function(e){return e.userId===currentUser.id});if(existing){existing.timestamp=now.toISOString();updateConcurrentUsersDisplay(key);return true}if(activeEditors[key].length>=MAX_CONCURRENT_EDITORS){alert("Da dat toi da "+MAX_CONCURRENT_EDITORS+" nguoi dang chinh sua dong thoi.");return false}activeEditors[key].push({userId:currentUser.id,userName:currentUser.name,timestamp:now.toISOString()});updateConcurrentUsersDisplay(key);return true}\n' +
'function releaseEditLock(type,code){var key=getEditorKey(type,code);if(!activeEditors[key])return;activeEditors[key]=activeEditors[key].filter(function(e){return e.userId!==currentUser.id});if(activeEditors[key].length===0)delete activeEditors[key];hideConcurrentUsersDisplay()}\n' +
'function updateConcurrentUsersDisplay(key){var bar=document.getElementById("concurrentUsersBar");var list=document.getElementById("concurrentUsersList");var count=document.getElementById("concurrentUsersCount");if(!activeEditors[key]||activeEditors[key].length<=1){bar.style.display="none";return}bar.style.display="flex";var html="";activeEditors[key].forEach(function(e){html+="<span class=\\"user-tag\\">"+e.userName+" ("+e.userId+")</span>"});list.innerHTML=html;count.textContent=activeEditors[key].length+"/"+MAX_CONCURRENT_EDITORS+" nguoi"}\n' +
'function hideConcurrentUsersDisplay(){document.getElementById("concurrentUsersBar").style.display="none"}\n' +
'function getEditCount(record){return(record.editHistory&&record.editHistory.length)||0}\n' +
'function canEdit(record){return getEditCount(record)<MAX_EDIT_COUNT}\n' +
'function canDelete(record){if(!record.editHistory||record.editHistory.length===0)return true;var lastEdit=record.editHistory[record.editHistory.length-1];var hoursSinceLastEdit=(new Date()-new Date(lastEdit.timestamp))/(1000*60*60);return hoursSinceLastEdit<DELETE_LOCK_HOURS}\n' +
'function getEditCountBadge(record){var count=getEditCount(record);var cls=count===0?"edit-count-ok":(count<MAX_EDIT_COUNT?"edit-count-warn":"edit-count-max");return"<span class=\\"edit-count-badge "+cls+"\\">"+count+"/"+MAX_EDIT_COUNT+" lan sua</span>"}\n' +
'function renderEditHistoryHTML(record){if(!record.editHistory||record.editHistory.length===0)return"";var h="<div class=\\"edit-history-section\\"><h3>LICH SU CHINH SUA "+getEditCountBadge(record)+"</h3>";record.editHistory.forEach(function(edit,idx){h+="<div class=\\"edit-history-item\\">";h+="<strong>Lan sua "+(idx+1)+"/"+MAX_EDIT_COUNT+"</strong> | ";h+="<span style=\\"color:#1565c0\\">"+formatDateTime(edit.timestamp)+"</span><br>";h+="Nguoi sua: "+edit.employeeName+" ("+edit.employeeId+") - "+edit.employeePosition+" - "+edit.employeeDept;if(edit.changes){h+="<br>Thay doi: "+edit.changes}h+="</div>"});if(getEditCount(record)>=MAX_EDIT_COUNT){h+="<div style=\\"color:#c62828;font-weight:700;margin-top:8px\\">Da dat gioi han chinh sua toi da ("+MAX_EDIT_COUNT+" lan). Khong the sua them.</div>"}if(record.editHistory.length>0){var lastEdit=record.editHistory[record.editHistory.length-1];var hoursSince=(new Date()-new Date(lastEdit.timestamp))/(1000*60*60);if(hoursSince<DELETE_LOCK_HOURS){var remainHours=Math.ceil(DELETE_LOCK_HOURS-hoursSince);h+="<div style=\\"color:#1565c0;font-weight:600;margin-top:8px\\">Khong the xoa trong "+remainHours+" gio tiep theo (ke tu lan sua cuoi).</div>"}}h+="</div>";return h}\n' +
'var interviewers=[{code:"268493",name:"NGUYEN VAN MINH",position:"Truong phong",department:"Hanh chinh nhan su"},{code:"NV002",name:"TRAN THI LAN",position:"Truong bo phan",department:"San xuat 1"},{code:"NV003",name:"LE VAN HAI",position:"Truong nhom",department:"Ky thuat 1"},{code:"NV004",name:"PHAM THI HUONG",position:"Truong phong",department:"Kiem soat chat luong 1"},{code:"NV005",name:"HOANG VAN DUC",position:"Truong bo phan",department:"Bao tri bao duong 1"},{code:"NV006",name:"VU THI MAI",position:"Truong nhom",department:"QA"},{code:"NV007",name:"DANG VAN TU",position:"Nhan vien",department:"IT (he thong)"}];\n' +
'var departments=["San xuat 1","San xuat 2.1","San xuat 2.2","San xuat 2.2 M&E","San xuat 3.345","San xuat 3.6","San xuat 4","Bao tri bao duong 1","Ky thuat 1","Bao tri bao duong 2","Ky thuat 2","Kiem soat chat luong 1","Kiem soat chat luong 2","QA","Kiem tra 1","Kiem tra 2","Phan tich","EHS","Ho tro san xuat","Ke toan","Hanh chinh nhan su","IT (he thong)"];\n' +
'var levels=["Cong nhan","Tro ly","Nhan vien","Ky su","Truong nhom","Truong bo phan","Truong phong"];\n' +
'var educationLevels=["THCS","THPT","Trung cap","Cao dang","Dai hoc","Thac si","Tien si"];\n' +
'var currentUser=null,clockInterval=null;\n' +
'function loadDataFromServer(){return fetch("/api/data").then(function(response){return response.json()}).then(function(data){if(data.recruitmentRequests)recruitmentRequests=data.recruitmentRequests;if(data.candidates)candidates=data.candidates;if(data.interviews)interviews=data.interviews;if(data.interviewResults)interviewResults=data.interviewResults;if(data.onboardingRecords)onboardingRecords=data.onboardingRecords;if(data.history)actionHistory=data.history;if(data.counters){recruitmentRequestCounter=data.counters.recruitmentRequestCounter||1;candidateCounter=data.counters.candidateCounter||1;interviewFormCounter=data.counters.interviewFormCounter||1}console.log("Da tai du lieu tu server")}).catch(function(err){console.error("Loi tai du lieu:",err)})}\n' +
'function saveDataToServer(){var payload={recruitmentRequests:recruitmentRequests,candidates:candidates,interviews:interviews,interviewResults:interviewResults,onboardingRecords:onboardingRecords,history:actionHistory,counters:{recruitmentRequestCounter:recruitmentRequestCounter,candidateCounter:candidateCounter,interviewFormCounter:interviewFormCounter}};fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(response){return response.json()}).then(function(result){console.log("Da luu:",result.message)}).catch(function(err){console.error("Loi luu:",err)})}\n' +
'function isAdmin(){if(!currentUser)return false;return currentUser.position==="Truong phong"&&currentUser.department==="Hanh chinh nhan su"}\n' +
'function updateAdminVisibility(){var btnHistory=document.getElementById("btnGoHistory");if(isAdmin()){btnHistory.style.display="block"}else{btnHistory.style.display="none"}}\n' +
'function showView(id){document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});var t=document.getElementById(id);if(t)t.classList.add("active")}\n' +
'function goBack(id){showView(id)}\n' +
'function generateRecruitmentCode(){return"P"+String(recruitmentRequestCounter++).padStart(5,"0")}\n' +
'function generateCandidateCode(){return"C"+String(candidateCounter++).padStart(5,"0")}\n' +
'function generateInterviewFormCode(){return"V"+String(interviewFormCounter++).padStart(5,"0")}\n' +
'function formatDate(d){if(!d)return"";var dt=new Date(d);return String(dt.getDate()).padStart(2,"0")+"/"+String(dt.getMonth()+1).padStart(2,"0")+"/"+dt.getFullYear()}\n' +
'function formatDateTime(d){if(!d)return"";var dt=new Date(d);return formatDate(d)+" "+String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0")}\n' +
'function getNow(){return new Date().toISOString()}\n' +
'function updateClock(){var n=new Date();var el=document.getElementById("barClock");if(el)el.textContent=String(n.getDate()).padStart(2,"0")+"/"+String(n.getMonth()+1).padStart(2,"0")+"/"+n.getFullYear()+" "+String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0")+":"+String(n.getSeconds()).padStart(2,"0")}\n' +
'function populateSelect(id,opts,ph){var s=document.getElementById(id);if(!s)return;s.innerHTML="<option value=\\"\\">"+"-- "+(ph||"Chon")+" --</option>";opts.forEach(function(o){var opt=document.createElement("option");opt.value=o;opt.textContent=o;s.appendChild(opt)})}\n' +
'function setSelectValue(id,val){var s=document.getElementById(id);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;break}}}\n' +
'function getCheckedValues(name){var r=[];document.querySelectorAll("input[name=\\""+name+"\\"]:checked").forEach(function(cb){r.push(cb.value)});return r}\n' +
'function setCheckedValues(name,vals){document.querySelectorAll("input[name=\\""+name+"\\"]").forEach(function(cb){cb.checked=vals.indexOf(cb.value)!==-1})}\n' +
'function getUserStamp(){if(!currentUser)return{employeeId:"",employeeName:"",employeePosition:"",employeeDept:"",timestamp:getNow()};return{employeeId:currentUser.id,employeeName:currentUser.name,employeePosition:currentUser.position,employeeDept:currentUser.department,timestamp:getNow()}}\n' +
'function operatorInfo(r){return r.employeeName+" ("+r.employeeId+")"}\n' +
'function operatorFull(r){return r.employeeName+" ("+r.employeeId+") - "+r.employeePosition+" - "+r.employeeDept}\n' +
'function na(v){return v||"Khong co"}\n' +
'function resetForm(ids){ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==="checkbox"||el.type==="radio")el.checked=false;else if(el.tagName==="SELECT")el.selectedIndex=0;else el.value=""})}\n' +
'function addHistory(action,target,code,detail){actionHistory.push({action:action,target:target,code:code,detail:detail||"",employeeId:currentUser?currentUser.id:"",employeeName:currentUser?currentUser.name:"",employeePosition:currentUser?currentUser.position:"",employeeDept:currentUser?currentUser.department:"",timestamp:getNow()});saveDataToServer()}\n' +
'function getHiredCount(recCode){var c=0;onboardingRecords.forEach(function(ob){var cand=candidates.find(function(x){return x.code===ob.candidateCode});if(cand&&cand.recruitCode===recCode)c++});return c}\n' +
'function getRemainingQuantity(rec){return Math.max(0,rec.quantity-getHiredCount(rec.code))}\n' +
'function validateLogin(){var e=[];var id=document.getElementById("loginEmpId").value.trim();var name=document.getElementById("loginEmpName").value.trim();if(!id)e.push("Ma nhan vien");if(!name)e.push("Ho va ten");if(name&&name!==name.toUpperCase())e.push("Ho va ten phai IN HOA");if(!document.getElementById("loginEmpPosition").value)e.push("Chuc vu");if(!document.getElementById("loginEmpDept").value)e.push("Phong ban");if(e.length>0){alert("Vui long kiem tra:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function validateRecruitmentForm(){var e=[];if(!document.getElementById("recDepartment").value)e.push("Phong ban");var p=document.getElementById("recProposer").value.trim();if(!p)e.push("Nguoi de xuat");if(p&&p!==p.toUpperCase())e.push("Nguoi de xuat phai IN HOA");if(!document.getElementById("recPosition").value.trim())e.push("Vi tri tuyen dung");if(!document.getElementById("recLevel").value)e.push("Cap bac");if(!document.getElementById("recQuantity").value||parseInt(document.getElementById("recQuantity").value)<1)e.push("So luong");if(getCheckedValues("recReason").length===0)e.push("Ly do tuyen dung");if(!document.getElementById("recNeedDate").value)e.push("Thoi gian can nhan su");if(!document.getElementById("recReportTo").value.trim())e.push("Report to");if(getCheckedValues("recWorkplace").length===0)e.push("Dia diem lam viec");if(getCheckedValues("recWorktime").length===0)e.push("Thoi gian lam viec");if(!document.getElementById("recJobDesc").value.trim())e.push("Mo ta cong viec");if(!document.getElementById("recEducation").value)e.push("Trinh do hoc van");if(!document.getElementById("recDeadline").value)e.push("Deadline tuyen dung");if(e.length>0){alert("Vui long dien:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function validateCandidateForm(){var e=[];var name=document.getElementById("candFullName").value.trim();var phone=document.getElementById("candPhone").value.trim();var rc=document.getElementById("candRecruitCode").value.trim();var fr=recruitmentRequests.find(function(r){return r.code===rc});if(!rc)e.push("Ma nhu cau tuyen dung");else if(!fr)e.push("Ma nhu cau tuyen dung khong ton tai");if(!document.getElementById("candDepartment").value)e.push("Bo phan");if(!document.getElementById("candInterviewDate").value)e.push("Ngay phong van");if(!name)e.push("Ho va ten");if(name&&name!==name.toUpperCase())e.push("Ho va ten phai IN HOA");if(!document.getElementById("candDob").value)e.push("Ngay sinh");if(!document.getElementById("candGender").value)e.push("Gioi tinh");if(!document.getElementById("candEthnicity").value.trim())e.push("Dan toc");if(!document.getElementById("candMarital").value)e.push("Tinh trang ket hon");if(!document.getElementById("candCCCD").value.trim())e.push("So can cuoc cong dan");if(!document.getElementById("candCCCDDate").value)e.push("Ngay cap");if(!document.getElementById("candCCCDPlace").value.trim())e.push("Noi cap");if(!phone)e.push("So dien thoai");else if(!/^0\\d{9}$/.test(phone))e.push("So dien thoai sai dinh dang");else{var dup=candidates.find(function(c){return c.phone===phone&&(!editingCandidateCode||c.code!==editingCandidateCode)});if(dup)e.push("So dien thoai da ton tai")}if(!document.getElementById("candPermanentAddr").value.trim())e.push("Dia chi thuong tru");if(!document.getElementById("candEducationLevel").value)e.push("Trinh do");if(!document.getElementById("candPrevInterview").value)e.push("Da phong van chua");if(!document.getElementById("candAvailability").value)e.push("Thoi gian di lam");if(!document.getElementById("candWish1").value.trim())e.push("Nguyen vong 1");if(!document.getElementById("candCommitment").checked)e.push("Cam ket thong tin");if(fr&&!editingCandidateCode){var lvl=fr.level;if(lvl==="Tro ly"||lvl==="Nhan vien"||lvl==="Ky su"){var fi=document.getElementById("candCVFile");if(!fi.files||fi.files.length===0)e.push("Upload CV bat buoc cho vi tri "+lvl)}}if(e.length>0){alert("Vui long kiem tra:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function validateInterviewForm(){var e=[];if(!document.getElementById("ivCandidateSelect").value)e.push("Chon ung vien");var ic=document.getElementById("ivInterviewerCode").value.trim();if(!ic)e.push("Ma nhan vien nguoi phong van");else{var iv=interviewers.find(function(i){return i.code===ic});if(!iv)e.push("Ma nhan vien khong ton tai");else{if(["Truong nhom","Truong bo phan","Truong phong"].indexOf(iv.position)===-1)e.push("Nguoi phong van phai tu Truong nhom tro len")}}if(!document.getElementById("ivPosition").value)e.push("Vi tri phong van");if(!document.getElementById("ivDate").value)e.push("Ngay phong van");if(!document.getElementById("ivTime").value)e.push("Gio phong van");if(!document.getElementById("ivLocation").value)e.push("Dia diem");if(getCheckedValues("ivTest").length===0)e.push("Bai kiem tra");if(e.length>0){alert("Vui long kiem tra:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function validateInterviewResultForm(el){var e=[];var ok=true;el.querySelectorAll(".score-input").forEach(function(s){var v=parseFloat(s.value);if(isNaN(v)||v<0||v>5)ok=false});if(!ok)e.push("Diem phai tu 0 den 5");if(!el.querySelector("input[name=\\"resultSuitability\\"]:checked"))e.push("Muc do phu hop");if(!el.querySelector("input[name=\\"resultConclusion\\"]:checked"))e.push("Ket luan");if(e.length>0){alert("Vui long kiem tra:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function validateOnboardingForm(el){var e=[];el.querySelectorAll("[data-required=\\"true\\"]").forEach(function(inp){if(!inp.value.trim())e.push(inp.getAttribute("data-label")||"Truong bat buoc")});var ph=el.querySelector(".onboard-emergency-phone");if(ph&&ph.value.trim()&&!/^0\\d{9}$/.test(ph.value.trim()))e.push("So dien thoai khan cap sai dinh dang");var bhxhSel=el.querySelector(".onboard-bhxh");if(bhxhSel&&bhxhSel.value==="Roi"){var bn=el.querySelector(".onboard-bhxh-number");if(bn&&!bn.value.trim())e.push("So so bao hiem xa hoi")}if(e.length>0){alert("Vui long kiem tra:\\n- "+e.join("\\n- "));return false}return true}\n' +
'function checkOnboardingExpired(){var now=new Date();interviewResults.forEach(function(r){if(r.conclusion==="De xuat tuyen"){var diff=(now-new Date(r.timestamp))/(1000*60*60*24);if(diff>30&&!onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode}))r.expiredStatus="Khong xac nhan nhan viec"}})}\n' +
'function printContent(html){var pa=document.getElementById("printArea");pa.innerHTML=html;pa.style.display="block";window.print();pa.style.display="none"}\n' +
'function handleCVSectionVisibility(){var rc=document.getElementById("candRecruitCode").value.trim();var rec=recruitmentRequests.find(function(r){return r.code===rc});var sec=document.getElementById("candCVSection");if(rec&&(rec.level==="Tro ly"||rec.level==="Nhan vien"||rec.level==="Ky su"))sec.style.display="block";else sec.style.display="none"}\n' +
'function collectRecFormData(){return{department:document.getElementById("recDepartment").value,proposer:document.getElementById("recProposer").value.trim(),position:document.getElementById("recPosition").value.trim(),level:document.getElementById("recLevel").value,quantity:parseInt(document.getElementById("recQuantity").value),reasons:getCheckedValues("recReason"),needDate:document.getElementById("recNeedDate").value,reportTo:document.getElementById("recReportTo").value.trim(),workplaces:getCheckedValues("recWorkplace"),worktimes:getCheckedValues("recWorktime"),environment:document.getElementById("recEnvironment").value.trim(),jobDesc:document.getElementById("recJobDesc").value.trim(),benefits:document.getElementById("recBenefits").value.trim(),salaryRange:document.getElementById("recSalaryRange").value.trim(),education:document.getElementById("recEducation").value,major:document.getElementById("recMajor").value.trim(),experience:document.getElementById("recExperience").value.trim(),techSkill:document.getElementById("recTechSkill").value.trim(),softSkill:document.getElementById("recSoftSkill").value.trim(),language:document.getElementById("recLanguage").value.trim(),certificate:document.getElementById("recCertificate").value.trim(),deadline:document.getElementById("recDeadline").value}}\n' +
'function fillRecForm(r){setSelectValue("recDepartment",r.department);document.getElementById("recProposer").value=r.proposer;document.getElementById("recPosition").value=r.position;setSelectValue("recLevel",r.level);document.getElementById("recQuantity").value=r.quantity;setCheckedValues("recReason",r.reasons);document.getElementById("recNeedDate").value=r.needDate;document.getElementById("recReportTo").value=r.reportTo;setCheckedValues("recWorkplace",r.workplaces);setCheckedValues("recWorktime",r.worktimes);document.getElementById("recEnvironment").value=r.environment||"";document.getElementById("recJobDesc").value=r.jobDesc;document.getElementById("recBenefits").value=r.benefits||"";document.getElementById("recSalaryRange").value=r.salaryRange||"";setSelectValue("recEducation",r.education);document.getElementById("recMajor").value=r.major||"";document.getElementById("recExperience").value=r.experience||"";document.getElementById("recLanguage").value=r.language||"";document.getElementById("recTechSkill").value=r.techSkill||"";document.getElementById("recSoftSkill").value=r.softSkill||"";document.getElementById("recCertificate").value=r.certificate||"";document.getElementById("recDeadline").value=r.deadline}\n' +
'function collectCandFormData(){var exps=[];document.querySelectorAll("#experienceRows .exp-row").forEach(function(row){var inp=row.querySelectorAll("input");if(inp[0].value.trim()||inp[1].value.trim())exps.push({period:inp[0].value.trim(),job:inp[1].value.trim(),company:inp[2].value.trim(),location:inp[3].value.trim(),salary:inp[4].value.trim()})});return{recruitCode:document.getElementById("candRecruitCode").value.trim(),department:document.getElementById("candDepartment").value,interviewDate:document.getElementById("candInterviewDate").value,fullName:document.getElementById("candFullName").value.trim(),dob:document.getElementById("candDob").value,gender:document.getElementById("candGender").value,ethnicity:document.getElementById("candEthnicity").value.trim(),marital:document.getElementById("candMarital").value,children:document.getElementById("candChildren").value,cccd:document.getElementById("candCCCD").value.trim(),cccdDate:document.getElementById("candCCCDDate").value,cccdPlace:document.getElementById("candCCCDPlace").value.trim(),cccdExpiry:document.getElementById("candCCCDExpiry").value,phone:document.getElementById("candPhone").value.trim(),relativePhone:document.getElementById("candRelativePhone").value.trim(),permanentAddr:document.getElementById("candPermanentAddr").value.trim(),tempAddr:document.getElementById("candTempAddr").value.trim(),height:document.getElementById("candHeight").value,weight:document.getElementById("candWeight").value,shoeSize:document.getElementById("candShoeSize").value.trim(),educationLevel:document.getElementById("candEducationLevel").value,schoolName:document.getElementById("candSchoolName").value.trim(),gradYear:document.getElementById("candGradYear").value.trim(),major:document.getElementById("candMajor").value.trim(),experiences:exps,prevInterview:document.getElementById("candPrevInterview").value,availability:document.getElementById("candAvailability").value,startDate:document.getElementById("candStartDate").value,smoking:document.getElementById("candSmoking").value,disease:document.getElementById("candDisease").value,sources:getCheckedValues("candSource"),bus:document.getElementById("candBus").value,busStop:document.getElementById("candBusStop").value.trim(),wish1:document.getElementById("candWish1").value.trim(),wish2:document.getElementById("candWish2").value.trim(),wish3:document.getElementById("candWish3").value.trim()}}\n' +
'function fillCandForm(c){document.getElementById("candRecruitCode").value=c.recruitCode;setSelectValue("candDepartment",c.department);document.getElementById("candInterviewDate").value=c.interviewDate;document.getElementById("candFullName").value=c.fullName;document.getElementById("candDob").value=c.dob;setSelectValue("candGender",c.gender);document.getElementById("candEthnicity").value=c.ethnicity;setSelectValue("candMarital",c.marital);document.getElementById("candChildren").value=c.children;document.getElementById("candCCCD").value=c.cccd;document.getElementById("candCCCDDate").value=c.cccdDate;document.getElementById("candCCCDPlace").value=c.cccdPlace;document.getElementById("candCCCDExpiry").value=c.cccdExpiry||"";document.getElementById("candPhone").value=c.phone;document.getElementById("candRelativePhone").value=c.relativePhone||"";document.getElementById("candPermanentAddr").value=c.permanentAddr;document.getElementById("candTempAddr").value=c.tempAddr||"";document.getElementById("candHeight").value=c.height||"";document.getElementById("candWeight").value=c.weight||"";document.getElementById("candShoeSize").value=c.shoeSize||"";setSelectValue("candEducationLevel",c.educationLevel);document.getElementById("candSchoolName").value=c.schoolName||"";document.getElementById("candGradYear").value=c.gradYear||"";document.getElementById("candMajor").value=c.major||"";var expContainer=document.getElementById("experienceRows");expContainer.innerHTML="";if(c.experiences&&c.experiences.length>0){c.experiences.forEach(function(exp){var row=document.createElement("div");row.className="exp-row";row.innerHTML="<input type=\\"text\\" value=\\""+na(exp.period)+"\\"><input type=\\"text\\" value=\\""+na(exp.job)+"\\"><input type=\\"text\\" value=\\""+na(exp.company)+"\\"><input type=\\"text\\" value=\\""+na(exp.location)+"\\"><input type=\\"text\\" value=\\""+na(exp.salary)+"\\">";expContainer.appendChild(row)})}else{expContainer.innerHTML="<div class=\\"exp-row\\"><input type=\\"text\\" placeholder=\\"Thoi gian\\"><input type=\\"text\\" placeholder=\\"Noi dung cong viec\\"><input type=\\"text\\" placeholder=\\"Don vi\\"><input type=\\"text\\" placeholder=\\"Dia diem\\"><input type=\\"text\\" placeholder=\\"Muc luong\\"></div>"}setSelectValue("candPrevInterview",c.prevInterview);setSelectValue("candAvailability",c.availability);document.getElementById("candStartDate").value=c.startDate||"";setSelectValue("candSmoking",c.smoking);setSelectValue("candDisease",c.disease);setCheckedValues("candSource",c.sources||[]);setSelectValue("candBus",c.bus);document.getElementById("candBusStop").value=c.busStop||"";document.getElementById("candBusDetail").style.display=c.bus==="Co"?"flex":"none";document.getElementById("candWish1").value=c.wish1;document.getElementById("candWish2").value=c.wish2||"";document.getElementById("candWish3").value=c.wish3||"";document.getElementById("candCommitment").checked=true;handleCVSectionVisibility()}\n' +
'function renderRecruitmentTable(filtered){var data=filtered||recruitmentRequests;var c=document.getElementById("recruitmentTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co du lieu</p>";return}var h="<table id=\\"recruitmentDataTable\\"><thead><tr><th>ID</th><th>Phong ban</th><th>Vi tri tuyen dung</th><th>So luong</th><th>Mo ta cong viec</th><th>Yeu cau ung vien</th><th>Muc luong</th><th>Ngay yeu cau</th><th>Trang thai</th><th>File JD</th><th>Nguoi thao tac</th><th>Thoi gian thao tac</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(r){var hired=getHiredCount(r.code);var remain=Math.max(0,r.quantity-hired);var status=remain>0?"<span class=\\"badge badge-orange\\">Con "+remain+"</span>":"<span class=\\"badge badge-green\\">Du</span>";h+="<tr><td>"+r.code+"</td><td>"+r.department+"</td><td>"+r.position+"</td><td>"+r.quantity+"</td><td style=\\"max-width:150px\\">"+r.jobDesc.substring(0,50)+"...</td><td>"+r.education+", "+na(r.experience)+"</td><td>"+na(r.salaryRange)+"</td><td>"+formatDate(r.needDate)+"</td><td>"+status+"</td><td>"+formatDate(r.deadline)+"</td><td>"+operatorInfo(r)+"</td><td>"+formatDateTime(r.timestamp)+"</td><td><button class=\\"btn btn-edit btn-sm\\" onclick=\\"startEditRecruitment(\'"+r.code+"\')\\">Sua</button> <button class=\\"btn btn-delete btn-sm\\" onclick=\\"if(confirm(\'Xoa?\'))deleteRecruitment(\'"+r.code+"\')\\">Xoa</button> "+(remain>0?"<button class=\\"btn btn-action btn-sm btn-upload-candidate\\" data-code=\\""+r.code+"\\">Tai len thong tin ung vien</button>":"")+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h;c.querySelectorAll(".btn-upload-candidate").forEach(function(b){b.addEventListener("click",function(){openCandidateFormFromRecruitment(this.getAttribute("data-code"))})})}\n' +
'function openCandidateFormFromRecruitment(recCode){var rec=recruitmentRequests.find(function(r){return r.code===recCode});if(!rec)return;editingCandidateCode=null;document.getElementById("candidateFormTitle").textContent="THONG TIN UNG VIEN";document.getElementById("candidateEditInfo").style.display="none";resetForm(["candInterviewDate","candFullName","candDob","candEthnicity","candCCCD","candCCCDDate","candCCCDPlace","candCCCDExpiry","candPhone","candRelativePhone","candPermanentAddr","candTempAddr","candHeight","candWeight","candShoeSize","candSchoolName","candGradYear","candMajor","candStartDate","candWish1","candWish2","candWish3","candBusStop"]);document.getElementById("candGender").selectedIndex=0;document.getElementById("candMarital").selectedIndex=0;document.getElementById("candEducationLevel").selectedIndex=0;document.getElementById("candPrevInterview").selectedIndex=0;document.getElementById("candAvailability").selectedIndex=0;document.getElementById("candSmoking").selectedIndex=0;document.getElementById("candDisease").selectedIndex=0;document.getElementById("candBus").selectedIndex=0;document.getElementById("candChildren").value="0";document.getElementById("candCommitment").checked=false;document.querySelectorAll("input[name=\\"candSource\\"]").forEach(function(cb){cb.checked=false});document.getElementById("candCVFile").value="";document.getElementById("candBusDetail").style.display="none";document.getElementById("experienceRows").innerHTML="<div class=\\"exp-row\\"><input type=\\"text\\" placeholder=\\"Thoi gian\\"><input type=\\"text\\" placeholder=\\"Noi dung cong viec\\"><input type=\\"text\\" placeholder=\\"Don vi\\"><input type=\\"text\\" placeholder=\\"Dia diem\\"><input type=\\"text\\" placeholder=\\"Muc luong\\"></div>";document.getElementById("candRecruitCode").value=recCode;setSelectValue("candDepartment",rec.department);handleCVSectionVisibility();showView("candidateFormView")}\n' +
'function renderRecruitmentDetail(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;var hired=getHiredCount(r.code);var remain=Math.max(0,r.quantity-hired);var c=document.getElementById("recruitmentDetailContent");var h="<div class=\\"pdf-preview\\"><h2>PHIEU DE XUAT NHU CAU TUYEN DUNG</h2>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ma nhu cau tuyen dung:</span><span class=\\"info-value\\">"+r.code+"</span></div>";h+="<h3>I. THONG TIN CHUNG</h3>";var fields=[["Phong ban yeu cau",r.department],["Nguoi de xuat",r.proposer],["Vi tri tuyen dung",r.position],["Cap bac",r.level],["So luong can tuyen",r.quantity],["Da tuyen thanh cong",hired],["Con can tuyen",remain],["Ly do tuyen dung",r.reasons.join(", ")],["Thoi gian can nhan su",formatDate(r.needDate)]];fields.forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});h+="<h3>II. THONG TIN VI TRI</h3>";[["Report to",r.reportTo],["Dia diem lam viec",r.workplaces.join(", ")],["Thoi gian lam viec",r.worktimes.join(", ")],["Moi truong lam viec",na(r.environment)],["Mo ta cong viec",r.jobDesc],["Che do phuc loi",na(r.benefits)],["Muc luong de xuat",na(r.salaryRange)]].forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});h+="<h3>III. YEU CAU UNG VIEN</h3>";[["Trinh do hoc van",r.education],["Chuyen nganh",na(r.major)],["Kinh nghiem toi thieu",na(r.experience)],["Ky nang chuyen mon",na(r.techSkill)],["Ky nang mem",na(r.softSkill)],["Ngoai ngu",na(r.language)],["Chung chi",na(r.certificate)],["Deadline tuyen dung",formatDate(r.deadline)]].forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});h+="<br><div class=\\"info-row\\"><span class=\\"info-label\\">Nguoi thao tac:</span><span class=\\"info-value\\">"+operatorFull(r)+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Thoi gian tao:</span><span class=\\"info-value\\">"+formatDateTime(r.timestamp)+"</span></div>";h+="<div class=\\"signature-area\\"><div><div class=\\"sig-title\\">Nguoi de xuat</div><div>(Ky, ghi ro ho ten)</div></div><div><div class=\\"sig-title\\">Truong phong nhan su</div><div>(Ky, ghi ro ho ten)</div></div><div><div class=\\"sig-title\\">Ban Giam doc</div><div>(Ky, ghi ro ho ten)</div></div></div>";h+=renderEditHistoryHTML(r);h+="</div>";c.innerHTML=h;c.setAttribute("data-code",code);var editBtn=document.getElementById("btnEditRecruitment");var deleteBtn=document.getElementById("btnDeleteRecruitment");if(!canEdit(r)){editBtn.classList.add("btn-disabled");editBtn.disabled=true}else{editBtn.classList.remove("btn-disabled");editBtn.disabled=false}if(!canDelete(r)){deleteBtn.classList.add("btn-disabled");deleteBtn.disabled=true}else{deleteBtn.classList.remove("btn-disabled");deleteBtn.disabled=false}}\n' +
'function startEditRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canEdit(r)){alert("Da dat gioi han chinh sua toi da ("+MAX_EDIT_COUNT+" lan).");return}if(!acquireEditLock("recruitment",code))return;editingRecruitmentCode=code;document.getElementById("recruitmentFormTitle").textContent="Sua nhu cau tuyen dung - "+code;var infoDiv=document.getElementById("recruitmentEditInfo");infoDiv.style.display="block";infoDiv.innerHTML="<div class=\\"lock-info\\">Dang sua lan "+(getEditCount(r)+1)+"/"+MAX_EDIT_COUNT+" | "+getEditCountBadge(r)+"</div>";fillRecForm(r);showView("recruitmentFormView")}\n' +
'function deleteRecruitment(code){var r=recruitmentRequests.find(function(x){return x.code===code});if(!r)return;if(!canDelete(r)){var lastEdit=r.editHistory[r.editHistory.length-1];var hoursLeft=Math.ceil(DELETE_LOCK_HOURS-(new Date()-new Date(lastEdit.timestamp))/(1000*60*60));alert("Khong the xoa! Can cho "+hoursLeft+" gio.");return}if(!confirm("Ban co chac muon xoa nhu cau tuyen dung "+code+"?"))return;var idx=recruitmentRequests.findIndex(function(r){return r.code===code});if(idx===-1)return;recruitmentRequests.splice(idx,1);addHistory("Xoa","Nhu cau tuyen dung",code,"Da xoa nhu cau tuyen dung "+code);alert("Da xoa "+code);renderRecruitmentTable()}\n' +
'function renderCandidateTable(filtered){var data=filtered||candidates;var c=document.getElementById("candidateTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co du lieu</p>";return}var h="<table id=\\"candidateDataTable\\"><thead><tr><th>ID ung vien</th><th>Ten ung vien</th><th>Ngay sinh</th><th>Gioi tinh</th><th>So dien thoai</th><th>Email</th><th>Vi tri ung tuyen</th><th>Nguon tuyen dung</th><th>CV</th><th>Trang thai</th><th>Ghi chu</th><th>Nguoi thao tac</th><th>Thoi gian thao tac</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(c2){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var hasInterview=!!iv;var status=hasInterview?"<span class=\\"badge badge-green\\">Da dat lich</span>":"<span class=\\"badge badge-orange\\">Cho</span>";h+="<tr><td>"+c2.code+"</td><td>"+c2.fullName+"</td><td>"+formatDate(c2.dob)+"</td><td>"+c2.gender+"</td><td>"+c2.phone+"</td><td>-</td><td>"+c2.wish1+"</td><td>"+(c2.sources?c2.sources.join(", "):"")+"</td><td class=\\"cv-cell\\">"+(c2.cvName?"<span class=\\"link-code\\" data-cv=\\""+c2.code+"\\">"+c2.cvName+"</span>":"Khong co")+"</td><td>"+status+"</td><td>"+c2.recruitCode+"</td><td>"+operatorInfo(c2)+"</td><td>"+formatDateTime(c2.timestamp)+"</td><td><button class=\\"btn btn-edit btn-sm\\" onclick=\\"startEditCandidate(\'"+c2.code+"\')\\">Sua</button> <button class=\\"btn btn-delete btn-sm\\" onclick=\\"if(confirm(\'Xoa?\'))deleteCandidate(\'"+c2.code+"\')\\">Xoa</button> "+(!hasInterview?"<button class=\\"btn btn-action btn-sm btn-schedule-from-cand\\" data-code=\\""+c2.code+"\\">Tao lich phong van</button>":"")+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h;c.querySelectorAll(".link-code[data-cv]").forEach(function(lk){lk.addEventListener("click",function(){var cd=candidates.find(function(c){return c.code===lk.getAttribute("data-cv")});if(cd&&cd.cvURL)window.open(cd.cvURL,"_blank")})});c.querySelectorAll(".btn-schedule-from-cand").forEach(function(b){b.addEventListener("click",function(){openScheduleInterviewForm(this.getAttribute("data-code"))})})}\n' +
'function showCandidateDetailView(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;var ct=document.getElementById("candidateDetailContent");var h="<div class=\\"pdf-preview\\"><h2>PHIEU THONG TIN UNG VIEN</h2>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ma ung vien:</span><span class=\\"info-value\\">"+c.code+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ma nhu cau tuyen dung:</span><span class=\\"info-value\\">"+c.recruitCode+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Bo phan thi tuyen:</span><span class=\\"info-value\\">"+c.department+"</span></div>";h+="<h3>1. THONG TIN CA NHAN</h3>";[["Ho va ten",c.fullName],["Ngay sinh",formatDate(c.dob)],["Gioi tinh",c.gender],["Dan toc",c.ethnicity],["Tinh trang ket hon",c.marital],["So con",c.children],["Can cuoc cong dan",c.cccd],["Ngay cap",formatDate(c.cccdDate)],["Noi cap",c.cccdPlace],["So dien thoai",c.phone],["Dia chi thuong tru",c.permanentAddr]].forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});h+="<h3>2. TRINH DO & KINH NGHIEM</h3>";[["Trinh do hoc van",c.educationLevel],["Ten truong",na(c.schoolName)],["Chuyen nganh",na(c.major)]].forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});if(c.experiences&&c.experiences.length>0){h+="<table><thead><tr><th>Thoi gian</th><th>Noi dung</th><th>Don vi</th><th>Dia diem</th><th>Muc luong</th></tr></thead><tbody>";c.experiences.forEach(function(exp){h+="<tr><td>"+na(exp.period)+"</td><td>"+na(exp.job)+"</td><td>"+na(exp.company)+"</td><td>"+na(exp.location)+"</td><td>"+na(exp.salary)+"</td></tr>"});h+="</tbody></table>"}h+="<h3>3. NGUYEN VONG</h3>";[["Nguyen vong 1",c.wish1],["Nguyen vong 2",na(c.wish2)],["Nguyen vong 3",na(c.wish3)]].forEach(function(f){h+="<div class=\\"info-row\\"><span class=\\"info-label\\">"+f[0]+":</span><span class=\\"info-value\\">"+f[1]+"</span></div>"});h+="<br><div class=\\"info-row\\"><span class=\\"info-label\\">Nguoi thao tac:</span><span class=\\"info-value\\">"+operatorFull(c)+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Thoi gian:</span><span class=\\"info-value\\">"+formatDateTime(c.timestamp)+"</span></div>";h+=renderEditHistoryHTML(c);h+="</div>";ct.innerHTML=h;ct.setAttribute("data-code",code);showView("candidateDetailView");var editBtn=document.getElementById("btnEditCandidate");var deleteBtn=document.getElementById("btnDeleteCandidate");if(!canEdit(c)){editBtn.classList.add("btn-disabled");editBtn.disabled=true}else{editBtn.classList.remove("btn-disabled");editBtn.disabled=false}if(!canDelete(c)){deleteBtn.classList.add("btn-disabled");deleteBtn.disabled=true}else{deleteBtn.classList.remove("btn-disabled");deleteBtn.disabled=false}}\n' +
'function startEditCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canEdit(c)){alert("Da dat gioi han chinh sua toi da ("+MAX_EDIT_COUNT+" lan).");return}if(!acquireEditLock("candidate",code))return;editingCandidateCode=code;document.getElementById("candidateFormTitle").textContent="Sua thong tin ung vien - "+code;var infoDiv=document.getElementById("candidateEditInfo");infoDiv.style.display="block";infoDiv.innerHTML="<div class=\\"lock-info\\">Dang sua lan "+(getEditCount(c)+1)+"/"+MAX_EDIT_COUNT+" | "+getEditCountBadge(c)+"</div>";fillCandForm(c);showView("candidateFormView")}\n' +
'function deleteCandidate(code){var c=candidates.find(function(x){return x.code===code});if(!c)return;if(!canDelete(c)){var lastEdit=c.editHistory[c.editHistory.length-1];var hoursLeft=Math.ceil(DELETE_LOCK_HOURS-(new Date()-new Date(lastEdit.timestamp))/(1000*60*60));alert("Khong the xoa! Can cho "+hoursLeft+" gio.");return}if(!confirm("Ban co chac muon xoa ung vien "+code+"?"))return;var idx=candidates.findIndex(function(c){return c.code===code});if(idx===-1)return;candidates.splice(idx,1);addHistory("Xoa","Ung vien",code,"Da xoa ung vien "+code);alert("Da xoa "+code);renderCandidateTable()}\n' +
'function renderCandidateTableForInterview(filtered){var data=filtered||candidates;var c=document.getElementById("interviewCandidateTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co ung vien</p>";return}var h="<table><thead><tr><th>ID phong van</th><th>Ten ung vien</th><th>Vi tri ung tuyen</th><th>Phong ban</th><th>Ngay phong van</th><th>Gio phong van</th><th>Hinh thuc</th><th>Nguoi phong van</th><th>Dia diem / Link</th><th>Trang thai</th><th>Ghi chu</th><th>Nguoi thao tac</th><th>Thoi gian thao tac</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(c2){var iv=interviews.find(function(x){return x.candidateCode===c2.code});var rs=iv?interviewResults.find(function(r){return r.interviewCode===iv.code}):null;if(iv){h+="<tr><td>"+iv.code+"</td><td>"+c2.fullName+"</td><td>"+iv.position+"</td><td>"+c2.department+"</td><td>"+formatDate(iv.date)+"</td><td>"+iv.time+"</td><td>"+iv.tests.join(", ")+"</td><td>"+iv.interviewerName+"</td><td>"+iv.location+"</td><td><span class=\\"badge badge-green\\">Da dat lich</span></td><td>-</td><td>"+operatorInfo(iv)+"</td><td>"+formatDateTime(iv.timestamp)+"</td><td><button class=\\"btn btn-edit btn-sm\\" onclick=\\"alert(\'Chuc nang sua lich PV\')\\">Sua</button> <button class=\\"btn btn-delete btn-sm\\" onclick=\\"alert(\'Chuc nang xoa lich PV\')\\">Xoa</button> "+(!rs?"<button class=\\"btn btn-warning btn-sm btn-evaluate-from-list\\" data-ivcode=\\""+iv.code+"\\">Dien ket qua phong van</button>":"<span class=\\"badge badge-green\\">Da danh gia</span>")+"</td></tr>"}else{h+="<tr><td>-</td><td>"+c2.fullName+"</td><td>"+c2.wish1+"</td><td>"+c2.department+"</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td><span class=\\"badge badge-orange\\">Chua dat lich</span></td><td>-</td><td>"+operatorInfo(c2)+"</td><td>"+formatDateTime(c2.timestamp)+"</td><td><button class=\\"btn btn-primary btn-sm btn-schedule-iv\\" data-code=\\""+c2.code+"\\">Dat lich</button></td></tr>"}});h+="</tbody></table>";c.innerHTML=h;c.querySelectorAll(".btn-schedule-iv").forEach(function(b){b.addEventListener("click",function(){openScheduleInterviewForm(this.getAttribute("data-code"))})});c.querySelectorAll(".btn-evaluate-from-list").forEach(function(b){b.addEventListener("click",function(){showEvaluationForm(this.getAttribute("data-ivcode"));showView("interviewResultFormView")})})}\n' +
'function openScheduleInterviewForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;document.getElementById("ivCandidateSelect").innerHTML="<option value=\\""+cd.code+"\\">"+cd.code+" - "+cd.fullName+"</option>";var ps=document.getElementById("ivPosition");ps.innerHTML="<option value=\\"\\">"+"-- Chon --</option>";recruitmentRequests.forEach(function(r){if(getRemainingQuantity(r)>0){var o=document.createElement("option");o.value=r.position+" ("+r.code+")";o.textContent=r.position+" ("+r.code+") [Con "+getRemainingQuantity(r)+"]";ps.appendChild(o)}});document.getElementById("ivInterviewerCode").value="";document.getElementById("ivInterviewerInfo").style.display="none";document.getElementById("ivDate").value="";document.getElementById("ivTime").value="";document.getElementById("ivLocation").selectedIndex=0;document.querySelectorAll("input[name=\\"ivTest\\"]").forEach(function(cb){cb.checked=false});showView("scheduleInterviewFormView")}\n' +
'function renderInterviewExcelTable(){var data=interviews;var c=document.getElementById("interviewExcelTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co lich</p>";return}var h="<table id=\\"interviewExcelDataTable\\"><thead><tr><th>STT</th><th>Ma PV</th><th>Ma UV</th><th>Ten UV</th><th>Nguoi PV</th><th>Vi tri</th><th>Ngay gio</th><th>Dia diem</th><th>Bai KT</th><th>Nguoi thao tac</th><th>Thoi gian</th></tr></thead><tbody>";data.forEach(function(iv,i){var cd=candidates.find(function(c){return c.code===iv.candidateCode});h+="<tr><td>"+(i+1)+"</td><td>"+iv.code+"</td><td>"+iv.candidateCode+"</td><td>"+(cd?cd.fullName:"")+"</td><td>"+iv.interviewerName+"</td><td>"+iv.position+"</td><td>"+formatDate(iv.date)+" "+iv.time+"</td><td>"+iv.location+"</td><td>"+iv.tests.join(", ")+"</td><td>"+operatorInfo(iv)+"</td><td>"+formatDateTime(iv.timestamp)+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h}\n' +
'function renderResultInterviewTable(filtered){var data=filtered||interviews;var c=document.getElementById("resultInterviewTableContainer");document.getElementById("resultFormContainer").style.display="none";if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co du lieu</p>";return}var h="<table><thead><tr><th>ID ket qua</th><th>Ten ung vien</th><th>Vi tri ung tuyen</th><th>Ngay phong van</th><th>Nguoi phong van</th><th>Diem danh gia</th><th>Danh gia chuyen mon</th><th>Danh gia thai do</th><th>Danh gia tong the</th><th>Ket qua</th><th>De xuat luong</th><th>Ghi chu</th><th>Nguoi thao tac</th><th>Thoi gian thao tac</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(iv){var cd=candidates.find(function(c){return c.code===iv.candidateCode});var rs=interviewResults.find(function(r){return r.interviewCode===iv.code});if(rs){var techTotal=0;rs.techScores.forEach(function(s){techTotal+=s});var softTotal=0;rs.softScores.forEach(function(s){softTotal+=s});h+="<tr><td>"+iv.code+"</td><td>"+(cd?cd.fullName:"")+"</td><td>"+iv.position+"</td><td>"+formatDate(iv.date)+"</td><td>"+iv.interviewerName+"</td><td>"+rs.totalScore+"/50</td><td>"+techTotal+"/25</td><td>"+softTotal+"/25</td><td>"+rs.suitability+"</td><td><span class=\\"badge "+(rs.conclusion==="De xuat tuyen"?"badge-green":(rs.conclusion==="Du bi"?"badge-orange":"badge-red"))+"\\">"+rs.conclusion+"</span></td><td>"+(cd&&cd.offer?cd.offer.officialSalary:"-")+"</td><td>-</td><td>"+operatorInfo(rs)+"</td><td>"+formatDateTime(rs.timestamp)+"</td><td><button class=\\"btn btn-info btn-sm btn-view-result\\" data-ivcode=\\""+iv.code+"\\">Sua</button> "+(rs.conclusion==="De xuat tuyen"&&!onboardingRecords.find(function(o){return o.candidateCode===rs.candidateCode})?"<button class=\\"btn btn-success btn-sm btn-offer\\" data-ivcode=\\""+iv.code+"\\">Chuyen sang nhan vien moi</button>":"")+"</td></tr>"}else{h+="<tr><td>"+iv.code+"</td><td>"+(cd?cd.fullName:"")+"</td><td>"+iv.position+"</td><td>"+formatDate(iv.date)+"</td><td>"+iv.interviewerName+"</td><td>-</td><td>-</td><td>-</td><td>-</td><td><span class=\\"badge badge-orange\\">Chua</span></td><td>-</td><td>-</td><td>"+operatorInfo(iv)+"</td><td>"+formatDateTime(iv.timestamp)+"</td><td><button class=\\"btn btn-warning btn-sm btn-evaluate\\" data-ivcode=\\""+iv.code+"\\">Dien ket qua phong van</button></td></tr>"}});h+="</tbody></table>";c.innerHTML=h;c.querySelectorAll(".btn-evaluate").forEach(function(b){b.addEventListener("click",function(){showEvaluationForm(this.getAttribute("data-ivcode"))})});c.querySelectorAll(".btn-view-result").forEach(function(b){b.addEventListener("click",function(){showResultDetailView(this.getAttribute("data-ivcode"))})});c.querySelectorAll(".btn-offer").forEach(function(b){b.addEventListener("click",function(){showOfferForm(this.getAttribute("data-ivcode"))})})}\n' +
'function showEvaluationForm(ivCode){var iv=interviews.find(function(x){return x.code===ivCode});if(!iv)return;var cd=candidates.find(function(c){return c.code===iv.candidateCode});var ct=document.getElementById("resultFormContainer");ct.style.display="block";var tc=["Kien thuc chuyen mon","Kinh nghiem thuc te","Giai quyet van de","Tu duy logic","Ky nang cong cu"];var sc=["Giao tiep","Lam viec nhom","Chu dong","Kha nang hoc hoi","Phu hop van hoa"];var h="<div class=\\"form-section\\" id=\\"evaluationFormInner\\" data-ivcode=\\""+ivCode+"\\"><h3>Danh gia: "+(cd?cd.fullName:"")+" ("+iv.code+")</h3><h3>I. Chuyen mon (25 diem)</h3><table class=\\"score-table\\"><tbody>";tc.forEach(function(c){h+="<tr><td>"+c+"</td><td><input type=\\"number\\" class=\\"score-input tech-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr>"});h+="</tbody></table><h3>II. Ky nang & thai do (25 diem)</h3><table class=\\"score-table\\"><tbody>";sc.forEach(function(c){h+="<tr><td>"+c+"</td><td><input type=\\"number\\" class=\\"score-input soft-score\\" min=\\"0\\" max=\\"5\\" step=\\"0.5\\" value=\\"0\\"></td></tr>"});h+="</tbody></table><p>Diem tong: <strong id=\\"totalScoreDisplay\\">0</strong>/50</p><div class=\\"form-group\\"><label>Muc do phu hop *</label><div class=\\"checkbox-group\\">";["Rat phu hop","Phu hop","Can can nhac","Khong phu hop"].forEach(function(v){h+="<label><input type=\\"radio\\" name=\\"resultSuitability\\" value=\\""+v+"\\"> "+v+"</label>"});h+="</div></div><h3>Ket luan *</h3><div class=\\"checkbox-group\\">";["De xuat tuyen","Du bi","Khong tuyen"].forEach(function(v){h+="<label><input type=\\"radio\\" name=\\"resultConclusion\\" value=\\""+v+"\\"> "+v+"</label>"});h+="</div><br><button class=\\"btn btn-success\\" id=\\"btnSaveEval\\" style=\\"width:100%;min-height:45px;font-size:16px\\">Luu danh gia</button></div>";ct.innerHTML=h;ct.querySelectorAll(".score-input").forEach(function(inp){inp.addEventListener("input",function(){var t=0;ct.querySelectorAll(".score-input").forEach(function(s){t+=parseFloat(s.value)||0});document.getElementById("totalScoreDisplay").textContent=t})});document.getElementById("btnSaveEval").addEventListener("click",function(){var fe=document.getElementById("evaluationFormInner");if(!validateInterviewResultForm(fe))return;var ts=[],ss=[];fe.querySelectorAll(".tech-score").forEach(function(s){ts.push(parseFloat(s.value))});fe.querySelectorAll(".soft-score").forEach(function(s){ss.push(parseFloat(s.value))});var total=0;ts.forEach(function(s){total+=s});ss.forEach(function(s){total+=s});var stamp=getUserStamp();interviewResults.push({interviewCode:ivCode,candidateCode:iv.candidateCode,position:iv.position,techScores:ts,softScores:ss,totalScore:total,suitability:fe.querySelector("input[name=\\"resultSuitability\\"]:checked").value,conclusion:fe.querySelector("input[name=\\"resultConclusion\\"]:checked").value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,expiredStatus:null,editHistory:[]});addHistory("Tao moi","Danh gia phong van",ivCode,"Danh gia ung vien "+iv.candidateCode);alert("Luu danh gia thanh cong!");ct.style.display="none";renderResultInterviewTable()})}\n' +
'function showResultDetailView(ivCode){var r=interviewResults.find(function(x){return x.interviewCode===ivCode});if(!r)return;var cd=candidates.find(function(c){return c.code===r.candidateCode});var ct=document.getElementById("resultDetailContent");var h="<div class=\\"pdf-preview\\"><h2>PHIEU DANH GIA UNG VIEN</h2>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ma phong van:</span><span class=\\"info-value\\">"+r.interviewCode+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ung vien:</span><span class=\\"info-value\\">"+(cd?cd.fullName:"")+" ("+r.candidateCode+")</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Diem tong:</span><span class=\\"info-value\\"><strong>"+r.totalScore+"/50</strong></span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Muc do phu hop:</span><span class=\\"info-value\\">"+r.suitability+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Ket luan:</span><span class=\\"info-value\\"><strong>"+r.conclusion+"</strong></span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Nguoi thao tac:</span><span class=\\"info-value\\">"+operatorFull(r)+"</span></div>";h+="<div class=\\"info-row\\"><span class=\\"info-label\\">Thoi gian:</span><span class=\\"info-value\\">"+formatDateTime(r.timestamp)+"</span></div>";h+=renderEditHistoryHTML(r);h+="</div>";ct.innerHTML=h;ct.setAttribute("data-ivcode",ivCode);showView("resultDetailView")}\n' +
'function showOfferForm(ivCode){var rs=interviewResults.find(function(r){return r.interviewCode===ivCode});if(!rs)return;var cd=candidates.find(function(c){return c.code===rs.candidateCode});if(!cd)return;var ct=document.getElementById("offerFormContent");var h="<div class=\\"form-section\\" id=\\"offerFormInner\\" data-candcode=\\""+cd.code+"\\"><h3>Trung tuyen - "+cd.fullName+"</h3><div class=\\"form-row\\"><div class=\\"form-group\\"><label>Luong thu viec *</label><input type=\\"text\\" id=\\"offerProbSalary\\"></div><div class=\\"form-group\\"><label>Luong chinh thuc *</label><input type=\\"text\\" id=\\"offerOfficialSalary\\"></div></div><div class=\\"form-group\\"><label>Phu cap</label><div class=\\"checkbox-group\\">";["An ca","Chuyen can","Nha o","Khac"].forEach(function(v){h+="<label><input type=\\"checkbox\\" name=\\"offerAllowance\\" value=\\""+v+"\\"> "+v+"</label>"});h+="</div></div><div class=\\"form-group\\"><label>Luong dong bao hiem</label><input type=\\"text\\" id=\\"offerInsuranceSalary\\"></div><div class=\\"form-group\\"><label>Hinh thuc tra luong *</label><div class=\\"checkbox-group\\"><label><input type=\\"radio\\" name=\\"offerPayMethod\\" value=\\"Chuyen khoan\\"> Chuyen khoan</label><label><input type=\\"radio\\" name=\\"offerPayMethod\\" value=\\"Tien mat\\"> Tien mat</label></div></div><br><button class=\\"btn btn-success\\" id=\\"btnSaveOffer\\" style=\\"width:100%;min-height:45px;font-size:16px\\">Luu</button></div>";ct.innerHTML=h;showView("offerFormView");document.getElementById("btnSaveOffer").addEventListener("click",function(){if(!document.getElementById("offerProbSalary").value.trim()){alert("Nhap luong thu viec");return}if(!document.getElementById("offerOfficialSalary").value.trim()){alert("Nhap luong chinh thuc");return}var pm=document.getElementById("offerFormInner").querySelector("input[name=\\"offerPayMethod\\"]:checked");if(!pm){alert("Chon hinh thuc tra luong");return}var stamp=getUserStamp();cd.offer={probSalary:document.getElementById("offerProbSalary").value.trim(),officialSalary:document.getElementById("offerOfficialSalary").value.trim(),allowances:getCheckedValues("offerAllowance"),insuranceSalary:document.getElementById("offerInsuranceSalary").value.trim(),payMethod:pm.value,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp};addHistory("Tao moi","Thong bao trung tuyen",cd.code,"Trung tuyen: "+cd.fullName);alert("Luu thanh cong!");renderProposedExcelTable();showView("proposedExcelView")})}\n' +
'function renderProposedExcelTable(){checkOnboardingExpired();var data=interviewResults.filter(function(r){return r.conclusion==="De xuat tuyen"});var c=document.getElementById("proposedExcelTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co</p>";return}var h="<table id=\\"proposedExcelDataTable\\"><thead><tr><th>STT</th><th>Ma UV</th><th>Ten UV</th><th>Vi tri</th><th>Diem</th><th>Ket luan</th><th>Trang thai</th></tr></thead><tbody>";data.forEach(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var st=r.expiredStatus||(ob?"Da nhan viec":"Cho xac nhan");var bc=ob?"badge-green":(r.expiredStatus?"badge-red":"badge-orange");h+="<tr><td>"+(i+1)+"</td><td>"+r.candidateCode+"</td><td>"+(cd?cd.fullName:"")+"</td><td>"+r.position+"</td><td>"+r.totalScore+"/50</td><td>"+r.conclusion+"</td><td><span class=\\"badge "+bc+"\\">"+st+"</span></td></tr>"});h+="</tbody></table>";c.innerHTML=h}\n' +
'function renderOnboardingList(filtered){checkOnboardingExpired();var data=filtered||interviewResults.filter(function(r){return r.conclusion==="De xuat tuyen"});var c=document.getElementById("onboardingListContainer");document.getElementById("onboardingFormContent").style.display="none";if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co</p>";return}var h="<table><thead><tr><th>ID nhan vien</th><th>Ten nhan vien</th><th>Vi tri</th><th>Phong ban</th><th>Ngay nhan viec</th><th>Muc luong</th><th>Loai hop dong</th><th>Nguoi quan ly</th><th>Trang thai</th><th>Ghi chu</th><th>Nguoi thao tac</th><th>Thoi gian thao tac</th><th>Thao tac</th></tr></thead><tbody>";data.forEach(function(r){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var iv=interviews.find(function(x){return x.code===r.interviewCode});var st=r.expiredStatus||(ob?"Da nhan viec":"Cho xac nhan");var bc=ob?"badge-green":(r.expiredStatus?"badge-red":"badge-orange");h+="<tr><td>"+(ob?ob.newEmployeeId:"-")+"</td><td>"+(cd?cd.fullName:"")+"</td><td>"+r.position+"</td><td>"+(cd?cd.department:"")+"</td><td>"+(ob?formatDate(ob.startDate):"-")+"</td><td>"+(cd&&cd.offer?cd.offer.officialSalary:"-")+"</td><td>-</td><td>"+(iv?iv.interviewerName:"-")+"</td><td><span class=\\"badge "+bc+"\\">"+st+"</span></td><td>-</td><td>"+(ob?operatorInfo(ob):operatorInfo(r))+"</td><td>"+formatDateTime(ob?ob.timestamp:r.timestamp)+"</td><td>";if(!ob&&!r.expiredStatus){h+="<button class=\\"btn btn-edit btn-sm\\" onclick=\\"alert(\'Sua\')\\">Sua</button> <button class=\\"btn btn-delete btn-sm\\" onclick=\\"alert(\'Xoa\')\\">Xoa</button> <button class=\\"btn btn-success btn-sm btn-do-onboard\\" data-candcode=\\""+r.candidateCode+"\\">Xac nhan nhan viec</button>"}else if(ob){h+="<span class=\\"badge badge-green\\">Da xac nhan</span>"}h+="</td></tr>"});h+="</tbody></table>";c.innerHTML=h;c.querySelectorAll(".btn-do-onboard").forEach(function(b){b.addEventListener("click",function(){showOnboardingForm(this.getAttribute("data-candcode"))})})}\n' +
'function showOnboardingForm(candCode){var cd=candidates.find(function(c){return c.code===candCode});if(!cd)return;var ct=document.getElementById("onboardingFormContent");ct.style.display="block";var h="<div class=\\"form-section\\" id=\\"onboardFormInner\\" data-candcode=\\""+candCode+"\\"><h3>Nhan viec - "+cd.fullName+"</h3>";h+="<div class=\\"form-row\\"><div class=\\"form-group\\"><label>Ho va ten</label><input value=\\""+cd.fullName+"\\" readonly></div><div class=\\"form-group\\"><label>Ma nhan vien moi *</label><input class=\\"onboard-new-empid\\" data-required=\\"true\\" data-label=\\"Ma nhan vien moi\\"></div></div>";h+="<div class=\\"form-group\\"><label>Ngay nhan viec *</label><input type=\\"date\\" class=\\"onboard-start-date\\" data-required=\\"true\\" data-label=\\"Ngay nhan viec\\"></div>";h+="<h3>Bao hiem xa hoi</h3><div class=\\"form-group\\"><label>Da tham gia?</label><select class=\\"onboard-bhxh\\"><option value=\\"Chua\\">Chua</option><option value=\\"Roi\\">Roi</option></select></div><div class=\\"form-group onboard-bhxh-number-group\\" style=\\"display:none\\"><label>So so bao hiem xa hoi *</label><input class=\\"onboard-bhxh-number\\"></div>";h+="<h3>Thue</h3><div class=\\"form-group\\"><label>Ma so thue</label><input class=\\"onboard-tax-code\\"></div>";h+="<h3>Lien he khan cap</h3><div class=\\"form-row\\"><div class=\\"form-group\\"><label>Ho ten * (IN HOA)</label><input class=\\"onboard-emergency-name uppercase-input\\" data-required=\\"true\\" data-label=\\"Ten lien he khan cap\\" style=\\"text-transform:uppercase\\"></div><div class=\\"form-group\\"><label>Quan he</label><input class=\\"onboard-emergency-relation\\"></div></div><div class=\\"form-row\\"><div class=\\"form-group\\"><label>So dien thoai *</label><input class=\\"onboard-emergency-phone\\" data-required=\\"true\\" data-label=\\"So dien thoai khan cap\\"></div><div class=\\"form-group\\"><label>Dia chi</label><input class=\\"onboard-emergency-addr\\"></div></div>";h+="<h3>Ngan hang</h3><div class=\\"form-row\\"><div class=\\"form-group\\"><label>Ten ngan hang</label><input class=\\"onboard-bank-name\\"></div><div class=\\"form-group\\"><label>Chi nhanh</label><input class=\\"onboard-bank-branch\\"></div></div><div class=\\"form-row\\"><div class=\\"form-group\\"><label>So tai khoan</label><input class=\\"onboard-bank-account\\"></div><div class=\\"form-group\\"><label>Chu tai khoan (IN HOA)</label><input class=\\"onboard-bank-owner uppercase-input\\" style=\\"text-transform:uppercase\\"></div></div>";h+="<h3>Checklist ho so</h3><div class=\\"checkbox-group\\">";["Can cuoc cong dan","So yeu ly lich","Giay kham suc khoe","Bang cap","Giay khai sinh"].forEach(function(v){h+="<label><input type=\\"checkbox\\" name=\\"onboardChecklist\\" value=\\""+v+"\\"> "+v+"</label>"});h+="</div><br><button class=\\"btn btn-success\\" id=\\"btnSaveOnboard\\" style=\\"width:100%;min-height:45px;font-size:16px\\">Xac nhan nhan viec</button></div>";ct.innerHTML=h;var bhxhSel=ct.querySelector(".onboard-bhxh");bhxhSel.addEventListener("change",function(){ct.querySelector(".onboard-bhxh-number-group").style.display=this.value==="Roi"?"block":"none"});ct.querySelectorAll(".uppercase-input").forEach(function(inp){inp.addEventListener("input",function(){this.value=this.value.toUpperCase()})});document.getElementById("btnSaveOnboard").addEventListener("click",function(){var fe=document.getElementById("onboardFormInner");if(!validateOnboardingForm(fe))return;var eName=fe.querySelector(".onboard-emergency-name").value.trim();if(eName&&eName!==eName.toUpperCase()){alert("Ten lien he khan cap phai IN HOA");return}var stamp=getUserStamp();onboardingRecords.push({candidateCode:candCode,candidateName:cd.fullName,newEmployeeId:fe.querySelector(".onboard-new-empid").value.trim(),startDate:fe.querySelector(".onboard-start-date").value,bhxh:fe.querySelector(".onboard-bhxh").value,bhxhNumber:fe.querySelector(".onboard-bhxh").value==="Roi"?fe.querySelector(".onboard-bhxh-number").value.trim():"",taxCode:fe.querySelector(".onboard-tax-code").value.trim(),emergencyName:eName,emergencyRelation:fe.querySelector(".onboard-emergency-relation").value.trim(),emergencyPhone:fe.querySelector(".onboard-emergency-phone").value.trim(),emergencyAddr:fe.querySelector(".onboard-emergency-addr").value.trim(),bankName:fe.querySelector(".onboard-bank-name").value.trim(),bankBranch:fe.querySelector(".onboard-bank-branch").value.trim(),bankAccount:fe.querySelector(".onboard-bank-account").value.trim(),bankOwner:fe.querySelector(".onboard-bank-owner").value.trim(),checklist:getCheckedValues("onboardChecklist"),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp});addHistory("Tao moi","Xac nhan nhan viec",candCode,cd.fullName+" da nhan viec");alert("Xac nhan nhan viec thanh cong!");ct.style.display="none";renderOnboardingList()})}\n' +
'function renderHistoryTable(filtered){var data=filtered||actionHistory;var c=document.getElementById("historyTableContainer");if(!data.length){c.innerHTML="<p style=\\"text-align:center;color:#999;padding:20px\\">Chua co lich su</p>";return}var h="<table id=\\"historyDataTable\\"><thead><tr><th>STT</th><th>Hanh dong</th><th>Doi tuong</th><th>Ma</th><th>Chi tiet</th><th>Nguoi thao tac</th><th>Chuc vu</th><th>Phong ban</th><th>Thoi gian</th></tr></thead><tbody>";data.slice().reverse().forEach(function(h2,i){h+="<tr><td>"+(i+1)+"</td><td><span class=\\"badge "+(h2.action==="Xoa"?"badge-red":(h2.action==="Sua"?"badge-orange":"badge-green"))+"\\">"+h2.action+"</span></td><td>"+h2.target+"</td><td>"+h2.code+"</td><td>"+h2.detail+"</td><td>"+h2.employeeName+" ("+h2.employeeId+")</td><td>"+h2.employeePosition+"</td><td>"+h2.employeeDept+"</td><td>"+formatDateTime(h2.timestamp)+"</td></tr>"});h+="</tbody></table>";c.innerHTML=h}\n' +
'function exportTableToExcel(tableId,fileName){var tbl=document.getElementById(tableId);if(!tbl){alert("Khong co du lieu");return}var html="<html xmlns:o=\\"urn:schemas-microsoft-com:office:office\\" xmlns:x=\\"urn:schemas-microsoft-com:office:excel\\" xmlns=\\"http://www.w3.org/TR/REC-html40\\"><head><meta charset=\\"UTF-8\\"><style>td{mso-number-format:\\"\\\\\\\\@\\";white-space:normal;word-wrap:break-word;max-width:200px}</style></head><body>"+tbl.outerHTML+"</body></html>";var blob=new Blob([html],{type:"application/vnd.ms-excel"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=fileName+".xls";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}\n' +
'function exportDataToExcel(headers,rows,fileName){var html="<html xmlns:o=\\"urn:schemas-microsoft-com:office:office\\" xmlns:x=\\"urn:schemas-microsoft-com:office:excel\\" xmlns=\\"http://www.w3.org/TR/REC-html40\\"><head><meta charset=\\"UTF-8\\"><style>td{mso-number-format:\\"\\\\\\\\@\\";white-space:normal;word-wrap:break-word}td.cv-col{min-width:150px;width:200px}</style></head><body><table border=\\"1\\"><thead><tr>";headers.forEach(function(h){html+="<th>"+h+"</th>"});html+="</tr></thead><tbody>";rows.forEach(function(row){html+="<tr>";row.forEach(function(cell,ci){var cls=headers[ci]==="CV"?" class=\\"cv-col\\"":"";html+="<td"+cls+">"+(cell===undefined||cell===null?"":cell)+"</td>"});html+="</tr>"});html+="</tbody></table></body></html>";var blob=new Blob([html],{type:"application/vnd.ms-excel"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=fileName+".xls";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}\n' +
'function doLogin(){if(!validateLogin())return;currentUser={id:document.getElementById("loginEmpId").value.trim(),name:document.getElementById("loginEmpName").value.trim().toUpperCase(),position:document.getElementById("loginEmpPosition").value,department:document.getElementById("loginEmpDept").value};document.getElementById("barEmpId").textContent=currentUser.id;document.getElementById("barEmpName").textContent=currentUser.name;document.getElementById("barEmpPosition").textContent=currentUser.position;document.getElementById("barEmpDept").textContent=currentUser.department;document.getElementById("loginView").classList.remove("active");document.getElementById("appContainer").style.display="block";showView("mainView");updateClock();clockInterval=setInterval(updateClock,1000);addHistory("Dang nhap","He thong",currentUser.id,currentUser.name+" da dang nhap");updateAdminVisibility()}\n' +
'function doLogout(){addHistory("Dang xuat","He thong",currentUser?currentUser.id:"","Da dang xuat");Object.keys(activeEditors).forEach(function(key){activeEditors[key]=activeEditors[key].filter(function(e){return e.userId!==currentUser.id});if(activeEditors[key].length===0)delete activeEditors[key]});hideConcurrentUsersDisplay();currentUser=null;if(clockInterval){clearInterval(clockInterval);clockInterval=null}document.getElementById("appContainer").style.display="none";document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});document.getElementById("loginEmpId").value="";document.getElementById("loginEmpName").value="";document.getElementById("loginEmpPosition").selectedIndex=0;document.getElementById("loginEmpDept").selectedIndex=0;showView("loginView")}\n' +
'function initApp(){populateSelect("loginEmpDept",departments,"Chon phong ban");populateSelect("recDepartment",departments,"Chon phong ban");populateSelect("recLevel",levels,"Chon cap bac");populateSelect("recEducation",educationLevels,"Chon trinh do");populateSelect("candDepartment",departments,"Chon bo phan");populateSelect("candEducationLevel",educationLevels,"Chon trinh do");loadDataFromServer().then(function(){showView("loginView")}).catch(function(){showView("loginView")})}\n' +
'document.getElementById("btnLogin").addEventListener("click",function(){doLogin()});\n' +
'document.getElementById("loginEmpName").addEventListener("input",function(){this.value=this.value.toUpperCase()});\n' +
'document.getElementById("btnLogout").addEventListener("click",function(){if(confirm("Ban co chac muon dang xuat?"))doLogout()});\n' +
'document.getElementById("btnGoRecruitment").addEventListener("click",function(){renderRecruitmentTable();showView("recruitmentView")});\n' +
'document.getElementById("btnGoCandidate").addEventListener("click",function(){renderCandidateTable();showView("candidateView")});\n' +
'document.getElementById("btnGoInterview").addEventListener("click",function(){renderCandidateTableForInterview();showView("interviewView")});\n' +
'document.getElementById("btnGoResult").addEventListener("click",function(){renderResultInterviewTable();showView("interviewResultFormView")});\n' +
'document.getElementById("btnGoOnboarding").addEventListener("click",function(){renderOnboardingList();showView("onboardingFormView")});\n' +
'document.getElementById("btnGoHistory").addEventListener("click",function(){if(!isAdmin()){alert("Ban khong co quyen truy cap chuc nang nay.");return}renderHistoryTable();showView("historyView")});\n' +
'document.getElementById("btnBackFromRecruitment").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnBackFromRecruitmentForm").addEventListener("click",function(){if(editingRecruitmentCode)releaseEditLock("recruitment",editingRecruitmentCode);editingRecruitmentCode=null;document.getElementById("recruitmentEditInfo").style.display="none";renderRecruitmentTable();goBack("recruitmentView")});\n' +
'document.getElementById("btnBackFromRecruitmentDetail").addEventListener("click",function(){renderRecruitmentTable();goBack("recruitmentView")});\n' +
'document.getElementById("btnBackFromCandidate").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnBackFromCandidateForm").addEventListener("click",function(){if(editingCandidateCode)releaseEditLock("candidate",editingCandidateCode);editingCandidateCode=null;document.getElementById("candidateEditInfo").style.display="none";renderCandidateTable();goBack("candidateView")});\n' +
'document.getElementById("btnBackFromCandidateDetail").addEventListener("click",function(){renderCandidateTable();goBack("candidateView")});\n' +
'document.getElementById("btnBackFromInterview").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnBackFromScheduleInterview").addEventListener("click",function(){renderCandidateTableForInterview();goBack("interviewView")});\n' +
'document.getElementById("btnBackFromInterviewExcel").addEventListener("click",function(){renderCandidateTableForInterview();goBack("interviewView")});\n' +
'document.getElementById("btnBackFromInterviewResult").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnBackFromResultDetail").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});\n' +
'document.getElementById("btnBackFromProposedExcel").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});\n' +
'document.getElementById("btnBackFromOffer").addEventListener("click",function(){renderResultInterviewTable();goBack("interviewResultFormView")});\n' +
'document.getElementById("btnBackFromOnboarding").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnBackFromHistory").addEventListener("click",function(){goBack("mainView")});\n' +
'document.getElementById("btnPrintRecruitment").addEventListener("click",function(){printContent(document.getElementById("recruitmentDetailContent").innerHTML)});\n' +
'document.getElementById("btnPrintCandidate").addEventListener("click",function(){printContent(document.getElementById("candidateDetailContent").innerHTML)});\n' +
'document.getElementById("btnPrintResult").addEventListener("click",function(){printContent(document.getElementById("resultDetailContent").innerHTML)});\n' +
'document.getElementById("btnPrintInterviewExcel").addEventListener("click",function(){var tbl=document.getElementById("interviewExcelDataTable");if(tbl)printContent("<h2 style=\\"text-align:center\\">BANG LICH PHONG VAN</h2>"+tbl.outerHTML)});\n' +
'document.getElementById("btnEditRecruitment").addEventListener("click",function(){var code=document.getElementById("recruitmentDetailContent").getAttribute("data-code");if(code)startEditRecruitment(code)});\n' +
'document.getElementById("btnDeleteRecruitment").addEventListener("click",function(){var code=document.getElementById("recruitmentDetailContent").getAttribute("data-code");if(code){deleteRecruitment(code);showView("recruitmentView")}});\n' +
'document.getElementById("btnEditCandidate").addEventListener("click",function(){var code=document.getElementById("candidateDetailContent").getAttribute("data-code");if(code)startEditCandidate(code)});\n' +
'document.getElementById("btnDeleteCandidate").addEventListener("click",function(){var code=document.getElementById("candidateDetailContent").getAttribute("data-code");if(code){deleteCandidate(code);showView("candidateView")}});\n' +
'document.getElementById("btnAddRecruitment").addEventListener("click",function(){editingRecruitmentCode=null;document.getElementById("recruitmentFormTitle").textContent="Tao nhu cau tuyen dung";document.getElementById("recruitmentEditInfo").style.display="none";resetForm(["recProposer","recPosition","recQuantity","recNeedDate","recReportTo","recEnvironment","recJobDesc","recBenefits","recSalaryRange","recMajor","recExperience","recLanguage","recTechSkill","recSoftSkill","recCertificate","recDeadline"]);document.getElementById("recDepartment").selectedIndex=0;document.getElementById("recLevel").selectedIndex=0;document.getElementById("recEducation").selectedIndex=0;document.getElementById("recQuantity").value="1";document.querySelectorAll("input[name=\\"recReason\\"]").forEach(function(cb){cb.checked=false});document.querySelectorAll("input[name=\\"recWorkplace\\"]").forEach(function(cb){cb.checked=false});document.querySelectorAll("input[name=\\"recWorktime\\"]").forEach(function(cb){cb.checked=false});showView("recruitmentFormView")});\n' +
'document.getElementById("recProposer").addEventListener("input",function(){this.value=this.value.toUpperCase()});\n' +
'document.getElementById("btnSubmitRecruitment").addEventListener("click",function(){if(!validateRecruitmentForm())return;var stamp=getUserStamp();var data=collectRecFormData();if(editingRecruitmentCode){var rec=recruitmentRequests.find(function(r){return r.code===editingRecruitmentCode});if(!rec)return;if(!rec.editHistory)rec.editHistory=[];if(rec.editHistory.length>=MAX_EDIT_COUNT){alert("Da dat gioi han chinh sua toi da ("+MAX_EDIT_COUNT+" lan).");return}rec.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:"Cap nhat thong tin nhu cau tuyen dung"});Object.assign(rec,data);rec.lastEditEmployeeId=stamp.employeeId;rec.lastEditEmployeeName=stamp.employeeName;rec.lastEditTimestamp=stamp.timestamp;addHistory("Sua","Nhu cau tuyen dung",editingRecruitmentCode,"Da cap nhat thong tin (lan "+rec.editHistory.length+"/"+MAX_EDIT_COUNT+")");alert("Cap nhat thanh cong! Ma: "+editingRecruitmentCode);releaseEditLock("recruitment",editingRecruitmentCode);editingRecruitmentCode=null;document.getElementById("recruitmentEditInfo").style.display="none"}else{var rec=Object.assign({code:generateRecruitmentCode()},data,{employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});recruitmentRequests.push(rec);addHistory("Tao moi","Nhu cau tuyen dung",rec.code,"Tao moi: "+rec.position+" - "+rec.department);alert("Tao thanh cong! Ma: "+rec.code)}renderRecruitmentTable();showView("recruitmentView")});\n' +
'document.getElementById("btnAddCandidate").addEventListener("click",function(){editingCandidateCode=null;document.getElementById("candidateFormTitle").textContent="THONG TIN UNG VIEN";document.getElementById("candidateEditInfo").style.display="none";resetForm(["candRecruitCode","candInterviewDate","candFullName","candDob","candEthnicity","candCCCD","candCCCDDate","candCCCDPlace","candCCCDExpiry","candPhone","candRelativePhone","candPermanentAddr","candTempAddr","candHeight","candWeight","candShoeSize","candSchoolName","candGradYear","candMajor","candStartDate","candWish1","candWish2","candWish3","candBusStop"]);document.getElementById("candGender").selectedIndex=0;document.getElementById("candMarital").selectedIndex=0;document.getElementById("candDepartment").selectedIndex=0;document.getElementById("candEducationLevel").selectedIndex=0;document.getElementById("candPrevInterview").selectedIndex=0;document.getElementById("candAvailability").selectedIndex=0;document.getElementById("candSmoking").selectedIndex=0;document.getElementById("candDisease").selectedIndex=0;document.getElementById("candBus").selectedIndex=0;document.getElementById("candChildren").value="0";document.getElementById("candCommitment").checked=false;document.querySelectorAll("input[name=\\"candSource\\"]").forEach(function(cb){cb.checked=false});document.getElementById("candCVFile").value="";document.getElementById("candCVSection").style.display="none";document.getElementById("candBusDetail").style.display="none";document.getElementById("experienceRows").innerHTML="<div class=\\"exp-row\\"><input type=\\"text\\" placeholder=\\"Thoi gian\\"><input type=\\"text\\" placeholder=\\"Noi dung cong viec\\"><input type=\\"text\\" placeholder=\\"Don vi\\"><input type=\\"text\\" placeholder=\\"Dia diem\\"><input type=\\"text\\" placeholder=\\"Muc luong\\"></div>";showView("candidateFormView")});\n' +
'document.getElementById("btnAddExpRow").addEventListener("click",function(){var row=document.createElement("div");row.className="exp-row";row.innerHTML="<input type=\\"text\\" placeholder=\\"Thoi gian\\"><input type=\\"text\\" placeholder=\\"Noi dung cong viec\\"><input type=\\"text\\" placeholder=\\"Don vi\\"><input type=\\"text\\" placeholder=\\"Dia diem\\"><input type=\\"text\\" placeholder=\\"Muc luong\\">";document.getElementById("experienceRows").appendChild(row)});\n' +
'document.getElementById("candFullName").addEventListener("input",function(){this.value=this.value.toUpperCase()});\n' +
'document.getElementById("candRecruitCode").addEventListener("input",function(){handleCVSectionVisibility()});\n' +
'document.getElementById("candBus").addEventListener("change",function(){document.getElementById("candBusDetail").style.display=this.value==="Co"?"flex":"none"});\n' +
'document.getElementById("btnSubmitCandidate").addEventListener("click",function(){if(!validateCandidateForm())return;var stamp=getUserStamp();var data=collectCandFormData();if(editingCandidateCode){var c=candidates.find(function(x){return x.code===editingCandidateCode});if(!c)return;if(!c.editHistory)c.editHistory=[];if(c.editHistory.length>=MAX_EDIT_COUNT){alert("Da dat gioi han chinh sua toi da ("+MAX_EDIT_COUNT+" lan).");return}c.editHistory.push({employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,changes:"Cap nhat thong tin ung vien"});var oldCv={cvName:c.cvName,cvURL:c.cvURL};Object.assign(c,data);var fi=document.getElementById("candCVFile");if(fi.files&&fi.files.length>0){c.cvName=fi.files[0].name;c.cvURL=URL.createObjectURL(fi.files[0])}else{c.cvName=oldCv.cvName;c.cvURL=oldCv.cvURL}c.lastEditEmployeeId=stamp.employeeId;c.lastEditEmployeeName=stamp.employeeName;c.lastEditTimestamp=stamp.timestamp;addHistory("Sua","Ung vien",editingCandidateCode,"Da cap nhat: "+c.fullName+" (lan "+c.editHistory.length+"/"+MAX_EDIT_COUNT+")");alert("Cap nhat thanh cong! Ma: "+editingCandidateCode);releaseEditLock("candidate",editingCandidateCode);editingCandidateCode=null;document.getElementById("candidateEditInfo").style.display="none"}else{var cvName="",cvURL="";var fi=document.getElementById("candCVFile");if(fi.files&&fi.files.length>0){cvName=fi.files[0].name;cvURL=URL.createObjectURL(fi.files[0])}var c=Object.assign({code:generateCandidateCode()},data,{cvName:cvName,cvURL:cvURL,offer:null,employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]});candidates.push(c);addHistory("Tao moi","Ung vien",c.code,"Them moi: "+c.fullName);alert("Luu thanh cong! Ma: "+c.code)}renderCandidateTable();showView("candidateView")});\n' +
'document.getElementById("ivInterviewerCode").addEventListener("input",function(){var code=this.value.trim();var info=document.getElementById("ivInterviewerInfo");var iv=interviewers.find(function(i){return i.code===code});if(iv){var allowed=["Truong nhom","Truong bo phan","Truong phong"].indexOf(iv.position)!==-1;info.style.display="block";info.innerHTML="<strong>Ten:</strong> "+iv.name+"<br><strong>Chuc vu:</strong> "+iv.position+"<br><strong>Bo phan:</strong> "+iv.department;if(!allowed)info.innerHTML+="<br><span style=\\"color:red\\">Chuc vu khong du</span>";info.style.background=allowed?"#e8f5e9":"#ffebee"}else{info.style.display=code.length>0?"block":"none";info.innerHTML="<span style=\\"color:red\\">Khong tim thay</span>";info.style.background="#ffebee"}});\n' +
'document.getElementById("btnSubmitInterview").addEventListener("click",function(){if(!validateInterviewForm())return;var ic=document.getElementById("ivInterviewerCode").value.trim();var iwr=interviewers.find(function(i){return i.code===ic});var stamp=getUserStamp();var iv={code:generateInterviewFormCode(),candidateCode:document.getElementById("ivCandidateSelect").value,interviewerCode:ic,interviewerName:iwr.name,interviewerPosition:iwr.position,interviewerDept:iwr.department,position:document.getElementById("ivPosition").value,date:document.getElementById("ivDate").value,time:document.getElementById("ivTime").value,location:document.getElementById("ivLocation").value,tests:getCheckedValues("ivTest"),employeeId:stamp.employeeId,employeeName:stamp.employeeName,employeePosition:stamp.employeePosition,employeeDept:stamp.employeeDept,timestamp:stamp.timestamp,editHistory:[]};interviews.push(iv);addHistory("Tao moi","Lich phong van",iv.code,"Dat lich PV cho "+iv.candidateCode);alert("Dat lich thanh cong! Ma: "+iv.code);renderInterviewExcelTable();showView("interviewExcelView")});\n' +
'document.getElementById("btnSearchRecruitment").addEventListener("click",function(){var f=document.getElementById("recruitSearchFrom").value,t=document.getElementById("recruitSearchTo").value;renderRecruitmentTable(recruitmentRequests.filter(function(r){var ts=r.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnSearchCandidate").addEventListener("click",function(){var f=document.getElementById("candidateSearchFrom").value,t=document.getElementById("candidateSearchTo").value;renderCandidateTable(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnSearchInterview").addEventListener("click",function(){var f=document.getElementById("interviewSearchFrom").value,t=document.getElementById("interviewSearchTo").value;renderCandidateTableForInterview(candidates.filter(function(c){var ts=c.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnSearchResult").addEventListener("click",function(){var f=document.getElementById("resultSearchFrom").value,t=document.getElementById("resultSearchTo").value;renderResultInterviewTable(interviews.filter(function(iv){var ts=iv.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnSearchOnboarding").addEventListener("click",function(){var f=document.getElementById("onboardSearchFrom").value,t=document.getElementById("onboardSearchTo").value;renderOnboardingList(interviewResults.filter(function(r){if(r.conclusion!=="De xuat tuyen")return false;var ts=r.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnSearchHistory").addEventListener("click",function(){var f=document.getElementById("historySearchFrom").value,t=document.getElementById("historySearchTo").value;renderHistoryTable(actionHistory.filter(function(h){var ts=h.timestamp.substring(0,10);return(!f||ts>=f)&&(!t||ts<=t)}))});\n' +
'document.getElementById("btnExportRecruitment").addEventListener("click",function(){var h=["STT","Ma nhu cau tuyen dung","Phong ban","Nguoi de xuat","Vi tri","Cap bac","So luong can","Da tuyen","Con lai","Ly do","Muc luong","Deadline","Lan sua","Nguoi thao tac","Thoi gian"];var rows=recruitmentRequests.map(function(r,i){var hired=getHiredCount(r.code);return[i+1,r.code,r.department,r.proposer,r.position,r.level,r.quantity,hired,Math.max(0,r.quantity-hired),r.reasons.join(", "),na(r.salaryRange),formatDate(r.deadline),getEditCount(r)+"/"+MAX_EDIT_COUNT,operatorFull(r),formatDateTime(r.timestamp)]});exportDataToExcel(h,rows,"NhuCauTuyenDung")});\n' +
'document.getElementById("btnExportCandidate").addEventListener("click",function(){var h=["STT","Ma UV","Ho va ten","Ngay sinh","Gioi tinh","SDT","CCCD","Trinh do","NV1","NV2","NV3","Ma nhu cau tuyen dung","Bo phan","CV","Lan sua","Nguoi thao tac","Thoi gian"];var rows=candidates.map(function(c,i){return[i+1,c.code,c.fullName,formatDate(c.dob),c.gender,c.phone,c.cccd,c.educationLevel,c.wish1,na(c.wish2),na(c.wish3),c.recruitCode,c.department,c.cvName||"Khong co",getEditCount(c)+"/"+MAX_EDIT_COUNT,operatorFull(c),formatDateTime(c.timestamp)]});exportDataToExcel(h,rows,"DanhSachUngVien")});\n' +
'document.getElementById("btnExportInterview").addEventListener("click",function(){var h=["STT","Ma UV","Ho va ten","SDT","NV1","Trang thai"];var rows=candidates.map(function(c,i){var iv=interviews.find(function(x){return x.candidateCode===c.code});return[i+1,c.code,c.fullName,c.phone,c.wish1,iv?"Da dat lich":"Chua dat lich"]});exportDataToExcel(h,rows,"DatLichPhongVan")});\n' +
'document.getElementById("btnExportInterviewExcel").addEventListener("click",function(){var tbl=document.getElementById("interviewExcelDataTable");if(tbl)exportTableToExcel("interviewExcelDataTable","LichPhongVan");else alert("Chua co du lieu")});\n' +
'document.getElementById("btnExportResult").addEventListener("click",function(){var h=["STT","Ma PV","Ma UV","Ten UV","Vi tri","Diem","Muc do","Ket luan","Nguoi thao tac","Thoi gian"];var rows=interviewResults.map(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});return[i+1,r.interviewCode,r.candidateCode,cd?cd.fullName:"",r.position,r.totalScore+"/50",r.suitability,r.conclusion,operatorFull(r),formatDateTime(r.timestamp)]});exportDataToExcel(h,rows,"KetQuaPhongVan")});\n' +
'document.getElementById("btnExportProposedExcel").addEventListener("click",function(){var tbl=document.getElementById("proposedExcelDataTable");if(tbl)exportTableToExcel("proposedExcelDataTable","DeXuatTuyenDung");else alert("Chua co du lieu")});\n' +
'document.getElementById("btnExportOnboarding").addEventListener("click",function(){checkOnboardingExpired();var proposed=interviewResults.filter(function(r){return r.conclusion==="De xuat tuyen"});var h=["STT","Ma UV","Ten UV","Vi tri","Trang thai"];var rows=proposed.map(function(r,i){var cd=candidates.find(function(c){return c.code===r.candidateCode});var ob=onboardingRecords.find(function(o){return o.candidateCode===r.candidateCode});var st=r.expiredStatus||(ob?"Da nhan viec":"Cho xac nhan");return[i+1,r.candidateCode,cd?cd.fullName:"",r.position,st]});exportDataToExcel(h,rows,"XacNhanNhanViec")});\n' +
'document.getElementById("btnExportHistory").addEventListener("click",function(){if(!isAdmin()){alert("Khong co quyen xuat du lieu lich su!");return}var tbl=document.getElementById("historyDataTable");if(tbl)exportTableToExcel("historyDataTable","LichSuThaoTac");else alert("Chua co du lieu")});\n' +
'document.addEventListener("DOMContentLoaded",function(){initApp()});\n' +
'<\/script>\n' +
'</body>\n' +
'</html>';

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