const express = require('express');
const fs = require('fs');
const path = require('path');
const {
    parseProdukSelection,
    normalizeKatalogData,
    serializeKatalogData,
    resolveKategoriInput,
    validateTransaksiInput,
    validateKatalogInput,
    deleteKategori,
    createBackupFileName,
    buildBackupPayload,
    restoreFromBackup,
    pruneTransactionsByDate
} = require('./utils/appLogic');
const app = express();
const PORT = 3000;

function buildRedirectWithMessage(path, { message, type = 'info', title = 'Informasi' }) {
    const [basePath, existingQuery = ''] = path.split('?');
    const params = new URLSearchParams(existingQuery);
    if (message) params.set('message', message);
    if (type) params.set('type', type);
    if (title) params.set('title', title);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// PENGATURAN PATH DATABASE (PKG)
const isCompiled = typeof process.pkg !== 'undefined';
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const dbFolder = path.join(basePath, 'data');
const dbPath = path.join(dbFolder, 'database.json');
const katalogPath = path.join(dbFolder, 'katalog.json');

if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ transaksi: [], masterStok: {} }, null, 2), 'utf8');

const katalogDefault = {
    "DATA UTAMA": {
        "TELKOMSEL": ["S 6GB (30k)", "B 3GB (15k)", "B 7GB (30k)"],
        "INDOSAT": ["2GB (20k)", "6GB (35k)"],
        "AXIS": ["6GB (25k)", "AXIS 0K (10k)"],
        "TRI": ["5GB (30k)"],
        "SMARTFREN": ["2GB UNL (20k)", "3GB / 14 (20k)", "UNL / 7 (35k)", "UNL / 28 (90k)"],
        "XL": ["S 11GB (30k)", "M 45GB (60k)", "L 113GB (80k)", "XL 190GB (110k)", "XL 0K (15k)"]
    },
    "AKSESORIS": {
        "UMUM": ["KABEL M (10k)", "KABEL C (15k)", "KABEL IP (20k)", "C TO C (30k)", "CAR BIASA (16k)", "CAR FAST (28k)", "HEADSET (20k)", "HOLDER (50k)"]
    }
};

if (!fs.existsSync(katalogPath)) fs.writeFileSync(katalogPath, JSON.stringify(katalogDefault, null, 2), 'utf8');

function readDB() {
    try {
        const rawData = fs.readFileSync(dbPath, 'utf8');
        return rawData ? JSON.parse(rawData) : { transaksi: [], masterStok: {} };
    } catch { return { transaksi: [], masterStok: {} }; }
}
function writeDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8'); }

function readKatalog() {
    try {
        const rawData = fs.readFileSync(katalogPath, 'utf8');
        const parsed = rawData ? JSON.parse(rawData) : katalogDefault;
        return normalizeKatalogData(parsed);
    } catch { return normalizeKatalogData(katalogDefault); }
}
function writeKatalog(data) {
    const normalized = normalizeKatalogData(data);
    fs.writeFileSync(katalogPath, JSON.stringify(serializeKatalogData(normalized), null, 2), 'utf8');
}

// ==========================================
// ROUTES UTAMA (DEFAULT: BULAN SEKARANG)
// ==========================================
app.get('/', (req, res) => {
    const db = readDB();
    const katalog = readKatalog();
    
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    let { bulanAwal, bulanAkhir, page } = req.query;
    const flashMessage = req.query.message ? decodeURIComponent(req.query.message) : '';
    const flashType = req.query.type || 'info';
    const flashTitle = req.query.title ? decodeURIComponent(req.query.title) : 'Informasi';
    
    // Default: Bulan Sekarang jika tidak ada filter
    if (Object.keys(req.query).filter(k => k !== 'page').length === 0) {
        bulanAwal = currentMonth;
        bulanAkhir = currentMonth;
    }

    // Filter transaksi
    const transaksiFiltered = db.transaksi.filter(t => {
        const tBulan = t.tanggal.substring(0, 7);
        const matchesAwal = bulanAwal ? tBulan >= bulanAwal : true;
        const matchesAkhir = bulanAkhir ? tBulan <= bulanAkhir : true;
        return matchesAwal && matchesAkhir;
    });

    // --- LOGIKA PAGINASI ---
    const limit = 50; // Jumlah item per halaman
    const currentPage = parseInt(page) || 1;
    const totalItems = transaksiFiltered.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = transaksiFiltered.slice(startIndex, endIndex);

    const grandTotal = transaksiFiltered.reduce((sum, item) => sum + item.jml, 0);
    
    res.render('index', { 
        katalog: katalog, 
        transaksi: paginatedItems, // Mengirim data yang sudah di-slice
        masterStok: db.masterStok,
        filterBulanAwal: bulanAwal || '',
        filterBulanAkhir: bulanAkhir || '',
        grandTotal: grandTotal,
        currentPage: currentPage,
        totalPages: totalPages,
        flashMessage: flashMessage,
        flashType: flashType,
        flashTitle: flashTitle
    });
});

