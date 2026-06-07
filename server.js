const express = require('express');
const mineflayer = require('mineflayer');
const path = require('path');
const { SocksClient } = require('socks');
const fs = require('fs');
const https = require('https');
const os = require('os');

const KEY_SUNUCU = 'shaxzm-lisans.onrender.com';
const KEY_DOSYASI = path.join(process.env.APPDATA || os.homedir(), '.shaxzm-lic');
const AYAR_DOSYASI = path.join(process.env.APPDATA || os.homedir(), '.shaxzm-ayarlar.json');
const PROFIL_DOSYASI = path.join(process.env.APPDATA || os.homedir(), '.shaxzm-profiller.json');

function keyDogrula(key) {
    return new Promise((resolve) => {
        const veri = JSON.stringify({ key });
        const options = {
            hostname: KEY_SUNUCU,
            path: '/dogrula',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ valid: json.gecerli, reason: json.mesaj });
                } catch(e) {
                    resolve({ valid: false, reason: 'Sunucu hatası' });
                }
            });
        });
        req.on('error', () => resolve({ valid: false, reason: 'Sunucuya bağlanılamadı' }));
        req.write(veri);
        req.end();
    });
}

async function baslatKontrol() {
    if (fs.existsSync(KEY_DOSYASI)) {
        const key = fs.readFileSync(KEY_DOSYASI, 'utf8').trim();
        console.log('⏳ Kayıtlı lisans doğrulanıyor...');
        const sonuc = await keyDogrula(key);
        if (sonuc.valid) {
            console.log('✅ Lisans geçerli!');
            return true;
        } else {
            fs.unlinkSync(KEY_DOSYASI);
            console.log('❌ Kayıtlı lisans geçersiz.');
        }
    }
    return false;
}

