import { execute as commonExecute, expandReferences } from 'language-common';
import pg from 'pg';
import { resolve as resolveUrl } from 'url';

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
 * Make a POST request
 * @example
 * execute(
 *   post(params)
 * )(state)
 * @constructor
 * @param {object} params - data to make the POST
 * @returns {Operation}
 */
export function post(url, {body, callback, headers}) {

  return state => {

    return new Promise((resolve, reject) => {

      // instantiate a new client
      // the client will read connection information from
      // the same environment variables used by postgres cli tools
      var client = new pg.Client();

      // connect to our database
      client.connect(function (err) {
        if (err) throw err;

        // execute a query on our database
        client.query('SELECT $1::text as name', ['brianc'], function (err, result) {
          if (err) throw err;

          // just print the result to the console
          console.log(result.rows[0]); // outputs: { name: 'brianc' }

          // disconnect the client
          client.end(function (err) {
            if (err) throw err;
          });
        });
      });

    }).then((data) => {
      const nextState = { ...state, response: { body: data } };
      if (callback) return callback(nextState);
      return nextState;
    })

  }
}

export {
  field, fields, sourceValue, fields, alterState,
  merge, dataPath, dataValue, lastReferenceValue
} from 'language-common';