app.post('/tambah-transaksi', (req, res) => {
    const { produk, aw, tb, ah } = req.body;
    const db = readDB();
    const parsedProduk = parseProdukSelection(produk);
    const validation = validateTransaksiInput({
        produk: parsedProduk.label,
        aw,
        tb,
        ah,
        harga: parsedProduk.harga
    });

    if (!validation.valid) {
        return res.redirect(buildRedirectWithMessage('/', { message: validation.message, type: 'error', title: 'Gagal Menyimpan' }));
    }

    const { stokAwal, tambahStok, stokAkhir, hargaJual, terjual } = validation;
    const ttl = stokAwal + tambahStok;
    const jml = terjual * hargaJual;

    const tanggalHariIni = new Date().toISOString().split('T')[0];

    db.transaksi.push({
        id: Date.now(),
        tanggal: tanggalHariIni,
        produk: parsedProduk.label,
        aw: stokAwal, tb: tambahStok, ttl: ttl, ah: stokAkhir, tr: terjual, harga: hargaJual, jml: jml,
        status: "Aktif"
    });
    
    db.masterStok[parsedProduk.label] = stokAkhir; 
    writeDB(db);
    res.redirect(buildRedirectWithMessage('/', { message: 'Transaksi berhasil disimpan.', type: 'success', title: 'Sukses' }));
});

app.post('/tutup-buku', (req, res) => {
    const { bulanTutup } = req.body;
    if (!bulanTutup) return res.redirect(buildRedirectWithMessage('/', { message: 'Pilih bulan yang ingin ditutup.', type: 'error', title: 'Perhatian' }));

    const db = readDB();
    let count = 0;
    db.transaksi = db.transaksi.map(t => {
        if (t.tanggal.startsWith(bulanTutup) && t.status === "Aktif") {
            count++; return { ...t, status: "Tutup Buku" };
        }
        return t;
    });
    writeDB(db);
    res.redirect(buildRedirectWithMessage(`/?bulanAwal=${bulanTutup}&bulanAkhir=${bulanTutup}`, { message: `Berhasil tutup buku! ${count} transaksi bulan ${bulanTutup} dikunci.`, type: 'success', title: 'Sukses' }));
});

app.post('/edit-transaksi', (req, res) => {
    const { id, aw, tb, ah } = req.body;
    const db = readDB();

    const index = db.transaksi.findIndex(t => t.id === parseInt(id));
    if (index !== -1) {
        const t = db.transaksi[index];
        const validation = validateTransaksiInput({
            produk: t.produk,
            aw,
            tb,
            ah,
            harga: t.harga
        });

        if (!validation.valid) {
            return res.redirect(buildRedirectWithMessage('/', { message: validation.message, type: 'error', title: 'Gagal Mengedit' }));
        }

        t.aw = validation.stokAwal;
        t.tb = validation.tambahStok;
        t.ah = validation.stokAkhir;
        t.ttl = t.aw + t.tb;
        t.tr = validation.terjual;
        t.jml = t.tr * t.harga;
        db.transaksi[index] = t;
        db.masterStok[t.produk] = t.ah; 
        writeDB(db);
    }
    res.redirect(buildRedirectWithMessage(req.get('Referrer') || '/', { message: 'Transaksi berhasil diperbarui.', type: 'success', title: 'Sukses' }));
});

app.post('/hapus-transaksi', (req, res) => {
    const { id } = req.body;
    const db = readDB();
    db.transaksi = db.transaksi.filter(t => t.id !== parseInt(id));
    writeDB(db);
    res.json({ success: true, message: 'Transaksi berhasil dihapus.' });
});

