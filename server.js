const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_SIFRE = process.env.ADMIN_SIFRE || 'shaxzm2024admin';

function keylerYukle() {
    try {
        const data = process.env.KEYLER_DATA || '{}';
        return JSON.parse(data);
    } catch(e) {
        return {};
    }
}

async function keylerKaydet(keyler) {
    try {
        const serviceId = process.env.RENDER_SERVICE_ID;
        const apiKey = process.env.RENDER_API_KEY;
        if (!serviceId || !apiKey) {
            process.env.KEYLER_DATA = JSON.stringify(keyler);
            return;
        }
        const https = require('https');
        const body = JSON.stringify({
            envVars: [{ key: 'KEYLER_DATA', value: JSON.stringify(keyler) }]
        });
        const options = {
            hostname: 'api.render.com',
            path: `/v1/services/${serviceId}/env-vars`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        await new Promise((resolve, reject) => {
            const req = https.request(options, resolve);
            req.on('error', reject);
            req.write(body);
            req.end();
        });
        process.env.KEYLER_DATA = JSON.stringify(keyler);
    } catch(e) {
        console.error('Kaydetme hatası:', e.message);
        process.env.KEYLER_DATA = JSON.stringify(keyler);
    }
}

function keyUret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let parca1 = '', parca2 = '';
    for (let i = 0; i < 4; i++) parca1 += chars[Math.floor(Math.random() * chars.length)];
    for (let i = 0; i < 4; i++) parca2 += chars[Math.floor(Math.random() * chars.length)];
    return `SHAXZM-${parca1}-${parca2}`;
}

function bitisHesapla(paket) {
    const simdi = new Date();
    if (paket === 'deneme') simdi.setDate(simdi.getDate() + 2);
    else if (paket === 'aylik') simdi.setDate(simdi.getDate() + 30);
    else if (paket === 'omurlik') simdi.setFullYear(simdi.getFullYear() + 99);
    return simdi;
}

app.post('/dogrula', (req, res) => {
    const keyler = keylerYukle();
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
    return res.json({ gecerli: true, kullanici: keyData.kullanici, paket: keyData.paket, kalanGun: keyData.paket === 'omurlik' ? '∞' : kalanGun, mesaj: 'Giriş başarılı!' });
});

// Şifre hem header'dan hem body'den kabul edilir
function adminKontrol(req, res, next) {
    const sifre = req.headers['x-admin-sifre'] || req.body?.sifre || req.query?.sifre;
    if (sifre !== ADMIN_SIFRE) return res.status(401).json({ hata: 'Yetkisiz!' });
    next();
}

app.get('/admin/keyler', adminKontrol, (req, res) => {
    const keyler = keylerYukle();
    const liste = Object.entries(keyler).map(([key, data]) => ({
        key, ...data,
        bitis: new Date(data.bitis).toLocaleDateString('tr-TR'),
        gecerli: new Date() < new Date(data.bitis) && data.aktif
    }));
    liste.sort((a, b) => new Date(b.olusturma) - new Date(a.olusturma));
    res.json(liste);
});

app.post('/admin/key-olustur', adminKontrol, async (req, res) => {
    const keyler = keylerYukle();
    const { kullanici, paket } = req.body;
    if (!kullanici || !paket) return res.json({ hata: 'Kullanıcı ve paket gerekli!' });
    let key;
    do { key = keyUret(); } while (keyler[key]);
    keyler[key] = { kullanici, paket, bitis: bitisHesapla(paket), aktif: true, olusturma: new Date() };
    await keylerKaydet(keyler);
    res.json({ key, ...keyler[key] });
});

app.delete('/admin/key/:key', adminKontrol, async (req, res) => {
    const keyler = keylerYukle();
    const key = req.params.key.toUpperCase();
    if (keyler[key]) { delete keyler[key]; await keylerKaydet(keyler); res.json({ basari: true }); }
    else res.json({ hata: 'Key bulunamadı!' });
});

app.post('/admin/key-toggle/:key', adminKontrol, async (req, res) => {
    const keyler = keylerYukle();
    const key = req.params.key.toUpperCase();
    if (keyler[key]) { keyler[key].aktif = !keyler[key].aktif; await keylerKaydet(keyler); res.json({ basari: true, aktif: keyler[key].aktif }); }
    else res.json({ hata: 'Key bulunamadı!' });
});

app.get('/admin/istatistik', adminKontrol, (req, res) => {
    const keyler = keylerYukle();
    const simdi = new Date();
    res.json({
        toplam: Object.keys(keyler).length,
        aktif: Object.values(keyler).filter(k => k.aktif && simdi < new Date(k.bitis)).length,
        deneme: Object.values(keyler).filter(k => k.paket === 'deneme').length,
        aylik: Object.values(keyler).filter(k => k.paket === 'aylik').length,
        omurlik: Object.values(keyler).filter(k => k.paket === 'omurlik').length
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Shaxzm Lisans Sunucusu: http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
});
