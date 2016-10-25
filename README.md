Language PostgreSQL
===================

Language Pack for building expressions and operations to run PostgreSQL queries.

Documentation
-------------

## required configuration for Heroku postgres
```json
{
  "host": "some-host-url.compute-1.amazonaws.com",
  "port": "5432",
  "database": "wouldntyouliketoknow",
  "user": "me",
  "password": "noway",
  "ssl": true
}
```

## `sql(query)`
Execute an sql query.

#### sample usage
```js
sql(
  function(state) {
    return (
      `INSERT INTO untitled_table (name, the_geom) VALUES ('`
      + dataValue("form.first_name")(state)
      + `', ST_SetSRID(ST_Point(`
        + dataValue("lat")(state) + `, `
        + dataValue("long")(state) + `),4326))`
    )
  }
)
```

#### query, alter state, query again
```js
sql(
  function(state) {
    console.log(state)
    return (
      `select FIRSTNAME from human limit 10`
    )
  }
),
alterState((state) => {
  state.response.body.rows.forEach( function (arrayItem) {
    arrayItem.firstname = arrayItem.firstname + " and santosh sittin in a tree"
    console.log(arrayItem.firstname)
  })
  console.log(state)
  return state;
}),
sql(
  function(state) {
    // does something with the new, altered state!
  }
)
```

## `insert(table, rowData)`
Run an insert statement by specifying the table and an bunch of key:value pairs,
typically created using `fields(field("key", "value"))`.

#### sample usage
```js
insert("humans", fields(
  field("name", "taylor"),
  field("surnam", "sewlal")
))
```

Development
-----------

Clone the repo, run `npm install`.

Run tests using `npm run test` or `npm run test:watch`

Build the project using `make`.
