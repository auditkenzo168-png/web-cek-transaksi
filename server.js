const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

// PASTIKAN RUTE INI ADA DI FILE SERVER.JS LU
app.post('/api/fetch-panel', async (req, res) => {
    const { email, password, targetUrl } = req.body;

    if (!email || !password || !targetUrl) {
        return res.status(400).json({ status: "GAGAL", pesan: "Data parameter kurang lengkap!" });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false, // Biar kelihatan prosesnya di layar lu
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        if (fs.existsSync('session.json')) {
            const cookies = JSON.parse(fs.readFileSync('session.json', 'utf8'));
            await page.setCookie(...cookies);
        }

        console.log("Akses langsung ke: " + targetUrl);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Cek apakah nyasar ke halaman login atau butuh autentikasi
        const isLoginPage = await page.$('input[type="email"], input[name="email"]') !== null;

        if (isLoginPage) {
            console.log("Sesi habis, mengisi form login otomatis...");
            await page.type('input[type="email"], input[name="email"]', email, { delay: 100 });
            await randomDelay(1000, 2000);
            
            await page.type('input[type="password"], input[name="password"]', password, { delay: 120 });
            await randomDelay(1500, 2500);

            await page.click('button[type="submit"], button');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

            // Simpan sesi cookie terbaru
            const currentCookies = await page.cookies();
            fs.writeFileSync('session.json', JSON.stringify(currentCookies, null, 2));
        }

        // Kalau targetUrl memaksa ke /dashboard, tunggu elemen saldonya muncul
        console.log("Menunggu elemen saldo muncul di halaman dashboard...");
        await page.waitForSelector('h5.mb-2.text-tiffany', { timeout: 15000 });

        const scrapedData = await page.evaluate(() => {
            const element = document.querySelector('h5.mb-2.text-tiffany');
            return {
                availableWithdraw: element ? element.innerText.trim() : "Kosong"
            };
        });

        await browser.close();

        return res.json({
            status: "SUKSES",
            pesan: "Data saldo dashboard berhasil ditarik!",
            data: scrapedData
        });

    } catch (error) {
        console.error("Error Automation:", error);
        if (browser) await browser.close();
        return res.status(500).json({ status: "GAGAL", pesan: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server backend jalan di http://localhost:${PORT}`);
});