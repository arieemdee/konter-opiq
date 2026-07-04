const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackupFileName, buildBackupPayload, restoreFromBackup } = require('../utils/appLogic');

test('createBackupFileName menghasilkan nama file backup yang valid', () => {
  const name = createBackupFileName('database.json');
  assert.match(name, /backup_.*_database\.json$/);
});

test('buildBackupPayload menyusun payload lengkap dari database dan katalog', () => {
  const payload = buildBackupPayload({ transaksi: [{ id: 1 }] }, { 'DATA UTAMA': {} }, 'database.json', 'katalog.json');
  assert.equal(payload.databaseFile, 'database.json');
  assert.equal(payload.katalogFile, 'katalog.json');
  assert.equal(payload.data.database.transaksi.length, 1);
  assert.ok(payload.data.katalog['DATA UTAMA']);
});

test('restoreFromBackup mengembalikan data yang sudah diparsing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  const filePath = path.join(tempDir, 'backup.json');
  fs.writeFileSync(filePath, JSON.stringify({ database: { transaksi: [{ id: 2 }] }, katalog: { 'DATA UTAMA': {} } }));
  const result = restoreFromBackup(filePath);
  assert.equal(result.data.database.transaksi[0].id, 2);
  assert.ok(result.data.katalog['DATA UTAMA']);
  fs.rmSync(tempDir, { recursive: true, force: true });
});