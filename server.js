const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Admin şifresi - bunu değiştir!
const ADMIN_SIFRE = 'shaxzm2024admin';

// Key veritabanı (bellekte tutuluyor, Render'da persist eder)
let keyler = {};
// Örnek: { 'SHAXZM-XXXX-XXXX': { kullanici: 'test', paket: 'aylik', bitis: Date, aktif: true } }

// Key üret
function keyUret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let parca1 = '', parca2 = '';
    for (let i = 0; i < 4; i++) parca1 += chars[Math.floor(Math.random() * chars.length)];
    for (let i = 0; i < 4; i++) parca2 += chars[Math.floor(Math.random() * chars.length)];
    return `SHAXZM-${parca1}-${parca2}`;
}

// Süre hesapla
function bitisHesapla(paket) {
    const simdi = new Date();
    if (paket === 'deneme') simdi.setDate(simdi.getDate() + 2);
    else if (paket === 'aylik') simdi.setDate(simdi.getDate() + 30);
    else if (paket === 'omurlik') simdi.setFullYear(simdi.getFullYear() + 99);
    return simdi;
}

// ===================== API =====================

// Key doğrula (uygulama tarafından çağrılır)
app.post('/dogrula', (req, res) => {
    const { key } = req.body;
    if (!key) return res.json({ gecerli: false, mesaj: 'Key girilmedi' });
    
    const keyData = keyler[key.toUpperCase()];
    if (!keyData) return res.json({ gecerli: false, mesaj: 'Geçersiz key!' });
    if (!keyData.aktif) return res.json({ gecerli: false, mesaj: 'Key devre dışı!' });
    
    const simdi = new Date();
    const bitis = new Date(keyData.bitis);
    if (simdi > bitis) return res.json({ gecerli: false, mesaj: 'Key süresi dolmuş!' });
    
    const kalanMs = bitis - simdi;
    const kalanGun = Math.ceil(kalanMs / (1000 * 60 * 60 * 24));
    
    return res.json({ 
        gecerli: true, 
        kullanici: keyData.kullanici,
        paket: keyData.paket,
        kalanGun: keyData.paket === 'omurlik' ? '∞' : kalanGun,
        mesaj: 'Giriş başarılı!'
    });
});

// ===================== ADMIN API =====================

// Admin giriş kontrol middleware
function adminKontrol(req, res, next) {
    const sifre = req.headers['x-admin-sifre'];
    if (sifre !== ADMIN_SIFRE) return res.status(401).json({ hata: 'Yetkisiz!' });
    next();
}

// Tüm keyleri listele
app.get('/admin/keyler', adminKontrol, (req, res) => {
    const liste = Object.entries(keyler).map(([key, data]) => ({
        key,
        ...data,
        bitis: new Date(data.bitis).toLocaleDateString('tr-TR'),
        gecerli: new Date() < new Date(data.bitis) && data.aktif
    }));
    liste.sort((a, b) => new Date(b.olusturma) - new Date(a.olusturma));
    res.json(liste);
});

// Key oluştur
app.post('/admin/key-olustur', adminKontrol, (req, res) => {
    const { kullanici, paket } = req.body;
    if (!kullanici || !paket) return res.json({ hata: 'Kullanıcı ve paket gerekli!' });
    
    let key;
    do { key = keyUret(); } while (keyler[key]);
    
    keyler[key] = {
        kullanici,
        paket,
        bitis: bitisHesapla(paket),
        aktif: true,
        olusturma: new Date()
    };
    
    res.json({ key, ...keyler[key] });
});

// Key sil
app.delete('/admin/key/:key', adminKontrol, (req, res) => {
    const key = req.params.key.toUpperCase();
    if (keyler[key]) {
        delete keyler[key];
        res.json({ basari: true });
    } else {
        res.json({ hata: 'Key bulunamadı!' });
    }
});

// Key aktif/pasif
app.post('/admin/key-toggle/:key', adminKontrol, (req, res) => {
    const key = req.params.key.toUpperCase();
    if (keyler[key]) {
        keyler[key].aktif = !keyler[key].aktif;
        res.json({ basari: true, aktif: keyler[key].aktif });
    } else {
        res.json({ hata: 'Key bulunamadı!' });
    }
});

