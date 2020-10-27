import { execute as commonExecute, expandReferences } from 'language-common';
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

/**
 * Execute an SQL statement
 * @public
 * @example
 * execute(
 *   sql(sqlQuery)
 * )(state)
 * @constructor
 * @param {object} sqlQuery - Payload data for the message
 * @returns {Operation}
 */
export function sql(sqlQuery) {
  return state => {
    let { client } = state;

    try {
      const body = sqlQuery(state);
      console.log('Executing SQL statement.');

      return new Promise((resolve, reject) => {
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
      }).then(data => {
        const nextState = { ...state, response: { body: data } };
        return nextState;
      });
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
 * @returns {Operation}
 */
export function insert(table, record) {
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

      return new Promise((resolve, reject) => {
        console.log(`Executing insert via : ${safeQuery}`);

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
 * @returns {Operation}
 */
export function insertMany(table, records) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      // Note: we select the keys of the FIRST object as the canonical template.
      const columns = Object.keys(recordData[0]);
      const columnsList = columns.join(', ');
      const valueSets = recordData.map(x => Object.values(x));

      const query = format(
        `INSERT INTO ${table} (${columnsList}) VALUES %L;`,
        valueSets
      );

      const safeQuery = `INSERT INTO ${table} (${columnsList}) VALUES [--REDACTED--]];`;

      return new Promise((resolve, reject) => {
        console.log(`Executing insert many via: ${safeQuery}`);
        // execute a query on our database
        client.query(query, (err, result) => {
          if (err) {
            reject(err);
            // Disconnect if there's an error.
            client.end();
          } else {
            console.log(result);
            resolve(result);
          }
        });
      }).then(data => {
        return { ...state, response: { body: data } };
      });
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
 *  {name: 'Elodie', id: 7}
 * )
 * @constructor
 * @param {string} table - The target table
 * @param {string} uuid - The uuid column to determine a matching/existing record
 * @param {object} record - Payload data for the record as a JS object
 * @returns {Operation}
 */
export function upsert(table, uuid, record) {
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

      return new Promise((resolve, reject) => {
        console.log(`Executing upsert via : ${safeQuery}`);

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
 * @returns {Operation}
 */
export function upsertMany(table, uuid, records) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
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

      return new Promise((resolve, reject) => {
        console.log(`Executing upsert via : ${safeQuery}`);

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
 * @param {string} table - The name of the table to describe
 * @returns {Operation}
 */
export function describeTable(table) {
  return state => {
    let { client } = state;

    try {
      const query = `SELECT column_name, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_name='${table}';`;

      return new Promise((resolve, reject) => {
        console.log(`Describing table via : ${query}`);

        client.query(query, (err, result) => {
          if (err) {
            reject(err);
            client.end();
          } else {
            //console.log(result);
            resolve(result);
          }
        });
      }).then(data => {
        return { ...state, table_data: { body: data } };
      });
    } catch (e) {
      console.log(e);
      client.end();
    }
  };
}

/**
 * Create a table in database when given a form definition and a table_name.
 * @public
 * @example
 * insertTable('table_name', state => state.data.koboColumns)
 * @constructor
 * @param {string} table - The new table to create
 * @param {function} records - An array of form columns
 * @returns {Operation}
 */
export function insertTable(table, records) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      const structureData = recordData
        .map(x => `${x.name} ${x.type} ${x.required ? 'NOT NULL' : ''}`)
        .join(', ');

      const query = `CREATE TABLE ${table} (
        ${structureData}
      );`;

      return new Promise((resolve, reject) => {
        console.log(`Creating table via : ${query}`);

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
 * modifyTable('table_name', state => state.data.koboColumns)
 * @constructor
 * @param {string} table - The name of the table to alter
 * @param {function} records - An array of form columns
 * @returns {Operation}
 */
export function modifyTable(table, records) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      const structureData = recordData
        .map(
          x => `ADD COLUMN ${x.name} ${x.type} ${x.required ? 'NOT NULL' : ''}`
        )
        .join(', ');

      const query = `ALTER TABLE ${table}
        ${structureData}
      ;`;

      return new Promise((resolve, reject) => {
        console.log(`Altering table via : ${query}`);

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
} from 'language-common';
