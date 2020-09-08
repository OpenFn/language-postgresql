"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.execute = execute;
exports.sql = sql;
exports.insert = insert;
exports.insertMany = insertMany;
exports.upsert = upsert;
exports.upsertMany = upsertMany;
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

var _languageCommon = require("language-common");

var _url = require("url");

var _pg = _interopRequireDefault(require("pg"));

var _pgFormat = _interopRequireDefault(require("pg-format"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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
    data: null
  };
  return function (state) {
    return _languageCommon.execute.apply(void 0, [createClient, connect].concat(operations, [disconnect, cleanupState]))(_objectSpread({}, initialState, {}, state));
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
/**
 * Execute an SQL statement
 * @example
 * execute(
 *   sql(sqlQuery)
 * )(state)
 * @constructor
 * @param {object} sqlQuery - Payload data for the message
 * @returns {Operation}
 */


function sql(sqlQuery) {
  return function (state) {
    var client = state.client;

    try {
      var body = sqlQuery(state);
      console.log('Executing SQL statement.');
      return new Promise(function (resolve, reject) {
        // execute a query on our database
        client.query(body, function (err, result) {
          if (err) {
            reject(err); // Disconnect if there's an error.

            client.end();
          } else {
            console.log(result);
            resolve(result);
          }
        });
      }).then(function (data) {
        var nextState = _objectSpread({}, state, {
          response: {
            body: data
          }
        });

        return nextState;
      });
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function handleValues(sqlString, nullString) {
  if (nullString == false) {
    return sqlString;
  }

  var re = new RegExp(escapeRegExp(nullString), 'g');
  return sqlString.replace(re, 'NULL');
}

function handleOptions(options) {
  if (options && options.setNull === false) {
    return false;
  }

  return options && options.setNull || "'undefined'";
}
/**
 * Insert a record
 * @example
 * execute(
 *   insert(table, record, {setNull: "'undefined'"})
 * )(state)
 * @constructor
 * @param {string} table - The target table
 * @param {object} record - Payload data for the record as a JS object
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function insert(table, record, options) {
  return function (state) {
    var client = state.client;

    try {
      var recordData = (0, _languageCommon.expandReferences)(record)(state);
      var columns = Object.keys(recordData).sort();
      var values = columns.map(function (key) {
        return recordData[key];
      });
      var query = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES (%L);"), values);
      var safeQuery = handleValues("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES [--REDACTED--];"), handleOptions(options));
      return new Promise(function (resolve, reject) {
        console.log("Executing insert via : ".concat(safeQuery));
        client.query(query, function (err, result) {
          if (err) {
            reject(err);
            client.end();
          } else {
            console.log(result);
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
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}
/**
 * Insert many records, using the keys of the first as the column template
 * @example
 * execute(
 *   insertMany(table, records, { setNull: false })
 * )(state)
 * @constructor
 * @param {string} table - The target table
 * @param {function} records - A function that takes state and returns an array of records
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function insertMany(table, records, options) {
  return function (state) {
    var client = state.client;

    try {
      var recordData = records(state); // Note: we select the keys of the FIRST object as the canonical template.

      var columns = Object.keys(recordData[0]);
      var valueSets = recordData.map(function (x) {
        return Object.values(x);
      });
      var query = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES %L;"), valueSets);
      var safeQuery = handleValues("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES [--REDACTED--]"), handleOptions(options));
      return new Promise(function (resolve, reject) {
        console.log("Executing insert many via: ".concat(safeQuery)); // execute a query on our database

        client.query(query, function (err, result) {
          if (err) {
            reject(err); // Disconnect if there's an error.

            client.end();
          } else {
            console.log(result);
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
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}
/**
 * Insert or update a record using ON CONFLICT UPDATE
 * @example
 * upsert(
 *  table, // the DB table
 *  uuid, // a DB column with a unique constraint OR a CONSTRAINT NAME
 *  record,
 *  options
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} record - Payload data for the record as a JS object
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function upsert(table, uuid, record, options) {
  return function (state) {
    var client = state.client;

    try {
      var recordData = (0, _languageCommon.expandReferences)(record)(state);
      console.log(recordData);
      var columns = Object.keys(recordData).sort();
      console.log(columns);
      var values = columns.map(function (key) {
        return recordData[key];
      });
      console.log(values);
      var conflict = uuid.split(' ').length > 1 ? uuid : "(".concat(uuid, ")");
      var updateValues = columns.map(function (key) {
        return "".concat(key, "=excluded.").concat(key);
      }).join(', ');
      /* const updateValues = columns
        .map(key => `${key}='${recordData[key]}'`)
        .join(', '); */

      var insertValues = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES (%L)"), values);
      var query = "".concat(insertValues, "\n          ON CONFLICT ").concat(conflict, "\n          DO\n            UPDATE SET ").concat(updateValues, ";");
      /* const query = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ('${values}')
        ON CONFLICT ${conflict}
        DO
          UPDATE SET ${updateValues};`,
        handleOptions(options)
      ); */

      var safeQuery = handleValues("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES [--REDACTED--]\n        ON CONFLICT ").concat(conflict, "\n        DO\n          UPDATE SET [--REDACTED--];"), handleOptions(options));
      return new Promise(function (resolve, reject) {
        console.log("Executing upsert via : ".concat(query));
        client.query(query, function (err, result) {
          if (err) {
            reject(err);
            client.end();
          } else {
            console.log(result);
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
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}
/**
 * Insert or update multiple records using ON CONFLICT UPDATE and excluded
 * @example
 * upsert(
 *  table, // the DB table
 *  uuid, // a DB column with a unique constraint OR a CONSTRAINT NAME
 *  record,
 *  options
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} records - A function that takes state and returns an array of records
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */


function upsertMany(table, uuid, records, options) {
  return function (state) {
    var client = state.client;

    try {
      // recordData = array
      var recordData = records(state);
      var columns = Object.keys(recordData[0]);
      var values = recordData.map(function (x) {
        return Object.values(x);
      });
      var conflict = uuid.split(' ').length > 1 ? uuid : "(".concat(uuid, ")");
      var updateValues = columns.map(function (key) {
        return "".concat(key, "=excluded.").concat(key);
      }).join(', ');
      var insertValues = (0, _pgFormat["default"])("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES %L"), values);
      var query = "".concat(insertValues, "\n        ON CONFLICT ").concat(conflict, "\n        DO\n          UPDATE SET ").concat(updateValues, ";");
      var safeQuery = handleValues("INSERT INTO ".concat(table, " (").concat(columns.join(', '), ") VALUES [--REDACTED--]\n        ON CONFLICT ").concat(conflict, "\n        DO\n          UPDATE SET [--REDACTED--];"), handleOptions(options));
      return new Promise(function (resolve, reject) {
        console.log("Executing upsert via : ".concat(safeQuery));
        client.query(query, function (err, result) {
          if (err) {
            reject(err);
            client.end();
          } else {
            console.log(result);
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
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}