// İstatistikler
app.get('/admin/istatistik', adminKontrol, (req, res) => {
    const simdi = new Date();
    const toplam = Object.keys(keyler).length;
    const aktif = Object.values(keyler).filter(k => k.aktif && simdi < new Date(k.bitis)).length;
    const deneme = Object.values(keyler).filter(k => k.paket === 'deneme').length;
    const aylik = Object.values(keyler).filter(k => k.paket === 'aylik').length;
    const omurlik = Object.values(keyler).filter(k => k.paket === 'omurlik').length;
    res.json({ toplam, aktif, deneme, aylik, omurlik });
});

// Admin paneli HTML
app.get('/admin', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Shaxzm Admin Panel</title>
<style>
:root{--bg:#06070d;--card:#0f1322;--border:#1a2040;--blue:#38bdf8;--green:#22c55e;--red:#ef4444;--yellow:#facc15;--text:#f3f4f6;--muted:#4b5563}
*{box-sizing:border-box;font-family:'Segoe UI',sans-serif;margin:0;padding:0}
body{background:var(--bg);color:var(--text);min-height:100vh;padding:20px}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.logo{font-size:22px;font-weight:bold;color:var(--blue)}
.login-box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:400px;margin:100px auto;text-align:center}
.login-box h2{margin-bottom:20px;color:var(--blue)}
input{width:100%;background:#0a0c14;border:1px solid var(--border);padding:12px;border-radius:8px;color:white;font-size:14px;margin-bottom:12px}
input:focus{outline:none;border-color:var(--blue)}
button{padding:10px 20px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px;transition:opacity 0.2s}
button:hover{opacity:0.85}
.btn-blue{background:var(--blue);color:#000}
.btn-green{background:var(--green);color:#000}
.btn-red{background:var(--red);color:#fff}
.btn-yellow{background:var(--yellow);color:#000}
.btn-sm{padding:6px 12px;font-size:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
.stat-num{font-size:28px;font-weight:bold;color:var(--blue);margin:8px 0}
.stat-label{font-size:12px;color:var(--muted)}
.create-box{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:24px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.create-box label{font-size:12px;color:var(--muted);display:block;margin-bottom:6px}
.create-box input,.create-box select{margin-bottom:0;width:auto}
select{background:#0a0c14;border:1px solid var(--border);padding:12px;border-radius:8px;color:white;font-size:14px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden}
th{padding:12px 16px;text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border);background:#0a0c14}
td{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold}
.badge-green{background:#052e16;color:var(--green);border:1px solid #166534}
.badge-red{background:#2d0a0a;color:var(--red);border:1px solid #7f1d1d}
.badge-yellow{background:#1c1a00;color:var(--yellow);border:1px solid #713f12}
.badge-blue{background:#0c1f33;color:var(--blue);border:1px solid #1e40af}
.key-text{font-family:monospace;font-size:13px;color:var(--blue);background:#0a1520;padding:4px 10px;border-radius:6px;cursor:pointer}
.toast{position:fixed;bottom:24px;right:24px;background:var(--card);border:1px solid var(--blue);color:var(--blue);padding:10px 20px;border-radius:8px;font-size:13px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:9999}
.toast.show{opacity:1}
.hidden{display:none}
</style>
</head>
<body>

<div id="loginEkrani">
  <div class="login-box">
    <h2>⚡ Shaxzm Admin</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px;">Admin paneline erişmek için şifre girin</p>
    <input type="password" id="adminSifre" placeholder="Admin şifresi..." onkeydown="if(event.key==='Enter')giris()">
    <button class="btn-blue" style="width:100%" onclick="giris()">Giriş Yap</button>
  </div>
</div>

<div id="adminPanel" class="hidden">
  <div class="header">
    <div class="logo">⚡ Shaxzm Admin Panel</div>
    <div style="display:flex;gap:10px;align-items:center">
      <span style="font-size:12px;color:var(--muted)">Hoşgeldin, Admin</span>
      <button class="btn-red btn-sm" onclick="cikis()">Çıkış</button>
    </div>
  </div>

  <div class="stats" id="istatistikler"></div>

  <div class="create-box">
    <div>
      <label>Kullanıcı Adı</label>
      <input id="yeniKullanici" placeholder="ör: Ahmet" style="width:180px">
    </div>
    <div>
      <label>Paket</label>
      <select id="yeniPaket">
        <option value="deneme">🎁 Deneme (2 gün)</option>
        <option value="aylik">📅 Aylık (30 gün) - 400₺</option>
        <option value="omurlik">♾️ Ömürlük - 750₺</option>
      </select>
    </div>
    <button class="btn-green" onclick="keyOlustur()">+ Key Oluştur</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>Key</th>
        <th>Kullanıcı</th>
        <th>Paket</th>
        <th>Bitiş</th>
        <th>Durum</th>
        <th>İşlem</th>
      </tr>
    </thead>
    <tbody id="keyTablosu"></tbody>
  </table>
</div>

<div class="toast" id="toast"></div>

<script>
let adminSifre = '';

function giris() {
  const s = document.getElementById('adminSifre').value;
  fetch('/admin/istatistik', { headers: { 'x-admin-sifre': s } })
    .then(r => {
      if (r.status === 401) { toastGoster('❌ Yanlış şifre!'); return; }
      adminSifre = s;
      document.getElementById('loginEkrani').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      yukle();
    });
}

function cikis() {
  adminSifre = '';
  document.getElementById('loginEkrani').classList.remove('hidden');
  document.getElementById('adminPanel').classList.add('hidden');
}

function toastGoster(msg) {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function kopyala(text) {
  navigator.clipboard.writeText(text);
  toastGoster('✅ Kopyalandı: ' + text);
}

async function yukle() {
  await istatistikYukle();
  await keylerYukle();
}

async function istatistikYukle() {
  const r = await fetch('/admin/istatistik', { headers: { 'x-admin-sifre': adminSifre } });
  const d = await r.json();
  document.getElementById('istatistikler').innerHTML = 
    '<div class="stat-card"><div class="stat-label">Toplam Key</div><div class="stat-num" style="color:var(--blue)">' + d.toplam + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Aktif Key</div><div class="stat-num" style="color:var(--green)">' + d.aktif + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Deneme</div><div class="stat-num" style="color:var(--muted)">' + d.deneme + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Aylık</div><div class="stat-num" style="color:var(--yellow)">' + d.aylik + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Ömürlük</div><div class="stat-num" style="color:var(--blue)">' + d.omurlik + '</div></div>';
}

async function keylerYukle() {
  const r = await fetch('/admin/keyler', { headers: { 'x-admin-sifre': adminSifre } });
  const liste = await r.json();
  const tbody = document.getElementById('keyTablosu');
  tbody.innerHTML = '';
  liste.forEach(k => {
    const paketBadge = k.paket === 'deneme' ? '<span class="badge badge-blue">🎁 Deneme</span>' : k.paket === 'aylik' ? '<span class="badge badge-yellow">📅 Aylık</span>' : '<span class="badge badge-green">♾️ Ömürlük</span>';
    const durumBadge = k.gecerli ? '<span class="badge badge-green">✅ Aktif</span>' : '<span class="badge badge-red">❌ Pasif</span>';
    tbody.innerHTML += '<tr>' +
      '<td><span class="key-text" onclick="kopyala(\\''+k.key+'\\')">' + k.key + '</span></td>' +
      '<td>' + k.kullanici + '</td>' +
      '<td>' + paketBadge + '</td>' +
      '<td>' + k.bitis + '</td>' +
      '<td>' + durumBadge + '</td>' +
      '<td style="display:flex;gap:6px;">' +
        '<button class="btn-yellow btn-sm" onclick="toggle(\\''+k.key+'\\')">⏸</button>' +
        '<button class="btn-red btn-sm" onclick="sil(\\''+k.key+'\\')">🗑</button>' +
      '</td>' +
    '</tr>';
  });
}

async function keyOlustur() {
  const kullanici = document.getElementById('yeniKullanici').value.trim();
  const paket = document.getElementById('yeniPaket').value;
  if (!kullanici) { toastGoster('❌ Kullanıcı adı gir!'); return; }
  const r = await fetch('/admin/key-olustur', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-sifre': adminSifre },
    body: JSON.stringify({ kullanici, paket })
  });
  const d = await r.json();
  if (d.key) {
    toastGoster('✅ Key oluşturuldu: ' + d.key);
    document.getElementById('yeniKullanici').value = '';
    yukle();
  }
}

async function sil(key) {
  if (!confirm(key + ' silinsin mi?')) return;
  await fetch('/admin/key/' + key, { method: 'DELETE', headers: { 'x-admin-sifre': adminSifre } });
  toastGoster('🗑 Silindi!');
  yukle();
}

async function toggle(key) {
  const r = await fetch('/admin/key-toggle/' + key, { method: 'POST', headers: { 'x-admin-sifre': adminSifre } });
  const d = await r.json();
  toastGoster(d.aktif ? '✅ Aktif edildi' : '⏸ Pasif edildi');
  yukle();
}

setInterval(yukle, 10000);
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`Shaxzm Lisans Sunucusu: http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
});
