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
    )({ ...initialState, ...state });
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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function handleValues(sqlString, nullString) {
  if (nullString == false) {
    return sqlString;
  }

  const re = new RegExp(escapeRegExp(nullString), 'g');
  return sqlString.replace(re, 'NULL');
}

function handleOptions(options) {
  if (options && options.setNull === false) {
    return false;
  }
  return (options && options.setNull) || "'undefined'";
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
export function insert(table, record, options) {
  return state => {
    const { client } = state;

    try {
      const recordData = expandReferences(record)(state);

      const columns = Object.keys(recordData).sort();

      const values = columns.map(key => recordData[key]);

      const query = format(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (%L);`,
        values
      );

      const safeQuery = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES [--REDACTED--];`,
        handleOptions(options)
      );

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
export function insertMany(table, records, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = records(state);
      // Note: we select the keys of the FIRST object as the canonical template.
      const columns = Object.keys(recordData[0]);

      const valueSets = recordData.map(x => Object.values(x));

      const query = format(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES %L;`,
        valueSets
      );

      const safeQuery = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES [--REDACTED--]`,
        handleOptions(options)
      );

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
export function upsert(table, uuid, record, options) {
  return state => {
    let { client } = state;

    try {
      const recordData = expandReferences(record)(state);
      const columns = Object.keys(recordData).sort();
      const values = columns.map(key => recordData[key]).join("', '");
      const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;

      const updateValues = columns
        .map(key => `${key}='${recordData[key]}'`)
        .join(', ');

      const query = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ('${values}')
        ON CONFLICT ${conflict}
        DO
          UPDATE SET ${updateValues};`,
        handleOptions(options)
      );

      const safeQuery = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO
          UPDATE SET [--REDACTED--];`,
        handleOptions(options)
      );

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
export function upsertMany(table, uuid, records, options) {
  return state => {
    let { client } = state;

    try {
      // recordData = array
      const recordData = records(state);

      const columns = Object.keys(recordData[0]);
      const values = recordData.map(x => Object.values(x));

      const conflict = uuid.split(' ').length > 1 ? uuid : `(${uuid})`;

      const updateValues = columns
        .map(key => {
          return `${key}=excluded.${key}`;
        })
        .join(', ');

      const insertValues = format(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES %L`,
        values
      );

      const query = `${insertValues}
        ON CONFLICT ${conflict}
        DO
          UPDATE SET ${updateValues};`;

      const safeQuery = handleValues(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES [--REDACTED--]
        ON CONFLICT ${conflict}
        DO
          UPDATE SET [--REDACTED--];`,
        handleOptions(options)
      );

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
