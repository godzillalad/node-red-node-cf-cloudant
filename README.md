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


For **update** it will modify an existing document or documentss  
The query to find objects to update uses msg.selector and the update to the element uses msg.payload.

if `msg.selector` is missing it will try to use a specific `msg.payload.selector` from the msg.payload but this will be stored in the document

The msg.payload and existing objects will be merged.

Update can add a object if it does not exist or update multiple objects.

`Update ALL` means all documents that match the selector will be updated. _id and _rev are stripped from msg.payload

For **delete**, you must pass the `_id` and the `_rev`as part
of the input `msg` object.


To **find** a document you have four options: 

Note: the query/selector should be passed in the `msg.payload` input object as a string.

**_id**: get a document directly by its `_id`
When getting documents by id, the `payload` will be the desired `_id` value.

**search**: use an existing [search index](https://cloudant.com/for-developers/search/)from the database. 
For `search indexes`, the query should follow the format `indexName:value`.

**Cloudant query** runs a `cloudant.db.find` using existing indexes on the Cloudant database

The simplest index is 
```{ "type": "text", "index": {} }``` 
which will index all fields in all documents allowing for Lucene type searches.

A sample query selector to return document with id '213' and displaying the provided fields 
```{ "selector": { "id": 213 }, "fields": [ "id", "name", "email", "_id" ] }```


For more see [cloudant query](https://docs.cloudant.com/cloudant_query.html)

**all**: return all documents 


Example Flow
------------

1. Import this flow into Node-RED
2. Modify the Cloudant DB credentials
3. Follow the steps

```[{"id":"1e91af2b.9383e1","type":"tab","label":"Cloudant Query example"},{"id":"5edabb5b.7166cc","type":"cloudant in","z":"1e91af2b.9383e1","name":"Query using selector {\"Id\": 18 }","cloudant":"baad2208.a6e9d8","database":"sample","service":"_ext_","search":"_query_","design":"","index":"","x":431,"y":447,"wires":[["c7eadff9.80a9f8"]]},{"id":"aadca57c.e8ac8","type":"inject","z":"1e91af2b.9383e1","name":"","topic":"","payload":"{   \"selector\": {   \"Id\": 18 },    \"fields\": [     \"Id\",     \"name\",     \"skills\",     \"available\",     \"location\",     \"email\",     \"_id\"   ] }","payloadType":"str","repeat":"","crontab":"","once":false,"x":131,"y":446,"wires":[["5edabb5b.7166cc"]]},{"id":"c7eadff9.80a9f8","type":"debug","z":"1e91af2b.9383e1","name":"","active":true,"console":"false","complete":"payload","x":719,"y":447,"wires":[]},{"id":"cf70f13a.2a55f8","type":"cloudant out","z":"1e91af2b.9383e1","name":"create sample database","cloudant":"baad2208.a6e9d8","database":"sample","service":"_ext_","payonly":true,"operation":"insert","x":570,"y":105,"wires":[]},{"id":"abbe579.ed5c528","type":"inject","z":"1e91af2b.9383e1","name":"","topic":"","payload":"{\"name\": \"Shane's Friend\",   \"Id\": 19,   \"location\": [     -9.561788,     53.271325   ],    \"skills\": [     \"Java\",     \"Node\",     \"Node-red\"   ] }","payloadType":"str","repeat":"","crontab":"","once":false,"x":139,"y":105,"wires":[["657e9ea1.e1fdd"]]},{"id":"a7c67613.9fdf88","type":"cloudant in","z":"1e91af2b.9383e1","name":"Read all documents","cloudant":"baad2208.a6e9d8","database":"sample","service":"_ext_","search":"_query_","design":"","index":"","x":403,"y":245,"wires":[["be29ffb8.7d1ba"]]},{"id":"5044d2dd.12f7bc","type":"inject","z":"1e91af2b.9383e1","name":"","topic":"","payload":"","payloadType":"str","repeat":"","crontab":"","once":false,"x":128,"y":244,"wires":[["a7c67613.9fdf88"]]},{"id":"be29ffb8.7d1ba","type":"debug","z":"1e91af2b.9383e1","name":"","active":true,"console":"false","complete":"payload","x":683,"y":246,"wires":[]},{"id":"7cdd29f0.9ad518","type":"cloudant out","z":"1e91af2b.9383e1","name":"Add another document","cloudant":"baad2208.a6e9d8","database":"sample","service":"_ext_","payonly":true,"operation":"insert","x":569,"y":365,"wires":[]},{"id":"da7969b5.81b67","type":"inject","z":"1e91af2b.9383e1","name":"","topic":"","payload":"{\"name\": \"Shane Lynch\",   \"Id\": 18,   \"location\": [     -9.561788,     53.271325   ],    \"skills\": [     \"Java\",     \"Node\",     \"Node-red\"   ] }","payloadType":"str","repeat":"","crontab":"","once":false,"x":133,"y":365,"wires":[["5e71fe42.0a954"]]},{"id":"657e9ea1.e1fdd","type":"json","z":"1e91af2b.9383e1","name":"","x":311,"y":105,"wires":[["cf70f13a.2a55f8"]]},{"id":"5e71fe42.0a954","type":"json","z":"1e91af2b.9383e1","name":"","x":321,"y":365,"wires":[["7cdd29f0.9ad518"]]},{"id":"655419c8.27e3e","type":"cloudant in","z":"1e91af2b.9383e1","name":"Query only name field","cloudant":"baad2208.a6e9d8","database":"sample","service":"_ext_","search":"_query_","design":"","index":"","x":407,"y":527,"wires":[["1ec60f5d.f584f1"]]},{"id":"a9d14ec6.98798","type":"inject","z":"1e91af2b.9383e1","name":"","topic":"","payload":"{   \"selector\": {   \"Id\": 18 },    \"fields\": [     \"name\"] }","payloadType":"str","repeat":"","crontab":"","once":false,"x":137,"y":526,"wires":[["655419c8.27e3e"]]},{"id":"1ec60f5d.f584f1","type":"debug","z":"1e91af2b.9383e1","name":"","active":true,"console":"false","complete":"payload","x":725,"y":527,"wires":[]},{"id":"d4e21697.0196b","type":"comment","z":"1e91af2b.9383e1","name":"1. Add a document to sample database, this will create the database if it doesn't exist","info":"The node will create a cloudant database if one does not exist using `cloudant.db.create`","x":363,"y":57,"wires":[]},{"id":"ec2a842c.b8e9d","type":"comment","z":"1e91af2b.9383e1","name":"2. Query the cloudant db for all documents","info":"This wil run a `db.list` function and return all documents for a database","x":216,"y":191,"wires":[]},{"id":"c0b0e50d.94b16","type":"comment","z":"1e91af2b.9383e1","name":"3. Add another doc and fetch using Cloudant Query selectors","info":"*Cloudant query* runs a `cloudant.db.find` using existing indexes on the cloudant database\n\nThe simplest index is \n```{ \"type\": \"text\", \"index\": {} }``` \nwhich will index all fields in all documents allowing for Lucene type searches.\n\nA sample query selector to return document with id '213' and displaying the provided fields \n```{ \"selector\": { \"id\": 213 }, \"fields\": [ \"id\", \"name\", \"email\", \"_id\" ] }```\n\n\nSee https://docs.cloudant.com/cloudant_query.html","x":275,"y":316,"wires":[]},{"id":"baad2208.a6e9d8","type":"cloudant","z":"","host":"insert cloudant db details","name":""}]```



Authors
-------
* Luiz Gustavo Ferraz Aoqui - [laoqui@ca.ibm.com](mailto:laoqui@ca.ibm.com)
* Túlio Pascoal
* Shane Lynch - [godzillalad](https://github.com/godzillalad)
