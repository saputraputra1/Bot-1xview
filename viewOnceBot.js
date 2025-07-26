const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

client.on('qr', qr => {
    console.log('Scan QR code berikut:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot berhasil login!');
});

client.on('message', async msg => {
    if (msg.hasMedia && msg.isViewOnce) {
        try {
            const media = await msg.downloadMedia();
            const ext = media.mimetype.split('/')[1];
            const filename = `viewonce_${Date.now()}.${ext}`;
            const dir = path.join(__dirname, 'saved_media');
            
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            
            fs.writeFileSync(
                path.join(dir, filename),
                media.data,
                'base64'
            );
            
            console.log(`Media disimpan: ${filename}`);
            msg.reply('Media view once telah disimpan!');
            
        } catch (error) {
            console.error('Error:', error);
        }
    }
});

client.initialize();
