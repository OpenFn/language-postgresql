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
  "ssl": true,
  "allowSelfSignedCert": true
}
```

## `sql(query)`

Execute an sql query. An option can be added to either log the query or not and either execute the query or no. The options can be omitted as well.

#### sample usage

```js
sql(
  state =>
    `INSERT INTO untitled_table (name, the_geom) VALUES ('` +
    dataValue('form.first_name')(state) +
    `', ST_SetSRID(ST_Point(` +
    dataValue('lat')(state) +
    `, ` +
    dataValue('long')(state) +
    `),4326))`,
  { writeSql: true, execute: true }
);
```

## Insert a single record

This functions is used to insert a single record in postgres database. An option `writeSql` allows to log the generated sql query.

```js
insert(
  'users',
  {
    email: 'antony@gmail.com',
    first_name: 'Antony',
    inserted_at: '2020-08-27 00:00:00',
    updated_at: '2020-08-27 00:00:00',
  },
  { writeSql: true }
);
```

## Insert or Update using a unique column as a key

Insert or Update if matched. An option, `execute`, allows to either run the generated query or no.

```js
upsert(
  'users',
  'email',
  {
    email: 'luca@openfn.org',
    first_name: 'Luca',
    inserted_at: '2010-01-01 00:00:00',
    updated_at: '2010-01-01 00:00:00',
  },
  { writeSql: false, execute: true }
);
```

## Insert many records in postgresql

This function allows the insert of a set of records inside a table all at once.

```js
insertMany('users', state =>
  state.data.people.map(s => {
    return {
      first_name: ['Luca', 'Mohamed', 'Elodie'],
      inserted_at: '2020-01-01 00:00:00',
      updated_at: '2020-01-01 00:00:00',
    };
  })
);
```

## Upsert many records in postgresql

This function allows the upsert of a set of records inside a table all at once.

```js
upsertMany('users', 'ON CONSTRAINT users_pkey', state =>
  state.data.people.map(s => {
    return {
      first_name: ['Luca', 'Mohamed', 'Elodie'],
      inserted_at: '2020-01-01 00:00:00',
      updated_at: '2020-01-01 00:00:00',
    };
  })
);
```

## Describe a table from postgres

This function is used to fetch the list of columns of a given table in the database.

```js
describeTable('users', { writeSql: true, execute: false });
```

## Create a table in the database

This function allows to create a table in a database from a given array of columns.

```js
insertTable('users', state =>
  state.data.map(column => ({
    name: column.name,
    type: column.type,
    required: true, // optional
    unique: false, // optional - set to true for unique constraint
  }))
);
```

## Alter a table in the database

This function allows to add new columns to a table. Beware of the fact that you cannot add new columns with names that already exist in the table.

```js
modifyTable(
  'users',
  state =>
    state.data.map(newColumn => ({
      name: newColumn.name,
      type: newColumn.type,
      required: true, // optional
      unique: false, // optional - set to true for unique constraint
    })),
  { writeSql: false, execute: true }
);
```

## Development

Clone the repo, run `npm install`.

Run tests using `npm run test` or `npm run test:watch`

Build the project using `make`.
