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
exports.upsertMany = upsertMany;
exports.describeTable = describeTable;
exports.insertTable = insertTable;
exports.modifyTable = modifyTable;
Object.defineProperty(exports, "alterState", {
  enumerable: true,
  get: function () {
    return _languageCommon.alterState;
  }
});
Object.defineProperty(exports, "arrayToString", {
  enumerable: true,
  get: function () {
    return _languageCommon.arrayToString;
  }
});
Object.defineProperty(exports, "combine", {
  enumerable: true,
  get: function () {
    return _languageCommon.combine;
  }
});
Object.defineProperty(exports, "dataPath", {
  enumerable: true,
  get: function () {
    return _languageCommon.dataPath;
  }
});
Object.defineProperty(exports, "dataValue", {
  enumerable: true,
  get: function () {
    return _languageCommon.dataValue;
  }
});
Object.defineProperty(exports, "each", {
  enumerable: true,
  get: function () {
    return _languageCommon.each;
  }
});
Object.defineProperty(exports, "field", {
  enumerable: true,
  get: function () {
    return _languageCommon.field;
  }
});
Object.defineProperty(exports, "http", {
  enumerable: true,
  get: function () {
    return _languageCommon.http;
  }
});
Object.defineProperty(exports, "fields", {
  enumerable: true,
  get: function () {
    return _languageCommon.fields;
  }
});
Object.defineProperty(exports, "lastReferenceValue", {
  enumerable: true,
  get: function () {
    return _languageCommon.lastReferenceValue;
  }
});
Object.defineProperty(exports, "merge", {
  enumerable: true,
  get: function () {
    return _languageCommon.merge;
  }
});
Object.defineProperty(exports, "sourceValue", {
  enumerable: true,
  get: function () {
    return _languageCommon.sourceValue;
  }
});

var _languageCommon = require("@openfn/language-common");

var _url = require("url");

var _pg = _interopRequireDefault(require("pg"));

var _pgFormat = _interopRequireDefault(require("pg-format"));

var _path = require("path");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// async function expandReferences(thing) {
//   return state => {
//     if (typeof thing?.then === 'function') {
//       console.log('think its a promise', thing);
//       // probably a promise
//       await thing;
//     } else {
//       console.log('else not', thing);
//       return commonExpansion(thing)(state);
//     }
//   };
// }.
const expandReferences = async (value, skipFilter) => {
  console.log(value);
  return async state => {
    if (skipFilter && skipFilter(value)) return value;

    if (typeof (value === null || value === void 0 ? void 0 : value.then) === 'function') {
      console.log('think its a promise', value); // probably a promise

      const pgData = await value;
      return pgData;
    }

    if (Array.isArray(value)) {
      return value.map(v => expandReferences(v)(state));
    }

    if (typeof value == 'object' && !!value) {
      return Object.keys(value).reduce((acc, key) => {
        return { ...acc,
          [key]: expandReferences(value[key])(state)
        };
      }, {});
    }

    if (typeof value == 'function') {
      return expandReferences(value(state))(state);
    }

    return value;
  };
}; // function expandReferences(thing) {
//   console.log('thing', thing);
//   console.log('hello thing', JSON.stringify(thing, null, 2));
//   return state => {
//     if (typeof thing?.then === 'function') {
//       console.log('think its a promise', thing);
//       // probably a promise
//       return thing.resolve(state);
//     } else {
//       console.log('else not', thing);
//       return commonExpansion(thing)(state);
//     }
//   };
// }

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


function execute(...operations) {
  const initialState = {
    references: [],
    data: null,
    queries: []
  };
  return state => {
    return (0, _languageCommon.execute)(createClient, connect, ...operations, disconnect, cleanupState)({ ...initialState,
      ...state
    }).catch(e => {
      console.error(e);
      console.error('Unhandled error in the operations. Exiting process.');
      process.exit(1);
    });
  };
}

function createClient(state) {
  const {
    host,
    port,
    database,
    password,
    user,
    ssl,
    allowSelfSignedCert
  } = state.configuration; // Allowing or blocking self signed certificate

  const sslOptions = ssl ? {
    rejectUnauthorized: !allowSelfSignedCert
  } : false; // setup client config

  var config = {
    host,
    port,
    database,
    user,
    password,
    ssl: sslOptions
  }; // instantiate a new client

  var client = new _pg.default.Client(config);
  return { ...state,
    client: client
  };
}

function connect(state) {
  let {
    client
  } = state;
  client.connect();
  return { ...state,
    client: client
  };
}

function disconnect(state) {
  let {
    client
  } = state;
  client.end();
  return state;
}

function cleanupState(state) {
  delete state.client;
  return state;
}