app.post('/katalog/tambah', (req, res) => {
    let { kategori, kategoriBaru, brand, nama_item, harga_k } = req.body;
    const kategoriResolution = resolveKategoriInput({ kategori, kategoriBaru });
    if (!kategoriResolution.valid) {
        return res.redirect(buildRedirectWithMessage('/', { message: kategoriResolution.message, type: 'error', title: 'Gagal Menyimpan' }));
    }

    let resolvedKategori = kategoriResolution.kategori;
    brand = (brand || '').trim().toUpperCase();
    nama_item = (nama_item || '').trim();
    harga_k = parseInt(harga_k, 10) || 0;

    const katalog = readKatalog();
    const validation = validateKatalogInput({
        kategori: resolvedKategori,
        brand,
        nama_item,
        harga_k,
        katalog
    });

    if (!validation.valid) {
        return res.redirect(buildRedirectWithMessage('/', { message: validation.message, type: 'error', title: 'Gagal Menyimpan' }));
    }

    if (!katalog[resolvedKategori]) katalog[resolvedKategori] = {};
    if (!katalog[resolvedKategori][brand]) katalog[resolvedKategori][brand] = [];

    katalog[resolvedKategori][brand].push({ nama: nama_item, harga: harga_k });
    writeKatalog(katalog);
    res.redirect(buildRedirectWithMessage('/', { message: 'Katalog berhasil ditambahkan.', type: 'success', title: 'Sukses' }));
});

app.get('/backup', (req, res) => {
    const db = readDB();
    const katalog = readKatalog();
    const backupPayload = buildBackupPayload(db, katalog, 'database.json', 'katalog.json');
    const backupFileName = createBackupFileName('backup.json');
    const backupPath = path.join(dbFolder, backupFileName);
    const backupContent = JSON.stringify(backupPayload, null, 2);
    fs.writeFileSync(backupPath, backupContent, 'utf8');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFileName}"`);
    res.send(backupContent);
});

app.post('/restore', (req, res) => {
    const { backupContent } = req.body;
    if (!backupContent) {
        return res.json({ success: false, message: 'Isi file backup tidak ditemukan.' });
    }

    try {
        const parsed = JSON.parse(backupContent);
        const restored = parsed.data ? parsed : { data: parsed };
        if (!restored || !restored.data) {
            return res.json({ success: false, message: 'Format backup tidak valid.' });
        }

        const dbData = restored.data.database || { transaksi: [], masterStok: {} };
        const katalogData = restored.data.katalog || {};
        writeDB(dbData);
        writeKatalog(katalogData);
        return res.json({ success: true, message: 'Data berhasil dipulihkan.' });
    } catch (error) {
        return res.json({ success: false, message: 'Gagal memulihkan data: ' + error.message });
    }
});

app.post('/prune-data', (req, res) => {
    const { startDate, endDate } = req.body;
    const db = readDB();
    const result = pruneTransactionsByDate(db, startDate, endDate);
    if (!result.success) {
        return res.json(result);
    }

    writeDB(result.data);
    return res.json({ success: true, deletedCount: result.deletedCount, message: `Data laporan lama berhasil dipangkas. ${result.deletedCount} transaksi dihapus.` });
});

app.post('/katalog/hapus', (req, res) => {
    const { kategori, brand, produkString } = req.body;
    const katalog = readKatalog();

    if (kategori && !brand && !produkString) {
        const result = deleteKategori(katalog, kategori);
        if (result.success) {
            writeKatalog(result.katalog);
            return res.json({ success: true, message: 'Kategori berhasil dihapus.' });
        }
        return res.json({ success: false, message: result.message });
    }

    if (katalog[kategori] && katalog[kategori][brand]) {
        katalog[kategori][brand] = katalog[kategori][brand].filter((item) => {
            if (typeof item === 'string') {
                return item !== produkString;
            }
            return `${item.nama} (${item.harga}k)` !== produkString;
        });
        if (katalog[kategori][brand].length === 0) delete katalog[kategori][brand];
        if (Object.keys(katalog[kategori]).length === 0) delete katalog[kategori];
        writeKatalog(katalog);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.listen(PORT, () => {
    console.log(`🚀 GUI Pembukuan Berjalan di http://localhost:${PORT}`);
});