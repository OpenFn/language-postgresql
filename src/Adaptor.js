import { execute as commonExecute, expandReferences } from '@openfn/language-common';
import { resolve as resolveUrl } from 'url';
import pg from 'pg';
import format from 'pg-format';

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
export function execute(...operations) {
  const initialState = {
    references: [],
    data: null,
    queries: [],
  };

  return state => {
    return commonExecute(
      createClient,
      connect,
      ...operations,
      disconnect,
      cleanupState
    )({ ...initialState, ...state }).catch(e => {
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
    allowSelfSignedCert,
  } = state.configuration;

  // Allowing or blocking self signed certificate
  const sslOptions = ssl ? { rejectUnauthorized: !allowSelfSignedCert } : false;

  // setup client config
  var config = { host, port, database, user, password, ssl: sslOptions };

  // instantiate a new client
  var client = new pg.Client(config);

  return { ...state, client: client };
}

function connect(state) {
  let { client } = state;
  client.connect();
  return { ...state, client: client };
}

function disconnect(state) {
  let { client } = state;
  client.end();
  return state;
}

function cleanupState(state) {
  delete state.client;
  return state;
}

function queryHandler(state, query, options) {
  const { client } = state;
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
        console.log(result);
        resolve(result);
      }
    });
  }).then(data => {
    return { ...state, response: { body: data } };
  });
}

/**
 * Execute an SQL statement
 * @public
 * @example
 * execute(
 *   sql(sqlQuery, { writeSql: true })
 * )(state)
 * @constructor
 * @param {function} sqlQuery - a function which takes state and returns a
 * string of SQL.
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function sql(sqlQuery, options) {
  return state => {
    let { client } = state;

    try {
      const body = sqlQuery(state);

      console.log('Preparing to execute sql statement');
      return queryHandler(state, body, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Insert a record
 * @public
 * @example
 * insert('users', {name: 'Elodie', id: 7});
 * @constructor
 * @param {string} table - The target table
 * @param {object} record - Payload data for the record as a JS object
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function insert(table, record, options) {
  return state => {
    const { client } = state;

    try {
      const recordData = expandReferences(record)(state);
      const columns = Object.keys(recordData).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => recordData[key]);

      const query = format(
        `INSERT INTO ${table} (${columnsList}) VALUES (%L);`,
        values
      );

      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]];`;

      console.log('Preparing to insert via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
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
 * @param {function} records - A function that takes state and returns an array of records
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function insertMany(table, records, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      if (recordData.length === 0) {
        console.log('No data found, Skipping insert.');
        return state;
      }
      // Note: we select the keys of the FIRST object as the canonical template.
      const columns = Object.keys(recordData[0]);
      const columnsList = columns.join(', ');
      const valueSets = recordData.map(x => Object.values(x));

      const query = format(
        `INSERT INTO ${table} (${columnsList}) VALUES %L;`,
        valueSets
      );

      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]];`;

      console.log('Preparing to insertMany via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Insert or update a record using ON CONFLICT UPDATE
 * @public
 * @example
 * upsert(
 *  'users', // the DB table
 *  'ON CONSTRAINT users_pkey', // a DB column with a unique constraint OR a CONSTRAINT NAME
 *  {name: 'Elodie', id: 7},
 *  {writeSql:true, execute: true}
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} record - Payload data for the record as a JS object
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function upsert(table, uuid, record, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = expandReferences(record)(state);
      const columns = Object.keys(recordData).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => recordData[key]);
      const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;

      const updateValues = columns
        .map(key => {
          return `${key}=excluded.${key}`;
        })
        .join(', ');

      const insertValues = format(
        `INSERT INTO ${table} (${columnsList}) VALUES (%L)`,
        values
      );

      const query = `${insertValues}
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;

      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;

      console.log('Preparing to upsert via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Insert or update multiple records using ON CONFLICT UPDATE and excluded
 * @public
 * @example
 * upsert(
 *  'users', // the DB table
 *  'email', // a DB column with a unique constraint OR a CONSTRAINT NAME
 *  state => state.data.usersArray
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {function} records - A function that takes state and returns an array of records
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function upsertMany(table, uuid, records, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      if (recordData.length === 0) {
        console.log('No data found, Skipping upsert.');
        return state;
      }
      const columns = Object.keys(recordData[0]);
      const columnsList = columns.join(', ');
      const values = recordData.map(x => Object.values(x));
      const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;

      const updateValues = columns
        .map(key => {
          return `${key}=excluded.${key}`;
        })
        .join(', ');

      const insertValues = format(
        `INSERT INTO ${table} (${columnsList}) VALUES %L`,
        values
      );

      const query = `${insertValues}
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;

      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO UPDATE SET ${updateValues};`;

      console.log('Preparing to upsert via:', safeQuery);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * List the columns of a table in a database.
 * @public
 * @example
 * describeTable('table_name')
 * @constructor
 * @param {string} tableName - The name of the table to describe
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function describeTable(tableName, options) {
  return state => {
    let { client } = state;

    try {
      const query = `SELECT column_name, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_name='${tableName}';`;

      console.log('Preparing to describle table via:', query);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Create a table in database when given an array of columns and a table_name.
 * @public
 * @example
 * insertTable('table_name', state => state.data.map(
 *   column => ({
 *      name: column.name,
 *      type: column.type,
 *      required: true, // optional
 *      unique: false, // optional - to be set to true for unique constraint
 *    })
 * ));
 * @constructor
 * @param {string} tableName - The name of the table to create
 * @param {function} columns - An array of form columns
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function insertTable(tableName, columns, options) {
  return state => {
    let { client } = state;
    try {
      const recordData = columns(state);
      if (recordData.length === 0) {
        console.log('No data found, Skipping create.');
        return state;
      }
      const structureData = recordData
        .map(
          x =>
            `${x.name} ${x.type} ${x.unique ? 'UNIQUE' : ''} ${
              x.required ? 'NOT NULL' : ''
            }`
        )
        .join(', ');

      const query = `CREATE TABLE ${tableName} (
        ${structureData}
      );`;

      console.log('Preparing to create table via:', query);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Alter an existing table in the database.
 * @public
 * @example
 * modifyTable('table_name', state => state.data.map(
 *    newColumn => ({
 *      name: newColumn.name,
 *      type: newColumn.type,
 *      required: true, // optional
 *      unique: false, // optional - to be set to true for unique constraint
 *    })
 * ));
 * @constructor
 * @param {string} tableName - The name of the table to alter
 * @param {function} columns - An array of form columns
 * @param {object} options - Optional options argument
 * @returns {Operation}
 */
export function modifyTable(tableName, columns, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = columns(state);
      if (recordData.length === 0) {
        console.log('No data found, Skipping modification.');
        return state;
      }
      const structureData = recordData
        .map(
          x => `ADD COLUMN ${x.name} ${x.type} ${x.required ? 'NOT NULL' : ''}`
        )
        .join(', ');

      const query = `ALTER TABLE ${tableName}
        ${structureData}
      ;`;

      console.log('Preparing to modify table via:', query);
      return queryHandler(state, query, options);
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

export {
  alterState,
  arrayToString,
  combine,
  dataPath,
  dataValue,
  each,
  field,
  fields,
  lastReferenceValue,
  merge,
  sourceValue,
} from '@openfn/language-common';
