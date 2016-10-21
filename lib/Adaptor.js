'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lastReferenceValue = exports.dataValue = exports.dataPath = exports.merge = exports.alterState = exports.sourceValue = exports.fields = exports.field = undefined;

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
    return _languageCommon.execute.apply(undefined, operations)(_extends({}, initialState, state));
  };
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
    var _state$configuration = state.configuration;
    var host = _state$configuration.host;
    var port = _state$configuration.port;
    var database = _state$configuration.database;
    var password = _state$configuration.password;
    var user = _state$configuration.user;


    var body = sqlQuery(state);
    console.log("Executing SQL statement: " + body);

    // create a config to configure both pooling behavior and client options
    // note: all config is optional and the environment variables will be read
    // if the config is not present.
    var config = {
      host: host,
      port: port,
      database: database,
      user: user,
      password: password,
      ssl: true
    };

    //this initializes a connection pool
    //it will keep idle connections open for a 30 seconds
    //and set a limit of maximum 10 idle clients
    var pool = new _pg2.default.Pool(config);

    return new Promise(function (resolve, reject) {
      // to run a query we can acquire a client from the pool,
      // run a query on the client, and then return the client to the pool
      pool.connect(function (err, client, done) {
        if (err) {
          return console.error('error fetching client from pool', err);
          reject(err);
        } else {
          client.query(body, function (err, result) {
            // call `done()` to release the client back to the pool
            resolve(done());
            if (err) {
              return console.error('error running query', err);
              reject(err);
            } else {
              console.log(result);
              resolve("OK.");
            }
          });
        }
      });
    }).then(function (result) {
      pool.on('error', function (err, client) {
        // if an error is encountered by a client while it sits idle in the pool
        // the pool itself will emit an error event with both the error and
        // the client which emitted the original error
        // this is a rare occurrence but can happen if there is a network
        //  partition between your application and the database, the database
        //  restarts, etc.
        // and so you might want to handle it and at least log it out
        console.error('idle client error', err.message, err.stack);
        reject(err);
      });
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
    var _state$configuration2 = state.configuration;
    var host = _state$configuration2.host;
    var port = _state$configuration2.port;
    var database = _state$configuration2.database;
    var password = _state$configuration2.password;
    var user = _state$configuration2.user;


    var dataObject = (0, _languageCommon.expandReferences)(rowData)(state);

    var sql = jsonSql.build({
      type: 'insert',
      table: table,
      values: dataObject
    });

    var body = Object.keys(sql.values).reduce(function (query, valueKey) {
      return query.replace('$' + valueKey, '\'' + sql.values[valueKey] + '\'');
    }, sql.query);

    console.log(body);

    // create a config to configure both pooling behavior and client options
    // note: all config is optional and the environment variables will be read
    // if the config is not present.
    var config = {
      host: host,
      port: port,
      database: database,
      user: user,
      password: password,
      ssl: true
    };

    //this initializes a connection pool
    //it will keep idle connections open for a 30 seconds
    //and set a limit of maximum 10 idle clients
    var pool = new _pg2.default.Pool(config);

    // to run a query we can acquire a client from the pool,
    // run a query on the client, and then return the client to the pool
    pool.connect(function (err, client, done) {
      if (err) {
        return console.error('error fetching client from pool', err);
      }
      client.query(body, function (err, result) {
        // call `done()` to release the client back to the pool
        done();

        if (err) {
          return console.error('error running query', err);
        }
        console.log(result);
        //output: 1
      });
    });

    pool.on('error', function (err, client) {
      // if an error is encountered by a client while it sits idle in the pool
      // the pool itself will emit an error event with both the error and
      // the client which emitted the original error
      // this is a rare occurrence but can happen if there is a network
      //  partition between your application and the database, the database
      //  restarts, etc.
      // and so you might want to handle it and at least log it out
      console.error('idle client error', err.message, err.stack);
    });
  };
}
