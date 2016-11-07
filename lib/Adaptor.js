'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lastReferenceValue = exports.dataValue = exports.dataPath = exports.merge = exports.combine = exports.each = exports.arrayToString = exports.alterState = exports.sourceValue = exports.fields = exports.field = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.execute = execute;
exports.sql = sql;
exports.insert = insert;

var _languageCommon = require('language-common');

Object.defineProperty(exports, 'field', {
  enumerable: true,
  get: function get() {
    return _languageCommon.field;
  }
});
Object.defineProperty(exports, 'fields', {
  enumerable: true,
  get: function get() {
    return _languageCommon.fields;
  }
});
Object.defineProperty(exports, 'sourceValue', {
  enumerable: true,
  get: function get() {
    return _languageCommon.sourceValue;
  }
});
Object.defineProperty(exports, 'fields', {
  enumerable: true,
  get: function get() {
    return _languageCommon.fields;
  }
});
Object.defineProperty(exports, 'alterState', {
  enumerable: true,
  get: function get() {
    return _languageCommon.alterState;
  }
});
Object.defineProperty(exports, 'arrayToString', {
  enumerable: true,
  get: function get() {
    return _languageCommon.arrayToString;
  }
});
Object.defineProperty(exports, 'each', {
  enumerable: true,
  get: function get() {
    return _languageCommon.each;
  }
});
Object.defineProperty(exports, 'combine', {
  enumerable: true,
  get: function get() {
    return _languageCommon.combine;
  }
});
Object.defineProperty(exports, 'merge', {
  enumerable: true,
  get: function get() {
    return _languageCommon.merge;
  }
});
Object.defineProperty(exports, 'dataPath', {
  enumerable: true,
  get: function get() {
    return _languageCommon.dataPath;
  }
});
Object.defineProperty(exports, 'dataValue', {
  enumerable: true,
  get: function get() {
    return _languageCommon.dataValue;
  }
});
Object.defineProperty(exports, 'lastReferenceValue', {
  enumerable: true,
  get: function get() {
    return _languageCommon.lastReferenceValue;
  }
});

var _url = require('url');

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var jsonSql = require('json-sql')();

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
  for (var _len = arguments.length, operations = Array(_len), _key = 0; _key < _len; _key++) {
    operations[_key] = arguments[_key];
  }

  var initialState = {
    references: [],
    data: null
  };

  return function (state) {
    return _languageCommon.execute.apply(undefined, [connect].concat(operations, [disconnect, cleanupState]))(_extends({}, initialState, state));
  };
}

function connect(state) {
  var _state$configuration = state.configuration;
  var host = _state$configuration.host;
  var port = _state$configuration.port;
  var database = _state$configuration.database;
  var password = _state$configuration.password;
  var user = _state$configuration.user;

  // setup client config

  var config = { host: host, port: port, database: database, user: user, password: password, ssl: true };

  // instantiate a new client
  var client = new _pg2.default.Client(config);

  client.connect();

  return _extends({}, state, { client: client });
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


    var body = sqlQuery(state);
    console.log("Executing SQL statement: " + body);

    return new Promise(function (resolve, reject) {
      // execute a query on our database
      client.query(body, function (err, result) {
        if (err) {
          reject(err);
          // Disconnect if there's an error.
          client.end();
        } else {
          console.log(result);
          resolve(result);
        }
      });
    }).then(function (data) {
      var nextState = _extends({}, state, { response: { body: data } });
      return nextState;
    });
  };
}

/**
 * Execute an SQL insert statement
 * @example
 * execute(
 *   sql(params)
 * )(state)
 * @constructor
 * @param {object} params - data to make the query
 * @returns {Operation}
 */
function insert(table, rowData) {

  return function (state) {
    var client = state.client;


    var dataObject = (0, _languageCommon.expandReferences)(rowData)(state);

    var sql = jsonSql.build({
      type: 'insert',
      table: table,
      values: dataObject
    });

    var body = Object.keys(sql.values).reduce(function (query, valueKey) {
      return query.replace('$' + valueKey, '\'' + sql.values[valueKey] + '\'');
    }, sql.query);

    console.log("Executing SQL statement: " + body);

    return new Promise(function (resolve, reject) {
      // execute a query on our database
      client.query(body, function (err, result) {
        if (err) reject(err);
        // print the result to the console
        console.log(result);
        resolve(result);
        // disconnect the client
      });
    }).then(function (data) {
      var nextState = _extends({}, state, { response: { body: data } });
      return nextState;
    });
  };
}
