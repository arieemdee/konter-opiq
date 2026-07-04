const test = require('node:test');
const assert = require('node:assert/strict');
const { pruneTransactionsByDate } = require('../utils/appLogic');

test('pruneTransactionsByDate menghapus transaksi di luar rentang tanggal', () => {
  const db = {
    transaksi: [
      { id: 1, tanggal: '2024-01-10' },
      { id: 2, tanggal: '2024-02-10' },
      { id: 3, tanggal: '2024-03-10' }
    ],
    masterStok: {}
  };

  const result = pruneTransactionsByDate(db, '2024-02-01', '2024-02-29');
  assert.equal(result.success, true);
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(result.data.transaksi.map((item) => item.id), [2]);
});