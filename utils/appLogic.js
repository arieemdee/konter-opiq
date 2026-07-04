function parseProdukSelection(value) {
  if (!value || typeof value !== 'string') {
    return { nama: '', harga: 0, label: '' };
  }

  const match = value.match(/^(.*?)\s*-\s*(.*?)\s*\((\d+)[kK]?\)$/);
  if (match) {
    const [, brand, item, harga] = match;
    const label = `${brand} - ${item} (${harga}k)`;
    return { nama: item, harga: parseInt(harga, 10), label };
  }

  const simple = value.match(/\((\d+)[kK]?\)$/);
  if (simple) {
    const harga = parseInt(simple[1], 10);
    return { nama: value.replace(/\s*\((\d+)[kK]?\)\s*$/, '').trim(), harga, label: value };
  }

  return { nama: value, harga: 0, label: value };
}

function normalizeKatalogData(katalog) {
  if (!katalog || typeof katalog !== 'object') return {};

  const normalized = {};
  for (const [kategori, sub] of Object.entries(katalog)) {
    normalized[kategori] = {};
    for (const [brand, items] of Object.entries(sub || {})) {
      const list = Array.isArray(items) ? items : [];
      normalized[kategori][brand] = list.map((item) => {
        if (typeof item === 'string') {
          const parsed = parseProdukSelection(item);
          return { nama: parsed.nama || item, harga: parsed.harga || 0 };
        }

        if (item && typeof item === 'object') {
          return {
            nama: item.nama || '',
            harga: Number(item.harga) || 0
          };
        }

        return { nama: '', harga: 0 };
      });
    }
  }

  return normalized;
}

function serializeKatalogData(katalog) {
  const serialized = {};
  for (const [kategori, sub] of Object.entries(katalog || {})) {
    serialized[kategori] = {};
    for (const [brand, items] of Object.entries(sub || {})) {
      serialized[kategori][brand] = (items || []).map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return `${item.nama} (${item.harga}k)`;
        }
        return '';
      }).filter(Boolean);
    }
  }
  return serialized;
}

function validateTransaksiInput({ produk, aw, tb, ah, harga }) {
  if (!produk || typeof produk !== 'string' || !produk.trim()) {
    return { valid: false, message: 'Pilih produk terlebih dahulu.' };
  }

  const stokAwal = Number(aw);
  const tambahStok = Number(tb);
  const stokAkhir = Number(ah);
  const hargaJual = Number(harga);

  if ([stokAwal, tambahStok, stokAkhir, hargaJual].some((value) => Number.isNaN(value))) {
    return { valid: false, message: 'Input stok dan harga harus berupa angka.' };
  }

  if (stokAwal < 0 || tambahStok < 0 || stokAkhir < 0 || hargaJual <= 0) {
    return { valid: false, message: 'Nilai stok tidak boleh negatif dan harga harus lebih dari 0.' };
  }

  const totalStok = stokAwal + tambahStok;
  if (stokAkhir > totalStok) {
    return { valid: false, message: 'Stok akhir (AH) tidak boleh lebih besar dari total stok.' };
  }

  const terjual = totalStok - stokAkhir;
  if (terjual < 0) {
    return { valid: false, message: 'Jumlah terjual tidak boleh negatif.' };
  }

  return { valid: true, stokAwal, tambahStok, stokAkhir, hargaJual, terjual };
}

function resolveKategoriInput({ kategori, kategoriBaru }) {
  const selected = (kategori || '').trim().toUpperCase();
  const custom = (kategoriBaru || '').trim().toUpperCase();

  if (custom) {
    return { valid: true, kategori: custom };
  }

  if (!selected) {
    return { valid: false, message: 'Kategori wajib dipilih atau ditulis.' };
  }

  return { valid: true, kategori: selected };
}

function validateKatalogInput({ kategori, brand, nama_item, harga_k, katalog }) {
  if (!kategori || !brand || !nama_item || !harga_k) {
    return { valid: false, message: 'Semua field katalog wajib diisi.' };
  }

  const normalized = normalizeKatalogData(katalog || {});
  const targetKategori = normalized[kategori] || {};
  const existingItems = targetKategori[brand] || [];
  const duplicate = existingItems.some((item) => item.nama.toUpperCase() === nama_item.trim().toUpperCase());

  if (duplicate) {
    return { valid: false, message: 'Produk ini sudah ada pada brand yang sama.' };
  }

  return { valid: true, katalog: normalized };
}

function deleteKategori(katalog, kategori) {
  if (!katalog || !kategori) {
    return { success: false, message: 'Kategori tidak valid.' };
  }

  const normalized = normalizeKatalogData(katalog);
  if (!normalized[kategori]) {
    return { success: false, message: 'Kategori tidak ditemukan.' };
  }

  delete normalized[kategori];
  return { success: true, katalog: normalized };
}

function createBackupFileName(fileName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backup_${stamp}_${fileName}`;
}

function buildBackupPayload(databaseData, katalogData, databaseFileName, katalogFileName) {
  return {
    exportedAt: new Date().toISOString(),
    databaseFile: databaseFileName,
    katalogFile: katalogFileName,
    data: {
      database: databaseData,
      katalog: katalogData
    }
  };
}

function restoreFromBackup(filePath) {
  const rawContent = require('fs').readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawContent);
  return {
    success: true,
    data: parsed.data || parsed
  };
}

function pruneTransactionsByDate(dbData, startDate, endDate) {
  if (!dbData || !Array.isArray(dbData.transaksi)) {
    return { success: false, message: 'Data transaksi tidak valid.' };
  }

  if (!startDate || !endDate) {
    return { success: false, message: 'Rentang tanggal wajib dipilih.' };
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return { success: false, message: 'Rentang tanggal tidak valid.' };
  }

  const filtered = dbData.transaksi.filter((item) => {
    const itemDate = new Date(`${item.tanggal}T00:00:00`);
    return itemDate >= start && itemDate <= end;
  });

  const deletedCount = dbData.transaksi.length - filtered.length;
  const updatedData = { ...dbData, transaksi: filtered };
  return { success: true, deletedCount, data: updatedData };
}

module.exports = {
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
};