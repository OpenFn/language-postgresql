Language HTTP
=============

Language Pack for building expressions and operations to make HTTP calls.

Documentation
-------------
## insert

#### required configuration for Heroku postgres
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

#### sample usage
```js
insert(table, rowData)
```

Development
-----------

Clone the repo, run `npm install`.

Run tests using `npm run test` or `npm run test:watch`

Build the project using `make`.
