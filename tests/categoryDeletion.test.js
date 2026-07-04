const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteKategori } = require('../utils/appLogic');

test('deleteKategori menghapus kategori beserta isinya', () => {
  const katalog = {
    'DATA UTAMA': {
      TELKOMSEL: [{ nama: 'S 6GB', harga: 30 }]
    },
    'DATA HARIAN': {
      XL: [{ nama: '1GB', harga: 10 }]
    }
  };

  const result = deleteKategori(katalog, 'DATA HARIAN');
  assert.equal(result.success, true);
  assert.equal(result.katalog['DATA HARIAN'], undefined);
  assert.ok(result.katalog['DATA UTAMA']);
});