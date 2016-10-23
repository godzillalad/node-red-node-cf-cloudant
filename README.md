node-red-node-cf-cloudant
=========================
A pair of [Node-RED](http://nodered.org) nodes to work with documents
in a [Cloudant](http://cloudant.com) database that is integrated with
[IBM Bluemix](http://bluemix.net).

Install
-------
Install from [npm](http://npmjs.org)
```
npm install node-red-node-cf-cloudant
```

Usage
-----
Allows basic access to a [Cloudant](http://cloudant.com) database to
`insert`, `update`, `delete` and `search` for documents.

To **insert** a new document into the database you have the option to store
the entire `msg` object or just the `msg.payload`. If the input value is not
in JSON format, it will be transformed before being stored.


For **update** and **delete**, you must pass the `_id` and the `_rev`as part
of the input `msg` object.


To **find** a document you have four options: 

Note: the query/selector should be passed in the `msg.payload` input object as a string.

**_id**: get a document directly by its `_id`
When getting documents by id, the `payload` will be the desired `_id` value.

**search**: use an existing [search index](https://cloudant.com/for-developers/search/)from the database. 
For `search indexes`, the query should follow the format `indexName:value`.

**query**: search using generic json query [cloudant query](https://docs.cloudant.com/cloudant_query.html)
For `query` the selector can determine the returned fields 

```{   "selector": {   "id": 213 },    "fields": [     "id",     "name",   "email",     "_id"   ] }```

**all**: return all documents 




Authors
-------
* Luiz Gustavo Ferraz Aoqui - [laoqui@ca.ibm.com](mailto:laoqui@ca.ibm.com)
* Túlio Pascoal
* Shane Lynch - [godzillalad](https://github.com/godzillalad)
