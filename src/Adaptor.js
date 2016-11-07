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
    return commonExecute(
      connect,
      ...operations,
      disconnect,
      cleanupState
    )({ ...initialState, ...state })
  };

}

function connect(state) {
  const { host, port, database, password, user } = state.configuration;

  // setup client config
  var config = { host, port, database, user, password, ssl: true };

  // instantiate a new client
  var client = new pg.Client(config);

  client.connect()

  return { ...state, client: client }
}

function disconnect(state) {
  let { client } = state;
  client.end()
  return state
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

    const body = sqlQuery(state);
    console.log("Executing SQL statement: " + body)

    return new Promise((resolve, reject) => {
      // execute a query on our database
      client.query(body, function(err, result) {
        if (err) reject(err);
        // print the result to the console
          // console.log(err)
          console.log("***************** sqlQuery Result Start **************")
          console.log(result)
          console.log("***************** sqlQuery Result End  ***************")

          resolve(result)
        // disconnect the client
      })
    })
    .then((data) => {
      const nextState = { ...state, response: { body: data } };
      return nextState;
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

    let { client } = state;

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

    console.log("Executing SQL statement: " + body)

    return new Promise((resolve, reject) => {
      // execute a query on our database
      client.query(body, function(err, result) {
        if (err) reject(err);
        // print the result to the console
        console.log(result)
        resolve(result)
        // disconnect the client
      })
    })
    .then((data) => {
      const nextState = { ...state, response: { body: data } };
      return nextState;
    })

  }
}

export {
  field, fields, sourceValue, fields, alterState, arrayToString, each, combine,
  merge, dataPath, dataValue, lastReferenceValue
} from 'language-common';
