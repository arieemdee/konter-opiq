const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProdukSelection, normalizeKatalogData, validateTransaksiInput, validateKatalogInput, resolveKategoriInput } = require('../utils/appLogic');

test('parseProdukSelection mengolah nilai lama yang berisi harga di string', () => {
  const result = parseProdukSelection('TELKOMSEL - S 6GB (30k)');
  assert.equal(result.nama, 'S 6GB');
  assert.equal(result.harga, 30);
  assert.equal(result.label, 'TELKOMSEL - S 6GB (30k)');
});

test('normalizeKatalogData mengubah item katalog lama ke format objek', () => {
  const katalog = normalizeKatalogData({
    'DATA UTAMA': {
      TELKOMSEL: ['S 6GB (30k)', 'B 3GB (15k)']
    }
  });

  assert.deepEqual(katalog['DATA UTAMA'].TELKOMSEL, [
    { nama: 'S 6GB', harga: 30 },
    { nama: 'B 3GB', harga: 15 }
  ]);
});

test('validateTransaksiInput menolak stok akhir melebihi total stok', () => {
  const result = validateTransaksiInput({ produk: 'S 6GB (30k)', aw: 5, tb: 2, ah: 10, harga: 30 });
  assert.equal(result.valid, false);
  assert.match(result.message, /stok akhir/i);
});

test('validateKatalogInput menolak duplikat produk pada brand yang sama', () => {
  const katalog = {
    'DATA UTAMA': {
      TELKOMSEL: [{ nama: 'S 6GB', harga: 30 }]
    }
  };

  const result = validateKatalogInput({ kategori: 'DATA UTAMA', brand: 'TELKOMSEL', nama_item: 'S 6GB', harga_k: 30, katalog });
  assert.equal(result.valid, false);
  assert.match(result.message, /sudah ada/i);
});

test('resolveKategoriInput memakai kategori baru ketika diisi', () => {
  const result = resolveKategoriInput({ kategori: 'DATA UTAMA', kategoriBaru: 'DATA HARIAN' });
  assert.equal(result.valid, true);
  assert.equal(result.kategori, 'DATA HARIAN');
});