const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLaporanSummary } = require('../utils/appLogic');

test('buildLaporanSummary menghitung ringkasan penjualan yang informatif', () => {
  const transaksi = [
    { tanggal: '2026-07-01', produk: 'A', tr: 2, jml: 20 },
    { tanggal: '2026-07-01', produk: 'B', tr: 5, jml: 50 },
    { tanggal: '2026-07-02', produk: 'A', tr: 3, jml: 30 },
    { tanggal: '2026-07-03', produk: 'B', tr: 1, jml: 10 }
  ];

  const result = buildLaporanSummary(transaksi, { bulanAwal: '2026-07', bulanAkhir: '2026-07' });

  assert.equal(result.totalPenjualan, 110);
  assert.equal(result.produkTerlaris.nama, 'B');
  assert.equal(result.produkTerlaris.terjual, 6);
  assert.equal(result.monthlyRows[0].label, '2026-07');
  assert.equal(result.dailyChart[0].label, '2026-07-01');
  assert.equal(result.dailyChart[0].omzet, 70);
});