import { execute as commonExecute, expandReferences } from 'language-common';
import { resolve as resolveUrl } from 'url';
import pg from 'pg';

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
export function execute(...operations) {
  const initialState = {
    references: [],
    data: null
  }

  return state => {
    return commonExecute(...operations)({ ...initialState, ...state })
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
export function sql(sqlQuery) {

  return state => {

    const {
      host,
      port,
      database,
      password,
      user
    } = state.configuration;

    const body = sqlQuery(state);
    console.log("Executing SQL statement: " + body)

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
    var pool = new pg.Pool(config);

    return new Promise((resolve, reject) => {
      // to run a query we can acquire a client from the pool,
      // run a query on the client, and then return the client to the pool
      pool.connect(function(err, client, done) {
        if(err) {
          return console.error('error fetching client from pool', err);
          reject(err)
        } else {
          client.query(body, function(err, result) {
            // call `done()` to release the client back to the pool
            resolve(done())
            if(err) {
              return console.error('error running query', err);
              reject(err)
            } else {
              console.log(result);
              resolve("OK.")
            }
          })
        }
      })
    })

    .then((result) => {
      pool.on('error', function (err, client) {
        // if an error is encountered by a client while it sits idle in the pool
        // the pool itself will emit an error event with both the error and
        // the client which emitted the original error
        // this is a rare occurrence but can happen if there is a network
        //  partition between your application and the database, the database
        //  restarts, etc.
        // and so you might want to handle it and at least log it out
        console.error('idle client error', err.message, err.stack)
        reject(err)
      })
    })

  }
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
export function insert(table, rowData) {

  return state => {

    const {
      host,
      port,
      database,
      password,
      user
    } = state.configuration;

    const dataObject = expandReferences(rowData)(state);

    const sql = jsonSql.build({
        type: 'insert',
        table: table,
        values: dataObject
    });

    const body = Object.keys(sql.values).reduce(
      function(query, valueKey) {
        return query.replace(`\$${valueKey}`, `'${sql.values[valueKey]}'`)
      },
      sql.query
    )

    console.log(body)

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
    var pool = new pg.Pool(config);

    // to run a query we can acquire a client from the pool,
    // run a query on the client, and then return the client to the pool
    pool.connect(function(err, client, done) {
      if(err) {
        return console.error('error fetching client from pool', err);
      }
      client.query(body, function(err, result) {
        // call `done()` to release the client back to the pool
        done();

        if(err) {
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
      console.error('idle client error', err.message, err.stack)
    })

  }
}

export {
  field, fields, sourceValue, fields, alterState,
  merge, dataPath, dataValue, lastReferenceValue
} from 'language-common';
