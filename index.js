const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==========================================
// PENGATURAN PATH DATABASE & KATALOG (PKG)
// ==========================================
const isCompiled = typeof process.pkg !== 'undefined';
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const dbFolder = path.join(basePath, 'data');
const dbPath = path.join(dbFolder, 'database.json');
const katalogPath = path.join(dbFolder, 'katalog.json');

// Pastikan folder data ada
if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
}

// Inisialisasi Database Transaksi default jika belum ada
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ transaksi: [], masterStok: {} }, null, 2), 'utf8');
}

// Inisialisasi Katalog default jika belum ada
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

if (!fs.existsSync(katalogPath)) {
    fs.writeFileSync(katalogPath, JSON.stringify(katalogDefault, null, 2), 'utf8');
}

// Helper Baca / Tulis File JSON
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
        return rawData ? JSON.parse(rawData) : katalogDefault;
    } catch { return katalogDefault; }
}
function writeKatalog(data) { fs.writeFileSync(katalogPath, JSON.stringify(data, null, 2), 'utf8'); }


// ==========================================
// ROUTES APLIKASI
// ==========================================

// 1. Tampilan Utama GUI
app.get('/', (req, res) => {
    const db = readDB();
    const katalog = readKatalog();
    const { bulan } = req.query;
    
    let transaksiFiltered = db.transaksi;
    if (bulan) {
        transaksiFiltered = db.transaksi.filter(t => t.tanggal.startsWith(bulan));
    }

    const grandTotal = transaksiFiltered.reduce((sum, item) => sum + item.jml, 0);

    res.render('index', { 
        katalog: katalog, 
        transaksi: transaksiFiltered, 
        masterStok: db.masterStok,
        filterBulan: bulan || '',
        grandTotal: grandTotal
    });
});

// 2. Input Transaksi Harian Baru
app.post('/tambah-transaksi', (req, res) => {
    const { produk, aw, tb, ah } = req.body;
    const db = readDB();

    const namaProduk = produk;
    const hargaMatch = produk.match(/\((\d+)k\)/);
    const harga = hargaMatch ? parseInt(hargaMatch[1]) : 0;

    const stokAwal = parseInt(aw) || 0;
    const tambahStok = parseInt(tb) || 0;
    const stokAkhir = parseInt(ah) || 0;

    const ttl = stokAwal + tambahStok;
    const tr = ttl - stokAkhir;
    const jml = tr * harga;

    if (tr < 0) {
        return res.send("<script>alert('Stok akhir tidak boleh lebih besar dari Total Stok!'); window.location='/';</script>");
    }

    const tanggalHariIni = new Date().toISOString().split('T')[0];

    db.transaksi.push({
        id: Date.now(),
        tanggal: tanggalHariIni,
        produk: namaProduk,
        aw: stokAwal,
        tb: tambahStok,
        ttl: ttl,
        ah: stokAkhir,
        tr: tr,
        harga: harga,
        jml: jml,
        status: "Aktif"
    });
    
    db.masterStok[namaProduk] = stokAkhir; 
    writeDB(db);
    res.redirect('/');
});

// 3. Fitur Tutup Buku Bulanan
app.post('/tutup-buku', (req, res) => {
    const { bulanTutup } = req.body;
    const db = readDB();

    let count = 0;
    db.transaksi = db.transaksi.map(t => {
        if (t.tanggal.startsWith(bulanTutup) && t.status === "Aktif") {
            count++;
            return { ...t, status: "Tutup Buku" };
        }
        return t;
    });

    writeDB(db);
    res.send(`<script>alert('Berhasil Tutup Buku! ${count} transaksi bulan ${bulanTutup} telah dikunci.'); window.location='/?bulan=${bulanTutup}';</script>`);
});


// ==========================================
// ROUTE CRUD KATALOG (FITUR BARU)
// ==========================================

// Tambah / Update Produk ke Katalog
app.post('/katalog/tambah', (req, res) => {
    let { kategori, brand, nama_item, harga_k } = req.body;
    
    kategori = kategori.trim().toUpperCase();
    brand = brand.trim().toUpperCase();
    nama_item = nama_item.trim();
    harga_k = parseInt(harga_k) || 0;

    if (!kategori || !brand || !nama_item || harga_k <= 0) {
        return res.send("<script>alert('Semua data katalog harus diisi dengan benar!'); window.location='/';</script>");
    }

    const katalog = readKatalog();

    // Pastikan kategori & brand ada di objek json
    if (!katalog[kategori]) katalog[kategori] = {};
    if (!katalog[kategori][brand]) katalog[kategori][brand] = [];

    // Format string produk standar konter: "Nama Item (Xk)"
    const produkString = `${nama_item} (${harga_k}k)`;

    // Cek duplikasi, jika belum ada baru dimasukkan
    if (!katalog[kategori][brand].includes(produkString)) {
        katalog[kategori][brand].push(produkString);
    }

    writeKatalog(katalog);
    res.send("<script>alert('Produk baru berhasil ditambahkan ke katalog.json!'); window.location='/';</script>");
});

// Hapus Produk dari Katalog
app.post('/katalog/hapus', (req, res) => {
    const { kategori, brand, produkString } = req.body;
    const katalog = readKatalog();

    if (katalog[kategori] && katalog[kategori][brand]) {
        katalog[kategori][brand] = katalog[kategori][brand].filter(p => p !== produkString);
        
        // Bersihkan objek jika brand/kategori tersebut menjadi kosong
        if (katalog[kategori][brand].length === 0) delete katalog[kategori][brand];
        if (Object.keys(katalog[kategori]).length === 0) delete katalog[kategori];

        writeKatalog(katalog);
        return res.json({ success: true });
    }
    res.json({ success: false, message: "Produk tidak ditemukan" });
});


// Jalankan Server
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 GUI Pembukuan Konter Terhubung ke katalog.json!`);
    console.log(`🌐 Alamat Aplikasi: http://localhost:${PORT}`);
    console.log(`===================================================`);
});