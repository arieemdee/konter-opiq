const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.set('view engine', 'ejs');
// Views tetap menggunakan __dirname karena ini aset statis yang dibungkus pkg
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==========================================
// PERBAIKAN PATH DATABASE UNTUK PKG (.EXE)
// ==========================================
// Cek apakah berjalan sebagai .exe (pkg) atau node biasa
const isCompiled = typeof process.pkg !== 'undefined';
// Jika .exe, simpan data di folder tempat .exe berada. Jika node biasa, simpan di folder root proyek.
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const dbFolder = path.join(basePath, 'data');
const dbPath = path.join(dbFolder, 'database.json');

// Pastikan folder data dan file json ada secara fisik
if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ transaksi: [], masterStok: {} }, null, 2), 'utf8');
}

// ==========================================
// PERBAIKAN FUNGSI BACA/TULIS DB (ANTI CRASH)
// ==========================================
function readDB() {
    try {
        const rawData = fs.readFileSync(dbPath, 'utf8');
        // Jika file ada tapi kosong, paksa throw error agar masuk ke catch
        if (!rawData || !rawData.trim()) {
            throw new Error("File JSON kosong");
        }
        return JSON.parse(rawData);
    } catch (err) {
        console.error("⚠️ Peringatan: Gagal membaca database, membuat format baru...");
        // Kembalikan struktur default agar program tidak crash
        return { transaksi: [], masterStok: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// ==========================================
// DATABASE KATALOG PRODUK
// ==========================================
const katalogProduk = {
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

// ... 
// (Sisa kode Route Utama, Route Input, dan Route Tutup Buku biarkan sama persis seperti sebelumnya)
// ...

// Route Utama (Tampilan GUI)
app.get('/', (req, res) => {
    const db = readDB();
    const { bulan } = req.query; 
    
    let transaksiFiltered = db.transaksi;
    
    if (bulan) {
        transaksiFiltered = db.transaksi.filter(t => t.tanggal.startsWith(bulan));
    }

    const grandTotal = transaksiFiltered.reduce((sum, item) => sum + item.jml, 0);

    res.render('index', { 
        katalog: katalogProduk, 
        transaksi: transaksiFiltered, 
        masterStok: db.masterStok,
        filterBulan: bulan || '',
        grandTotal: grandTotal
    });
});

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

    const dataBaru = {
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
    };

    db.transaksi.push(dataBaru);
    db.masterStok[namaProduk] = stokAkhir; 

    writeDB(db);
    res.redirect('/');
});

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

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 GUI Pembukuan Konter Sukses Berjalan!`);
    console.log(`🌐 Buka browser Anda di alamat: http://localhost:${PORT}`);
    console.log(`===================================================`);
});