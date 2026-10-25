'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'airline_booking_ci_test') {
  throw new Error('Refusing MySQL verification outside the dedicated CI test database.');
}

const db = require('../../models');

async function verify() {
  const { sequelize, SequelizeMeta } = db;
  const queryInterface = sequelize.getQueryInterface();
  await sequelize.authenticate();

  const [identityRows] = await sequelize.query(
    'SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only',
  );
  const identity = identityRows[0];
  assert.equal(identity.database_name, 'airline_booking_ci_test');
  assert.equal(Number(identity.read_only), 0);
  console.log(`Connected to isolated MySQL database ${identity.database_name} on port ${identity.server_port}.`);

  const actualTables = new Set((await queryInterface.showAllTables()).map((table) => (
    typeof table === 'string' ? table : table.tableName
  )));
  const models = Object.values(db).filter((value) => value && value.sequelize === sequelize && value.rawAttributes);

  for (const model of models) {
    const tableName = model.getTableName();
    const normalizedTableName = typeof tableName === 'string' ? tableName : tableName.tableName;
    assert.ok(actualTables.has(normalizedTableName), `Missing model table: ${normalizedTableName}`);
  }

  const migrationDirectory = path.resolve(__dirname, '../../migrations');
  const sourceMigrations = fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.js'))
    .sort();
  const [appliedRows] = await sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name');
  assert.deepEqual(appliedRows.map((row) => row.name).sort(), sourceMigrations);

  const foreignKeysByTable = new Map();
  const indexesByTable = new Map();
  for (const tableName of actualTables) {
    foreignKeysByTable.set(tableName, await queryInterface.getForeignKeyReferencesForTable(tableName));
    indexesByTable.set(tableName, await queryInterface.showIndex(tableName));
  }

  for (const model of models) {
    const tableName = model.getTableName();
    const normalizedTableName = typeof tableName === 'string' ? tableName : tableName.tableName;
    const columns = await queryInterface.describeTable(normalizedTableName);
    const foreignKeys = foreignKeysByTable.get(normalizedTableName) || [];
    const indexes = indexesByTable.get(normalizedTableName) || [];

    for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
      const field = attribute.field || attributeName;
      assert.ok(columns[field], `Missing model column ${normalizedTableName}.${field}`);
      if (attribute.primaryKey) {
        assert.ok(
          indexes.some((index) => index.primary && index.fields.some((indexField) => (indexField.attribute || indexField.name || indexField.field) === field)),
          `Missing primary-key index ${normalizedTableName}.${field}`,
        );
      }
    }

    for (const declaredIndex of model.options.indexes || []) {
      const fields = declaredIndex.fields.map((field) => (
        typeof field === 'string' ? field : field.attribute || field.name || field.field
      ));
      assert.ok(
        indexes.some((index) => index.name === declaredIndex.name
          && Boolean(index.unique) === Boolean(declaredIndex.unique)
          && fields.every((field) => index.fields.some((indexField) => (indexField.attribute || indexField.name || indexField.field) === field))),
        `Missing model index ${normalizedTableName}.${declaredIndex.name || fields.join('_')}`,
      );
    }

    for (const association of Object.values(model.associations || {})) {
      if (association.associationType !== 'BelongsTo' || association.options?.constraints === false) continue;
      const field = association.foreignKeyField || model.rawAttributes[association.foreignKey]?.field || association.foreignKey;
      assert.ok(
        foreignKeys.some((key) => key.columnName === field && key.referencedTableName === association.target.getTableName()),
        `Missing FK ${normalizedTableName}.${field} -> ${association.target.getTableName()}`,
      );
    }

    for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
      if (!attribute.unique) continue;
      const field = attribute.field || attributeName;
      assert.ok(
        indexes.some((index) => index.unique && index.fields.some((indexField) => (indexField.attribute || indexField.name || indexField.field) === field)),
        `Missing unique index ${normalizedTableName}.${field}`,
      );
    }
  }

  const roleModel = db.Role || db.role;
  assert.ok(roleModel, 'Role model is required for transaction rollback verification.');
  const marker = `ci-rollback-${Date.now()}-${process.pid}`;
  const before = await roleModel.count();
  await assert.rejects(
    sequelize.transaction(async (transaction) => {
      await roleModel.create({ name: marker, description: 'Disposable CI rollback probe' }, { transaction });
      throw new Error('intentional-ci-rollback');
    }),
    /intentional-ci-rollback/,
  );
  assert.equal(await roleModel.count(), before, 'Rolled-back CI probe unexpectedly persisted.');

  console.log(`Verified ${sourceMigrations.length} migrations, ${models.length} model tables, declared foreign keys, unique indexes, and MySQL transaction rollback.`);
}

verify()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
