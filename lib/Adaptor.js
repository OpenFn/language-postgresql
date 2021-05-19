"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.execute = execute;
exports.sql = sql;
exports.findValue = findValue;
exports.insert = insert;
exports.insertMany = insertMany;
exports.upsert = upsert;
exports.upsertIf = upsertIf;
exports.upsertMany = upsertMany;
exports.describeTable = describeTable;
exports.insertTable = insertTable;
exports.modifyTable = modifyTable;
Object.defineProperty(exports, "alterState", {
  enumerable: true,
  get: function get() {
    return _languageCommon.alterState;
  }
});
Object.defineProperty(exports, "arrayToString", {
  enumerable: true,
  get: function get() {
    return _languageCommon.arrayToString;
  }
});
Object.defineProperty(exports, "combine", {
  enumerable: true,
  get: function get() {
    return _languageCommon.combine;
  }
});
Object.defineProperty(exports, "dataPath", {
  enumerable: true,
  get: function get() {
    return _languageCommon.dataPath;
  }
});
Object.defineProperty(exports, "dataValue", {
  enumerable: true,
  get: function get() {
    return _languageCommon.dataValue;
  }
});
Object.defineProperty(exports, "each", {
  enumerable: true,
  get: function get() {
    return _languageCommon.each;
  }
});
Object.defineProperty(exports, "field", {
  enumerable: true,
  get: function get() {
    return _languageCommon.field;
  }
});
Object.defineProperty(exports, "http", {
  enumerable: true,
  get: function get() {
    return _languageCommon.http;
  }
});
Object.defineProperty(exports, "fields", {
  enumerable: true,
  get: function get() {
    return _languageCommon.fields;
  }
});
Object.defineProperty(exports, "lastReferenceValue", {
  enumerable: true,
  get: function get() {
    return _languageCommon.lastReferenceValue;
  }
});
Object.defineProperty(exports, "merge", {
  enumerable: true,
  get: function get() {
    return _languageCommon.merge;
  }
});
Object.defineProperty(exports, "sourceValue", {
  enumerable: true,
  get: function get() {
    return _languageCommon.sourceValue;
  }
});

var _languageCommon = require("@openfn/language-common");

var _url = require("url");

var _pg = _interopRequireDefault(require("pg"));

var _pgFormat = _interopRequireDefault(require("pg-format"));

var _path = require("path");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/** @module Adaptor */

/**
 * Execute a sequence of operations.
 * Wraps `language-common/execute`, and prepends initial state for postgresql.
 * @example
 * execute(
 *   create('foo'),
 *   delete('bar')
 * )(state)
 * @constructor
 * @param {Operations} operations - Operations to be performed.
 * @returns {Operation}
 */
function execute() {
  for (var _len = arguments.length, operations = new Array(_len), _key = 0; _key < _len; _key++) {
    operations[_key] = arguments[_key];
  }

  var initialState = {
    references: [],
    data: null,
    queries: []
  };
  return function (state) {
    return _languageCommon.execute.apply(void 0, [createClient, connect].concat(operations, [disconnect, cleanupState]))(_objectSpread({}, initialState, {}, state))["catch"](function (e) {
      console.error(e);
      console.error('Unhandled error in the operations. Exiting process.');
      process.exit(1);
    });
  };
}

function createClient(state) {
  var _state$configuration = state.configuration,
      host = _state$configuration.host,
      port = _state$configuration.port,
      database = _state$configuration.database,
      password = _state$configuration.password,
      user = _state$configuration.user,
      ssl = _state$configuration.ssl,
      allowSelfSignedCert = _state$configuration.allowSelfSignedCert; // Allowing or blocking self signed certificate

  var sslOptions = ssl ? {
    rejectUnauthorized: !allowSelfSignedCert
  } : false; // setup client config

  var config = {
    host: host,
    port: port,
    database: database,
    user: user,
    password: password,
    ssl: sslOptions
  }; // instantiate a new client

  var client = new _pg["default"].Client(config);
  return _objectSpread({}, state, {
    client: client
  });
}

function connect(state) {
  var client = state.client;
  client.connect();
  return _objectSpread({}, state, {
    client: client
  });
}

function disconnect(state) {
  var client = state.client;
  client.end();
  return state;
}

function cleanupState(state) {
  delete state.client;
  return state;
}

