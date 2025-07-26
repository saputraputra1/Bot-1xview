const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Load config
const config = require('./config.json');

// Inisialisasi client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

// Variabel penyimpanan sementara
const tempStorage = new Map();

// Fungsi untuk membersihkan media lama
function cleanOldMedia() {
    if (!config.botSettings.autoDelete) return;
    
    const dir = config.mediaSettings.savePath;
    if (!fs.existsSync(dir)) return;

    const now = Date.now();
    const maxAge = config.botSettings.maxStorageDays * 24 * 60 * 60 * 1000;

    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        if ((now - stats.birthtimeMs) > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`Deleted old file: ${file}`);
        }
    });
}

client.on('qr', qr => {
    console.log('Scan QR code berikut:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot siap digunakan!');
    cleanOldMedia();
    setInterval(cleanOldMedia, 24 * 60 * 60 * 1000); // Bersihkan setiap 24 jam
});

client.on('message', async msg => {
    // Perintah bantuan
    if (msg.body === config.botSettings.prefix || msg.body === `${config.botSettings.prefix} help`) {
        msg.reply(config.messages.help);
        return;
    }

    // Tangkap media view once
    if (msg.hasMedia && msg.isViewOnce) {
        try {
            const media = await msg.downloadMedia();
            
            // Cek tipe media yang diizinkan
            if (!config.mediaSettings.allowedTypes.includes(media.mimetype.split('/')[0])) {
                return msg.reply('❌ Jenis media ini tidak didukung');
            }
            
            // Cek ukuran file
            const fileSizeMB = (media.data.length * 3/4) / (1024*1024);
            if (fileSizeMB > config.mediaSettings.maxFileSizeMB) {
                return msg.reply(`❌ Ukuran media terlalu besar (maks ${config.mediaSettings.maxFileSizeMB}MB)`);
            }
            
            const ext = media.mimetype.split('/')[1];
            const filename = `xview_${Date.now()}.${ext}`;
            
            // Simpan ke storage sementara
            tempStorage.set(msg.from, { filename, media });
            
            msg.reply(config.messages.mediaDetected);
            
        } catch (error) {
            console.error('Error:', error);
            msg.reply('❌ Gagal memproses media.');
        }
    }

    // Perintah save
    if (msg.body === `${config.botSettings.prefix} save`) {
        if (tempStorage.has(msg.from)) {
            const { filename, media } = tempStorage.get(msg.from);
            const dir = config.mediaSettings.savePath;
            
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            
            fs.writeFile(
                path.join(dir, filename),
                media.data,
                'base64',
                (err) => {
                    if (err) {
                        msg.reply('❌ Gagal menyimpan media.');
                        console.error(err);
                    } else {
                        const replyMsg = config.messages.mediaSaved.replace('{filename}', filename);
                        msg.reply(replyMsg);
                        
                        // Notifikasi admin
                        if (config.botSettings.notifyAdmin && msg.from !== config.botSettings.adminNumber) {
                            client.sendMessage(
                                config.botSettings.adminNumber,
                                `📥 Media baru disimpan dari ${msg.from}\nNama file: ${filename}`
                            );
                        }
                        
                        tempStorage.delete(msg.from);
                    }
                }
            );
        } else {
            msg.reply('❌ Tidak ada media yang terdeteksi. Kirim media view once terlebih dahulu.');
        }
    }

    // Perintah list (hanya admin)
    if (msg.body === `${config.botSettings.prefix} list` && msg.from === config.botSettings.adminNumber) {
        const dir = config.mediaSettings.savePath;
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            if (files.length > 0) {
                let listText = '*Daftar Media Tersimpan:*\n';
                files.forEach((file, index) => {
                    const stats = fs.statSync(path.join(dir, file));
                    const date = new Date(stats.birthtime);
                    listText += `${index+1}. ${file} (${date.toLocaleDateString()})\n`;
                });
                msg.reply(listText);
            } else {
                msg.reply('❌ Tidak ada media yang tersimpan.');
            }
        } else {
            msg.reply('❌ Tidak ada media yang tersimpan.');
        }
    }
});

client.initialize();
