# Language PostgreSQL

Language Pack for building expressions and operations to run PostgreSQL queries.

## Documentation

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
sql(function (state) {
  return (
    `INSERT INTO untitled_table (name, the_geom) VALUES ('` +
    dataValue('form.first_name')(state) +
    `', ST_SetSRID(ST_Point(` +
    dataValue('lat')(state) +
    `, ` +
    dataValue('long')(state) +
    `),4326))`
  );
});
```

## Insert many records in postgresql
This function allows the insert of a set of records inside a table all at once.

```js
insertMany('users', state =>
  state.data.people.map(s => {
    return {
      first_name: ["taylor", "mamadou", "aleksa"],
      inserted_at: '2020-01-01 00:00:00',
      updated_at: '2020-01-01 00:00:00',
    };
  })
);
```
## Insert or Update 


## Development

Clone the repo, run `npm install`.

Run tests using `npm run test` or `npm run test:watch`

Build the project using `make`.