function queryHandler(state, query, options) {
  var client = state.client;
  return new Promise(function (resolve, reject) {
    if (options) {
      if (options.writeSql) {
        console.log('Adding prepared SQL to state.queries array.');
        state.queries.push(query);
      }

      if (options.execute === false) {
        console.log('Not executing query; options.execute === false');
        resolve('Query not executed.');
      }
    }

    client.query(query, function (err, result) {
      if (err) {
        reject(err);
        client.end();
      } else {
        console.log("".concat(result.command, " succeeded, rowCount: ").concat(result.rowCount));
        resolve(result);
      }
    });
  }).then(function (data) {
    return _objectSpread({}, state, {
      response: {
        body: data
      }
    });
  });
}
/**
 * Execute an SQL statement
 * @public
 * @example
 * sql(state => `select(*) from ${state.data.tableName};`, { writeSql: true })
 * @constructor
 * @param {function} sqlQuery - a function which takes state and returns a
 * string of SQL.
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function sql(sqlQuery, options) {
  return function (state) {
    var client = state.client;

    try {
      var body = sqlQuery(state);
      console.log('Preparing to execute sql statement');
      return queryHandler(state, body, options);
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Fetch a uuid key given a condition
 * @public
 * @example
 * findValue({
 *    uuid: 'id',
 *    relation: 'users',
 *    where: { first_name: 'Mamadou' },
 *    operator: { first_name: 'like' }
 *  })
 * @constructor
 * @param {object} filter - A filter object with the lookup table, a uuid and the condition
 * @returns {Operation}
 */