async function baslat() {
    const server = express();
    const PORT = 49152;

    let keyOnaylandi = false;
    let aktifBotlar = {};
    let kapatiliyor = false;
    let globalChatLog = [];

    let botAyarlari = {
        prefix: "", baslangic: 1, adet: 10, sifre: "", mayor: "",
        tetikleyici: "", host: "", port: 25565,
        proxyHost: '', proxyPort: 1080, proxyUser: '', proxyPass: '',
        girisKomutu: ''
    };

    if (fs.existsSync(AYAR_DOSYASI)) {
        try {
            const kayitli = JSON.parse(fs.readFileSync(AYAR_DOSYASI, 'utf8'));
            botAyarlari = { ...botAyarlari, ...kayitli };
            console.log('✅ Ayarlar yüklendi.');
        } catch(e) {}
    }

    let profiller = [];
    if (fs.existsSync(PROFIL_DOSYASI)) {
        try {
            profiller = JSON.parse(fs.readFileSync(PROFIL_DOSYASI, 'utf8'));
            console.log('✅ Profiller yüklendi.');
        } catch(e) {}
    }

    server.use(express.json());

    server.get('/key', (req, res) => res.sendFile(path.join(__dirname, 'key.html')));

    server.post('/verify-key', async (req, res) => {
        const { key } = req.body;
        if (!key) return res.json({ valid: false, reason: 'Key boş olamaz' });
        const sonuc = await keyDogrula(key);
        if (sonuc.valid) {
            fs.writeFileSync(KEY_DOSYASI, key);
            keyOnaylandi = true;
        }
        res.json(sonuc);
    });

    server.get('/key-durum', (req, res) => res.json({ onaylandi: keyOnaylandi }));

    server.use(express.static(__dirname));
    server.get('/', (req, res) => {
        if (!keyOnaylandi) { res.redirect('/key'); return; }
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    server.get('/durum', (req, res) => {
        let toplam = 0, liste = [], botlar = {};
        Object.keys(aktifBotlar).forEach(isim => {
            toplam += aktifBotlar[isim].kristal;
            liste.push({
                isim,
                kristal: aktifBotlar[isim].kristal,
                durum: aktifBotlar[isim].durum,
                // Her botun hangi profile ait olduğunu da gönder
                profilIsim: aktifBotlar[isim].profilIsim || ''
            });
            botlar[isim] = {
                chatLog: aktifBotlar[isim].chatLog,
                kristal: aktifBotlar[isim].kristal,
                durum: aktifBotlar[isim].durum,
                profilIsim: aktifBotlar[isim].profilIsim || ''
            };
        });
        liste.sort((a, b) => b.kristal - a.kristal);
        res.json({ toplam, liste, botlar, globalChat: globalChatLog });
    });

    server.get('/ayarlar', (req, res) => res.json(botAyarlari));

    server.post('/ayar', (req, res) => {
        const { alan, deger, tumAyarlar } = req.body;
        if (tumAyarlar) {
            botAyarlari = { ...botAyarlari, ...tumAyarlar };
        } else if (alan && deger !== undefined) {
            botAyarlari[alan] = deger;
        }
        fs.writeFileSync(AYAR_DOSYASI, JSON.stringify(botAyarlari, null, 2));
        res.json({ success: true });
    });

    server.get('/profiller', (req, res) => res.json(profiller));

    server.post('/profil-kaydet', (req, res) => {
        const { isim, ayarlar } = req.body;
        if (!isim) return res.json({ success: false });
        const idx = profiller.findIndex(p => p.isim === isim);
        if (idx >= 0) profiller[idx] = { isim, ayarlar };
        else profiller.push({ isim, ayarlar });
        fs.writeFileSync(PROFIL_DOSYASI, JSON.stringify(profiller, null, 2));
        res.json({ success: true });
    });

    server.post('/profil-sil', (req, res) => {
        const { isim } = req.body;
        profiller = profiller.filter(p => p.isim !== isim);
        fs.writeFileSync(PROFIL_DOSYASI, JSON.stringify(profiller, null, 2));
        res.json({ success: true });
    });

    // =====================================================================
    // /baslat — ÖNEMLİ FIX:
    // Eğer istek body'sinde "profilIsim" varsa, o profilin ayarlarını kullan.
    // Global botAyarlari'nı HİÇ override etme — sadece o oturum için çalış.
    // =====================================================================
    server.post('/baslat', (req, res) => {
        const body = req.body;

        let kullanilacakAyar;

        if (body.profilIsim) {
            // Profil bazlı başlatma — global ayarlara dokunma
            const profil = profiller.find(p => p.isim === body.profilIsim);
            if (!profil) return res.json({ success: false, reason: 'Profil bulunamadı' });
            kullanilacakAyar = { ...profil.ayarlar };
            console.log(`\n[BAŞLAT] Profil: ${body.profilIsim} → ${kullanilacakAyar.host}:${kullanilacakAyar.port}`);
        } else {
            // Manuel başlatma — global ayarları güncelle ve kaydet
            botAyarlari = { ...botAyarlari, ...body };
            fs.writeFileSync(AYAR_DOSYASI, JSON.stringify(botAyarlari, null, 2));
            kullanilacakAyar = { ...botAyarlari };
            console.log(`\n[BAŞLAT] Manuel → ${kullanilacakAyar.host}:${kullanilacakAyar.port}`);
        }

        kapatiliyor = false;
        const baslangicNo = parseInt(kullanilacakAyar.baslangic) || 1;
        const adet = parseInt(kullanilacakAyar.adet) || 10;
        const bitisNo = baslangicNo + adet - 1;
        const profilIsimEtiketi = body.profilIsim || '';

        console.log(`[BAŞLAT] ${baslangicNo} - ${bitisNo} arası botlar açılıyor...\n`);

        for (let i = baslangicNo; i <= bitisNo; i++) {
            const delay = (i - baslangicNo) * 5000;
            const botIsim = `${kullanilacakAyar.prefix}${i}`;
            // Her bot kendi ayar kopyasını taşıyor — başka profil baskısı yok
            const botAyarKopya = { ...kullanilacakAyar };
            setTimeout(() => {
                if (!kapatiliyor) botOlustur(botIsim, botAyarKopya, profilIsimEtiketi);
            }, delay);
        }

        res.json({ success: true });
    });

    server.post('/durdur', (req, res) => {
        const { profilIsim } = req.body || {};
        if (profilIsim) {
            // Sadece o profile ait botları kapat
            Object.keys(aktifBotlar).forEach(isim => {
                if (aktifBotlar[isim].profilIsim === profilIsim) {
                    aktifBotlar[isim].bagli = false;
                    if (aktifBotlar[isim].loop) { clearInterval(aktifBotlar[isim].loop); aktifBotlar[isim].loop = null; }
                    if (aktifBotlar[isim].bot) { try { aktifBotlar[isim].bot.quit(); } catch(e) {} aktifBotlar[isim].bot = null; }
                    delete aktifBotlar[isim];
                }
            });
            console.log(`[DURDUR] ${profilIsim} profili botları kapatıldı.`);
        } else {
            kapatiliyor = true;
            botlariKapat();
        }
        res.json({ success: true });
    });

    server.post('/silbot', (req, res) => {
        const { botIsim } = req.body;
        if (botIsim && aktifBotlar[botIsim]) {
            aktifBotlar[botIsim].bagli = false;
            if (aktifBotlar[botIsim].loop) { clearInterval(aktifBotlar[botIsim].loop); aktifBotlar[botIsim].loop = null; }
            if (aktifBotlar[botIsim].bot) { try { aktifBotlar[botIsim].bot.quit(); } catch(e) {} aktifBotlar[botIsim].bot = null; }
            delete aktifBotlar[botIsim];
        }
        res.json({ success: true });
    });

    server.post('/komut', (req, res) => {
        const { botIsim, cmd } = req.body;
        if (botIsim === '__global__') {
            Object.keys(aktifBotlar).forEach(isim => {
                if (aktifBotlar[isim]?.bot && aktifBotlar[isim]?.durum === 'Online') {
                    try { aktifBotlar[isim].bot.chat(cmd); } catch(e) {}
                }
            });
            globalLogYaz(`[GLOBAL CMD] ${cmd}`);
        } else if (botIsim && aktifBotlar[botIsim]?.bot) {
            try { aktifBotlar[botIsim].bot.chat(cmd); } catch(e) {}
        }
        res.json({ success: true });
    });

    server.post('/sok', (req, res) => {
        const { botIsim } = req.body;
        const hedefler = botIsim === '__global__' ? Object.keys(aktifBotlar) : [botIsim];
        hedefler.forEach((isim, idx) => {
            const b = aktifBotlar[isim];
            if (!b?.bot) return;
            setTimeout(() => {
                try {
                    b.bot.chat(`/queue smptrap`);
                    uiLogYaz(isim, `📬 /queue smptrap atıldı`);
                    setTimeout(() => {
                        if (aktifBotlar[isim]?.bot) {
                            aktifBotlar[isim].bot.chat(`/warp afk`);
                            uiLogYaz(isim, `🚀 /warp afk atıldı`);
                        }
                    }, 3000);
                } catch(e) {}
            }, idx * 500);
        });
        res.json({ success: true });
    });

    server.post('/cikar', (req, res) => {
        const { botIsim } = req.body;
        const hedefler = botIsim === '__global__' ? Object.keys(aktifBotlar) : [botIsim];
        hedefler.forEach((isim, idx) => {
            const b = aktifBotlar[isim];
            if (!b?.bot) return;
            setTimeout(() => {
                try { b.bot.chat(`/lobby`); uiLogYaz(isim, `🚪 /lobby atıldı`); } catch(e) {}
            }, idx * 500);
        });
        res.json({ success: true });
    });

    function globalLogYaz(msg) {
        const time = new Date().toLocaleTimeString();
        globalChatLog.push(`[${time}] ${msg}`);
        if (globalChatLog.length > 500) globalChatLog.shift();
    }

    function uiLogYaz(botIsim, msg) {
        if (!aktifBotlar[botIsim]) return;
        const time = new Date().toLocaleTimeString();
        aktifBotlar[botIsim].chatLog.push(`[${time}] ${msg}`);
        if (aktifBotlar[botIsim].chatLog.length > 200) aktifBotlar[botIsim].chatLog.shift();
        if (!msg.startsWith('🟢') && !msg.startsWith('⏳') && !msg.startsWith('🔴') &&
            !msg.startsWith('📝') && !msg.startsWith('🔑') && !msg.startsWith('📬') &&
            !msg.startsWith('🚀') && !msg.startsWith('❌')) {
            globalChatLog.push(`[${time}] [${botIsim}] ${msg}`);
            if (globalChatLog.length > 500) globalChatLog.shift();
        }
    }

    // profilIsimEtiketi = hangi profil kartından başlatıldı (etiket için)
    function botOlustur(isim, ayar, profilIsimEtiketi) {
        const a = ayar; // Bu fonksiyon artık her zaman kendi ayar kopyasıyla çalışır
        if (kapatiliyor) return;
        if (aktifBotlar[isim]?.bot) return;

        if (!aktifBotlar[isim]) {
            aktifBotlar[isim] = {
                chatLog: [], kristal: 0,
                durum: '⏳ Bağlanıyor...',
                bagli: false, loop: null, bot: null,
                profilIsim: profilIsimEtiketi || ''
            };
        } else {
            aktifBotlar[isim].durum = '⏳ Bağlanıyor...';
            aktifBotlar[isim].bot = null;
            aktifBotlar[isim].profilIsim = profilIsimEtiketi || aktifBotlar[isim].profilIsim || '';
        }

        const botConfig = {
            host: a.host,
            port: parseInt(a.port) || 25565,
            username: isim,
            version: "1.20.1",
            skipValidation: true,
            auth: 'offline',
            hideErrors: false,
            checkTimeoutInterval: 30000,
            keepAlive: true
        };

        if (a.proxyHost && a.proxyPort) {
            botConfig.connect = (client) => {
                SocksClient.createConnection({
                    proxy: {
                        host: a.proxyHost,
                        port: parseInt(a.proxyPort),
                        type: 5,
                        userId: a.proxyUser || undefined,
                        password: a.proxyPass || undefined
                    },
                    command: 'connect',
                    destination: { host: a.host, port: parseInt(a.port) || 25565 }
                }, (err, info) => {
                    if (err) { uiLogYaz(isim, `❌ Proxy hatası: ${err.message}`); return; }
                    client.setSocket(info.socket);
                    client.emit('connect');
                });
            };
        }

        let bot;
        try { bot = mineflayer.createBot(botConfig); } catch(e) {
            uiLogYaz(isim, `❌ Bot oluşturulamadı: ${e.message}`);
            aktifBotlar[isim].durum = 'Offline';
            setTimeout(() => {
                if (aktifBotlar[isim] && !kapatiliyor) botOlustur(isim, a, profilIsimEtiketi);
            }, 10000);
            return;
        }

        aktifBotlar[isim].bot = bot;
        aktifBotlar[isim].bagli = true;

        let loginTamamlandi = false, swGirildi = false, komutlarAtildi = false;

        bot.on('login', () => {
            if (!aktifBotlar[isim]) return;
            aktifBotlar[isim].durum = 'Online';
            loginTamamlandi = false; swGirildi = false; komutlarAtildi = false;
            uiLogYaz(isim, `🟢 Sunucuya bağlandı. [${a.host}:${a.port}]`);

            if (a.girisKomutu && a.girisKomutu.trim()) {
                setTimeout(() => {
                    if (!aktifBotlar[isim]?.bagli || !aktifBotlar[isim]?.bot) return;
                    const komutlar = a.girisKomutu.split('\n').map(k => k.trim()).filter(k => k);
                    komutlar.forEach((k, ki) => {
                        setTimeout(() => {
                            if (aktifBotlar[isim]?.bagli && aktifBotlar[isim]?.bot) {
                                try { bot.chat(k); uiLogYaz(isim, `⌨️ Giriş komutu: ${k}`); } catch(e) {}
                            }
                        }, ki * 1200);
                    });
                }, 1000);
            }

            setTimeout(() => {
                if (!aktifBotlar[isim]?.bagli || !aktifBotlar[isim]?.bot || komutlarAtildi) return;
                komutlarAtildi = true;
                bot.chat(`/register ${a.sifre} ${a.sifre}`);
                uiLogYaz(isim, `📝 /register atıldı`);
            }, 2000);
            setTimeout(() => {
                if (!aktifBotlar[isim]?.bagli || !aktifBotlar[isim]?.bot) return;
                bot.chat(`/login ${a.sifre}`);
                uiLogYaz(isim, `🔑 /login atıldı`);
            }, 4000);
            setTimeout(() => {
                if (!aktifBotlar[isim]?.bagli || !aktifBotlar[isim]?.bot || swGirildi) return;
                bot.chat(`/queue smptrap`);
                uiLogYaz(isim, `📬 /queue smptrap atıldı`);
            }, 8000);
            setTimeout(() => {
                if (!aktifBotlar[isim]?.bagli || !aktifBotlar[isim]?.bot || swGirildi) return;
                bot.chat(`/warp afk`);
                uiLogYaz(isim, `🚀 /warp afk atıldı`);
                swGirildi = true;
            }, 12000);

            if (aktifBotlar[isim].loop) clearInterval(aktifBotlar[isim].loop);
            aktifBotlar[isim].loop = setInterval(() => {
                if (aktifBotlar[isim]?.bagli && aktifBotlar[isim]?.bot && aktifBotlar[isim]?.durum === 'Online') {
                    try { bot.chat('/points'); } catch(e) {}
                }
            }, 60000);
        });

        bot.on('spawn', () => {
            if (!aktifBotlar[isim]) return;
            uiLogYaz(isim, `✅ Dünya yüklendi.`);
        });

        bot.on('message', (jsonMsg) => {
            if (!aktifBotlar[isim]) return;
            const msg = jsonMsg.toString().trim();
            if (!msg) return;
            uiLogYaz(isim, msg);
            if (msg.match(/kristal|points|puan/i)) {
                const rakamlar = msg.match(/[\d,]+/);
                if (rakamlar) aktifBotlar[isim].kristal = parseInt(rakamlar[0].replace(/,/g, ''));
            }
            if (msg.match(/already registered|zaten kayıtlı|already logged|bu kullanıcı adı/i)) {
                setTimeout(() => {
                    if (aktifBotlar[isim]?.bagli && aktifBotlar[isim]?.bot) {
                        bot.chat(`/login ${a.sifre}`);
                        uiLogYaz(isim, `🔑 Zaten kayıtlı, login atılıyor...`);
                    }
                }, 1000);
            }
            if (msg.match(/logged in|giriş yapıldı|başarıyla giriş|welcome back|successfully logged/i)) {
                if (!loginTamamlandi) {
                    loginTamamlandi = true;
                    uiLogYaz(isim, `✅ Login başarılı! SW'ye giriliyor...`);
                    setTimeout(() => {
                        if (aktifBotlar[isim]?.bagli && aktifBotlar[isim]?.bot && !swGirildi) {
                            bot.chat(`/queue smptrap`);
                            uiLogYaz(isim, `📬 /queue smptrap atıldı`);
                        }
                    }, 2000);
                    setTimeout(() => {
                        if (aktifBotlar[isim]?.bagli && aktifBotlar[isim]?.bot && !swGirildi) {
                            bot.chat(`/warp afk`);
                            uiLogYaz(isim, `🚀 /warp afk atıldı`);
                            swGirildi = true;
                        }
                    }, 5000);
                }
            }

            const tetikleyici = (a.tetikleyici || `-${a.mayor}`).toLowerCase();
            const msgLower = msg.toLowerCase();
            if (tetikleyici && msgLower.includes(tetikleyici)) {
                const tetikIdx = msgLower.indexOf(tetikleyici);
                const sonrasi = msg.substring(tetikIdx + tetikleyici.length).trim();
                if (sonrasi.toLowerCase().startsWith('all')) {
                    const kristal = aktifBotlar[isim].kristal;
                    if (kristal > 0) {
                        uiLogYaz(isim, `💸 Tüm kristal (${kristal}) ${a.mayor}'e gönderiliyor...`);
                        try { bot.chat(`/points pay ${a.mayor} ${kristal}`); } catch(e) {}
                    }
                } else {
                    const miktarMatch = sonrasi.match(/\d+/);
                    if (miktarMatch) {
                        const miktar = miktarMatch[0];
                        uiLogYaz(isim, `💸 ${miktar} kristal gönderiliyor...`);
                        try { bot.chat(`/points pay ${a.mayor} ${miktar}`); } catch(e) {}
                    }
                }
            }
        });

        bot.on('end', (reason) => {
            uiLogYaz(isim, `🔴 Bağlantı kesildi: ${reason || 'bilinmiyor'}`);
            if (!aktifBotlar[isim]) return;
            aktifBotlar[isim].durum = 'Offline';
            aktifBotlar[isim].bot = null;
            if (aktifBotlar[isim].loop) { clearInterval(aktifBotlar[isim].loop); aktifBotlar[isim].loop = null; }
            if (aktifBotlar[isim].bagli && !kapatiliyor) {
                uiLogYaz(isim, `⏳ 60sn sonra yeniden bağlanılacak...`);
                // Yeniden bağlanırken de aynı ayar kopyasını kullan — global ayar değişse bile
                setTimeout(() => {
                    if (aktifBotlar[isim]?.bagli && !kapatiliyor) botOlustur(isim, a, profilIsimEtiketi);
                }, 60000);
            }
        });

        bot.on('error', (err) => { uiLogYaz(isim, `❌ Hata: ${err.message}`); });
    }

    function botlariKapat() {
        Object.keys(aktifBotlar).forEach(isim => {
            if (!aktifBotlar[isim]) return;
            aktifBotlar[isim].bagli = false;
            if (aktifBotlar[isim].loop) { clearInterval(aktifBotlar[isim].loop); aktifBotlar[isim].loop = null; }
            if (aktifBotlar[isim].bot) { try { aktifBotlar[isim].bot.quit(); } catch(e) {} aktifBotlar[isim].bot = null; }
        });
        aktifBotlar = {};
        console.log('[DURDUR] Tüm botlar kapatıldı.');
    }

    server.listen(PORT, async () => {
        console.log(`\n==================================================`);
        console.log(`🚀 Shaxzm Client AÇILIYOR - Port: ${PORT}`);
        console.log(`==================================================\n`);
        const keyGecerli = await baslatKontrol();
        if (keyGecerli) keyOnaylandi = true;
    });
}

baslat();
