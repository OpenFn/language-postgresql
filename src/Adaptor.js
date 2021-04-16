import {
  execute as commonExecute,
  expandReferences,
} from '@openfn/language-common';
import { resolve as resolveUrl } from 'url';
import pg from 'pg';
import format from 'pg-format';
import { resolve } from 'path';

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
 * sql(state => `select(*) from ${state.data.tableName};`, { writeSql: true })
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
 *    operator: { first_name: 'like', last_name: '='}
 *  })
 * @constructor
 * @param {object} filter - A filter object with the lookup table, a uuid and the condition
 * @returns {Operation}
 */
export function findValue(filter) {
  return state => {
    let { client } = state;

    const { uuid, relation, where, operator } = filter;
    const whereData = expandReferences(where)(state);
    const operatorData = expandReferences(operator)(state);

    let conditionsArray = [];
    for (let key in where)
      conditionsArray.push(`${key} ${operatorData[key]} '${whereData[key]}'`);
    
      const condition = conditionsArray.length > 0  ? `where ${conditionsArray.join(' and ')}` : ''; // In a near future the 'and' can live in the filter.

    try {
      const body = `select ${uuid} from ${relation} ${condition}`;
      console.log(body)

      console.log('Preparing to execute sql statement');
      let returnValue = null;

      return new Promise((resolve, reject) => {
        client.query(body, (err, result) => {
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
export function insert(table, record, options) {
  return state => {
    const { client } = state;

    try {
      const data = expandReferences(record)(state);
      const columns = Object.keys(data).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => data[key]);

      const query = format(
        `INSERT INTO ${table} (${columnsList}) VALUES (%L);`,
        values
      );

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
export function insertMany(table, records, options) {
  return state => {
    let { client } = state;

    try {
      const data = expandReferences(records)(state);

      return new Promise((resolve, reject) => {
        if (!data || data.length === 0) {
          console.log('No records provided; skipping insert.');
          resolve(state);
        }
        // Note: we select the keys of the FIRST object as the canonical template.
        const columns = Object.keys(data[0]);
        const columnsList = columns.join(', ');
        const valueSets = data.map(x => Object.values(x));

        const query = format(
          `INSERT INTO ${table} (${columnsList}) VALUES %L;`,
          valueSets
        );

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
export function upsert(table, uuid, record, options) {
  return state => {
    let { client } = state;

    try {
      const data = expandReferences(record)(state);
      const columns = Object.keys(data).sort();
      const columnsList = columns.join(', ');
      const values = columns.map(key => data[key]);
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
export function upsertMany(table, uuid, data, options) {
  return state => {
    let { client } = state;

    try {
      const records = expandReferences(data)(state);

      return new Promise((resolve, reject) => {
        if (!records || records.length === 0) {
          console.log('No records provided; skipping upsert.');
          resolve(state);
        }

        const columns = Object.keys(records[0]);
        const columnsList = columns.join(', ');
        const values = records.map(x => Object.values(x));
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
export function describeTable(tableName, options) {
  return state => {
    let { client } = state;
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
export function insertTable(tableName, columns, options) {
  return state => {
    let { client } = state;
    try {
      const data = expandReferences(columns)(state);

      return new Promise((resolve, reject) => {
        if (!data || data.length === 0) {
          console.log('No columns provided; skipping table creation.');
          resolve(state);
        }
        const structureData = data
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
export function modifyTable(tableName, columns, options) {
  return state => {
    let { client } = state;

    try {
      const data = expandReferences(columns)(state);

      return new Promise((resolve, reject) => {
        if (!data || data.length === 0) {
          console.log('No columns provided; skipping table modification.');
          resolve(state);
        }
        const structureData = data
          .map(
            x =>
              `ADD COLUMN ${x.name} ${x.type} ${x.required ? 'NOT NULL' : ''}`
          )
          .join(', ');

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

export {
  alterState,
  arrayToString,
  combine,
  dataPath,
  dataValue,
  each,
  field,
  http,
  fields,
  lastReferenceValue,
  merge,
  sourceValue,
} from '@openfn/language-common';