function findValue(filter) {
  return function (state) {
    var client = state.client;
    var uuid = filter.uuid,
        relation = filter.relation,
        where = filter.where,
        operator = filter.operator;
    var whereData = (0, _languageCommon.expandReferences)(where)(state);
    var operatorData = (0, _languageCommon.expandReferences)(operator)(state);
    var conditionsArray = [];

    for (var key in where) {
      conditionsArray.push("".concat(key, " ").concat(operatorData ? operatorData[key] : '=', " '").concat(whereData[key], "'"));
    }

    var condition = conditionsArray.length > 0 ? "where ".concat(conditionsArray.join(' and ')) : ''; // In a near future the 'and' can live in the filter.

    try {
      var body = "select ".concat(uuid, " from ").concat(relation, " ").concat(condition);
      console.log('Preparing to execute sql statement');
      var returnValue = null;
      return new Promise(function (resolve, reject) {
        client.query(body, function (err, result) {
          if (err) {
            console.log(err);
            reject(err);
            client.end();
          } else {
            if (result.rows.length > 0) {
              returnValue = result.rows[0][uuid];
            }

            resolve(returnValue);
          }
        });
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Insert a record
 * @public
 * @example
 * insert('users', { name: 'Elodie', id: 7 });
 * @constructor
 * @param {string} table - The target table
 * @param {object} record - Payload data for the record as a JS object or function
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function insert(table, record, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(record)(state);
      var columns = Object.keys(data).sort();
      var columnsList = columns.join(', ');
      var values = columns.map(function (key) {
        return data[key];
      });
      var query = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES (%L);"), values);
      var safeQuery = "INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES [--REDACTED--]];");
      console.log('Preparing to insert via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Insert many records, using the keys of the first as the column template
 * @public
 * @example
 * insertMany('users', state => state.data.recordArray);
 * @constructor
 * @param {string} table - The target table
 * @param {array} records - An array or a function that takes state and returns an array
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function insertMany(table, records, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(records)(state);
      return new Promise(function (resolve, reject) {
        if (!data || data.length === 0) {
          console.log('No records provided; skipping insert.');
          resolve(state);
        } // Note: we select the keys of the FIRST object as the canonical template.


        var columns = Object.keys(data[0]);
        var columnsList = columns.join(', ');
        var valueSets = data.map(function (x) {
          return Object.values(x);
        });
        var query = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES %L;"), valueSets);
        var safeQuery = "INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES [--REDACTED--]];");
        console.log('Preparing to insertMany via:', safeQuery);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Insert or update a record using ON CONFLICT UPDATE
 * @public
 * @example
 * upsert(
 *   'users', // the DB table
 *   'ON CONSTRAINT users_pkey', // a DB column with a unique constraint OR a CONSTRAINT NAME
 *   { name: 'Elodie', id: 7 },
 *   { writeSql:true, execute: true }
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} record - Payload data for the record as a JS object or function
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function upsert(table, uuid, record, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(record)(state);
      var columns = Object.keys(data).sort();
      var columnsList = columns.join(', ');
      var values = columns.map(function (key) {
        return data[key];
      });
      var conflict = uuid.split(' ').length > 1 ? uuid : "(".concat(uuid, ")");
      var updateValues = columns.map(function (key) {
        return "".concat(key, "=excluded.").concat(key);
      }).join(', ');
      var insertValues = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES (%L)"), values);
      var query = "".concat(insertValues, "\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
      var safeQuery = "INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES [--REDACTED--]\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
      console.log('Preparing to upsert via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Insert or update a record based on a logical condition using ON CONFLICT UPDATE
 * @public
 * @example
 * upsertIf(
 *   logical,
 *   'users', // the DB table
 *   'ON CONSTRAINT users_pkey', // a DB column with a unique constraint OR a CONSTRAINT NAME
 *   { name: 'Elodie', id: 7 },
 *   { writeSql:true, execute: true }
 * )
 * @constructor
 * @param {boolean} logical - a logical statement that will be evaluated.
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} record - Payload data for the record as a JS object or function
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function upsertIf(logical, table, uuid, record, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(record)(state);
      return new Promise(function (resolve, reject) {
        if (!logical) {
          console.log('Skipping upsert.');
          resolve(state);
          return state;
        }

        var columns = Object.keys(data).sort();
        var columnsList = columns.join(', ');
        var values = columns.map(function (key) {
          return data[key];
        });
        var conflict = uuid.split(' ').length > 1 ? uuid : "(".concat(uuid, ")");
        var updateValues = columns.map(function (key) {
          return "".concat(key, "=excluded.").concat(key);
        }).join(', ');
        var insertValues = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES (%L)"), values);
        var query = "".concat(insertValues, "\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
        var safeQuery = "INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES [--REDACTED--]\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
        console.log('Preparing to upsert via:', safeQuery);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Insert or update multiple records using ON CONFLICT UPDATE and excluded
 * @public
 * @example
 * upsertMany(
 *   'users', // the DB table
 *   'email', // a DB column with a unique constraint OR a CONSTRAINT NAME
 *   [
 *     { name: 'one', email: 'one@openfn.org },
 *     { name: 'two', email: 'two@openfn.org },
 *   ]
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {array} data - An array of objects or a function that returns an array
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function upsertMany(table, uuid, data, options) {
  return function (state) {
    var client = state.client;

    try {
      var records = (0, _languageCommon.expandReferences)(data)(state);
      return new Promise(function (resolve, reject) {
        if (!records || records.length === 0) {
          console.log('No records provided; skipping upsert.');
          resolve(state);
        }

        var columns = Object.keys(records[0]);
        var columnsList = columns.join(', ');
        var values = records.map(function (x) {
          return Object.values(x);
        });
        var conflict = uuid.split(' ').length > 1 ? uuid : "(".concat(uuid, ")");
        var updateValues = columns.map(function (key) {
          return "".concat(key, "=excluded.").concat(key);
        }).join(', ');
        var insertValues = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES %L"), values);
        var query = "".concat(insertValues, "\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
        var safeQuery = "INSERT INTO ".concat(table, " (").concat(columnsList, ") VALUES [--REDACTED--]\n        ON CONFLICT ").concat(conflict, "\n        DO UPDATE SET ").concat(updateValues, ";");
        console.log('Preparing to upsert via:', safeQuery);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * List the columns of a table in a database.
 * @public
 * @example
 * describeTable('clinic_visits')
 * @constructor
 * @param {string} tableName - The name of the table to describe
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function describeTable(tableName, options) {
  return function (state) {
    var client = state.client;
    var name = (0, _languageCommon.expandReferences)(tableName)(state);

    try {
      var query = "SELECT column_name, udt_name, is_nullable\n        FROM information_schema.columns\n        WHERE table_name='".concat(name, "';");
      console.log('Preparing to describe table via:', query);
      return queryHandler(state, query, options);
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Create a table in database when given an array of columns and a table_name.
 * @public
 * @example
 * insertTable('table_name', state => state.data.map(
 *   column => ({
 *     name: column.name,
 *     type: column.type,
 *     required: true, // optional
 *     unique: false, // optional - to be set to true for unique constraint
 *   })
 * ));
 * @constructor
 * @param {string} tableName - The name of the table to create
 * @param {array} columns - An array of form columns
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function insertTable(tableName, columns, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(columns)(state);
      return new Promise(function (resolve, reject) {
        if (!data || data.length === 0) {
          console.log('No columns provided; skipping table creation.');
          resolve(state);
        }

        var structureData = data.map(function (x) {
          return "".concat(x.name, " ").concat(x.type, " ").concat(x.unique ? 'UNIQUE' : '', " ").concat(x.identity ? 'GENERATED BY DEFAULT AS IDENTITY' : '', " ").concat(x.required ? 'NOT NULL' : '');
        }).join(', ');
        var query = "CREATE TABLE ".concat(tableName, " (\n        ").concat(structureData, "\n      );");
        console.log('Preparing to create table via:', query);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Alter an existing table in the database.
 * @public
 * @example
 * modifyTable('table_name', state => state.data.map(
 *   newColumn => ({
 *     name: newColumn.name,
 *     type: newColumn.type,
 *     required: true, // optional
 *     unique: false, // optional - to be set to true for unique constraint
 *   })
 * ));
 * @constructor
 * @param {string} tableName - The name of the table to alter
 * @param {array} columns - An array of form columns
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function modifyTable(tableName, columns, options) {
  return function (state) {
    var client = state.client;

    try {
      var data = (0, _languageCommon.expandReferences)(columns)(state);
      return new Promise(function (resolve, reject) {
        if (!data || data.length === 0) {
          console.log('No columns provided; skipping table modification.');
          resolve(state);
        }

        var structureData = data.map(function (x) {
          return "ADD COLUMN ".concat(x.name, " ").concat(x.type, " ").concat(x.identity ? 'GENERATED BY DEFAULT AS IDENTITY' : '', " ").concat(x.required ? 'NOT NULL' : '');
        }).join(', ');
        var query = "ALTER TABLE ".concat(tableName, " ").concat(structureData, ";");
        console.log('Preparing to modify table via:', query);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}