function queryHandler(state, query, options) {
  const {
    client
  } = state;
  return new Promise((resolve, reject) => {
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

    client.query(query, (err, result) => {
      if (err) {
        reject(err);
        client.end();
      } else {
        // console.log(result);
        resolve(result);
      }
    });
  }).then(data => {
    return { ...state,
      response: {
        body: data
      }
    };
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
  return state => {
    let {
      client
    } = state;

    try {
      const body = sqlQuery(state);
      console.log('Preparing to execute sql statement');
      return queryHandler(state, body, options);
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
/**
 * Fetch a foreign key
 * @public
 * @example
 * findValue(
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
 * @param {array} parentUuid - An array of objects or a function that returns an array
 * @param {object} value - The value to look for
 * @returns {Operation}
 */


function findValue(table, uuid, parentUuid, value) {
  return state => {
    let {
      client
    } = state;

    try {
      const body = `select ${parentUuid} from ${table} where ${uuid} = '${value}'`;
      console.log('body', body);
      return new Promise((resolve, reject) => {
        client.query(body, (err, result) => {
          if (err) {
            console.log(err);
            reject(err);
            client.end();
          } else {
            console.log(result);
            resolve(result);
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
  return state => {
    const {
      client
    } = state;

    try {
      const data = expandReferences(record)(state);
      const columns = Object.keys(data).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => data[key]);
      const query = (0, _pgFormat.default)(`INSERT INTO ${table} (${columnsList}) VALUES (%L);`, values);
      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]];`;
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
  return state => {
    let {
      client
    } = state;

    try {
      const data = expandReferences(records)(state);
      return new Promise((resolve, reject) => {
        if (data.length === 0) {
          console.log('No records provided; skipping insert.');
          resolve(state);
        } // Note: we select the keys of the FIRST object as the canonical template.


        const columns = Object.keys(data[0]);
        const columnsList = columns.join(', ');
        const valueSets = data.map(x => Object.values(x));
        const query = (0, _pgFormat.default)(`INSERT INTO ${table} (${columnsList}) VALUES %L;`, valueSets);
        const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]];`;
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
  return state => {
    let {
      client
    } = state;

    try {
      console.log('rec before expand', record);
      const data = expandReferences.resolve(record)(state);
      console.log('data after expand', data);
      const columns = Object.keys(data).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => data[key]);
      const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;
      const updateValues = columns.map(key => {
        return `${key}=excluded.${key}`;
      }).join(', ');
      const insertValues = (0, _pgFormat.default)(`INSERT INTO ${table} (${columnsList}) VALUES (%L)`, values);
      const query = `${insertValues}
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;
      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;
      console.log('Preparing to upsert via:', query);
      return queryHandler(state, query, options);
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
 * upsert(
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
  return state => {
    let {
      client
    } = state;

    try {
      const records = expandReferences(data)(state);
      return new Promise((resolve, reject) => {
        if (records.length === 0) {
          console.log('No records provided; skipping upsert.');
          resolve(state);
        }

        const columns = Object.keys(records[0]);
        const columnsList = columns.join(', ');
        const values = records.map(x => Object.values(x));
        const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;
        const updateValues = columns.map(key => {
          return `${key}=excluded.${key}`;
        }).join(', ');
        const insertValues = (0, _pgFormat.default)(`INSERT INTO ${table} (${columnsList}) VALUES %L`, values);
        const query = `${insertValues}
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;
        const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;
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
  return state => {
    let {
      client
    } = state;
    const name = expandReferences(tableName)(state);

    try {
      const query = `SELECT column_name, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_name='${name}';`;
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
  return state => {
    let {
      client
    } = state;

    try {
      const data = expandReferences(columns)(state);
      return new Promise((resolve, reject) => {
        if (data.length === 0) {
          console.log('No columns provided; skipping table creation.');
          resolve(state);
        }

        const structureData = data.map(x => `${x.name} ${x.type} ${x.unique ? 'UNIQUE' : ''} ${x.required ? 'NOT NULL' : ''}`).join(', ');
        const query = `CREATE TABLE ${tableName} (
        ${structureData}
      );`;
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
  return state => {
    let {
      client
    } = state;

    try {
      const data = expandReferences(columns)(state);
      return new Promise((resolve, reject) => {
        if (data.length === 0) {
          console.log('No columns provided; skipping table modification.');
          resolve(state);
        }

        const structureData = data.map(x => `ADD COLUMN ${x.name} ${x.type} ${x.required ? 'NOT NULL' : ''}`).join(', ');
        const query = `ALTER TABLE ${tableName} ${structureData};`;
        console.log('Preparing to modify table via:', query);
        resolve(queryHandler(state, query, options));
      });
    } catch (e) {
      client.end();
      throw e;
    }
  };
}
